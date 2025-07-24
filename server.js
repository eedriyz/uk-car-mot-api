const express = require('express');
const { chromium } = require('playwright');
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

    let browser;
    try {
        // Launch browser with stealth settings
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        });

        const context = await browser.newContext({
            // Mimic real browser
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 },
            locale: 'en-GB',
            timezoneId: 'Europe/London',
            // Enable JavaScript and images
            javaScriptEnabled: true,
            acceptDownloads: false
        });

        const page = await context.newPage();
        
        // Set additional headers to look more human
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0'
        });

        console.log(`Fetching MOT data for: ${reg}`);
        
        // Navigate with realistic timing
        await page.goto(url, { 
            waitUntil: 'networkidle', 
            timeout: 30000 
        });

        // Wait a bit to avoid looking too bot-like
        await page.waitForTimeout(2000);

        // Check if we got blocked
        const content = await page.content();
        
        if (content.includes('Pardon Our Interruption') || 
            content.includes('you were a bot') ||
            content.includes('JavaScript are enabled')) {
            throw new Error('Blocked by bot detection');
        }

        // Check if vehicle found
        if (content.includes('No results found') || 
            content.includes('Vehicle not found')) {
            return res.status(404).json({ 
                error: 'Vehicle not found',
                registration: reg 
            });
        }

        await browser.close();
        
        console.log(`Successfully fetched MOT data for: ${reg}`);
        res.send(content);

    } catch (err) {
        console.error('API Error:', err.message);
        
        if (browser) {
            await browser.close();
        }
        
        res.status(500).json({ 
            error: "Failed to fetch MOT data", 
            details: err.message,
            registration: reg
        });
    }
});

app.get('/', (req, res) => {
    res.send('MOT API is running - Playwright version');
});

app.get('/test', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'MOT API with Playwright'
    });
});

app.listen(port, () => {
    console.log(`MOT API Server running on port ${port}`);
});
