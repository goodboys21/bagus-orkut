const crypto = require("crypto");
const axios = require("axios");

let transactions = {}; // Simpan transaksi sementara (gunakan database untuk implementasi nyata)

const createPaydisini = async (amount, keypaydis, return_url, type_fee = "1", valid_time = "1800") => {
  const requestType = "new";
  const uniqueCode = Math.random().toString(36).substring(2, 12);
  const service = "11";
  const signature = crypto
    .createHash("md5")
    .update(keypaydis + uniqueCode + service + amount + valid_time + "NewTransaction")
    .digest("hex");

  const config = {
    method: "POST",
    url: "https://paydisini.co.id/api/",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    data: new URLSearchParams({
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
    }),
  };

  try {
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response ? error.response.data : error.message };
  }
};

const checkPaymentStatus = async (keypaydis, uniqueCode, signature) => {
  const config = {
    method: "POST",
    url: "https://api.paydisini.co.id/v1/",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    data: new URLSearchParams({
      key: keypaydis,
      request: "status",
      unique_code: uniqueCode,
      signature: signature
    }),
  };

  try {
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response ? error.response.data : error.message };
  }
};

const cancelTransaction = async (keypaydis, uniqueCode, signature) => {
  const config = {
    method: "POST",
    url: "https://api.paydisini.co.id/v1/",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    data: new URLSearchParams({
      key: keypaydis,
      request: "cancel",
      unique_code: uniqueCode,
      signature: signature
    }),
  };

  try {
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response ? error.response.data : error.message };
  }
};

function cancelTransactionOrkut(transactionId) {
  if (!transactions[transactionId]) {
    throw new Error("Transaction not found");
  }
  const transaction = transactions[transactionId];
  if (transaction.status === "paid") {
    throw new Error("Cannot cancel a completed transaction");
  }
  transaction.status = "cancelled";
  return transaction;
}

module.exports = { createPaydisini, checkPaymentStatus, cancelTransaction, cancelTransactionOrkut };