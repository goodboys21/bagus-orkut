const crypto = require("crypto");
const axios = require("axios");

const BASE_URL = "https://paydisini.co.id/api/";

const createPaydisini = async (amount, keypaydis, return_url, type_fee = "1", valid_time = "1800") => {
  const requestType = "new";
  const uniqueCode = Math.random().toString(36).substring(2, 12);
  const service = "11";
  const signature = crypto
    .createHash("md5")
    .update(keypaydis + uniqueCode + service + amount + valid_time + "NewTransaction")
    .digest("hex");

  const data = new URLSearchParams({
    key: keypaydis,
    request: requestType,
    unique_code: uniqueCode,
    service: service,
    amount: amount,
    note: "Pembayaran pertama",
    valid_time: valid_time,
    type_fee: type_fee,
    payment_guide: true,
    signature: signature,
    return_url: return_url
  });

  try {
    const response = await axios.post(BASE_URL, data, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response ? error.response.data : error.message };
  }
};

const checkPaymentStatus = async (keypaydis, uniqueCode) => {
  const signature = crypto
    .createHash("md5")
    .update(keypaydis + uniqueCode + "CheckTransaction")
    .digest("hex");

  const data = new URLSearchParams({
    key: keypaydis,
    request: "status",
    unique_code: uniqueCode,
    signature: signature
  });

  try {
    const response = await axios.post(BASE_URL, data, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response ? error.response.data : error.message };
  }
};

const cancelTransaction = async (keypaydis, uniqueCode) => {
  const signature = crypto
    .createHash("md5")
    .update(keypaydis + uniqueCode + "CancelTransaction")
    .digest("hex");

  const data = new URLSearchParams({
    key: keypaydis,
    request: "cancel",
    unique_code: uniqueCode,
    signature: signature
  });

  try {
    const response = await axios.post(BASE_URL, data, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response ? error.response.data : error.message };
  }
};

module.exports = { createPaydisini, checkPaymentStatus, cancelTransaction };
