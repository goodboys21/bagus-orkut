const express = require('express');
const crypto = require('crypto');
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
        const apiUrl = `https://api.vreden.web.id/api/igdownload?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (result.status !== 200 || !result.result || !result.result.response.status) {
            return res.json({ success: false, message: "Gagal mengambil data dari API Instagram." });
        }

        // Mengambil informasi video
        const videoData = result.result.response.data.find(item => item.type === "video");
        
        if (!videoData) {
            return res.json({ success: false, message: "Tidak ada video yang ditemukan di URL ini." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril", // Watermark Creator
            profile: {
                id: result.result.response.profile.id,
                username: result.result.response.profile.username,
                full_name: result.result.response.profile.full_name,
                is_verified: result.result.response.profile.is_verified,
                profile_pic_url: result.result.response.profile.profile_pic_url
            },
            caption: result.result.response.caption.text,
            statistics: result.result.response.statistics,
            video: {
                thumbnail: videoData.thumb,
                url: videoData.url,
                width: videoData.width,
                height: videoData.height
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
        const apiUrl = `https://api.vreden.web.id/api/mediafiredl?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (result.status !== 200 || !result.result || !result.result[0].status) {
            return res.json({ success: false, message: "Gagal mengambil data dari API MediaFire." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril",
            file_name: decodeURIComponent(result.result[0].nama),
            mime: result.result[0].mime,
            size: result.result[0].size,
            download_link: result.result[0].link
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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
        const bratUrl = `https://fgsi-brat.hf.space/?text=${encodeURIComponent(text)}&modeBlur=true`;

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
        const bratvidUrl = `https://fgsi-brat.hf.space/?text=${encodeURIComponent(text)}&modeBlur=true&isVideo=true`;

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

app.get('/stick/atp', async (req, res) => {
    const { apikey, text } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!text) {
        return res.json({ success: false, message: "Isi parameter text untuk membuat ATP." });
    }

    try {
        const atpUrl = `https://berkahesport.my.id/api/atp?text=${encodeURIComponent(text)}&key=free_be`;
        const response = await fetch(atpUrl);
        const { result } = await response.json();

        const imageResponse = await fetch(result);
        const imageBuffer = await imageResponse.arrayBuffer();

        res.setHeader('Content-Type', 'image/png');
        res.send(Buffer.from(imageBuffer));
    } catch (error) {
        res.status(500).json({ success: false, message: "Terjadi kesalahan dalam mengambil gambar ATP." });
    }
});


app.get('/search/tiktok', async (req, res) => {
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
        // Panggil API TikTok
        const apiUrl = `https://api.siputzx.my.id/api/s/tiktok?query=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl);

        // Debugging log
        console.log("Response dari API:", response.data);

        // Pastikan response memiliki format yang diharapkan
        if (!response.data || response.data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tidak ditemukan hasil untuk pencarian ini.'
            });
        }

        // Ambil data hasil pencarian pertama
        const result = response.data;

        res.json({
            success: true,
            creator: "Bagus Bahril",
            video: {
                play_url: result.wmplay || "Tidak tersedia",
                size: result.size || "Tidak tersedia",
                wm_size: result.wm_size || "Tidak tersedia"
            },
            music: {
                title: result.music_info?.title || "Tidak tersedia",
                url: result.music_info?.play || "Tidak tersedia",
                cover: result.music_info?.cover || "Tidak tersedia",
                author: result.music_info?.author || "Tidak tersedia",
                duration: result.music_info?.duration || "Tidak tersedia"
            },
            stats: {
                play_count: result.play_count || 0,
                digg_count: result.digg_count || 0,
                comment_count: result.comment_count || 0,
                share_count: result.share_count || 0,
                download_count: result.download_count || 0
            },
            author: {
                id: result.author?.id || "Tidak tersedia",
                unique_id: result.author?.unique_id || "Tidak tersedia",
                nickname: result.author?.nickname || "Tidak tersedia",
                avatar: result.author?.avatar || "Tidak tersedia"
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data TikTok.',
            error: error.message
        });
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
        const apiUrl = `https://itzpire.com/stalk/tiktok?username=${encodeURIComponent(username)}`;
        const response = await fetch(apiUrl);
        const result = await response.json();

        if (result.status !== "success" || !result.data) {
            return res.json({ success: false, message: "Gagal mengambil data dari API TikTok." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril", // Watermark Creator
            data: {
                name: result.data.name,
                username: result.data.username,
                bio: result.data.bio,
                joined: result.data.joined,
                avatar: result.data.avatar,
                verified: result.data.verified,
                is_private: result.data.is_private,
                last_modified_name: result.data.last_modified_name,
                followers: result.data.followers,
                following: result.data.following,
                likes: result.data.likes,
                videos: result.data.videos,
                friends: result.data.friends
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

    
app.get('/stalker/chwa', async (req, res) => {
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
        return res.json({ success: false, message: "Isi parameter URL channel WhatsApp." });
    }

    try {
        const apiUrl = `https://itzpire.com/stalk/whatsapp-channel?url=${encodeURIComponent(url)}`;
        const response = await fetch(apiUrl);
        const result = await response.json();

        if (result.status !== "success" || !result.data) {
            return res.json({ success: false, message: "Gagal mengambil data dari API WhatsApp Channel." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril", // Watermark Creator
            data: {
                title: result.data.title,
                followers: result.data.followers,
                description: result.data.description,
                img: result.data.img
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
        

app.get('/stalker/freefire', async (req, res) => {
    const { apikey, id } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi parameter 'id'
    if (!id) {
        return res.json({ success: false, message: "Isi parameter ID Free Fire." });
    }

    try {
        const apiUrl = `https://api.vreden.web.id/api/ffstalk?id=${encodeURIComponent(id)}`;
        const response = await fetch(apiUrl);
        const result = await response.json();

        if (result.status !== 200 || !result.result) {
            return res.json({ success: false, message: "Gagal mengambil data dari API Free Fire." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril", // Watermark Creator
            data: {
                account: {
                    id: result.result.account.id,
                    name: result.result.account.name,
                    level: result.result.account.level,
                    xp: result.result.account.xp,
                    region: result.result.account.region,
                    like: result.result.account.like,
                    bio: result.result.account.bio,
                    create_time: result.result.account.create_time,
                    last_login: result.result.account.last_login,
                    honor_score: result.result.account.honor_score,
                    booyah_pass: result.result.account.booyah_pass,
                    booyah_pass_badge: result.result.account.booyah_pass_badge,
                    evo_access_badge: result.result.account.evo_access_badge,
                    equipped_title: result.result.account.equipped_title,
                    BR_points: result.result.account.BR_points,
                    CS_points: result.result.account.CS_points
                },
                pet_info: result.result.pet_info,
                guild: result.result.guild,
                ketua_guild: result.result.ketua_guild
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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
          
app.listen(PORT, () => {
  console.log(`Server berjalan pada http://localhost:${PORT}`);
});
