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
          
app.listen(PORT, () => {
  console.log(`Server berjalan pada http://localhost:${PORT}`);
});
