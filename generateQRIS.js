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
    return ("000" + ((crc & 0xFFFF).toString(16).toUpperCase())).slice(-4);
}

const generateQRIS = async (codeqr) => {
    try {
        let qrisData = codeqr;
        qrisData = qrisData.slice(0, -4);
        const step1 = qrisData.replace("010211", "010212");
        const step2 = step1.split("5802ID");

        const result = step2[0] + "5802ID" + step2[1] + convertCRC16(step2[0] + "5802ID" + step2[1]);

        const path = 'qr_image.png';
        await QRCode.toFile(path, result);

        const uploadedFile = await elxyzFile(path);
        fs.unlinkSync(path);

        return { qrImageUrl: uploadedFile.fileUrl };
    } catch (error) {
        console.error('Error generating and uploading QR code:', error);
        throw error;
    }
};

module.exports = generateQRIS;
