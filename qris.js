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

async function elxyzFile(Path) {
    return new Promise(async (resolve, reject) => {
        if (!fs.existsSync(Path)) return reject(new Error("File not Found"));

        try {
            const form = new FormData();
            form.append("file", fs.createReadStream(Path));

            const response = await axios.post('https://cdn.rafaelxd.tech/', form, {
                headers: form.getHeaders(),
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.lengthComputable) {
                        console.log(`🚀 Upload Progress: ${(progressEvent.loaded * 100) / progressEvent.total}%`);
                    }
                }
            });

            resolve(response.data);
        } catch (error) {
            reject(error);
        }
    });
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

        const form = new FormData();
        form.append('file', qrCodeBuffer, { filename: 'qr_image.png', contentType: 'image/png' });

        const response = await axios.post('https://cdn.rafaelxd.tech/', form, {
            headers: form.getHeaders(),
            onUploadProgress: (progressEvent) => {
                if (progressEvent.lengthComputable) {
                    console.log(`🚀 Upload Progress: ${(progressEvent.loaded * 100) / progressEvent.total}%`);
                }
            }
        });

        return {
            transactionId: generateTransactionId(),
            amount: amount,
            expirationTime: generateExpirationTime(),
            qrImageUrl: response.data.fileUrl,
            status: "active"
        };
    } catch (error) {
        throw error;
    }
}

module.exports = {
  createQRIS,
  elxyzFile
}
