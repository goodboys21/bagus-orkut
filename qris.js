const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const QRCode = require('qrcode');

function convertCRC16(str) {
    let crc = 0xFFFF;
    for (let c = 0; c < str.length; c++) {
        crc ^= str.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
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

async function elxyzFile(Path) {
    if (!fs.existsSync(Path)) throw new Error("File not Found");
    try {
        const form = new FormData();
        form.append("file", fs.createReadStream(Path));
        const response = await axios.post('https://cloudgood.web.id/upload.php', form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        return { fileUrl: response.data?.url || 'Gagal Upload Good Site' };
    } catch (error) {
        throw error;
    }
}

async function createQRIS(amount, codeqr) {
    try {
        let qrisData = codeqr;
        qrisData = qrisData.slice(0, -4);
        const step1 = qrisData.replace("010211", "010212");
        const step2 = step1.split("5802ID");

        amount = amount.toString();
        let uang = "54" + ("0" + amount.length).slice(-2) + amount;
        uang += "5802ID";

        const result = step2[0] + uang + step2[1] + convertCRC16(step2[0] + uang + step2[1]);

        const qrCodeBuffer = await QRCode.toBuffer(result);
        const tmpPath = 'qr_image.png';
        fs.writeFileSync(tmpPath, qrCodeBuffer);

        const upload = await elxyzFile(tmpPath);
        fs.unlinkSync(tmpPath);

        return {
            transactionId: generateTransactionId(),
            amount: amount,
            expirationTime: generateExpirationTime(),
            qrImageUrl: upload.fileUrl,
            status: "active"
        };
    } catch (error) {
        throw error;
    }
}

module.exports = {
    createQRIS,
    elxyzFile
};
