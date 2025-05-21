const express = require('express');
const crypto = require('crypto');
const FormData = require('form-data');
const axios = require('axios');
const { createPaydisini, checkPaymentStatus, cancelTransaction, cancelTransactionOrkut } = require('./scrape');
const generateQRIS = require('./generateQRIS');
const { createQRIS } = require('./qris');
const VALID_API_KEYS = ['bagus']; // Ganti dengan daftar API key yang valid

const app = express();
const PORT = 3000;

app.set('json spaces', 2);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/paydisini/c-payment', async (req, res) => {
  const { amount, keypaydis, return_url, type_fee, valid_time } = req.query;

  if (!amount || !keypaydis || !return_url || !type_fee || !valid_time) {
    return res.status(400).json({ success: false, error: 'Semua parameter (amount, keypaydis, return_url, type_fee, valid_time) harus diisi.' });
  }

  try {
    const uniqueCode = Math.random().toString(36).substring(2, 12);
    const service = "11";

    const signature = crypto
      .createHash("md5")
      .update(keypaydis + uniqueCode + service + amount + valid_time + "NewTransaction")
      .digest("hex");

    const result = await createPaydisini(amount, keypaydis, return_url, type_fee, valid_time, uniqueCode, signature);
    if (result.success) {
      const qrContent = result.data.data.qr_content;
      const qrImage = await generateQRIS(qrContent);
      
      delete result.data.data.qr_content;
      delete result.data.data.qrcode_url;
      delete result.data.data.checkout_url_beta;
      delete result.data.data.checkout_url;
      delete result.data.data.checkout_url_v2;
      delete result.data.data.checkout_url_v3;
      
      result.data.data.qrcode_url = qrImage.qrImageUrl;
      result.data.data.signature = signature;

      const responseData = {
        success: result.data.success,
        msg: result.data.msg,
        data: {
          ...result.data.data,
          amount,
          keypaydis,
          return_url,
          type_fee,
          valid_time,
          unique_code: uniqueCode,
          signature
        }
      };
      res.json(responseData);
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/paydisini/cek-status-payment', async (req, res) => {
  const { keypaydis, unique_code, signature } = req.query;

  if (!keypaydis || !unique_code || !signature) {
    return res.status(400).json({ success: false, error: 'Semua parameter (keypaydis, unique_code, signature) harus diisi.' });
  }

  try {
    const result = await checkPaymentStatus(keypaydis, unique_code, signature);
    const responseData = {
      success: result.success,
      data: {
        ...result.data,
        keypaydis,
        unique_code,
        signature
      }
    };
    res.json(responseData);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/paydisini/cancel-payment', async (req, res) => {
  const { keypaydis, unique_code, signature } = req.query;

  if (!keypaydis || !unique_code || !signature) {
    return res.status(400).json({ success: false, error: 'Semua parameter (keypaydis, unique_code, signature) harus diisi.' });
  }

  try {
    const result = await cancelTransaction(keypaydis, unique_code, signature);
    const responseData = {
      success: result.success,
      data: {
        ...result.data,
        keypaydis,
        unique_code,
        signature
      }
    };
    res.json(responseData);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/orkut/createpayment', async (req, res) => {
    const { apikey, amount, codeqr } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter 'amount'
    if (!amount) {
        return res.json("Isi Parameter Amount.");
    }

    // Validasi parameter 'codeqr'
    if (!codeqr) {
        return res.json("Isi Parameter Token menggunakan codeqr kalian.");
    }

    try {
        const qrisData = await createQRIS(amount, codeqr);
        res.json({
            success: true,
            data: qrisData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating QRIS',
            error: error.message
        });
    }
});

app.get('/orkut/cekstatus', async (req, res) => {
    const { apikey, merchant, token } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter 'merchant'
    if (!merchant) {
        return res.status(400).json({
            success: false,
            message: 'Isi Parameter Merchant.'
        });
    }

    // Validasi parameter 'token'
    if (!token) {
        return res.status(400).json({
            success: false,
            message: 'Isi Parameter Token menggunakan codeqr kalian.'
        });
    }

    try {
        const apiUrl = `https://gateway.okeconnect.com/api/mutasi/qris/${merchant}/${token}`;
        const response = await axios.get(apiUrl);

        // Pastikan response memiliki data yang valid
        if (!response.data || !response.data.data || response.data.data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Transaksi tidak ditemukan atau data kosong.'
            });
        }

        // Ambil transaksi terbaru
        const latestTransaction = response.data.data[0];
        res.json({
            success: true,
            data: latestTransaction
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data.',
            error: error.message
        });
    }
});



