const axios = require('axios');
const FormData = require('form-data');
const QRCode = require('qrcode');

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

function generateTransactionId() {
    return Math.random().toString(36).substring(2, 10);
}

function generateExpirationTime() {
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 30);
    return expirationTime;
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

async function createQRIS(amount, codeqr) {
    try {
        let qrisData = codeqr.slice(0, -4).replace("010211", "010212");
        const step2 = qrisData.split("5802ID");

        amount = amount.toString();
        let uang = "54" + ("0" + amount.length).slice(-2) + amount;
        uang += "5802ID";

        const result = step2[0] + uang + step2[1] + convertCRC16(step2[0] + uang + step2[1]);

        const qrBuffer = await QRCode.toBuffer(result);
        const uploadedUrl = await uploadToCloudGood(qrBuffer);

        return {
            transactionId: generateTransactionId(),
            amount: amount,
            expirationTime: generateExpirationTime(),
            qrImageUrl: uploadedUrl,
            status: "active"
        };
    } catch (error) {
        throw new Error("QRIS generation failed: " + error.message);
    }
}

module.exports = {
    createQRIS
};
