const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const uploadToCatbox = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File tidak ditemukan.");
    }

    const form = new FormData();
    form.append("fileToUpload", fs.createReadStream(filePath));
    form.append("reqtype", "fileupload");

    const response = await axios.post("https://catbox.moe/user/api.php", form, {
      headers: {
        ...form.getHeaders(),
      },
    });

    if (response.data.startsWith("https")) {
      console.log("File berhasil diupload:", response.data);
      return response.data;
    } else {
      throw new Error("Upload gagal: " + response.data);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
};

// Contoh penggunaan
uploadToCatbox("./contoh.jpg");
