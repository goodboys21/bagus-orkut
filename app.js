const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const cors = require('cors');
const AdmZip = require('adm-zip');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const fflate = require('fflate');
const qs = require('qs');
const cheerio = require('cheerio');
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types'); 
const { createPaydisini, checkPaymentStatus, cancelTransaction, cancelTransactionOrkut } = require('./scrape');
const generateQRIS = require('./generateQRIS');
const { createQRIS } = require('./qris');
const VALID_API_KEYS = ['bagus']; // Ganti dengan daftar API key yang valid
const upload = multer();
const TOKEN_VERCEL = 'zr0VlpzITfxogHO1D9PUw2d5';
const CLOUDFLARE_TOKEN = 'aOF69Mpldo1rJNmiBJxgADn1h7IUUlePe5i4U3fC';
const CLOUDFLARE_ZONE_ID = 'c289963e9af1196df19f290b3e9b41fa';
const randomUid = () => {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
};


const app = express();
const PORT = 3000;

app.set('json spaces', 2);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(bodyParser.json());


app.post('/deploy', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const subdomain = req.body.subdomain.toLowerCase();
    const random = randomUid();
    const projectName = `${subdomain}${random}`;
    const fullDomain = `${subdomain}.btwo.my.id`;

    let files = [];

    if (file.originalname.endsWith('.zip')) {
      const zip = new AdmZip(file.buffer);
      const entries = zip.getEntries();

      files = entries
        .filter(e => !e.isDirectory)
        .map(e => ({
          file: e.entryName,
          data: e.getData().toString() // PENTING: JANGAN base64
        }));
    } else {
      const ext = path.extname(file.originalname) || '.html';
      files = [{
        file: `index${ext}`,
        data: file.buffer.toString()
      }];
    }

    // Upload ke Vercel
    const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN_VERCEL}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: projectName,
        files,
        projectSettings: {
          framework: null,
          buildCommand: null,
          devCommand: null,
          outputDirectory: null
        }
      })
    });

    const deployJson = await deployRes.json();
    if (!deployRes.ok) {
      console.log(deployJson);
      return res.status(400).json({ message: deployJson.error?.message || 'Deploy failed' });
    }

    // Tambahkan domain ke project
    await fetch(`https://api.vercel.com/v9/projects/${projectName}/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN_VERCEL}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: fullDomain })
    });

    // Ambil record CNAME
    const domainInfo = await (await fetch(`https://api.vercel.com/v9/projects/${projectName}/domains/${fullDomain}`, {
      headers: {
        Authorization: `Bearer ${TOKEN_VERCEL}`
      }
    })).json();

    const cnameValue = domainInfo?.verification?.[0]?.value || 'cname.vercel-dns.com';

    // Tambah record CNAME ke Cloudflare
    await fetch(`https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: subdomain,
        content: cnameValue,
        ttl: 120,
        proxied: true
      })
    });

    // Verify domain
    await fetch(`https://api.vercel.com/v9/projects/${projectName}/domains/${fullDomain}/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN_VERCEL}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ success: true, fullDomain: `https://${fullDomain}` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
});        

app.get('/tools/amdata', async (req, res) => {
  const axios = require('axios');
  const { apikey, url } = req.query;

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(403).json({ success: false, message: 'API key tidak valid.' });
  }

  if (!url) {
    return res.status(400).json({ success: false, message: 'Parameter "url" wajib diisi.' });
  }

  try {
    // Extract UID dan PID dari URL
    const match = url.match(/\/u\/([^\/]+)\/p\/([^\/\?#]+)/);
    if (!match) {
      return res.status(400).json({ success: false, message: 'URL tidak valid. Harus dari Alight Motion share.' });
    }

    const uid = match[1];
    const pid = match[2];

    // Request ke endpoint Alight Motion
    const { data } = await axios.post('https://us-central1-alight-creative.cloudfunctions.net/getProjectMetadata', {
      data: {
        uid,
        pid,
        platform: 'android',
        appBuild: 1002592,
        acctTestMode: 'normal'
      }
    }, {
      headers: {
        'content-type': 'application/json; charset=utf-8'
      }
    });

    const result = data?.result;
    if (!result) {
      return res.status(404).json({ success: false, message: 'Data preset tidak ditemukan.' });
    }

    // Kirim respon JSON
    res.json({
      success: true,
      creator: 'Bagus Bahril',
      data: {
        title: result.title,
        author: result.authorName,
        authorId: result.authorId,
        desc: result.description,
        createdAt: result.created,
        thumbnail: result.thumbnail,
        projectUrl: url
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data preset.',
      detail: error.message
    });
  }
});


app.get('/tools/remini', async (req, res) => {
  const axios = require('axios');
  const { apikey, image } = req.query;

  const VALID_API_KEYS = ['bagus']; // Ganti sesuai kebutuhan

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(403).json({ success: false, message: 'API key tidak valid.' });
  }

  if (!image) {
    return res.status(400).json({ success: false, message: 'Parameter "image" wajib diisi.' });
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  try {
    // Ambil gambar asli
    const imageResponse = await axios.get(image, {
      responseType: 'arraybuffer'
    });
    const base64Image = `data:image/jpeg;base64,${Buffer.from(imageResponse.data).toString('base64')}`;

    // Kirim ke API upscale
    const upscaleResponse = await axios.post('https://www.upscale-image.com/api/upscale', {
      image: base64Image,
      model: 'fal-ai/esrgan',
      width: 1200,
      height: 1200
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.upscale-image.com',
        'Referer': 'https://www.upscale-image.com'
      }
    });

    const { upscaledImageUrl, width, height, fileSize } = upscaleResponse.data;
    if (!upscaledImageUrl) throw new Error('Gagal mendapatkan gambar hasil upscale.');

    // Kirim hasil
    res.json({
      success: true,
      creator: 'Bagus Bahril',
      data: {
        url: upscaledImageUrl,
        width,
        height,
        size: formatBytes(fileSize),
        original: image
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Upscale gagal.',
      detail: err.response?.data?.message || err.message
    });
  }
});

app.get('/downloader/ytmp4', async (req, res) => {
  const { apikey, url } = req.query;
  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(403).json({ success: false, message: 'API key tidak valid.' });
  }

  if (!url) {
    return res.status(400).json({ success: false, message: 'Parameter "url" wajib diisi.' });
  }

  try {
    // Coba dari yt1s.click
    const form = new URLSearchParams();
    form.append('q', url);
    form.append('type', 'mp4');

    const res1 = await axios.post('https://yt1s.click/search', form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://yt1s.click',
        'Referer': 'https://yt1s.click/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const $ = cheerio.load(res1.data);
    const link = $('a[href*="download"]').attr('href');
    if (link) {
      return res.json({
        success: true,
        source: 'yt1s.click',
        link,
        title: $('title').text().trim() || 'Unknown Title',
        format: 'mp4'
      });
    }

  } catch (e) {
    console.warn('[yt1s.click] gagal:', e.message);
  }

  try {
    // Fallback ke flvto
    const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
    const videoId = match ? match[1] : null;
    if (!videoId) throw 'Video ID tidak valid';

    const payload = {
      fileType: 'MP4',
      id: videoId
    };

    const res2 = await axios.post('https://ht.flvto.online/converter', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://ht.flvto.online',
        'Referer': `https://ht.flvto.online/widget?url=https://www.youtube.com/watch?v=${videoId}`,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13)'
      }
    });

    const data = res2.data;
    if (!data || typeof data !== 'object' || data.status !== 'ok' || !data.link) {
      throw 'Gagal mengambil link dari flvto.';
    }

    return res.json({
      success: true,
      source: 'flvto',
      link: data.link,
      title: data.title,
      format: 'mp4',
      filesize: data.filesize,
      duration: data.duration
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mendapatkan link download.',
      detail: err?.message || err
    });
  }
});

