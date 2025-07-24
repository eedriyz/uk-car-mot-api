const express = require('express');
const { chromium } = require('playwright');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/mot/:reg', async (req, res) => {
  const reg = req.params.reg.toUpperCase();
  const url = `https://www.check-mot.service.gov.uk/results?registration=${reg}&checkRecalls=true`;

  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    const html = await page.content();
    await browser.close();

    res.send(html);
  } catch (err) {
    console.error("Playwright error:", err);
    res.status(500).send("Error fetching MOT data: " + err.message);
  }
});

app.get('/', (req, res) => {
  res.send('MOT API is live');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