app.get('/orkut/ceksaldo', async (req, res) => {
    const { apikey, merchant, pin, password } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter wajib
    if (!merchant || !pin || !password) {
        return res.status(400).json({
            success: false,
            message: 'Isi semua parameter: merchant, pin, dan password.'
        });
    }

    try {
        const apiUrl = `https://h2h.okeconnect.com/trx/balance?memberID=${memberID}&pin=${pin}&password=${password}`;
        const response = await axios.get(apiUrl);

        console.log("Response dari API:", response.data); // Debugging

        // Pastikan response memiliki format yang benar
        if (!response.data || !response.data.balance) {
            return res.status(404).json({
                success: false,
                message: 'Tidak dapat mengambil saldo. Periksa kembali kredensial Anda.'
            });
        }

        // Kirimkan saldo yang berhasil diambil
        res.json({
            success: true,
            balance: response.data.balance
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil saldo.',
            error: error.message
        });
    }
});

app.post('/orkut/cancel', (req, res) => {
    const { transactionId } = req.body;
    if (!transactionId) {
        return res.status(400).json({
            success: false,
            message: 'Parameter transactionId harus diisi.'
        });


    }
    try {
        const BatalTransaksi = cancelTransactionOrkut(transactionId);
        res.json({
            success: true,
            transaction: BatalTransaksi
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// API DOWNLOADER 

      app.get('/downloader/ttdl', async (req, res) => {
    const { apikey, url } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter 'url'
    if (!url) {
        return res.json({ success: false, message: "Isi parameter URL TikTok." });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/tiktok?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (result.status !== 200 || !result.result) {
            return res.json({ success: false, message: "Gagal mengambil data dari API TikTok." });
        }

        // Mengambil data video
        const videoNowm = result.result.data.find(item => item.type === "nowatermark")?.url;
        const videoNowmHd = result.result.data.find(item => item.type === "nowatermark_hd")?.url;
        const coverImage = result.result.cover;
        const musicUrl = result.result.music_info.url;

        res.json({
            success: true,
            creator: "Bagus Bahril",
            title: result.result.title,
            taken_at: result.result.taken_at,
            duration: result.result.duration,
            cover: coverImage,
            video: {
                nowatermark: videoNowm,
                nowatermark_hd: videoNowmHd
            },
            music: musicUrl,
            stats: result.result.stats,
            author: result.result.author
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/downloader/gdrivedl', async (req, res) => {
    const { apikey, url } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter 'url'
    if (!url) {
        return res.json({ success: false, message: "Isi parameter URL Google Drive." });
    }

    try {
        const apiUrl = `https://api.siputzx.my.id/api/d/gdrive?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (!result.status || !result.data) {
            return res.json({ success: false, message: "Gagal mengambil data dari API Google Drive." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril", // Watermark Creator
            file: {
                name: result.data.name,
                download_url: result.data.download,
                original_link: result.data.link
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/downloader/igdl', async (req, res) => {
    const { apikey, url } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter 'url'
    if (!url) {
        return res.json({ success: false, message: "Isi parameter URL Instagram." });
    }

    try {
        const apiUrl = `https://apizell.web.id/download/instagram?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (!result.status || !result.result || !result.result.url) {
            return res.json({ success: false, message: "Gagal mengambil data dari API Instagram." });
        }

        // Ambil data video
        const videoData = result.result.url[0];

        res.json({
            success: true,
            creator: "Bagus Bahril", // Watermark Creator
            video: {
                url: videoData.url,
                type: videoData.type,
                ext: videoData.ext
            },
            detail: {
                title: result.result.meta.title,
                username: result.result.meta.username,
                like: result.result.meta.like_count,
                comment: result.result.meta.comment_count,
                view: result.result.meta.view_count || "Tidak tersedia"
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
      

      app.get('/downloader/fbdl', async (req, res) => {
    const { apikey, url } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter 'url'
    if (!url) {
        return res.json({ success: false, message: "Isi parameter URL Facebook." });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/fbdl?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (result.status !== 200 || !result.data || !result.data.status) {
            return res.json({ success: false, message: "Gagal mengambil data dari API Facebook." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril", // Watermark Creator
            title: result.data.title,
            duration: result.data.durasi,
            video: {
                hd_url: result.data.hd_url,
                sd_url: result.data.sd_url
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

        // MediaFire Downloader
app.get('/downloader/mediafiredl', async (req, res) => {
    const { apikey, url } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!url) {
        return res.json({ success: false, message: "Isi parameter URL MediaFire." });
    }

    try {
        const apiUrl = `https://api.siputzx.my.id/api/d/mediafire?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (!result.status || !result.data) {
            return res.json({ success: false, message: "Gagal mengambil data dari API MediaFire." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril",
            name: result.data.fileName,
            mime: "application/zip", // Mime type tidak ada di respons API, jadi diset default ke zip
            size: result.data.fileSize,
            link: result.data.downloadLink
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/tools/tinyurl', async (req, res) => {
    const { apikey, url } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!url) {
        return res.status(400).json({ success: false, message: 'Parameter url tidak boleh kosong.' });
    }

    try {
        const apiUrl = `https://api.diioffc.web.id/api/tools/tinyurl?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);

        if (!response.data.status || !response.data.result?.link) {
            return res.status(500).json({ success: false, message: 'Gagal memperpendek URL. Coba lagi nanti.' });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril",
            short_url: response.data.result.link
        });

    } catch (error) {
        console.error("Error processing Short URL API:", error.message);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat memperpendek URL.', error: error.message });
    }
});

app.get('/tools/remini', async (req, res) => {
    const { apikey, url } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!url) {
        return res.status(400).json({ success: false, message: 'Parameter url tidak boleh kosong.' });
    }

    try {
        const apiUrl = `https://api.nyxs.pw/tools/hd?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);

        if (!response.data || !response.data.result) {
            return res.status(500).json({ success: false, message: 'Gagal memproses gambar.' });
        }

        const imageUrl = response.data.result;
        const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });

        res.setHeader('Content-Type', 'image/png');
        imageResponse.data.pipe(res);
        
    } catch (error) {
        console.error("Error processing Remini API:", error.message);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat meningkatkan kualitas gambar.', error: error.message });
    }
});


app.get('/tools/aiaudio', async (req, res) => {
    const { apikey, text } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!text) {
        return res.json({ success: false, message: "Isi parameter text untuk membuat audio AI." });
    }

    const apiKeys = [
        "mg-qn4nDMOfpwvTQbtCaQ1O5nJVCGzipjZQ",
        "mg-0esE2xzAzesJF2mye4IWBQxKFS3d8a8l",
        "mg-dQ7BvhYFOdMpBPBg79Qp5bu01kI9uMd0",
        "mg-MPJt9hRVSngiwLRSCZOfcBUACZrmitwn",
        "mg-NwjWkJ941XaqNbbo96NQ8uWoTZ8eC4zS",
        "mg-J4uXTMlxLhT6WfKGp31SOqYpRFl7X589",
        "mg-WL3q0GDNYuTjzxU1mC5UbqR5fgDC154h",
        "mg-UUAmWl3dHvay6NYA8IZN7Qf2yQBwuXGi",
        "mg-cHHa4COAB9Tra3ZQ4rYct2jmeoHe9LCh",
        "mg-c2kSZJ8KxESTkKgkyMF8UwEk1bhbPyQn"
    ];
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    try {
        const apiUrl = `https://api.maelyn.tech/api/chatgpt/audio?q=${encodeURIComponent(text)}&model=echo&apikey=${randomKey}`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.status !== 'Success' || !data.result || !data.result.url) {
            return res.status(500).json({ success: false, message: "Gagal mendapatkan audio dari API." });
        }

        const audioResponse = await fetch(data.result.url);
        const audioBuffer = await audioResponse.arrayBuffer();

        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(audioBuffer));
    } catch (error) {
        res.status(500).json({ success: false, message: "Terjadi kesalahan dalam mengambil audio AI." });
    }
});


    app.get('/tools/ascii', async (req, res) => {
    const { apikey, text } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!text) {
        return res.status(400).json({ success: false, message: 'Parameter text tidak boleh kosong.' });
    }

    try {
        const apiUrl = `https://berkahesport.my.id/api/generatetext?text=${encodeURIComponent(text)}&key=free_be`;
        const response = await axios.get(apiUrl);

        if (response.data.status !== 200 || !response.data.result) {
            return res.status(500).json({ success: false, message: 'Gagal membuat teks ASCII. Coba lagi nanti.' });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril",
            ascii_text: response.data.result
        });

    } catch (error) {
        console.error("Error processing Generate Text API:", error.message);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat membuat teks ASCII.', error: error.message });
    }
});

app.get('/tools/ssweb', async (req, res) => {
    const { apikey, url, type } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!url) {
        return res.status(400).json({ success: false, message: 'Parameter url tidak boleh kosong.' });
    }

    const deviceType = type || "desktop"; // Default desktop jika tidak disertakan

    try {
        const apiUrl = `https://api.vreden.web.id/api/ssweb?url=${encodeURIComponent(url)}&type=${deviceType}`;
        const imageResponse = await axios.get(apiUrl, { responseType: 'stream' });

        res.setHeader('Content-Type', 'image/png');
        imageResponse.data.pipe(res);
        
    } catch (error) {
        console.error("Error processing Screenshot API:", error.message);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat mengambil screenshot website.', error: error.message });
    }
});

app.get('/tools/ghibli', async (req, res) => {
const { apikey, url } = req.query;

if (!apikey || !VALID_API_KEYS.includes(apikey)) {  
    return res.status(401).json({  
        success: false,  
        message: 'API key tidak valid atau tidak disertakan.'  
    });  
}  

if (!url) {  
    return res.json({ success: false, message: "Isi parameter url gambar untuk mengubah ke gaya Ghibli." });  
}  

try {
    const apiKeys = [
        "mg-qn4nDMOfpwvTQbtCaQ1O5nJVCGzipjZQ",
        "mg-0esE2xzAzesJF2mye4IWBQxKFS3d8a8l",
        "mg-dQ7BvhYFOdMpBPBg79Qp5bu01kI9uMd0",
        "mg-MPJt9hRVSngiwLRSCZOfcBUACZrmitwn",
        "mg-NwjWkJ941XaqNbbo96NQ8uWoTZ8eC4zS",
        "mg-J4uXTMlxLhT6WfKGp31SOqYpRFl7X589",
        "mg-WL3q0GDNYuTjzxU1mC5UbqR5fgDC154h",
        "mg-UUAmWl3dHvay6NYA8IZN7Qf2yQBwuXGi",
        "mg-cHHa4COAB9Tra3ZQ4rYct2jmeoHe9LCh",
        "mg-c2kSZJ8KxESTkKgkyMF8UwEk1bhbPyQn"
    ];

    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    const apiUrl = `https://api.maelyn.tech/api/img2img/ghibli?url=${encodeURIComponent(url)}&apikey=${randomKey}`;
    
    const response = await fetch(apiUrl);
    const json = await response.json();

    if (!json.result || !json.result.url) {
        throw new Error("Gagal mengambil data dari API Ghibli.");
    }

    const imageResponse = await fetch(json.result.url);
    const imageBuffer = await imageResponse.arrayBuffer();

    res.setHeader('Content-Type', 'image/jpeg');  
    res.send(Buffer.from(imageBuffer));
} catch (error) {
    res.status(500).json({ success: false, message: "Terjadi kesalahan dalam mengambil gambar Ghibli." });
}
});

// Spotify Downloader
app.get('/downloader/spotifydl', async (req, res) => {
    const { apikey, url } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!url) {
        return res.json({ success: false, message: "Isi parameter URL Spotify." });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/spotify?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (result.status !== 200 || !result.result || !result.result.status) {
            return res.json({ success: false, message: "Gagal mengambil data dari API Spotify." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril",
            title: result.result.title,
            type: result.result.type,
            artist: result.result.artists,
            release_date: result.result.releaseDate,
            cover_image: result.result.cover,
            download_link: result.result.music
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Text to QR Code
app.get('/tools/toqr', async (req, res) => {
    const { apikey, text } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!text) {
        return res.json({ success: false, message: "Isi parameter text untuk membuat QR Code." });
    }

    try {
        const qrUrl = `https://api.siputzx.my.id/api/tools/text2qr?text=${encodeURIComponent(text)}`;

        // Mengambil gambar dari API Siputz
        const response = await fetch(qrUrl);
        const qrImage = await response.arrayBuffer();

        res.setHeader('Content-Type', 'image/png');
        res.send(Buffer.from(qrImage));

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/stick/brat', async (req, res) => {
    const { apikey, text } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!text) {
        return res.json({ success: false, message: "Isi parameter text untuk mendapatkan gambar." });
    }

    try {
        const bratUrl = `https://fgsi1-brat.hf.space/?text=${encodeURIComponent(text)}&modeBlur=true`;

        const response = await fetch(bratUrl);
        const bratImage = await response.arrayBuffer();

        res.setHeader('Content-Type', 'image/png');
        res.send(Buffer.from(bratImage));

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/stick/bratvid', async (req, res) => {
    const { apikey, text } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!text) {
        return res.json({ success: false, message: "Isi parameter text untuk mendapatkan video." });
    }

    try {
        const bratvidUrl = `https://fgsi1-brat.hf.space/?text=${encodeURIComponent(text)}&modeBlur=true&isVideo=true`;

        const response = await fetch(bratvidUrl);
        const bratVideo = await response.arrayBuffer();

        res.setHeader('Content-Type', 'video/mp4');
        res.send(Buffer.from(bratVideo));

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/stick/qc', async (req, res) => {
    const { apikey, text, username, avatar } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!text || !username || !avatar) {
        return res.json({ success: false, message: "Isi parameter text, username, dan avatar untuk membuat QuoteChat." });
    }

    try {
        const qcUrl = `https://berkahesport.my.id/api/quotechat?text=${encodeURIComponent(text)}&username=${encodeURIComponent(username)}&avatar=${encodeURIComponent(avatar)}&key=free_be`;

        const response = await fetch(qcUrl);
        const jsonResponse = await response.json();

        if (!jsonResponse.result) {
            return res.status(500).json({ success: false, message: "Gagal mendapatkan gambar QC." });
        }

        const imageResponse = await fetch(jsonResponse.result);
        const qcImage = await imageResponse.arrayBuffer();

        res.setHeader('Content-Type', 'image/png');
        res.send(Buffer.from(qcImage));

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});    

app.get('/search/playstore', async (req, res) => {
    const { apikey, q } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter query
    if (!q) {
        return res.status(400).json({
            success: false,
            message: 'Parameter query tidak boleh kosong.'
        });
    }

    try {
        // Panggil API Play Store
        const apiUrl = `https://api.siputzx.my.id/api/apk/playstore?query=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl);

        // Debugging log
        console.log("Response dari API:", response.data);

        // Periksa apakah respons API valid
        if (!response.data || !response.data.data || response.data.data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tidak ditemukan hasil untuk pencarian ini.'
            });
        }

        // Ambil data hasil pencarian pertama
        const result = response.data.data[0];

        res.json({
            success: true,
            creator: "Bagus Bahril",
            name: result.nama,
            developer: result.developer,
            icon: result.img,
            rating: result.rate2,
            link: result.link,
            developer_link: result.link_dev
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data Play Store.',
            error: error.message
        });
    }
});


app.get('/search/pinterest', async (req, res) => {
    const { apikey, q } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!q) {
        return res.status(400).json({
            success: false,
            message: 'Parameter query tidak boleh kosong.'
        });
    }

    try {
        const apiUrl = `https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl);

        console.log("Response dari API Pinterest:", response.data); // Debugging log

        // Cek apakah responsenya valid dan ada data
        if (!response.data || !response.data.data?.length) {
            return res.status(404).json({
                success: false,
                message: 'Tidak ditemukan hasil untuk pencarian ini.'
            });
        }

        // Ambil index random dari 1-10 (pastikan tidak lebih dari jumlah hasil)
        const maxIndex = Math.min(10, response.data.data.length);
        const randomIndex = Math.floor(Math.random() * maxIndex); // Ambil angka random dari 0 sampai maxIndex-1
        const pin = response.data.data[randomIndex];

        res.json({
            success: true,
            creator: "Bagus Bahril",
            pinterest: {
                pin_url: pin.pin || "Tidak tersedia",
                source_link: pin.link || "Tidak tersedia",
                created_at: pin.created_at || "Tidak tersedia",
                image_url: pin.images_url || "Tidak tersedia",
                title: pin.grid_title || "Tidak tersedia"
            }
        });

    } catch (error) {
        console.error("Error fetching Pinterest API:", error.message);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data Pinterest.',
            error: error.message
        });
    }
});

app.get('/search/youtube', async (req, res) => {
    const { apikey, q } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!q) {
        return res.status(400).json({ success: false, message: 'Parameter query tidak boleh kosong.' });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/yts?query=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl);

        if (!response.data || !response.data.result?.all.length) {
            return res.status(404).json({ success: false, message: 'Tidak ditemukan hasil untuk pencarian ini.' });
        }

        const randomIndex = Math.floor(Math.random() * response.data.result.all.length);
        const video = response.data.result.all[randomIndex];

        res.json({
            success: true,
            creator: "Bagus Bahril",
            youtube: {
                title: video.title || "Tidak tersedia",
                url: video.url || "Tidak tersedia",
                description: video.description || "Tidak tersedia",
                thumbnail: video.thumbnail || "Tidak tersedia",
                duration: video.duration.timestamp || "Tidak tersedia",
                views: video.views || 0,
                author: video.author.name || "Tidak tersedia"
            }
        });

    } catch (error) {
        console.error("Error fetching YouTube API:", error.message);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat mengambil data YouTube.', error: error.message });
    }
});

app.get('/search/google', async (req, res) => {
    const { apikey, q } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!q) {
        return res.status(400).json({ success: false, message: 'Parameter query tidak boleh kosong.' });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/google?query=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl);

        if (!response.data || !response.data.result?.items || response.data.result.items.length === 0) {
            return res.status(404).json({ success: false, message: 'Tidak ditemukan hasil untuk pencarian ini.' });
        }

        const randomIndex = Math.floor(Math.random() * response.data.result.items.length);
        const result = response.data.result.items[randomIndex];

        res.json({
            success: true,
            creator: "Bagus Bahril",
            google: {
                title: result.title || "Tidak tersedia",
                link: result.link || "Tidak tersedia",
                snippet: result.snippet || "Tidak tersedia",
                thumbnail: result.pagemap?.cse_thumbnail?.[0]?.src || "Tidak tersedia"
            }
        });

    } catch (error) {
        console.error("Error fetching Google API:", error.message);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat mengambil data Google.', error: error.message });
    }
});


app.get('/search/gimage', async (req, res) => {
    const { apikey, q } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!q) {
        return res.status(400).json({ success: false, message: 'Parameter query tidak boleh kosong.' });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/gimage?query=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl);

        if (!response.data || !response.data.result.length) {
            return res.status(404).json({ success: false, message: 'Tidak ditemukan hasil gambar.' });
        }

        const randomIndex = Math.floor(Math.random() * response.data.result.length);
        const imageUrl = response.data.result[randomIndex];

        res.json({
            success: true,
            creator: "Bagus Bahril",
            google_image: {
                image_url: imageUrl || "Tidak tersedia"
            }
        });

    } catch (error) {
        console.error("Error fetching Google Image API:", error.message);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat mengambil data Google Image.', error: error.message });
    }
});



app.get('/search/tiktok', async (req, res) => {
    const { apikey, q } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!q) {
        return res.status(400).json({
            success: false,
            message: 'Parameter query tidak boleh kosong.'
        });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/search/tiktok?query=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl);

        console.log("Response dari API TikTok:", response.data); // Debugging log

        // Pastikan response memiliki format yang diharapkan
        if (!response.data || !response.data.result?.status || !response.data.result.videos?.length) {
            return res.status(404).json({
                success: false,
                message: 'Tidak ditemukan hasil untuk pencarian ini.'
            });
        }

        const video = response.data.result.videos[0]; // Ambil video pertama dari hasil pencarian

        res.json({
            success: true,
            creator: "Bagus Bahril",
            video: {
                id: video.video_id || "Tidak tersedia",
                title: video.title || "Tidak tersedia",
                cover: video.cover || "Tidak tersedia",
                duration: video.duration || "Tidak tersedia",
                play_url: video.play || "Tidak tersedia",
                wmplay_url: video.wmplay || "Tidak tersedia",
                size: video.size || "Tidak tersedia",
                wm_size: video.wm_size || "Tidak tersedia"
            },
            music: {
                title: video.music_info?.title || "Tidak tersedia",
                url: video.music_info?.play || "Tidak tersedia",
                author: video.music_info?.author || "Tidak tersedia",
                duration: video.music_info?.duration || "Tidak tersedia"
            },
            stats: {
                play_count: video.play_count || 0,
                digg_count: video.digg_count || 0,
                comment_count: video.comment_count || 0,
                share_count: video.share_count || 0,
                download_count: video.download_count || 0
            },
            author: {
                id: video.author?.id || "Tidak tersedia",
                unique_id: video.author?.unique_id || "Tidak tersedia",
                nickname: video.author?.nickname || "Tidak tersedia",
                avatar: video.author?.avatar || "Tidak tersedia"
            }
        });

    } catch (error) {
        console.error("Error fetching TikTok API:", error.message);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data TikTok.',
            error: error.message
        });
    }
});

app.get('/search/spotify', async (req, res) => {
    const { apikey, q } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!q) {
        return res.status(400).json({ success: false, message: 'Parameter query tidak boleh kosong.' });
    }

    try {
        const apiUrl = `https://api.siputzx.my.id/api/s/spotify?query=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl);

        if (!response.data || !response.data.data || response.data.data.length === 0) {
            return res.status(404).json({ success: false, message: 'Tidak ditemukan hasil untuk pencarian ini.' });
        }

        const randomIndex = Math.floor(Math.random() * response.data.data.length);
        const result = response.data.data[randomIndex];

        res.json({
            success: true,
            creator: "Bagus Bahril",
            spotify: {
                title: result.title || "Tidak tersedia",
                artist: {
                    name: result.artist?.name || "Tidak tersedia",
                    spotify_url: result.artist?.external_urls?.spotify || "Tidak tersedia"
                },
                duration: result.duration || "Tidak tersedia",
                thumbnail: result.thumbnail || "Tidak tersedia",
                preview: result.preview || "Tidak tersedia"
            }
        });

    } catch (error) {
        console.error("Error fetching Spotify API:", error.message);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat mengambil data Spotify.', error: error.message });
    }
});

app.get('/stick/attp', async (req, res) => {
    const { apikey, text } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!text) {
        return res.json({ success: false, message: "Isi parameter text untuk membuat ATTP." });
    }

    try {
        const attpUrl = `https://berkahesport.my.id/api/attp?text=${encodeURIComponent(text)}&key=free_be`;
        const response = await fetch(attpUrl);
        const { result } = await response.json();

        const imageResponse = await fetch(result);
        const imageBuffer = await imageResponse.arrayBuffer();

        res.setHeader('Content-Type', 'image/png');
        res.send(Buffer.from(imageBuffer));
    } catch (error) {
        res.status(500).json({ success: false, message: "Terjadi kesalahan dalam mengambil gambar ATTP." });
    }
});

app.get('/stalker/tiktok', async (req, res) => {
    const { apikey, username } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter 'username'
    if (!username) {
        return res.json({ success: false, message: "Isi parameter username TikTok." });
    }

    try {
        const apiUrl = `https://api.vreden.my.id/api/tiktokStalk?query=${encodeURIComponent(username)}`;
        const response = await fetch(apiUrl);
        const result = await response.json();

        if (result.status !== 200 || !result.result) {
            return res.json({ success: false, message: "Gagal mengambil data dari API TikTok." });
        }

        const user = result.result.user;
        const stats = result.result.stats;

        res.json({
            success: true,
            creator: "Bagus Bahril", // Watermark Creator
            data: {
                id: user.id,
                username: user.uniqueId,
                name: user.nickname,
                bio: user.signature,
                avatar: user.avatarLarger,
                verified: user.verified,
                is_private: user.privateAccount,
                followers: stats.followerCount,
                following: stats.followingCount,
                likes: stats.heartCount,
                videos: stats.videoCount,
                friends: stats.friendCount,
                profile_image: result.result.image,
                bio_link: user.bioLink?.link || null,
                region: user.region
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/stalker/telegram', async (req, res) => {
    const { apikey, username } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!username) {
        return res.json({ success: false, message: "Isi parameter username Telegram." });
    }

    try {
        const apiUrl = `https://itzpire.com/stalk/telegram?username=${encodeURIComponent(username)}`;
        const response = await fetch(apiUrl);
        const textResponse = await response.text(); // Ambil respons dalam bentuk teks
        console.log("Raw API Response:", textResponse);

        const result = JSON.parse(textResponse); // Ubah teks ke JSON

        if (!result || result.status !== "success" || !result.data) {
            return res.json({ success: false, message: "Data tidak ditemukan atau API error." });
        }

        const userData = result.data;

        res.json({
            success: true,
            creator: "Bagus Bahril",
            data: {
                name: userData.name || "Tidak tersedia",
                username: userData.username || username,
                bio: userData.bio || "Tidak tersedia",
                profile_pic_url: userData.photo || "Tidak tersedia"
            }
        });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
    }
});

app.get('/stalker/instagram', async (req, res) => {
    const { apikey, username } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!username) {
        return res.json({ success: false, message: "Isi parameter username Instagram." });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/igstalk?query=${encodeURIComponent(username)}`;
        const response = await fetch(apiUrl);
        const result = await response.json();

        // **Tambahkan log untuk debugging**
        console.log("API Response:", JSON.stringify(result, null, 2));

        if (!result || result.status !== 200 || !result.result || !result.result.user) {
            return res.json({ success: false, message: "Data tidak ditemukan atau API error." });
        }

        // Ambil data dari hasil JSON
        const userData = result.result.user;

        res.json({
            success: true,
            creator: "Bagus Bahril",
            data: {
                full_name: userData.full_name || "Tidak tersedia",
                username: userData.username || username,
                profile_link: `https://www.instagram.com/${userData.username}`,
                bio: userData.biography || "Tidak tersedia",
                account_category: userData.account_category || "Tidak tersedia",
                profile_pic_url: userData.profile_pic_url || "Tidak tersedia"
            }
        });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
    }
});
            
app.get('/stalker/mlbb', async (req, res) => {
    const { apikey, id, zoneid } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter 'id' dan 'zoneid'
    if (!id || !zoneid) {
        return res.json({ success: false, message: "Isi parameter ID dan Zone ID Mobile Legends." });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/mlstalk?id=${encodeURIComponent(id)}&zoneid=${encodeURIComponent(zoneid)}`;
        const response = await fetch(apiUrl);
        const result = await response.json();

        if (result.status !== 200 || !result.result) {
            return res.json({ success: false, message: "Gagal mengambil data dari API Mobile Legends." });
        }

        const gameData = result.result;

        // Cek apakah semua data yang diperlukan ada
        if (!gameData.product || !gameData.item || !gameData.transaction_details || !gameData.game_detail) {
            return res.json({ success: false, message: "Data tidak lengkap." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril", // Watermark Creator
            data: {
                game_id: gameData.gameId || "Tidak tersedia",
                user_name: gameData.userNameGame || "Tidak tersedia",
                product: {
                    name: gameData.product.name || "Tidak tersedia",
                    image: gameData.product.image || "Tidak tersedia",
                    price: gameData.product.price || "Tidak tersedia",
                    price_default: gameData.product.priceDefault || "Tidak tersedia",
                    color: gameData.product.color || "Tidak tersedia",
                    description: gameData.product.name || "Tidak tersedia"
                },
                item: {
                    name: gameData.item.name || "Tidak tersedia",
                    image: gameData.item.image || "Tidak tersedia",
                    price: gameData.item.price || "Tidak tersedia"
                },
                transaction_details: {
                    transaction_id: gameData.transactionId || "Tidak tersedia",
                    transaction_code: gameData.transactionCode || "Tidak tersedia",
                    payment_method: gameData.paymentName || "Tidak tersedia"
                },
                game_detail: gameData.gameDetail || "Tidak tersedia"
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

//===============================
//App Maker Build App
//===============================

//build aplikasi

app.get('/appmaker/buildapp', async (req, res) => {
    const { apikey, url, name, appIcon, splashIcon } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter yang diperlukan
    if (!url || !name || !appIcon || !splashIcon) {
        return res.json({ success: false, message: "Isi parameter url, name, appIcon, dan splashIcon." });
    }

    try {
        const apiUrl = `https://fastrestapis.fasturl.cloud/tool/appmaker?action=create&url=${encodeURIComponent(url)}&email=bagusganz@guz.id&name=${encodeURIComponent(name)}&appIcon=${encodeURIComponent(appIcon)}&splashIcon=${encodeURIComponent(splashIcon)}&useToolbar=true&toolbarColor=%235303f4&toolbarTitleColor=%23FFFFFF`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (result.status !== 200 || !result.result) {
            return res.json({ success: false, message: "eror 404." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril",
            app: {
                Id: result.result.appId
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/appmaker/checkbuild', async (req, res) => { const { apikey, appid } = req.query;

// Validasi API key
if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(401).json({
        success: false,
        message: 'API key tidak valid atau tidak disertakan.'
    });
}

// Validasi parameter appid
if (!appid) {
    return res.json({ success: false, message: "Isi parameter appid." });
}

try {
    const apiUrl = `https://fastrestapis.fasturl.cloud/tool/appmaker?action=check&appId=${encodeURIComponent(appid)}`;
    const response = await axios.get(apiUrl);
    const result = response.data;

    if (result.status !== 200 || !result.result) {
        return res.json({ success: false, message: "Gagal memeriksa build aplikasi." });
    }

    res.json({
        success: true,
        creator: "Bagus Bahril",
        app: {
            nama: result.result.appName,
            web: result.result.url,
            status: result.result.status,
            isPaid: result.result.isPaid,
            package_name: result.result.package_name,
            Icon: result.result.appIcon,
            buildFile: result.result.buildFile
        }
    });
} catch (error) {
    res.status(500).json({ success: false, message: error.message });
}

});

             
app.get('/tools/createhtml', async (req, res) => {
    const { apikey, query } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter content
    if (!query) {
        return res.status(400).json({ success: false, message: "Isi querynya." });
    }

    try {
        const prompt = `buatkan saya kode html dan cssnya hanya dalam 1 file html ${query}, jangan berikan saya respon lain, hanya kode htmlnya tanpa tambahan kata apapun, ingat jangan berikan respon lain apapun termasuk nama file, Buat designenya semodern mungkin`;
        const apiUrl = `https://velyn.biz.id/api/ai/openai?prompt=${encodeURIComponent(prompt)}`;
        const response = await axios.get(apiUrl);

        if (!response.data.status) {
            return res.status(500).json({ success: false, message: "Gagal mendapatkan kode HTML." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril",
            code: response.data.data
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/tools/blekboxai', async (req, res) => {
    const { apikey, text } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!text) {
        return res.status(400).json({
            success: false,
            message: 'Parameter text wajib diisi.'
        });
    }

    class BlackboxAI {
        constructor(model = 'blackboxai') {
            this.apiUrl = 'https://api.blackbox.ai/api/chat';
            this.headers = {
                'Content-Type': 'application/json'
            };
            this.conversationHistory = {};
            this.model = model;
        }

        async sendMessage(conversationId, content) {
            if (!this.conversationHistory[conversationId]) {
                this.conversationHistory[conversationId] = [];
            }

            const message = { id: conversationId, content, role: 'user' };
            this.conversationHistory[conversationId].push(message);

            const payload = {
                messages: this.conversationHistory[conversationId],
                id: conversationId,
                previewToken: null,
                userId: null,
                codeModelMode: true,
                agentMode: {},
                trendingAgentMode: {},
                isMicMode: false,
                userSystemPrompt: null,
                maxTokens: 1024,
                playgroundTopP: 0.9,
                playgroundTemperature: 0.5,
                isChromeExt: false,
                githubToken: null,
                clickedAnswer2: false,
                clickedAnswer3: false,
                clickedForceWebSearch: false,
                visitFromDelta: false,
                mobileClient: false,
                userSelectedModel: this.model
            };

            try {
                const response = await axios.post(this.apiUrl, payload, { headers: this.headers });
                const cleaned = response.data.replace(/Generated by BLACKBOX\.AI, try unlimited chat https:\/\/www\.blackbox\.ai\n\n/g, '');
                const assistantMessage = { id: `response-${Date.now()}`, content: cleaned, role: 'assistant' };
                this.conversationHistory[conversationId].push(assistantMessage);
                return assistantMessage.content;
            } catch (error) {
                throw error;
            }
        }
    }

    try {
        const ai = new BlackboxAI();
        // Gunakan IP user sebagai ID, jika tidak tersedia fallback ke timestamp
        const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || `ip-${Date.now()}`;
        const conversationId = userIP.replace(/[^a-zA-Z0-9]/g, '');

        const result = await ai.sendMessage(conversationId, text);

        res.json({
            success: true,
            creator: "Bagus Xxpn",
            result: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Terjadi kesalahan saat menghubungi layanan BlackboxAI."
        });
    }
});

          
app.listen(PORT, () => {
  console.log(`Server berjalan pada http://localhost:${PORT}`);
});
