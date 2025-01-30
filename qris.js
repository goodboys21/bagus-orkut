const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const QRCode = require('qrcode');

function convertCRC16(str) {
    let crc = 0xFFFF;
    const strlen = str.length;

    for (let c = 0; c < strlen; c++) {
        crc ^= str.charCodeAt(c) << 8;

        for (let i = 0; i < 8; i++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }

    let hex = crc & 0xFFFF;
    hex = ("000" + hex.toString(16).toUpperCase()).slice(-4);

    return hex;
}

function generateTransactionId() {
    return Math.random().toString(36).substring(2, 10);
}

function generateExpirationTime() {
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 30);
    return expirationTime;
}

async function elxyzFile(filePath) {
    if (!fs.existsSync(filePath)) throw new Error("File not found: " + filePath);

    try {
        const form = new FormData();
        form.append("file", fs.createReadStream(filePath));

        const response = await axios.post('https://cdn.elxyz.me/', form, {
            headers: form.getHeaders()
        });

        return response.data;
    } catch (error) {
        throw error;
    }
}

async function createQRIS(amount, codeqr) {
    try {
        if (!codeqr || codeqr.length < 10) throw new Error("Invalid QRIS code.");

        amount = parseInt(amount, 10);
        if (isNaN(amount) || amount <= 0) throw new Error("Invalid amount.");

        let qrisData = codeqr.slice(0, -4);
        const step1 = qrisData.replace("010211", "010212");
        const step2 = step1.split("5802ID");

        let uang = "54" + ("0" + amount.toString().length).slice(-2) + amount;
        uang += "5802ID";

        const result = step2[0] + uang + step2[1] + convertCRC16(step2[0] + uang + step2[1]);

        const qrImagePath = 'qr_image.png';
        await QRCode.toFile(qrImagePath, result);

        const uploadedFile = await elxyzFile(qrImagePath);
        fs.unlinkSync(qrImagePath);

        return {
            transactionId: generateTransactionId(),
            amount: amount,
            expirationTime: generateExpirationTime(),
            qrImageUrl: uploadedFile.fileUrl,
            status: "active"
        };
    } catch (error) {
        console.error("Error creating QRIS:", error.message);
        throw error;
    }
}

module.exports = {
    createQRIS,
    elxyzFile
};
