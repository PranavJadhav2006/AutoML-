const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 5000;
const ML_SERVICE_URL = "http://localhost:8000/auto-train";

app.use(cors());
app.use(express.json());

app.post('/auto-train', async (req, res) => {
    try {
        const { query } = req.body;
        console.log(`Forwarding query to ML service: ${query}`);
        
        const response = await axios.post(ML_SERVICE_URL, { query });
        
        res.json(response.data);
    } catch (error) {
        console.error("Error connecting to ML service:", error.message);
        const status = error.response ? error.response.status : 500;
        const message = error.response ? error.response.data.detail : "Internal Server Error";
        res.status(status).json({ error: message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running at http://localhost:${PORT}`);
});
