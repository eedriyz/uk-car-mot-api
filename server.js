const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/mot/:reg', async (req, res) => {
    const reg = req.params.reg.toUpperCase();
    const url = `https://www.check-mot.service.gov.uk/results?registration=${reg}&checkRecalls=true`;

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        const html = await page.content(); // Entire page HTML

        await browser.close();

        res.send(html); // Send HTML back to frontend
    } catch (err) {
        console.error(err);
        res.status(500).send("Something went wrong trying to fetch MOT data.");
    }
});

app.get('/', (req, res) => {
    res.send('MOT API is running');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
