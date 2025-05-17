export default async function handler(req, res) {
    const { apikey, url, name, appIcon, splashIcon } = req.query;

    if (!apikey || !VALID_API_KEYS.includes(apikey)) {
        return res.status(401).json({
            success: false,
            message: 'API key tidak valid atau tidak disertakan.'
        });
    }

    if (!url || !name || !appIcon || !splashIcon) {
        return res.json({ success: false, message: "Isi parameter url, name, appIcon, dan splashIcon." });
    }

    try {
        const apiUrl = `https://fastrestapis.fasturl.cloud/tool/appmaker?action=create&url=${encodeURIComponent(url)}&email=bagusganz@guz.id&name=${encodeURIComponent(name)}&appIcon=${encodeURIComponent(appIcon)}&splashIcon=${encodeURIComponent(splashIcon)}&useToolbar=true&toolbarColor=%235303f4&toolbarTitleColor=%23FFFFFF`;
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (result.status !== 200 || !result.result) {
            return res.json({ success: false, message: "Gagal membangun aplikasi." });
        }

        res.json({
            success: true,
            creator: "Bagus Bahril",
            app: {
                appId: result.result.appId,
                message: result.result.message
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}
