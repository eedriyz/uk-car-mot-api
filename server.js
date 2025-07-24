const express = require('express');
const puppeteer = require('puppeteer'); // Changed from puppeteer-core
const app = express();
const port = process.env.PORT || 3000;

// Add CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.use(express.json());

app.get('/api/mot/:reg', async (req, res) => {
    const reg = req.params.reg.toUpperCase();
    const url = `https://www.check-mot.service.gov.uk/results?registration=${reg}&checkRecalls=true`;

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        const html = await page.content();
        await browser.close();

        res.send(html);
    } catch (err) {
        console.error('Puppeteer Error:', err);
        res.status(500).json({ 
            error: "Failed to fetch MOT data", 
            details: err.message 
        });
    }
});

app.get('/', (req, res) => {
    res.send('MOT API is running');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
