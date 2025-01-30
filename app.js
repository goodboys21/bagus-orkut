const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { createPaydisini, checkPaymentStatus, cancelTransaction, cancelTransactionOrkut } = require('./scrape');
const generateQRIS = require('./generateQRIS');
const { createQRIS } = require('./qris');

const VALID_API_KEYS = ['bagus']; // Ganti dengan daftar API key yang valid

const app = express();
const PORT = 3000;

app.set('json spaces', 2);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CREATE PAYMENT PAYDISINI
app.get('/paydisini/create-payment', async (req, res) => {
  const { amount, keypaydis, return_url, type_fee, valid_time } = req.query;

  if (!amount || !keypaydis || !return_url || !type_fee || !valid_time) {
    return res.status(400).json({ success: false, error: 'Semua parameter (amount, keypaydis, return_url, type_fee, valid_time) harus diisi.' });
  }

  try {
    const uniqueCode = Math.random().toString(36).substring(2, 12);
    const service = "11";

    const signature = crypto
      .createHash("md5")
      .update(keypaydis + uniqueCode + service + amount + valid_time + "NewTransaction")
      .digest("hex");

    const result = await createPaydisini(amount, keypaydis, return_url, type_fee, valid_time, uniqueCode, signature);
    if (result.success) {
      const qrContent = result.data?.data?.qr_content;
      let qrImageUrl = null;

      if (qrContent) {
        const qrImage = await generateQRIS(qrContent);
        qrImageUrl = qrImage?.qrImageUrl || null;
      }

      delete result.data.data.qr_content;
      delete result.data.data.qrcode_url;
      delete result.data.data.checkout_url_beta;
      delete result.data.data.checkout_url;
      delete result.data.data.checkout_url_v2;
      delete result.data.data.checkout_url_v3;
      
      result.data.data.qrcode_url = qrImageUrl;
      result.data.data.signature = signature;

      res.json({
        success: result.data.success,
        msg: result.data.msg,
        data: {
          ...result.data.data,
          amount,
          keypaydis,
          return_url,
          type_fee,
          valid_time,
          unique_code: uniqueCode,
          signature
        }
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CHECK PAYMENT STATUS PAYDISINI
app.get('/paydisini/check-payment-status', async (req, res) => {
  const { keypaydis, unique_code, signature } = req.query;

  if (!keypaydis || !unique_code || !signature) {
    return res.status(400).json({ success: false, error: 'Semua parameter harus diisi.' });
  }

  try {
    const result = await checkPaymentStatus(keypaydis, unique_code, signature);
    res.json({
      success: result?.success || false,
      data: result?.data || {}
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CANCEL PAYMENT PAYDISINI
app.get('/paydisini/cancel-payment', async (req, res) => {
  const { keypaydis, unique_code, signature } = req.query;

  if (!keypaydis || !unique_code || !signature) {
    return res.status(400).json({ success: false, error: 'Semua parameter harus diisi.' });
  }

  try {
    const result = await cancelTransaction(keypaydis, unique_code, signature);
    res.json({
      success: result?.success || false,
      data: result?.data || {}
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE PAYMENT ORKUT
app.get('/orkut/createpayment', async (req, res) => {
    const { apikey, amount, codeqr } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid.' });
    }

    if (!amount || !codeqr) {
        return res.status(400).json({ success: false, message: 'Parameter amount dan codeqr harus diisi.' });
    }

    try {
        const qrisData = await createQRIS(amount, codeqr);
        res.json({ success: true, data: qrisData });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error generating QRIS', error: error.message });
    }
});

// CHECK PAYMENT ORKUT
app.get('/orkut/checkpayment', async (req, res) => {
    const { apikey, merchant, token } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({ success: false, message: 'API key tidak valid.' });
    }

    if (!merchant || !token) {
        return res.status(400).json({ success: false, message: 'Parameter merchant dan token harus diisi.' });
    }
    
    try {
        const apiUrl = `https://gateway.okeconnect.com/api/mutasi/qris/${merchant}/${token}`;
        const response = await axios.get(apiUrl);
        const result = response.data;
        
        if (result?.data?.length > 0) {
            return res.json(result.data[0]);
        } else {
            return res.status(404).json({ success: false, message: 'Tidak ada transaksi ditemukan.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// CANCEL PAYMENT ORKUT
app.post('/orkut/cancel', async (req, res) => {
    const { transactionId } = req.body;

    if (!transactionId) {
        return res.status(400).json({ success: false, message: 'Parameter transactionId harus diisi.' });
    }

    try {
        const BatalTransaksi = await cancelTransactionOrkut(transactionId);
        res.json({ success: true, transaction: BatalTransaksi });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
  console.log(`Server berjalan pada http://localhost:${PORT}`);
});
