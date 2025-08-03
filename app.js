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
const { Readable } = require('stream');
const VALID_API_KEYS = ['bagus']; // Ganti dengan daftar API key yang valid
const upload = multer();
const MEDIAFIRE_SESSION_TOKEN = '0cffb9e4079cb03796d5add57d3d04ef2a483664395e1746f72730b86d5b7af8132bae4f959371f231541601a478ac5abff949fe45b4be6ea88e5d727e898b725b98fbde2f587c55';
const DOMAIN_CONFIGS = [
  {
    domain: 'btwo.my.id',
    vercelToken: 'WUT8w8KTOS06pNCCg5lJi3E3',
    cloudflareToken: 'aOF69Mpldo1rJNmiBJxgADn1h7IUUlePe5i4U3fC',
    cloudflareZoneId: 'c289963e9af1196df19f290b3e9b41fa'
  },
  {
    domain: 'kuyhost.biz.id',
    vercelToken: 'lwjJrMobE4TGmgsuUKEuG9pm',
    cloudflareToken: '54F9_KMSuYX5g8Qm5mteDBdO4xHMIBqjIdSdSij_',
    cloudflareZoneId: '82b50730b4953949cab7ff7e574b1778'
  },
  {
    domain: 'goodsite.my.id',
    vercelToken: 'YYqQ42r5aZgH4NoipzRgNfSp',
    cloudflareToken: 'ReDjqj4w1YFz--isQOa9jrLBoRKXyWbgwr5I2qA2',
    cloudflareZoneId: '4604b3a245ea3fed1567d4565de4b510'
  }
];
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

app.post('/tools/mdfup', async (req, res) => {
  const { apikey, filename, buffer } = req.body;

  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah' });
  }

  if (!buffer || !filename) {
    return res.status(400).json({ success: false, message: 'Harus ada buffer dan filename' });
  }

  try {
    const fileBuffer = Buffer.from(buffer, 'base64');

    const form = new FormData();
    form.append('file', fileBuffer, filename);

    await axios.post(
      `https://www.mediafire.com/api/1.5/upload/simple.php?session_token=${MEDIAFIRE_SESSION_TOKEN}`,
      form,
      { headers: form.getHeaders() }
    );

    const { data } = await axios.post(
      'https://www.mediafire.com/api/1.5/folder/get_content.php',
      null,
      {
        params: {
          session_token: MEDIAFIRE_SESSION_TOKEN,
          folder_key: 'myfiles',
          content_type: 'files',
          response_format: 'json'
        }
      }
    );

    const files = data?.response?.folder_content?.files;
    const lastFile = files?.[0];
    const link = lastFile?.links?.normal_download;

    if (!link) {
      return res.status(500).json({ success: false, message: 'Gagal ambil URL file' });
    }

    return res.json({ success: true, url: link });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: 'Upload gagal', error: err.message });
  }
});

app.post('/tools/mdfunnp', async (req, res) => {
  const { apikey, file } = req.body;

  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah' });
  }

  if (!file) {
    return res.status(400).json({ success: false, message: 'Parameter file tidak boleh kosong' });
  }

  try {
    const fileRes = await axios.get(file, { responseType: 'arraybuffer' });
    const buffer = fileRes.data;
    const filename = file.split('/').pop().split('?')[0];

    const form = new FormData();
    form.append('file', buffer, filename);

    await axios.post(
      `https://www.mediafire.com/api/1.5/upload/simple.php?session_token=${MEDIAFIRE_SESSION_TOKEN}`,
      form,
      { headers: form.getHeaders() }
    );

    const listRes = await axios.post('https://www.mediafire.com/api/1.5/folder/get_content.php', null, {
      params: {
        session_token: MEDIAFIRE_SESSION_TOKEN,
        folder_key: 'myfiles',
        content_type: 'files',
        response_format: 'json'
      }
    });

    const files = listRes.data?.response?.folder_content?.files;
    if (!files || !files.length) {
      return res.status(404).json({ success: false, message: 'Tidak ada file ditemukan' });
    }

    const lastFile = files[0];
    const url = lastFile.links?.normal_download;

    if (!url) {
      return res.status(500).json({ success: false, message: 'Gagal ambil URL download' });
    }

    return res.json({ success: true, url });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal error', error: err.message });
  }
});

