const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const elxyzFile = async (Path) => {
    if (!fs.existsSync(Path)) throw new Error("File not Found");

    const form = new FormData();
    form.append("file", fs.createReadStream(Path));

    const res = await axios.post("https://cloudgood.web.id/upload.php", form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    });

    return res.data?.url || 'Gagal Upload ke CloudGood';
};

module.exports = elxyzFile;
