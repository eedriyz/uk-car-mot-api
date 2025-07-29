const express = require('express');
const axios = require('axios');
const qs = require('querystring');

const app = express();
const port = process.env.PORT || 3000;

// Load environment variables
// For local testing, use dotenv if available
try {
  require('dotenv').config();
} catch (e) {
  console.log('dotenv not available, using process.env');
}

// DVSA Configuration - Use environment variables
const AUTH_CONFIG = {
  clientId: process.env.DVSA_CLIENT_ID,
  clientSecret: process.env.DVSA_CLIENT_SECRET,
  apiKey: process.env.DVSA_API_KEY,
  tokenUrl: process.env.DVSA_TOKEN_URL
};

// Enable CORS and JSON parsing
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Form for easy testing
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>DVSA MOT API Scope Tester</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          h1 { color: #333; }
          form { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; }
          label { display: block; margin: 10px 0 5px; }
          input, select { padding: 8px; width: 100%; box-sizing: border-box; }
          button { margin-top: 15px; padding: 10px; background: #4CAF50; color: white; border: none; cursor: pointer; }
          .info { background: #e8f4f8; padding: 15px; border-left: 5px solid #2196F3; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>DVSA MOT API Scope Tester</h1>
        
        <div class="info">
          <p>This tool tests different OAuth scopes and API endpoints to help diagnose DVSA MOT API access issues.</p>
          <p>Credentials configured:</p>
          <ul>
            <li>Client ID: ${AUTH_CONFIG.clientId ? '✅ Configured' : '❌ Missing'}</li>
            <li>Client Secret: ${AUTH_CONFIG.clientSecret ? '✅ Configured' : '❌ Missing'}</li>
            <li>API Key: ${AUTH_CONFIG.apiKey ? '✅ Configured' : '❌ Missing'}</li>
            <li>Token URL: ${AUTH_CONFIG.tokenUrl ? '✅ Configured' : '❌ Missing'}</li>
          </ul>
        </div>
        
        <form action="/test-scope" method="post">
          <h2>Test OAuth Scope</h2>
          <label for="registration">UK Registration Number:</label>
          <input type="text" id="registration" name="registration" placeholder="e.g., FE08BBU" required>
          
          <label for="scope">OAuth Scope to Test:</label>
          <select id="scope" name="scope">
            <option value="https://tapi.dvsa.gov.uk/.default">https://tapi.dvsa.gov.uk/.default (Default)</option>
            <option value="api://tapi.dvsa.gov.uk/.default">api://tapi.dvsa.gov.uk/.default</option>
            <option value="https://check-mot.service.gov.uk/.default">https://check-mot.service.gov.uk/.default</option>
            <option value="mot.read">mot.read</option>
            <option value="https://tapi.dvsa.gov.uk/mot.read">https://tapi.dvsa.gov.uk/mot.read</option>
            <option value="https://dvsa.gov.uk/.default">https://dvsa.gov.uk/.default</option>
            <option value="">Empty scope</option>
          </select>
          
          <button type="submit">Test Scope</button>
        </form>
        
        <form action="/test-url" method="post">
          <h2>Test API URL</h2>
          <label for="url_registration">UK Registration Number:</label>
          <input type="text" id="url_registration" name="registration" placeholder="e.g., FE08BBU" required>
          
          <label for="apiUrl">API URL to Test:</label>
          <select id="apiUrl" name="apiUrl">
            <option value="https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests">https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests</option>
            <option value="https://api.check-mot.service.gov.uk/trade/vehicles/mot-tests">https://api.check-mot.service.gov.uk/trade/vehicles/mot-tests</option>
            <option value="https://mot<span class="cursor">█</span>
