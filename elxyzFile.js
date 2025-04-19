const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const elxyzFile = async (Path) =>
  new Promise(async (resolve, reject) => {
    if (!fs.existsSync(Path)) return reject(new Error("File not Found"));

    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(Path));

      const response = await axios.post('https://cloudgood.web.id/upload.php', form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      resolve({ fileUrl: response.data?.url || 'Gagal Upload Good Site' });
    } catch (error) {
      console.error('Upload Failed:', error);
      reject(error);
    }
  });

module.exports = elxyzFile;