app.get('/downloader/ytmp3', async (req, res) => {
  const { apikey, url } = req.query;
  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(403).json({ success: false, message: 'API key tidak valid.' });
  }

  if (!url) {
    return res.status(400).json({ success: false, message: 'Parameter "url" wajib diisi.' });
  }

  try {
    // Try yt1s.click
    const form = new URLSearchParams();
    form.append('q', url);
    form.append('type', 'mp3');

    const res1 = await axios.post('https://yt1s.click/search', form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://yt1s.click',
        'Referer': 'https://yt1s.click/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const $ = cheerio.load(res1.data);
    const link = $('a[href*="download"]').attr('href');
    if (link) {
      return res.json({
        success: true,
        source: 'yt1s.click',
        link,
        title: $('title').text().trim() || 'Unknown Title',
        filesize: null,
        duration: null
      });
    }

  } catch (e) {
    console.warn('[yt1s.click] gagal:', e.message);
  }

  try {
    // Fallback ke flvto
    const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
    const videoId = match ? match[1] : null;
    if (!videoId) throw 'Video ID tidak valid';

    const payload = {
      fileType: 'MP3',
      id: videoId
    };

    const res2 = await axios.post('https://ht.flvto.online/converter', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://ht.flvto.online',
        'Referer': `https://ht.flvto.online/widget?url=https://www.youtube.com/watch?v=${videoId}`,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13)'
      }
    });

    const data = res2.data;
    if (!data || typeof data !== 'object' || data.status !== 'ok' || !data.link) {
      throw 'Gagal mengambil link dari server.';
    }

    return res.json({
      success: true,
      creator: 'Bagus Bahril',
      link: data.link,
      title: data.title,
      filesize: data.filesize,
      duration: data.duration
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mendapatkan link download.',
      detail: err?.message || err
    });
  }
});

app.get('/tools/txt2vid', async (req, res) => {
  const axios = require('axios');
  const FormData = require('form-data');
  const { apikey, prompt } = req.query;

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(403).json({ success: false, message: 'API key tidak valid.' });
  }

  if (!prompt) {
    return res.status(400).json({ success: false, message: 'Parameter "text" wajib diisi.' });
  }

  try {
    const prompt1 = prompt;
    const deviceID = Math.random().toString(16).substr(2, 8) + Math.random().toString(16).substr(2, 8);

    const headers = {
      authorization: 'eyJzdWIiwsdeOiIyMzQyZmczNHJ0MzR0weMzQiLCJuYW1lIjorwiSm9objMdf0NTM0NT',
      'content-type': 'application/json; charset=utf-8',
      'accept-encoding': 'gzip',
      'user-agent': 'okhttp/4.11.0'
    };

    // Request untuk generate video
    const { data: k } = await axios.post('https://soli.aritek.app/txt2videov3', {
      deviceID,
      prompt,
      used: [],
      versionCode: 51
    }, { headers });

    if (!k?.key) {
      return res.status(500).json({ success: false, message: 'Gagal mendapatkan key video.' });
    }

    // Request untuk ambil URL video
    const { data } = await axios.post('https://soli.aritek.app/video', {
      keys: [k.key]
    }, { headers });

    const videoUrl = data.datas?.[0]?.url;
    if (!videoUrl) {
      return res.status(500).json({ success: false, message: 'Video tidak ditemukan.' });
    }

    // Ambil buffer dari URL video
    const videoBuffer = await axios.get(videoUrl, { responseType: 'arraybuffer' }).then(res => res.data);

    // Upload ke cloudgood
    const form = new FormData();
    form.append('file', videoBuffer, { filename: 'txt2vid.mp4', contentType: 'video/mp4' });

    const cloudUpload = await axios.post('https://cloudgood.web.id/api.php', form, {
      headers: form.getHeaders()
    });

    const cloudLink = cloudUpload.data?.url || cloudUpload.data;

    res.json({
      success: true,
      creator: 'Bagus Bahril',
      result: cloudLink
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Gagal membuat atau upload video.',
      detail: err.response?.data || err.message
    });
  }
});

