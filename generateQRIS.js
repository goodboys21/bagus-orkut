const QRCode = require("qrcode");
const fs = require("fs");
const elxyzFile = require('./elxyzFile');

function convertCRC16(str) {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ("000" + (crc & 0xFFFF).toString(16).toUpperCase()).slice(-4);
}

const generateQRIS = async (codeqr) => {
  try {
    if (!codeqr || typeof codeqr !== 'string' || codeqr.length < 4) {
      throw new Error("Kode QR tidak valid atau terlalu pendek.");
    }

    let qrisData = codeqr.slice(0, -4);
    if (!qrisData.includes("5802ID")) {
      throw new Error("Format QRIS tidak valid, tidak ditemukan '5802ID'.");
    }

    const step1 = qrisData.replace("010211", "010212");
    const step2 = step1.split("5802ID");

    if (step2.length < 2) {
      throw new Error("Kesalahan format QRIS saat pemrosesan.");
    }

    const result = step2[0] + "5802ID" + step2[1];
    
    // Generate QR code langsung ke buffer
    const qrBuffer = await QRCode.toBuffer(result);

    // Upload ke CDN
    let uploadedFile;
    try {
      uploadedFile = await uploadToCDN(qrBuffer);
    } catch (uploadError) {
      throw new Error(`Gagal mengupload QR Code: ${uploadError.message}`);
    }

    return { qrImageUrl: uploadedFile || null };
  } catch (error) {
    console.error("Error generating and uploading QR code:", error.message);
    throw error;
  }
};

module.exports = generateQRIS;