app.get('/search/epanime', async (req, res) => {
  const { apikey, url } = req.query;

  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah!' });
  }

  if (!url) {
    return res.status(400).json({ success: false, message: 'Masukkan parameter ?url=' });
  }

  try {
    // Fetch data dari trace.moe
    const { data } = await axios.get(`https://api.trace.moe/search?url=${encodeURIComponent(url)}`);
    const resultList = data?.result;

    if (!resultList || resultList.length === 0) {
      return res.json({ success: false, message: 'Tidak ada hasil ditemukan' });
    }

    // Pilih 1 hasil secara acak
    const randomResult = resultList[Math.floor(Math.random() * resultList.length)];

    // Download image dan video buffer
    const [imageBuffer, videoBuffer] = await Promise.all([
      axios.get(randomResult.image, { responseType: 'arraybuffer' }).then(res => res.data),
      axios.get(randomResult.video, { responseType: 'arraybuffer' }).then(res => res.data)
    ]);

    // Upload ke cloudgood
    const uploadToCloudGood = async (buffer, filename) => {
      const form = new FormData();
      form.append('file', buffer, filename);

      const upload = await axios.post('https://cloudgood.xyz/upload.php', form, {
        headers: form.getHeaders()
      });

      return upload.data?.url || null;
    };

    const [imageURL, videoURL] = await Promise.all([
      uploadToCloudGood(imageBuffer, 'trace_image.jpg'),
      uploadToCloudGood(videoBuffer, 'trace_video.mp4')
    ]);

    return res.json({
      success: true,
      creator: 'Bagus Bahril',
      filename: randomResult.filename,
      episode: randomResult.episode || 'Unknown',
      image: imageURL,
      video: videoURL
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan internal', error: err.message });
  }
});

app.get('/tools/getstickpack', async (req, res) => {
  const { apikey, query } = req.query;

  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah!' });
  }

  if (!query) {
    return res.status(400).json({ success: false, message: 'Masukkan parameter ?query=' });
  }

  const base = 'https://getstickerpack.com';

  try {
    const searchRes = await axios.get(`${base}/stickers?query=${encodeURIComponent(query)}`);
    const $ = cheerio.load(searchRes.data);
    const packs = [];

    $('.sticker-pack-cols a').each((_, el) => {
      const title = $(el).find('.title').text().trim();
      const href = $(el).attr('href')?.trim();
      if (title && href) {
        const fullUrl = href.startsWith('http') ? href : base + href;
        packs.push({ title, url: fullUrl });
      }
    });

    if (!packs.length) {
      return res.json({ success: false, message: 'Tidak ada pack ditemukan untuk query tersebut.' });
    }

    // Ambil sticker dari pack pertama
    const firstPackUrl = packs[0].url;
    const packRes = await axios.get(firstPackUrl);
    const $$ = cheerio.load(packRes.data);
    const stickers = [];

    $$('img.sticker-image').each((_, el) => {
      const src = $$(el).attr('data-src-large');
      if (src) stickers.push(src);
    });

    res.json({
      success: true,
      creator: 'Bagus Bahril',
      query,
      title: packs[0].title,
      pack_url: firstPackUrl,
      total_stickers: stickers.length,
      stickers
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/tools/sertifikat', async (req, res) => {
  const { apikey, nama } = req.query;

  // Cek API key
  if (apikey !== 'bagus') {
    return res.status(403).json({ status: false, message: 'API key salah' });
  }

  try {
    const baseUrl = 'https://imphnen-certificate-20t4u7ddb-azwarkusumahs-projects.vercel.app';
    const { data: html } = await axios.get(baseUrl);
    const $ = cheerio.load(html);

    const result = [];

    $('table tbody tr').each((_, el) => {
      const td = $(el).find('td');
      const item = {
        nama: td.eq(1).text().trim(),
        prodi: td.eq(2).text().trim(),
        pelatihan: td.eq(3).text().trim(),
        link: baseUrl + td.eq(4).find('a').attr('href'),
      };
      result.push(item);
    });

    // Jika ada parameter nama, filter berdasarkan nama
    const filtered = nama
      ? result.filter((r) => r.nama.toLowerCase().includes(nama.toLowerCase()))
      : result;

    if (filtered.length === 0) {
      return res.json({
        status: false,
        message: 'Data tidak ditemukan',
        searched: nama || null
      });
    }

    return res.json({
      status: true,
      creator: 'Bagus Bahril',
      total: filtered.length,
      data: filtered
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      message: 'Gagal melakukan scraping',
      error: err.message || err
    });
  }
});

app.get('/tools/gmailbocor', async (req, res) => {
  const { apikey, email } = req.query;

  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah' });
  }

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Masukkan parameter ?email=' });
  }

  try {
    const formData = new URLSearchParams();
    formData.append('email', email);

    const response = await axios.post('https://periksadata.com/', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const $ = cheerio.load(response.data);
    const info = $('.text-center.col-md-6.col-lg-5 > div > h2').text();

    if (info === 'WAH SELAMAT!') {
      return res.json({
        success: true,
        creator: 'Bagus Bahril',
        email,
        message: '✅ Tidak ditemukan dalam kebocoran data.',
        breaches: []
      });
    }

    const breaches = [];
    $('div.col-md-6').each((i, element) => {
      try {
        const img = $(element).find('div > div > img').attr('src');
        const title = $(element).find('div.feature__body > h5').text().trim();
        const boldElements = $(element).find('div.feature__body > p > b');

        if (boldElements.length >= 3) {
          const date = $(boldElements[0]).text().trim();
          const breachedData = $(boldElements[1]).text().trim();
          const totalBreach = $(boldElements[2]).text().trim();

          breaches.push({
            img,
            title,
            date,
            breached_data: breachedData,
            total_breach: totalBreach
          });
        }
      } catch (err) {
        console.error('Error parsing breach data:', err);
      }
    });

    return res.json({
      success: true,
      creator: 'Bagus Bahril',
      email,
      total: breaches.length,
      breaches
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/tools/fakechat', async (req, res) => {
  const { apikey, nama, imageurl, versi, ...chatParams } = req.query;
  if (apikey !== 'bagus') return res.status(403).json({ success: false, message: 'API key salah' });
  if (!nama || !imageurl || !versi) return res.status(400).json({ success: false, message: 'Isi parameter nama, imageurl, versi' });

  const chatList = Object.entries(chatParams)
    .filter(([k]) => k.startsWith('chat'))
    .map(([_, v]) => v.trim())
    .filter(Boolean);

  if (chatList.length < 2 || chatList.length > 6)
    return res.status(400).json({ success: false, message: 'Minimal 2 dan maksimal 6 chat' });

  try {
    const d = new Date();
    const jamBase = d.getHours();
    const menitBase = d.getMinutes();

    const chatsHTML = chatList.map((c, i) => {
      const jam = `${String(jamBase).padStart(2, '0')}.${String((menitBase + i) % 60).padStart(2, '0')}`;
      const isUser = versi === '1' ? i % 2 === 0 : i % 2 !== 0;
      return isUser
        ? `
<div class="self-end max-w-[75%] bg-[#d9fdd3] rounded-2xl px-4 py-2 shadow-sm">
  <div class="flex justify-between items-end">
    <p class="text-black text-base leading-tight pr-2">${c}</p>
    <span class="text-[#5a5f65] text-xs leading-none flex items-center select-none">${jam} <i class="fas fa-check-double text-[#4fc3f7] text-xs ml-1"></i></span>
  </div>
</div>`
        : `
<div class="self-start max-w-[75%] bg-white rounded-2xl px-4 py-2 shadow-sm">
  <p class="text-black text-base leading-tight">${c}</p>
  <span class="text-[#5a5f65] text-xs block text-right mt-1 select-none">${jam}</span>
</div>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Fakechat</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css" rel="stylesheet"/>
<style>
body { font-family: 'Roboto', sans-serif; background-color: #f2efe9; }
</style></head>
<body class="min-h-screen bg-[#f2efe9] m-0 p-0 overflow-hidden">
<div class="relative w-full h-screen overflow-hidden">
<img src="https://storage.googleapis.com/a1aa/image/5a357f99-e0cc-49d8-e21b-57e4c1475c23.jpg"
class="absolute inset-0 w-full h-full object-cover select-none pointer-events-none" draggable="false" />
<div class="absolute top-0 left-0 right-0 h-[70px] bg-[#f0f0f0] px-3 flex items-center z-20">
<i class="fas fa-arrow-left text-lg mr-3"></i>
<img src="${imageurl}" class="w-10 h-10 rounded-full mr-3" alt="Profile">
<div class="flex flex-col flex-grow">
<span class="text-[16px] font-bold text-black leading-tight">${nama}</span>
<span class="text-sm text-gray-600 -mt-[2px]">Online</span>
</div>
<div class="ml-auto flex gap-4 text-xl text-gray-700">
<i class="fas fa-video"></i>
<i class="fas fa-phone-alt"></i>
<i class="fas fa-ellipsis-v"></i>
</div>
</div>
<div class="absolute inset-x-0 top-[70px] bottom-0 px-4 py-4 flex flex-col justify-start space-y-2 overflow-y-auto z-10">
<div class="self-center bg-[#e6e6e6] text-[#5a5f65] text-sm font-semibold rounded-full px-4 py-1 select-none">Hari ini</div>
<div class="bg-[#fff3cd] border border-[#ffeeba] text-[#5c5c5c] text-sm rounded-md px-3 py-2 shadow-sm flex items-start gap-2 select-none">
<i class="fas fa-lock text-[#5c5c5c] pt-[2px]"></i>
<span>Pesan dan panggilan terenkripsi secara end-to-end. <a href="#" class="underline">Pelajari selengkapnya</a>.</span>
</div>
${chatsHTML}
</div></div></body></html>`;

    const form = new FormData();
    form.append('file', Readable.from([html]), {
      filename: `fakechat_${Date.now()}.html`,
      contentType: 'text/html'
    });

    const upload = await axios.post('https://cloudgood.xyz/upload.php', form, {
      headers: form.getHeaders()
    });

    const htmlUrl = upload.data?.url;
    if (!htmlUrl) return res.json({ success: false, message: 'Gagal upload HTML ke CloudGood' });

       // Ambil screenshot pakai SiputZX
    const ss = await axios.get(`https://api.siputzx.my.id/api/tools/ssweb?url=${encodeURIComponent(htmlUrl)}&theme=light&device=mobile`, {
      responseType: 'arraybuffer'
    });

    // Upload screenshot ke CloudGood
    const ssForm = new FormData();
    ssForm.append('file', Buffer.from(ss.data), 'screenshot.png');

    const uploadSS = await axios.post('https://cloudgood.xyz/upload.php', ssForm, {
      headers: ssForm.getHeaders()
    });
      const ssUrl = uploadSS.data?.url;
    if (!ssUrl) return res.json({ success: false, message: 'Gagal upload screenshot ke CloudGood' });
    return res.json({
      success: true,
      creator: 'Bagus Bahril',
      versi,
      result: ssUrl
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
      
app.get('/tools/shortcloudku', async (req, res) => {
  const { apikey, url, custom } = req.query;

  if (apikey !== 'bagus') {
    return res.status(403).json({ status: false, message: 'API key salah' });
  }

  if (!url) {
    return res.status(400).json({ status: false, message: 'Parameter url wajib diisi' });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const customCode = `bgs-${custom || Math.floor(100000 + Math.random() * 900000)}`;

  const payload = {
    url,
    custom: customCode,
    timestamp
  };

  const headers = {
    'Content-Type': 'application/json',
    'Origin': 'https://cloudku.click',
    'Referer': 'https://cloudku.click/',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
  };

  try {
    const { data } = await axios.post('https://cloudku.click/api/link.php', payload, { headers });

    if (!data.success) {
      return res.json({ status: false, message: 'Gagal membuat shortlink', response: data });
    }

    return res.json({
      status: true,
      creator: 'Bagus Bahril',
      result: data.data.shortUrl,
      created: data.data.created
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
      error: err.message || err
    });
  }
});

app.get('/tools/fakechwa', async (req, res) => {
  const { apikey, nama, pengikut, deskripsi, jangkau, bersih, image, verified } = req.query;

    
  if (apikey !== 'bagus') return res.status(403).json({ success: false, message: 'API key salah' });
  if (!nama || !pengikut || !deskripsi || !image) {
    return res.status(400).json({
      success: false,
      message: 'Masukkan semua parameter: nama, pengikut, deskripsi, image',
    });
  }
    

  try {
     const isVerified = verified === 'true'; 
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${nama}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css" rel="stylesheet"/>
  <style>
    body { font-family: sans-serif; }
    input:checked + .slider { background-color: #059669; }
    input:checked + .slider:before {
      transform: translateX(1.25rem);
      background-color: white;
    }
    .verified-icon {
      color: #3b82f6;
      margin-left: 4px;
    }
  </style>
  <script>
    const config = {
      pageTitle: "${nama}",
      profileImageUrl: "${image}",
      channelName: "${nama}",
      verified: ${isVerified},
      channelInfo: "Saluran • ${pengikut} pengikut",
      deskripsi: \`${deskripsi.replace(/`/g, '\\`')}\`,
      creationDate: "Dibuat pada 18/07/24",
      insights: {
        title: "Insight selama 30 hari terakhir",
        viewAll: "Lihat semua",
        stat1: { value: "${jangkau || '5Rb'}", label: "Akun dijangkau" },
        stat2: { value: "${bersih || '-60'}", label: "Pengikut bersih" }
      },
      notifications: {
        label: "Bisukan notifikasi",
        isMuted: true
      },
      publicChannel: {
        title: "Saluran publik",
        info: "Konten yang Anda bagikan bisa dilihat oleh semua orang, tetapi nomor telepon Anda tidak."
      }
    };
  </script>
</head>
<body class="bg-white text-black">
  <div class="max-w-md mx-auto">
    <div class="flex items-center justify-between px-4 py-3">
      <button class="text-black text-2xl"><i class="fas fa-arrow-left"></i></button>
      <div></div>
      <button class="text-black text-2xl"><i class="fas fa-ellipsis-v"></i></button>
    </div>
    <div class="flex justify-center mt-1">
      <img id="profileImage" class="rounded-full w-24 h-24 object-cover" alt="Profile Picture" />
    </div>
    <div class="text-center mt-2 px-4">
      <h1 class="text-2xl font-semibold flex justify-center items-center gap-1">
        <span id="channelName"></span>
        <i id="verifiedIcon" class="fas fa-check-circle verified-icon hidden"></i>
      </h1>
      <p id="channelInfo" class="text-gray-500 text-base mt-1"></p>
    </div>
    <div class="mt-6 border-t border-gray-200 pt-4 px-4">
      <p id="descriptionContainer" class="text-base leading-snug whitespace-pre-wrap"></p>
      <p id="creationDate" class="text-gray-500 mt-1 text-sm"></p>
    </div>
    <div class="mt-6 border-t border-gray-200 pt-4 px-4 flex items-center text-gray-600 text-sm font-normal">
      <span id="insightsTitle"></span>
      <svg class="h-4 w-4 mx-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 8v4"></path>
        <circle cx="12" cy="16" r="1" fill="currentColor"></circle>
      </svg>
      <a id="insightsLink" href="#" class="text-green-700 font-semibold flex items-center gap-1">
        <span id="insightsViewAll"></span>
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </a>
    </div>
    <div class="flex gap-4 mt-4 px-4">
      <div class="flex-1 border border-gray-300 rounded-xl py-3 px-4">
        <p id="stat1Value" class="font-bold text-lg"></p>
        <p id="stat1Label" class="text-sm text-gray-700 mt-1"></p>
      </div>
      <div class="flex-1 border border-gray-300 rounded-xl py-3 px-4">
        <p id="stat2Value" class="font-bold text-lg"></p>
        <p id="stat2Label" class="text-sm text-gray-700 mt-1"></p>
      </div>
    </div>
    <div class="flex items-center justify-between mt-6 px-4 py-3 border-t border-gray-200">
      <div class="flex items-center gap-3">
        <i class="far fa-bell text-xl text-gray-700"></i>
        <span id="notificationLabel"></span>
      </div>
      <label class="relative inline-block w-10 h-6 cursor-pointer">
        <input class="opacity-0 w-0 h-0" id="toggle" type="checkbox" />
        <span class="slider absolute inset-0 bg-gray-300 rounded-full transition-all before:absolute before:left-0.5 before:top-0.5 before:bg-white before:border before:border-gray-300 before:rounded-full before:h-5 before:w-5 before:transition-all"></span>
      </label>
    </div>
    <div class="px-4 mt-6 pb-6">
      <p id="publicChannelTitle"></p>
      <p id="publicChannelInfo" class="text-gray-500 text-sm mt-1 leading-relaxed"></p>
    </div>
  </div>
  <script>
    function parseDeskripsi(teks) {
      return teks.replace(/https:\\/\\/\\S+/g, (match) => {
        const clean = match.split(/[\\s\\n]/)[0];
        return \`<span class="text-blue-600">\${clean}</span>\${match.slice(clean.length)}\`;
      });
    }

    document.addEventListener('DOMContentLoaded', function () {
      document.title = config.pageTitle;
      document.getElementById('profileImage').src = config.profileImageUrl;
      document.getElementById('channelName').innerText = config.channelName;
      if (config.verified) {
        document.getElementById('verifiedIcon').classList.remove('hidden');
      }
      document.getElementById('channelInfo').innerText = config.channelInfo;
let desc = config.deskripsi.trim();
let parsed = parseDeskripsi(desc);
if (desc.length >= 25) {
  parsed += ' <span class="font-bold text-green-700">Baca selengkapnya</span>';
}
document.getElementById('descriptionContainer').innerHTML = parsed;

      document.getElementById('creationDate').innerText = config.creationDate;
      document.getElementById('insightsTitle').innerText = config.insights.title;
      document.getElementById('insightsViewAll').innerText = config.insights.viewAll;
      document.getElementById('stat1Value').innerText = config.insights.stat1.value;
      document.getElementById('stat1Label').innerText = config.insights.stat1.label;
      document.getElementById('stat2Value').innerText = config.insights.stat2.value;
      document.getElementById('stat2Label').innerText = config.insights.stat2.label;
      document.getElementById('notificationLabel').innerText = config.notifications.label;
      document.getElementById('toggle').checked = config.notifications.isMuted;
      document.getElementById('publicChannelTitle').innerText = config.publicChannel.title;
      document.getElementById('publicChannelInfo').innerText = config.publicChannel.info;
    });
  </script>
</body>
</html>`;

    

    const form = new FormData();
form.append('file', Buffer.from(html), {
  filename: `fakech_${Date.now()}.html`,
  contentType: 'text/html',
});

const upload = await axios.post('https://cloudgood.xyz/upload.php', form, {
  headers: form.getHeaders()
});

const htmlUrl = upload.data?.url;
if (!htmlUrl) return res.json({ success: false, message: 'Gagal upload HTML ke cloudgood' });

    const ss = await axios.get(`https://apii.baguss.web.id/tools/ssweb?apikey=bagus&type=mobile&url=${encodeURIComponent(htmlUrl)}`);
    if (!ss.data.success) return res.json({ success: false, message: 'Gagal ambil screenshot' });

    return res.json({
      success: true,
      creator: 'Bagus Bahril',
      result: ss.data.url,
      verivied: `${isVerified}`
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/tools/fakesaluran', async (req, res) => {
  const axios = require('axios');
  const FormData = require('form-data');
  const {
    apikey, pageTitle, profileImageUrl, channelName,
    channelInfo, forward, share,
    line1, phoneNumber, line2, readMore,
    creationDate, stat1Value, stat1Label,
    stat2Value, stat2Label
  } = req.query;

  if (!apikey || apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key tidak valid.' });
  }

  try {
    const htmlContent = `
<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${pageTitle}</title><script>const config = {
  pageTitle: "${nama}",
  profileImageUrl: "${image}",
  channelName: "${nama}",
  channelInfo: "Saluran • ${pengikut} pengikut",
  verified: ${req.query.verified === 'true'}, // ✅
  deskripsi: \`${deskripsi.replace(/`/g, '\\`')}\`,
  creationDate: "Dibuat pada 18/07/24",
  insights: {
    title: "Insight selama 30 hari terakhir",
    viewAll: "Lihat semua",
    stat1: {
      value: "${req.query.jangkau || '5Rb'}",  // 👈 custom jangkau
      label: "Akun dijangkau"
    },
    stat2: {
      value: "${req.query.bersih || '-60'}",  // 👈 custom bersih
      label: "Pengikut bersih"
    }
  },notifications: {label: "Bisukan notifikasi",isMuted: true},
  publicChannel: {title: "Saluran publik",info: "Konten yang Anda bagikan bisa dilihat oleh semua orang, tetapi nomor telepon Anda tidak. Ketuk untuk mempelajari selengkapnya."}
};</script><script src="https://cdn.tailwindcss.com"></script><link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css" rel="stylesheet"/><style>body{font-family:sans-serif}input:checked+.slider{background:#059669}input:checked+.slider:before{transform:translateX(1.25rem);background:#fff}</style></head><body><div class="max-w-md mx-auto"><div class="flex justify-between px-4 py-3"><button class="text-black text-2xl"><i class="fas fa-arrow-left"></i></button><div></div><button class="text-black text-2xl"><i class="fas fa-ellipsis-v"></i></button></div><div class="flex justify-center mt-1"><img id="profileImage" class="rounded-full w-24 h-24 object-cover"/></div><div class="text-center mt-2 px-4"><h1 id="channelName" class="text-2xl font-semibold leading-tight"></h1><p id="channelInfo" class="text-gray-500 mt-1 text-base"></p></div><div class="flex gap-4 mt-4 px-4"><button class="flex-1 border rounded-xl py-3 flex items-center justify-center gap-2"><span id="forwardButton" class="text-black text-base font-normal"></span></button><button class="flex-1 border rounded-xl py-3 flex items-center justify-center gap-2"><span id="shareButton" class="text-black text-base font-normal"></span></button></div><div class="mt-6 border-t pt-4 px-4"><p id="descriptionContainer" class="text-base font-normal leading-snug"></p><p id="creationDate" class="text-gray-500 mt-1 text-sm"></p></div><div class="mt-6 border-t pt-4 px-4 flex items-center text-gray-600 text-sm font-normal"><span id="insightsTitle"></span><a id="insightsLink" class="text-green-700 font-semibold flex items-center gap-1"><span id="insightsViewAll"></span></a></div><div class="flex gap-4 mt-4 px-4"><div class="flex-1 border rounded-xl py-3 px-4"><p id="stat1Value" class="font-bold text-lg leading-none"></p><p id="stat1Label" class="text-sm text-gray-700 mt-1"></p></div><div class="flex-1 border rounded-xl py-3 px-4"><p id="stat2Value" class="font-bold text-lg leading-none"></p><p id="stat2Label" class="text-sm text-gray-700 mt-1"></p></div></div></div><script>document.addEventListener("DOMContentLoaded",()=>{document.title=config.pageTitle;document.getElementById("profileImage").src=config.profileImageUrl;document.getElementById("channelName").innerText=config.channelName;document.getElementById("channelInfo").innerText=config.channelInfo;document.getElementById("forwardButton").innerText=config.buttons.forward;document.getElementById("shareButton").innerText=config.buttons.share;document.getElementById("descriptionContainer").innerHTML=\`\${config.description.line1} <a class="text-blue-700 font-bold" href="tel:\${config.description.phoneNumber}">\${config.description.phoneNumber}</a> \${config.description.line2} <span class="font-bold text-green-700">\${config.description.readMore}</span>\`;document.getElementById("creationDate").innerText=config.creationDate;document.getElementById("insightsTitle").innerText=config.insights.title;document.getElementById("insightsViewAll").innerText=config.insights.viewAll;document.getElementById("stat1Value").innerText=config.insights.stat1.value;document.getElementById("stat1Label").innerText=config.insights.stat1.label;document.getElementById("stat2Value").innerText=config.insights.stat2.value;document.getElementById("stat2Label").innerText=config.insights.stat2.label;});</script></body></html>
    `;

    const buffer = Buffer.from(htmlContent, 'utf-8');

    const form = new FormData();
    form.append('file', buffer, { filename: 'fakesaluran.html', contentType: 'text/html' });
    form.append('filename', 'fakesaluran.html');

    const { data: uploadResult } = await axios.post('https://cloudgood.xyz/upload.php', form, {
      headers: form.getHeaders()
    });

    const link = uploadResult.result?.url;
    if (!link) throw new Error('Upload gagal');

    const ssweb = await axios.get(`https://apii.baguss.web.id/tools/ssweb?apikey=bagus&url=${encodeURIComponent(link)}&type=phone`, {
      responseType: 'arraybuffer'
    });

    res.set('Content-Type', 'image/jpeg');
    res.send(ssweb.data);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Gagal membuat fake saluran',
      detail: err.message
    });
  }
}); 
app.post('/deploy', upload.single('file'), async (req, res) => {
  try {
    // Pilih salah satu config secara acak
    const config = DOMAIN_CONFIGS[Math.floor(Math.random() * DOMAIN_CONFIGS.length)];

    const file = req.file;
    const subdomain = req.body.subdomain.toLowerCase();
    const random = randomUid();
    const projectName = `${subdomain}${random}`;
    const fullDomain = `${subdomain}.${config.domain}`;

    let files = [];

    if (file.originalname.endsWith('.zip')) {
      const zip = new AdmZip(file.buffer);
      const entries = zip.getEntries();

      files = entries
        .filter(e => !e.isDirectory)
        .map(e => ({
          file: e.entryName,
          data: e.getData().toString() // Jangan pakai base64
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
        Authorization: `Bearer ${config.vercelToken}`,
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
        Authorization: `Bearer ${config.vercelToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: fullDomain })
    });

    // Ambil record CNAME
    const domainInfo = await (await fetch(`https://api.vercel.com/v9/projects/${projectName}/domains/${fullDomain}`, {
      headers: {
        Authorization: `Bearer ${config.vercelToken}`
      }
    })).json();

    const cnameValue = domainInfo?.verification?.[0]?.value || 'cname.vercel-dns.com';

    // Tambah record CNAME ke Cloudflare
    await fetch(`https://api.cloudflare.com/client/v4/zones/${config.cloudflareZoneId}/dns_records`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.cloudflareToken}`,
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
        Authorization: `Bearer ${config.vercelToken}`,
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
  const FormData = require('form-data');
  const { apikey, image } = req.query;

  if (!apikey || !VALID_API_KEYS.includes(apikey)) {
    return res.status(403).json({ success: false, message: 'API key tidak valid.' });
  }

  if (!image) {
    return res.status(400).json({ success: false, message: 'Parameter "image" wajib diisi.' });
  }

  if (!/^https?:\/\/.+\.(jpe?g|png|webp|gif)$/i.test(image)) {
    return res.status(400).json({ success: false, message: 'URL gambar tidak valid. Harus jpg/png/webp/gif' });
  }

  try {
    const { data: imageBuffer } = await axios.get(image, { responseType: 'arraybuffer' });

    const form = new FormData();
    form.append('image', imageBuffer, { filename: 'image.jpg' });
    form.append('resolution', '1080p');
    form.append('enhance', 'false');

    const { data } = await axios.post('https://upscale.cloudkuimages.guru/hd.php', form, {
      headers: {
        ...form.getHeaders(),
        origin: 'https://upscale.cloudkuimages.guru',
        referer: 'https://upscale.cloudkuimages.guru/'
      },
      maxBodyLength: Infinity
    });

    if (data?.status !== 'success') {
      return res.status(500).json({ success: false, message: 'Upscale gagal.', detail: data });
    }

    const result = data.data;

    res.json({
      success: true,
      creator: 'Bagus Bahril',
      result: result.url,
      size: result.new_size
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memproses gambar.',
      detail: err.message
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

    const cloudUpload = await axios.post('https://cloudgood.xyz/upload.php', form, {
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

  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah atau tidak ada' });
  }

  if (!url) {
    return res.status(400).json({ success: false, message: 'Masukkan parameter ?url=' });
  }

  try {
    const headers = {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'referer': 'https://tikdownloader.io/id',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    };

    const resTik = await axios.post(
      'https://tikdownloader.io/api/ajaxSearch',
      `q=${encodeURIComponent(url)}`,
      { headers }
    );

    const $ = cheerio.load(resTik.data.data);
    const title = $('.tik-left .content h3').text().trim();
    const coverImage = $('.image-tik img').attr('src') || null;

    let videoNowm = null;
    let videoNowmHd = null;
    let musicUrl = null;

    $('.tik-button-dl').each((i, el) => {
      const text = $(el).text().toLowerCase();
      const href = $(el).attr('href');
      if (!href?.startsWith('http')) return;

      if (text.includes('hd')) {
        videoNowmHd = href;
      } else if (text.includes('download video')) {
        videoNowm = href;
      } else if (text.includes('music') || text.includes('mp3')) {
        musicUrl = href;
      }
    });

    if (!videoNowm && !videoNowmHd) {
      return res.status(404).json({
        success: false,
        message: 'Gagal mendapatkan link video TikTok.',
      });
    }

    return res.json({
      success: true,
      creator: "Bagus Bahril",
      title: title || 'Tanpa Judul',
      cover: coverImage,
      video: {
        nowatermark: videoNowm || null,
        nowatermark_hd: videoNowmHd || null
      },
      music: musicUrl || null
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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

  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah' });
  }

  if (!url) {
    return res.status(400).json({ success: false, message: 'Masukkan parameter ?url=' });
  }

  try {
    const fixUrl = (u) => u?.replace(/\\/g, '') || null;

    const headers = {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0',
    };

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${response.url}`);

    const html = await response.text();
    const m_sd = html.match(/"browser_native_sd_url":"(.+?)",/)?.[1];
    const m_hd = html.match(/"browser_native_hd_url":"(.+?)",/)?.[1];
    const m_a = html.match(/"mime_type":"audio\\\/mp4","codecs":"mp4a\.40\.5","base_url":"(.+?)",/)?.[1];

    const result = {
      sd: fixUrl(m_sd),
      hd: fixUrl(m_hd),
      audio: fixUrl(m_a),
    };

    if (!result.sd && !result.hd && !result.audio) {
      return res.json({ success: false, message: 'Gagal mengambil video, mungkin private?' });
    }

    return res.json({
      success: true,
      sd: result.sd || null,
      hd: result.hd || null,
      audio: result.audio || null,
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
  const { apikey, url } = req.query;

  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah.' });
  }

  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ success: false, message: 'URL tidak valid atau tidak diawali http/https.' });
  }

  try {
    // Step 1: Screenshot dengan mode mobile
    const ssRes = await axios.post(
      'https://api.magickimg.com/generate/website-screenshot',
      { url: url.trim(), device: 'mobile', fullPage: true },
      {
        responseType: 'arraybuffer',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://magickimg.com',
          'Referer': 'https://magickimg.com',
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0',
        },
      }
    );

    const buffer = Buffer.from(ssRes.data);
    const contentType = ssRes.headers['content-type'] || 'image/png';

    // Step 2: Upload ke CloudGood
    const form = new FormData();
    form.append('file', buffer, {
      filename: 'ssweb.png',
      contentType,
    });

    const uploadRes = await axios.post('https://cloudgood.xyz/upload.php', form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const uploadedUrl = uploadRes.data?.url;
    if (!uploadedUrl || uploadedUrl.startsWith('Error')) {
      throw new Error(uploadedUrl || 'Gagal upload ke CloudGood');
    }

    // Response sukses
    res.json({
      success: true,
      creator: 'Bagus Bahril',
      url: uploadedUrl,
      size: (buffer.length / 1024).toFixed(2) + ' KB',
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message || 'Terjadi kesalahan saat screenshot atau upload.',
    });
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

        const upload = await axios.post("https://cloudgood.xyz/upload.php", form, {
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

        const upload = await axios.post("https://cloudgood.xyz/upload.php", form, {
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
  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah atau tidak ada' });
  }

  if (!url) {
    return res.status(400).json({ success: false, message: 'Parameter ?url= diperlukan' });
  }

  try {
    // Step 1: Ambil meta lagu
    const metaResponse = await axios.post('https://spotiydownloader.com/api/metainfo', { url }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://spotiydownloader.com',
        'Referer': 'https://spotiydownloader.com/id',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const meta = metaResponse.data;
    if (!meta || !meta.success || !meta.id) {
      throw new Error('Gagal mengambil metadata lagu');
    }

    // Step 2: Ambil link download dari ID
    const dlResponse = await axios.post('https://spotiydownloader.com/api/download', { id: meta.id }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://spotiydownloader.com',
        'Referer': 'https://spotiydownloader.com/id',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const result = dlResponse.data;
    if (!result || !result.success || !result.link) {
      throw new Error('Gagal mendapatkan link download');
    }

    // Format durasi
    const msToMinutes = (ms) => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return res.json({
      success: true,
      creator: 'Bagus Bahril',
      title: meta.title || 'Unknown',
      artist: meta.artists || meta.artist || 'Unknown',
      duration: meta.duration_ms ? msToMinutes(meta.duration_ms) : 'Unknown',
      cover: meta.cover || null,
      audio: result.link
    });

  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
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
                    const upload = await axios.post("https://cloudgood.xyz/upload.php", form, {
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

app.get('/stalker/ffstalk', async (req, res) => {
  const { apikey, uid } = req.query;

  if (apikey !== 'bagus') {
    return res.status(403).json({ success: false, message: 'API key salah' });
  }

  if (!uid) {
    return res.status(400).json({ success: false, message: 'Masukkan parameter ?uid=' });
  }

  try {
    // Fetch data akun
    const response = await axios.get(`https://discordbot.freefirecommunity.com/player_info_api?uid=${uid}&region=id`, {
      headers: {
        'Origin': 'https://www.freefirecommunity.com',
        'Referer': 'https://www.freefirecommunity.com/ff-account-info/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K)',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });

    const data = response.data?.player_info;
    if (!data) {
      return res.json({ success: false, message: 'Gagal mengambil data akun Free Fire.' });
    }

    const b = data.basicInfo || {};
    const bannerURL = `https://discordbot.freefirecommunity.com/banner_image_api?uid=${uid}&region=id`;

    // Download banner sebagai buffer
    const bannerBuffer = await axios.get(bannerURL, { responseType: 'arraybuffer' });

    // Upload ke cloudgood.xyz
    const form = new FormData();
    form.append('file', Buffer.from(bannerBuffer.data), `banner_${uid}.jpg`);

    const upload = await fetch('https://cloudgood.xyz/upload.php', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const uploaded = await upload.json();
    const uploadedUrl = uploaded?.url || bannerURL;

    // Format hasil
    const result = {
      success: true,
      creator: 'Bagus Bahril',
      uid: b.accountId || uid,
      nickname: b.nickname || 'Tidak diketahui',
      level: b.level || '-',
      exp: b.exp || '-',
      rank: b.rank || '-',
      csRank: b.csRank || '-',
      createdAt: b.createAt ? moment.unix(b.createAt).format('YYYY-MM-DD HH:mm:ss') : '-',
      lastLogin: b.lastLoginAt ? moment.unix(b.lastLoginAt).format('YYYY-MM-DD HH:mm:ss') : '-',
      banner: uploadedUrl
    };

    return res.json(result);

  } catch (err) {
    console.error('❌ Error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data dari server Free Fire.',
      error: err.message
    });
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
