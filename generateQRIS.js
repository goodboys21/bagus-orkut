const QRCode = require("qrcode");
const FormData = require("form-data");
const axios = require("axios");

function convertCRC16(str) {
    let crc = 0xFFFF;
    for (let c = 0; c < str.length; c++) {
        crc ^= str.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        }
    }
    return ("000" + ((crc & 0xFFFF).toString(16).toUpperCase())).slice(-4);
}

async function uploadToCloudGood(buffer) {
    const form = new FormData();
    form.append("file", buffer, {
        filename: 'qr_image.png',
        contentType: 'image/png'
    });

    const res = await axios.post("https://cloudgood.web.id/upload.php", form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    });

    return res.data?.url || 'Gagal Upload ke CloudGood';
}

const generateQRIS = async (codeqr) => {
    try {
        let qrisData = codeqr.slice(0, -4).replace("010211", "010212");
        const step2 = qrisData.split("5802ID");
        const result = step2[0] + "5802ID" + step2[1] + convertCRC16(step2[0] + "5802ID" + step2[1]);

        const qrBuffer = await QRCode.toBuffer(result);
        const uploadedUrl = await uploadToCloudGood(qrBuffer);

        return { qrImageUrl: uploadedUrl };
    } catch (error) {
        console.error("Error generating and uploading QR code:", error);
        throw error;
    }
};

module.exports = generateQRIS;