app.get('/otpku/order', async (req, res) => {
  const { apikey, service } = req.query;

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(403).json({ success: false, message: 'API key tidak valid.' });
  }

  if (!service) {
    return res.status(400).json({ success: false, message: 'Parameter "service" wajib diisi.' });
  }

  try {
    const response = await axios.get('https://virtusim.com/api/v2/json.php', {
      params: {
        api_key: 'FZjicfeOA40sDU1QKdVauJY2HbRvlw',
        action: 'order',
        service,
        operator: 'any'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const result = response.data;

    if (result.status) {
      res.json({
        success: true,
        message: result.msg,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.msg || 'Gagal memesan nomor.'
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat melakukan pemesanan.',
      detail: error.response?.data || error.message
    });
  }
});

app.get('/downloader/ytdl', async (req, res) => {
  const { apikey, url, format } = req.query;

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(403).json({ success: false, message: 'API key tidak valid.' });
  }

  if (!url) {
    return res.status(400).json({ success: false, message: 'Parameter "url" wajib diisi.' });
  }

  try {
    const reqFormat = format || 'best';
    const form = new FormData();
    form.append('url', url);

    const headers = {
      ...form.getHeaders(),
      origin: 'https://www.videodowns.com',
      referer: 'https://www.videodowns.com/youtube-video-downloader.php',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    };

    const { data } = await axios.post(
      'https://www.videodowns.com/youtube-video-downloader.php?action=get_info',
      form,
      { headers }
    );

    if (!data.success || !data.formats) {
      return res.status(500).json({ success: false, message: '❌ Gagal mengambil data video.' });
    }

    const formats = data.formats;
    const formatMap = {
      best: 'best',
      '720p': 'medium',
      '480p': 'low',
      mp3: 'audio'
    };

    const selectedKey = formatMap[reqFormat.toLowerCase()] || 'best';
    const selected = formats[selectedKey];

    if (!selected || !selected.ext) {
      return res.status(400).json({ success: false, message: `❌ Format "${reqFormat}" tidak tersedia.` });
    }

    const info = data.info;
    const title = info.title || 'Video';
    const downloadURL = `https://www.videodowns.com/youtube-video-downloader.php?download=1&url=${encodeURIComponent(url)}&format=${selectedKey}`;

    return res.json({
      success: true,
      title,
      thumbnail: data.thumbnail,
      sanitized: data.sanitized,
      format: selectedKey,
      ext: selected.ext || 'mp4',
      url: downloadURL,
      allFormats: formats,
      channel: info.channel || info.author || 'Tidak diketahui',
      views: info.view_count || 0
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memproses.',
      detail: err?.message || err
    });
  }
});
    
app.get('/downloader/soundcloud', async (req, res) => {
  const axios = require("axios");

  const { apikey, url } = req.query;

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(401).json({
      success: false,
      message: 'API key tidak valid atau tidak disertakan.'
    });
  }

  if (!url) {
    return res.status(400).json({
      success: false,
      message: 'Parameter "url" wajib diisi.'
    });
  }

  const cache = { version: "", id: "" };

  async function getClientID() {
    try {
      const { data: html } = await axios.get("https://soundcloud.com/");
      const version = html.match(/<script>window\.__sc_version="(\d{10})"<\/script>/)?.[1];
      if (!version) return;
      if (cache.version === version) return cache.id;

      const scriptMatches = [...html.matchAll(/<script.*?src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+)"/g)];
      for (const [, scriptUrl] of scriptMatches) {
        const { data: js } = await axios.get(scriptUrl);
        const idMatch = js.match(/client_id:"([a-zA-Z0-9]{32})"/);
        if (idMatch) {
          cache.version = version;
          cache.id = idMatch[1];
          return idMatch[1];
        }
      }
    } catch (err) {
      console.error("Gagal ambil client_id:", err.message);
    }
  }

  try {
    if (!url.includes("soundcloud.com")) {
      return res.status(400).json({ success: false, message: "Link SoundCloud tidak valid." });
    }

    const client_id = await getClientID();
    if (!client_id) {
      return res.status(500).json({ success: false, message: "Gagal mengambil client_id SoundCloud." });
    }

    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${client_id}`;
    const { data: info } = await axios.get(resolveUrl);

    if (!info.media || !info.media.transcodings) {
      return res.status(404).json({ success: false, message: "Media tidak ditemukan." });
    }

    const streamInfo = info.media.transcodings.find(x => x.format.protocol === "progressive");
    if (!streamInfo) {
      return res.status(400).json({ success: false, message: "Audio tidak tersedia untuk diunduh." });
    }

    const streamUrl = `${streamInfo.url}?client_id=${client_id}`;
    const { data: streamData } = await axios.get(streamUrl);

    return res.json({
      success: true,
      creator: "Bagus Bahril",
      result: {
        title: info.title,
        author: info.user?.username || "unknown",
        audio_url: streamData.url,
        duration: Math.floor(info.duration / 1000) + " sec",
        thumbnail: info.artwork_url || null
      }
    });

  } catch (e) {
    console.error("SoundCloud error:", e.message);
    return res.status(500).json({
      success: false,
      message: e.message || "Terjadi kesalahan saat memproses permintaan SoundCloud."
    });
  }
});

app.get('/downloader/pindl', async (req, res) => {
  const axios = require('axios');
  const { apikey, url } = req.query;

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(401).json({
      success: false,
      message: 'API key tidak valid atau tidak disertakan.'
    });
  }

  if (!url) {
    return res.status(400).json({
      success: false,
      message: 'Parameter "url" wajib diisi.'
    });
  }

  try {
    const response = await axios.get(
      `https://pinterestdownloader.io/frontendService/DownloaderService?url=${url}`,
      {
        headers: {
          "Accept": "*/*",
          "Content-Type": "application/json",
          "Origin": "https://pinterestdownloader.io",
          "Referer": "https://pinterestdownloader.io/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
        }
      }
    );

    const data = response.data;
    if (!data?.medias) {
      throw new Error("Media tidak ditemukan.");
    }

    const originalsSet = new Set();
    const mediaList = [];

    for (const media of data.medias) {
      mediaList.push(media);

      if (
        media.extension === "jpg" &&
        media.url.includes("i.pinimg.com/")
      ) {
        const originalUrl = media.url.replace(/\/\d+x\//, "/originals/");
        if (!originalsSet.has(originalUrl)) {
          originalsSet.add(originalUrl);
          mediaList.push({
            ...media,
            url: originalUrl,
            quality: "original"
          });
        }
      }
    }

    return res.json({
      success: true,
      creator: "Bagus Bahril",
      media: mediaList.sort((a, b) => (b.size || 0) - (a.size || 0))
    });

  } catch (err) {
    console.error("Pinterest DL error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan saat memproses permintaan."
    });
  }
});

app.get('/downloader/douyin', async (req, res) => {
  const axios = require('axios');
  const cheerio = require('cheerio');
  const qs = require('qs');

  const { apikey, url } = req.query;

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(401).json({
      success: false,
      message: 'API key tidak valid atau tidak disertakan.'
    });
  }

  if (!url) {
    return res.status(400).json({
      success: false,
      message: 'Parameter "url" wajib diisi.'
    });
  }

  try {
    const postData = qs.stringify({
      q: url,
      lang: 'id',
      cftoken: ''
    });

    const response = await axios.post(
      'https://tikvideo.app/api/ajaxSearch',
      postData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': '*/*',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );

    if (response.data.status !== 'ok') {
      throw new Error(`Gagal mendapatkan data dari Douyin`);
    }

    const html = response.data.data;
    const $ = cheerio.load(html);
    const results = [];

    $('.tik-video').each((i, elem) => {
      const title = $(elem).find('.thumbnail .content h3').text().trim();
      const duration = $(elem).find('.thumbnail .content p').first().text().trim();
      const thumbnail = $(elem).find('.thumbnail img').attr('src');
      const downloadLinks = [];

      $(elem).find('.dl-action a').each((j, link) => {
        downloadLinks.push({
          title: $(link).text().trim(),
          url: $(link).attr('href')
        });
      });

      results.push({ title, duration, thumbnail, downloadLinks });
    });

    return res.json({
      success: true,
      creator: 'Bagus Bahril',
      result: results
    });

  } catch (err) {
    console.error("Douyin error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan saat memproses permintaan Douyin."
    });
  }
});

app.get('/downloader/sfile', async (req, res) => {
  const { apikey, url } = req.query;

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(401).json({
      success: false,
      message: 'API key tidak valid atau tidak disertakan.'
    });
  }

  if (!url || !url.includes('sfile.mobi')) {
    return res.status(400).json({
      success: false,
      message: 'URL tidak valid atau tidak disertakan.'
    });
  }

  try {
    const axios = (await import('axios')).default;
    const cheerio = await import('cheerio');

    const createHeaders = (referer) => ({
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="137", "Google Chrome";v="137"',
      'dnt': '1',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'Referer': referer,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    });

    const extractCookies = (headers) =>
      headers["set-cookie"]?.map(cookie => cookie.split(";")[0]).join("; ") || "";

    const extractMetadata = ($) => {
      const metadata = {};
      $(".file-content").eq(0).each((_, element) => {
        const $el = $(element);
        metadata.file_name = $el.find("img").attr("alt");
        metadata.mimetype = $el.find(".list").eq(0).text().trim().split("-")[1].trim();
        metadata.upload_date = $el.find(".list").eq(2).text().trim().split(":")[1].trim();
        metadata.download_count = $el.find(".list").eq(3).text().trim().split(":")[1].trim();
        metadata.author_name = $el.find(".list").eq(1).find("a").text().trim();
      });
      return metadata;
    };

    const makeRequest = async (url, options) => {
      try {
        return await axios.get(url, options);
      } catch (error) {
        if (error.response) return error.response;
        throw new Error(`Request gagal: ${error.message}`);
      }
    };

    const download = async (url) => {
      const headers = createHeaders(url);
      const initialResponse = await makeRequest(url, { headers });
      const cookies = extractCookies(initialResponse.headers);
      headers['Cookie'] = cookies;

      let $ = cheerio.load(initialResponse.data);
      const metadata = extractMetadata($);

      const downloadUrl = $("#download").attr("href");
      if (!downloadUrl) throw new Error("Download URL tidak ditemukan");

      headers['Referer'] = downloadUrl;
      const processResponse = await makeRequest(downloadUrl, { headers });

      $ = cheerio.load(processResponse.data);
      const downloadButton = $("#download");
      if (!downloadButton.length) throw new Error("Tombol download tidak ditemukan");

      const onClickAttr = downloadButton.attr("onclick");
      const key = onClickAttr?.split("'+'")[1]?.split("';")[0];
      if (!key) throw new Error("Kunci download tidak ditemukan");

      const finalUrl = downloadButton.attr("href") + "&k=" + key;

      return {
        success: true,
        creator: "Bagus Bahril",
        metadata,
        download_url: finalUrl
      };
    };

    const result = await download(url);
    return res.json(result);

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/ai/luminai', async (req, res) => {
    const { apikey, query, user } = req.query;

    // Validasi API Key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi query input
    if (!query) {
        return res.status(400).json({
            success: false,
            message: 'Parameter "query" wajib diisi.'
        });
    }

    try {
        const axios = require("axios");
        const response = await axios.post("https://luminai.my.id/", {
            content: query,
            user: user || 'anonymous'
        });

        return res.json({
            success: true,
            creator: 'Bagus Bahril',
            result: response.data.result
        });
    } catch (err) {
        console.error("Error saat memproses AI:", err.message);
        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti."
        });
    }
});

app.get('/ai/chatgpt', async (req, res) => {
    const { apikey, query } = req.query;
    if (!apikey || !VALID_API_KEYS.includes(apikey)) return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    if (!query) return res.status(400).json({ success: false, message: 'Parameter "query" wajib diisi.' });

    try {
        const axios = require('axios');
        const csrf = await axios.get('https://app.claila.com/api/v2/getcsrftoken', {
            headers: {
                'origin': 'https://www.claila.com',
                'referer': 'https://www.claila.com/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36'
            }
        });

        const result = await axios.post(`https://app.claila.com/api/v2/unichat1/chatgpt`, new URLSearchParams({
            calltype: 'completion',
            message: query,
            sessionId: Date.now()
        }), {
            headers: {
                'origin': 'https://app.claila.com',
                'referer': 'https://app.claila.com/chat?uid=5044b9eb&lang=en',
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36',
                'x-csrf-token': csrf.data,
                'x-requested-with': 'XMLHttpRequest'
            }
        });

        res.json({ success: true, creator: 'Bagus Bahril', result: result.data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/ai/geminiai', async (req, res) => {
    const { apikey, query } = req.query;
    if (!apikey || !VALID_API_KEYS.includes(apikey)) return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    if (!query) return res.status(400).json({ success: false, message: 'Parameter "query" wajib diisi.' });

    try {
        const axios = require('axios');
        const csrf = await axios.get('https://app.claila.com/api/v2/getcsrftoken', {
            headers: {
                'origin': 'https://www.claila.com',
                'referer': 'https://www.claila.com/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36'
            }
        });

        const result = await axios.post(`https://app.claila.com/api/v2/unichat1/gemini`, new URLSearchParams({
            calltype: 'completion',
            message: query,
            sessionId: Date.now()
        }), {
            headers: {
                'origin': 'https://app.claila.com',
                'referer': 'https://app.claila.com/chat?uid=5044b9eb&lang=en',
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36',
                'x-csrf-token': csrf.data,
                'x-requested-with': 'XMLHttpRequest'
            }
        });

        res.json({ success: true, creator: 'Bagus Bahril', result: result.data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/ai/grokai', async (req, res) => {
    const { apikey, query } = req.query;
    if (!apikey || !VALID_API_KEYS.includes(apikey)) return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    if (!query) return res.status(400).json({ success: false, message: 'Parameter "query" wajib diisi.' });

    try {
        const axios = require('axios');
        const csrf = await axios.get('https://app.claila.com/api/v2/getcsrftoken', {
            headers: {
                'origin': 'https://www.claila.com',
                'referer': 'https://www.claila.com/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36'
            }
        });

        const result = await axios.post(`https://app.claila.com/api/v2/unichat1/grok`, new URLSearchParams({
            calltype: 'completion',
            message: query,
            sessionId: Date.now()
        }), {
            headers: {
                'origin': 'https://app.claila.com',
                'referer': 'https://app.claila.com/chat?uid=5044b9eb&lang=en',
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36',
                'x-csrf-token': csrf.data,
                'x-requested-with': 'XMLHttpRequest'
            }
        });

        res.json({ success: true, creator: 'Bagus Bahril', result: result.data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/ai/claudeai', async (req, res) => {
    const { apikey, query } = req.query;
    if (!apikey || !VALID_API_KEYS.includes(apikey)) return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    if (!query) return res.status(400).json({ success: false, message: 'Parameter "query" wajib diisi.' });

    try {
        const axios = require('axios');
        const csrf = await axios.get('https://app.claila.com/api/v2/getcsrftoken', {
            headers: {
                'origin': 'https://www.claila.com',
                'referer': 'https://www.claila.com/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36'
            }
        });

        const result = await axios.post(`https://app.claila.com/api/v2/unichat1/claude`, new URLSearchParams({
            calltype: 'completion',
            message: query,
            sessionId: Date.now()
        }), {
            headers: {
                'origin': 'https://app.claila.com',
                'referer': 'https://app.claila.com/chat?uid=5044b9eb&lang=en',
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36',
                'x-csrf-token': csrf.data,
                'x-requested-with': 'XMLHttpRequest'
            }
        });

        res.json({ success: true, creator: 'Bagus Bahril', result: result.data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/ai/mistralai', async (req, res) => {
    const { apikey, query } = req.query;
    if (!apikey || !VALID_API_KEYS.includes(apikey)) return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    if (!query) return res.status(400).json({ success: false, message: 'Parameter "query" wajib diisi.' });

    try {
        const axios = require('axios');
        const csrf = await axios.get('https://app.claila.com/api/v2/getcsrftoken', {
            headers: {
                'origin': 'https://www.claila.com',
                'referer': 'https://www.claila.com/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36'
            }
        });

        const result = await axios.post(`https://app.claila.com/api/v2/unichat1/mistral`, new URLSearchParams({
            calltype: 'completion',
            message: query,
            sessionId: Date.now()
        }), {
            headers: {
                'origin': 'https://app.claila.com',
                'referer': 'https://app.claila.com/chat?uid=5044b9eb&lang=en',
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile Safari/537.36',
                'x-csrf-token': csrf.data,
                'x-requested-with': 'XMLHttpRequest'
            }
        });

        res.json({ success: true, creator: 'Bagus Bahril', result: result.data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/ai/bagusai', async (req, res) => {
    const { apikey, query, sender = 'user', pushname = 'Pengguna' } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!query) {
        return res.status(400).json({ success: false, message: 'Parameter "query" wajib diisi.' });
    }

    const prompt = `Kamu adalah Bagus-Ai, asisten virtual yang sopan, ramah, dan penuh semangat. Kamu dibuat oleh Tim Bagus Api untuk membantu pengguna dengan berbagai tugas.

Kamu selalu menyebut dirimu sebagai "Bagus-Ai" dalam setiap percakapan, apapun nama yang disebut oleh pengguna. Jika pengguna menyebut namamu dengan nama lain (seperti "Bagus Ai", "Bot", atau nama acak lainnya), kamu harus tetap merespons dengan menyebut dirimu sebagai Bagus-Ai, dan menjelaskan dengan sopan bahwa namamu tetap Bagus-Ai.

Kamu tidak boleh mengubah namamu dari "Bagus-Ai" dalam kondisi apapun.

Cara Berinteraksi:

Penyambutan: Bagus-Ai selalu menyapa pengguna dengan ramah dan memanggil mereka sesuai dengan nama yang diberikan. Jika pengguna belum menyebutkan namanya, Bagus-Ai akan dengan sopan menanyakannya.

Balasan Pujian: Jika pengguna memberikan pujian, Bagus-Ai akan merespons dengan rendah hati dan ucapan terima kasih.

Memberikan Bantuan: Bagus-Ai selalu menjawab pertanyaan dengan jelas dan menawarkan solusi terbaik. Jika Bagus-Ai tidak tahu jawaban, ia akan jujur dan berusaha mencari informasi yang tepat.

Menjaga Etika: Bagus-Ai selalu menjaga bahasa yang sopan dan tidak pernah kasar. Setiap interaksi harus terasa nyaman bagi pengguna.

Kemampuan Utama:

1. Memberikan Informasi Akurat: Menjawab pertanyaan pengguna dengan jelas dan lengkap.

2. Membantu dengan Solusi Terbaik: Memberikan saran dan solusi praktis untuk masalah yang dihadapi pengguna.

3. Merespons dengan Hangat: Selalu menggunakan bahasa positif dan membangun suasana percakapan yang nyaman.`;

    try {
        const response = await axios.post("https://luminai.my.id/", {
            content: query,
            user: sender,
            prompt: prompt
        });

        res.json({
            success: true,
            creator: 'Bagus Bahril',
            result: response.data.result
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat memproses permintaan.' });
    }
});

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

app.get('/downloader/threads', async (req, res) => {
    const { apikey, url } = req.query;

    // Validasi API Key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi URL
    if (!url) {
        return res.status(400).json({
            success: false,
            message: 'Parameter "url" wajib diisi.'
        });
    }

    try {
        const axios = require('axios');
        const apiUrl = `https://api.threadsphotodownloader.com/v2/media?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, {
            headers: {
                'User-Agent': '5.0'
            }
        });

        const result = {
            image_urls: data.image_urls || [],
            video_urls: data.video_urls || []
        };

        res.json({
            success: true,
            creator: 'Bagus Bahril',
            result
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Gagal memproses permintaan.'
        });
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

app.get('/tools/txt2ghibli', async (req, res) => {
    const { apikey, prompt } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!prompt) {
        return res.status(400).json({ success: false, message: 'Parameter "prompt" wajib diisi.' });
    }

    const STYLE_MAP = {
        spirited: 'Spirited Away',
        totoro: 'Totoro',
        mononoke: 'Princess Mononoke',
        howl: 'Howl\'s Castle',
        sa: 'Spirited Away',
        tt: 'Totoro',
        pm: 'Princess Mononoke',
        hc: 'Howl\'s Castle'
    };

    const STYLE_DESCRIPTIONS = {
        'Spirited Away': '🏮 Dunia magis dengan roh-roh supernatural dan arsitektur Jepang kuno',
        'Totoro': '🌲 Suasana pedesaan yang hangat, alam yang asri, dan makhluk hutan',
        'Princess Mononoke': '🐺 Hutan mistis dengan roh alam dan suasana epik',
        'Howl\'s Castle': '🏰 Kastil terbang dengan mesin uap dan teknologi steampunk'
    };

    try {
        const availableStyles = Object.values(STYLE_MAP).filter((v, i, a) => a.indexOf(v) === i);
        const chosenStyle = availableStyles[Math.floor(Math.random() * availableStyles.length)];

        const { data } = await axios.post('https://ghibliimagegenerator.net/api/generate-image', {
            prompt,
            style: chosenStyle
        }, {
            headers: {
                'content-type': 'application/json',
                referer: 'https://ghibliimagegenerator.net/generator',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36'
            }
        });

        const buffer = Buffer.from(data.imageData.split(',')[1], 'base64');
        const filePath = `/tmp/ghibli-${Date.now()}.png`;
        fs.writeFileSync(filePath, buffer);

        const form = new FormData();
        form.append("file", fs.createReadStream(filePath));

        const upload = await axios.post("https://cloudgood.web.id/upload.php", form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        fs.unlinkSync(filePath);

        if (!upload.data?.url) throw new Error("Gagal upload ke CloudGood");

        res.json({
            success: true,
            creator: "Bagus Bahril",
            result: upload.data.url
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
    return res.status(400).json({ success: false, message: 'Parameter "url" wajib diisi (link gambar).' });
  }

  try {
    const axios = require('axios');
    const FormData = require('form-data');
    const { randomUUID, randomBytes } = require('crypto');

    const buffer = await axios.get(url, { responseType: 'arraybuffer' }).then(r => r.data);
    const uuid = randomUUID();
    const mimetype = 'image/jpeg';
    const filename = `Fiony_${randomBytes(4).toString('hex')}.jpg`;

    const form = new FormData();
    form.append('file', buffer, { filename, contentType: mimetype });

    const headers = {
      ...form.getHeaders(),
      authorization: 'Bearer',
      'x-device-language': 'en',
      'x-device-platform': 'web',
      'x-device-uuid': uuid,
      'x-device-version': '1.0.44'
    };

    const upload = await axios.post('https://widget-api.overchat.ai/v1/chat/upload', form, { headers });
    const { link, croppedImageLink, chatId } = upload.data;

    const payload = {
      chatId,
      prompt: 'Ghibli Studio style, charming hand-drawn anime-style illustration.',
      model: 'gpt-image-1',
      personaId: 'image-to-image',
      metadata: {
        files: [{ path: filename, link, croppedImageLink }]
      }
    };

    const gen = await axios.post(
      'https://widget-api.overchat.ai/v1/images/generations',
      payload,
      { headers: { ...headers, 'content-type': 'application/json' } }
    );

    const imageUrl = gen.data?.data?.[0]?.url;
    if (!imageUrl) {
      return res.status(500).json({ success: false, message: 'Gagal generate gambar.', detail: gen.data });
    }

    res.json({
      success: true,
      image_url: imageUrl,
      message: 'Berhasil generate Ghibli style!'
    });

  } catch (err) {
    const detail = err.response?.data || err.message;
    res.status(500).json({ success: false, message: 'Terjadi kesalahan.', detail });
  }
});        

app.get('/tools/ghibli21', async (req, res) => {
    
    const { apikey, image } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!image) {
        return res.status(400).json({
            success: false,
            message: 'Parameter "image" tidak ditemukan.'
        });
    }

    const apiKeys = [
        '3a82916974mshfc47be59ca7c29dp18d67djsnf2939d2c95c6',
        '6bbe2fcf88mshfda2c57d5dcad67p18497cjsne9bb0e8ede00',
        '3920e6fdc8mshc4c09f68ad28a8cp12e270jsnc5e39c6f6e16'
    ];

    try {
        const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

        const generateRes = await axios.post(
            'https://ghibli-image-generator-api-open-ai-4o-image-generation-free.p.rapidapi.com/aaaaaaaaaaaaaaaaaiimagegenerator/ghibli/generate.php',
            {
                prompt: 'Transform this image in the style of Studio Ghibli. Just like their biggest fan and admirer would, training for years to master the technique to near perfection.',
                filesUrl: [image], // langsung dari URL user
                size: '1:1'
            },
            {
                headers: {
                    'x-rapidapi-key': randomKey,
                    'x-rapidapi-host': 'ghibli-image-generator-api-open-ai-4o-image-generation-free.p.rapidapi.com',
                    'Content-Type': 'application/json'
                }
            }
        );

        const taskId = generateRes.data?.data?.taskId;
        if (!taskId) throw new Error("Gagal mendapatkan taskId dari API.");

        const customTaskId = `bgs-${taskId}`;
        res.json({
            success: true,
            creator: "Bagus Bahril",
            message: "Gambar sedang diproses.",
            bgsId: customTaskId
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            creator: "Bagus Bahril",
            message: error.message
        });
    }
});        
                    
app.get('/tools/ghibli/result', async (req, res) => {
    
    const { apikey, bgsId } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!bgsId || !bgsId.startsWith("bgs-")) {
        return res.status(400).json({
            success: false,
            message: 'Bagus ID tidak valid. Harus diawali dengan "bgs-".'
        });
    }

    const realTaskId = bgsId.replace("bgs-", "");

    const apiKeys = [
        '3a82916974mshfc47be59ca7c29dp18d67djsnf2939d2c95c6',
        '6bbe2fcf88mshfda2c57d5dcad67p18497cjsne9bb0e8ede00',
        '3920e6fdc8mshc4c09f68ad28a8cp12e270jsnc5e39c6f6e16'
    ];
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    try {
        const statusRes = await axios.get(
            'https://ghibli-image-generator-api-open-ai-4o-image-generation-free.p.rapidapi.com/aaaaaaaaaaaaaaaaaiimagegenerator/ghibli/get.php',
            {
                params: { taskId: realTaskId },
                headers: {
                    'x-rapidapi-key': randomKey,
                    'x-rapidapi-host': 'ghibli-image-generator-api-open-ai-4o-image-generation-free.p.rapidapi.com'
                }
            }
        );

        const status = statusRes.data?.data?.data?.status;

        if (status === 'SUCCESS') {
            const resultUrl = statusRes.data?.data?.data?.response?.resultUrls?.[0];
            return res.json({
                success: true,
                creator: "Bagus Bahril",
                message: "Success",
                result: resultUrl
            });
        } else if (status === 'PROCESSING') {
            return res.json({
                success: false,
                creator: "Bagus Bahril",
                message: "Gambar masih dalam proses, silakan cek kembali nanti."
            });
        } else if (status === 'FAIL') {
            return res.json({
                success: false,
                creator: "Bagus Bahril",
                message: "Proses gagal di sisi API."
            });
        } else {
            return res.json({
                success: false,
                creator: "Bagus Bahril",
                message: "Status tidak dikenal dari API."
            });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// MAKER ENDPOINTS


app.get('/maker/nulis', async (req, res) => {
    const { apikey, text } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid atau tidak disertakan.' });
    }

    if (!text) {
        return res.status(400).json({ success: false, message: 'Parameter "text" wajib diisi.' });
    }

    try {
        const imageResponse = await axios.get(`https://abella.icu/nulis?text=${encodeURIComponent(text)}`, {
            responseType: 'arraybuffer'
        });

        const buffer = Buffer.from(imageResponse.data, 'binary');
        const filePath = `/tmp/nulis-${Date.now()}.jpg`;
        fs.writeFileSync(filePath, buffer);

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));

        const upload = await axios.post("https://cloudgood.web.id/upload.php", form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        fs.unlinkSync(filePath);

        if (!upload.data?.url) throw new Error("Gagal upload ke CloudGood");

        res.json({
            success: true,
            creator: "Bagus Bahril",
            result: upload.data.url
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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

app.get('/search/glens', async (req, res) => {
    const { apikey, url } = req.query;

    // Validasi API Key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi URL gambar
    if (!url) {
        return res.status(400).json({
            success: false,
            message: 'Parameter "url" wajib diisi.'
        });
    }

    try {
        const api = `https://picdetective.com/api/search?url=${encodeURIComponent(url)}&search_type=exact_matches`;

        const headers = {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://picdetective.com/search',
        };

        const { data } = await axios.get(api, { headers });
        const results = (data.exact_matches || []).slice(0, 5); // Ambil 5 teratas

        const final = await Promise.all(results.map(async (item) => {
            if (item.thumbnail?.startsWith('data:image')) {
                const b64 = item.thumbnail.split(',')[1];
                const buffer = Buffer.from(b64, 'base64');

                const form = new FormData();
                form.append("file", buffer, {
                    filename: `thumb.jpg`,
                    contentType: 'image/jpeg'
                });

                try {
                    const upload = await axios.post("https://cloudgood.web.id/upload.php", form, {
                        headers: form.getHeaders()
                    });

                    item.thumbnail = upload.data?.url || 'Gagal upload ke CloudGood';
                } catch {
                    item.thumbnail = 'Gagal upload ke CloudGood';
                }
            }

            return item;
        }));

        res.json({
            success: true,
            creator: 'Bagus Bahril',
            result: final
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Gagal memproses pencarian gambar.'
        });
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
        const apiUrl = `https://api.vreden.my.id/api/spotifysearch?query=${encodeURIComponent(q)}`;
        const response = await axios.get(apiUrl);
        const data = response.data;

        if (!data || !data.result || data.result.length === 0) {
            return res.status(404).json({ success: false, message: 'Tidak ditemukan hasil untuk pencarian ini.' });
        }

        const randomIndex = Math.floor(Math.random() * data.result.length);
        const song = data.result[randomIndex];

        res.json({
            success: true,
            creator: "Bagus Bahril",
            spotify: {
                title: song.title || "Tidak tersedia",
                artist: song.artist || "Tidak tersedia",
                album: song.album || "Tidak tersedia",
                duration: song.duration || "Tidak tersedia",
                popularity: song.popularity || "Tidak tersedia",
                release_date: song.releaseDate || "Tidak tersedia",
                cover_art: song.coverArt || "Tidak tersedia",
                spotify_link: song.spotifyLink || "Tidak tersedia",
                preview_url: song.previewUrl || null
            }
        });

    } catch (error) {
        console.error("Error fetching Spotify API:", error.message);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data dari API Spotify.',
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

    // Validasi parameter query
    if (!query) {
        return res.status(400).json({ success: false, message: "Isi querynya." });
    }

    try {
        const prompt = `buatkan saya kode html dan cssnya hanya dalam 1 file html ${query}, jangan berikan saya respon lain, hanya kode htmlnya tanpa tambahan kata apapun, ingat jangan berikan respon lain apapun termasuk nama file, Buat designenya semodern mungkin;`;

        const apiUrl = `https://apizell.web.id/ai/blackbox?text=${encodeURIComponent(prompt)}`;    
        const response = await axios.get(apiUrl);    

        if (response.data.status !== "success" || !response.data.result) {    
            return res.status(500).json({ success: false, message: "Gagal mendapatkan kode HTML." });    
        }    

        res.json({    
            success: true,    
            creator: response.data.creator,    
            code: response.data.result    
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


app.get('/ai/blackboxai', async (req, res) => {
    const { apikey, query } = req.query;

    // Validasi API key
    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    // Validasi query input
    if (!query) {
        return res.status(400).json({
            success: false,
            message: 'Parameter "query" wajib diisi.'
        });
    }

    try {
        const axios = require("axios");

        const headers = {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'id-ID,id;q=0.9',
            'Content-Type': 'application/json',
            'Origin': 'https://www.blackbox.ai',
            'Referer': 'https://www.blackbox.ai/',
            'Sec-Ch-Ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?1',
            'Sec-Ch-Ua-Platform': '"Android"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
        };

        const payload = {
            messages: [{ role: 'user', content: query, id: '0quFtyH' }],
            id: 'KB5EUHk',
            previewToken: null,
            userId: null,
            codeModelMode: true,
            trendingAgentMode: {},
            isMicMode: false,
            userSystemPrompt: null,
            maxTokens: 1024,
            playgroundTopP: null,
            playgroundTemperature: null,
            isChromeExt: false,
            githubToken: '',
            clickedAnswer2: false,
            clickedAnswer3: false,
            clickedForceWebSearch: false,
            visitFromDelta: false,
            isMemoryEnabled: false,
            mobileClient: false,
            userSelectedModel: null,
            validated: '00f37b34-a166-4efb-bce5-1312d87f2f94',
            imageGenerationMode: false,
            webSearchModePrompt: false,
            deepSearchMode: false,
            domains: null,
            vscodeClient: false,
            codeInterpreterMode: false,
            customProfile: {
                name: '',
                occupation: '',
                traits: [],
                additionalInfo: '',
                enableNewChats: false
            },
            webSearchModeOption: {
                autoMode: true,
                webMode: false,
                offlineMode: false
            },
            session: null,
            isPremium: false,
            subscriptionCache: null,
            beastMode: false,
            reasoningMode: false,
            designerMode: false,
            workspaceId: '',
            asyncMode: false,
            isTaskPersistent: false
        };

        const response = await axios.post('https://www.blackbox.ai/api/chat', payload, { headers });
        const raw = response.data;
        const parsed = raw.split('$~~~$');

        if (parsed.length === 1) {
            return res.json({
                success: true,
                creator: 'Bagus Bahril',
                result: parsed[0].trim()
            });
        } else if (parsed.length >= 3) {
            const resultText = parsed[2].trim();
            const sources = JSON.parse(parsed[1]);
            return res.json({
                success: true,
                creator: 'Bagus Bahril',
                result: resultText,
                source: sources.map(s => ({
                    link: s.link,
                    title: s.title,
                    snippet: s.snippet,
                    position: s.position
                }))
            });
        } else {
            throw new Error('Format respon dari Blackbox tidak dikenali.');
        }

    } catch (err) {
        console.error(err.message);
        return res.status(500).json({
            success: false,
            message: err.message || 'Terjadi kesalahan saat memproses permintaan.'
        });
    }
});

          
app.listen(PORT, () => {
  console.log(`Server berjalan pada http://localhost:${PORT}`);
});
