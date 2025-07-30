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
            <option value="https://mot.api.gov.uk/trade/vehicles/mot-tests">https://mot.api.gov.uk/trade/vehicles/mot-tests</option>
            <option value="https://tapi.dvsa.gov.uk/mot/trade/vehicles/mot-tests">https://tapi.dvsa.gov.uk/mot/trade/vehicles/mot-tests</option>
            <option value="https://tapi.dvsa.gov.uk/check-mot/trade/vehicles/mot-tests">https://tapi.dvsa.gov.uk/check-mot/trade/vehicles/mot-tests</option>
          </select>
          
          <button type="submit">Test URL</button>
        </form>
        
        <form action="/test-all" method="post">
          <h2>Test All Combinations</h2>
          <label for="all_registration">UK Registration Number:</label>
          <input type="text" id="all_registration" name="registration" placeholder="e.g., FE08BBU" required>
          
          <button type="submit">Test All Combinations</button>
        </form>
      </body>
    </html>
  `);
});

// Test a specific OAuth scope
app.post('/test-scope', async (req, res) => {
  const registration = req.body.registration.toUpperCase().replace(/\s/g, '');
  const scope = req.body.scope;
  
  console.log(`Testing scope "${scope}" with registration: ${registration}`);
  
  try {
    // Step 1: Get token with this scope
    console.log('Requesting token...');
    const tokenResponse = await axios({
      method: 'post',
      url: AUTH_CONFIG.tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      data: qs.stringify({
        grant_type: 'client_credentials',
        client_id: AUTH_CONFIG.clientId,
        client_secret: AUTH_CONFIG.clientSecret,
        scope: scope
      }),
      timeout: 10000
    });
    
    console.log('✅ Token acquired');
    const accessToken = tokenResponse.data.access_token;
    
    // Step 2: Try API with token + API key
    try {
      console.log('Calling API with token + API key...');
      const apiResponse = await axios({
        method: 'get',
        url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': AUTH_CONFIG.apiKey,
          'Accept': 'application/json+v6'
        },
        params: {
          registration: registration
        },
        timeout: 10000
      });
      
      console.log('✅ API call successful!');
      
      // Format response as HTML for better readability
      res.send(`
        <html>
          <head>
            <title>Scope Test Results</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
              h1 { color: #333; }
              .success { background: #e7f6e7; padding: 15px; border-left: 5px solid #4CAF50; margin: 20px 0; }
              .token-info { background: #f0f4f8; padding: 15px; margin: 20px 0; }
              pre { background: #f5f5f5; padding: 10px; overflow: auto; }
              .back-link { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h1>Scope Test Results</h1>
            
            <div class="success">
              <h2>✅ SUCCESS!</h2>
              <p>The scope <strong>${scope || '(empty)'}</strong> worked perfectly with registration: ${registration}</p>
            </div>
            
            <div class="token-info">
              <h3>Token Details:</h3>
              <ul>
                <li>Type: ${tokenResponse.data.token_type}</li>
                <li>Expires in: ${tokenResponse.data.expires_in} seconds</li>
                <li>Scope: ${tokenResponse.data.scope || '(none returned)'}</li>
              </ul>
            </div>
            
            <h3>API Response:</h3>
            <pre>${JSON.stringify(apiResponse.data, null, 2)}</pre>
            
            <div class="back-link">
              <a href="/">Back to Test Form</a>
            </div>
          </body>
        </html>
      `);
    } catch (apiError) {
      console.log('❌ API call failed');
      
      // Try without API key as fallback
      try {
        console.log('Trying API without API key...');
        const noKeyResponse = await axios({
          method: 'get',
          url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json+v6'
          },
          params: {
            registration: registration
          },
          timeout: 10000
        });
        
        console.log('✅ API call without API key successful!');
        
        res.send(`
          <html>
            <head>
              <title>Scope Test Results</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
                h1 { color: #333; }
                .success { background: #e7f6e7; padding: 15px; border-left: 5px solid #4CAF50; margin: 20px 0; }
                .warning { background: #fff9e6; padding: 15px; border-left: 5px solid #ff9800; margin: 20px 0; }
                .token-info { background: #f0f4f8; padding: 15px; margin: 20px 0; }
                pre { background: #f5f5f5; padding: 10px; overflow: auto; }
                .back-link { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h1>Scope Test Results</h1>
              
              <div class="success">
                <h2>✅ PARTIAL SUCCESS!</h2>
                <p>The scope <strong>${scope || '(empty)'}</strong> worked without the API key for registration: ${registration}</p>
              </div>
              
              <div class="warning">
                <h3>⚠️ Note:</h3>
                <p>API call with API key failed, but succeeded without the API key.</p>
                <p>API key error: ${apiError.message}</p>
                <p>Status code with API key: ${apiError.response?.status}</p>
              </div>
              
              <div class="token-info">
                <h3>Token Details:</h3>
                <ul>
                  <li>Type: ${tokenResponse.data.token_type}</li>
                  <li>Expires in: ${tokenResponse.data.expires_in} seconds</li>
                  <li>Scope: ${tokenResponse.data.scope || '(none returned)'}</li>
                </ul>
              </div>
              
              <h3>API Response:</h3>
              <pre>${JSON.stringify(noKeyResponse.data, null, 2)}</pre>
              
              <div class="back-link">
                <a href="/">Back to Test Form</a>
              </div>
            </body>
          </html>
        `);
      } catch (noKeyError) {
        console.log('❌ API call also failed without API key');
        
        res.send(`
          <html>
            <head>
              <title>Scope Test Results</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
                h1 { color: #333; }
                .error { background: #fde9e8; padding: 15px; border-left: 5px solid #f44336; margin: 20px 0; }
                .token-info { background: #f0f4f8; padding: 15px; margin: 20px 0; }
                .details { background: #f5f5f5; padding: 10px; overflow: auto; }
                .back-link { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h1>Scope Test Results</h1>
              
              <div class="token-info">
                <h3>✅ Token acquisition successful:</h3>
                <ul>
                  <li>Type: ${tokenResponse.data.token_type}</li>
                  <li>Expires in: ${tokenResponse.data.expires_in} seconds</li>
                  <li>Scope: ${tokenResponse.data.scope || '(none returned)'}</li>
                </ul>
              </div>
              
              <div class="error">
                <h2>❌ API Access Failed</h2>
                <p>The scope <strong>${scope || '(empty)'}</strong> successfully obtained a token, but API access was denied.</p>
                
                <h3>With API Key:</h3>
                <p>Status: ${apiError.response?.status || 'Unknown'}</p>
                <p>Error: ${apiError.message}</p>
                ${apiError.response?.data ? `<div class="details"><pre>${JSON.stringify(apiError.response.data, null, 2)}</pre></div>` : ''}
                
                <h3>Without API Key:</h3>
                <p>Status: ${noKeyError.response?.status || 'Unknown'}</p>
                <p>Error: ${noKeyError.message}</p>
                ${noKeyError.response?.data ? `<div class="details"><pre>${JSON.stringify(noKeyError.response.data, null, 2)}</pre></div>` : ''}
              </div>
              
              <div class="error">
                <h3>🔑 Conclusion:</h3>
                <p>Your OAuth authentication is working correctly, but you don't have permission to access the MOT API.</p>
                <p>This is likely because your API key needs to be activated by DVSA. Please contact DVSA support.</p>
              </div>
              
              <div class="back-link">
                <a href="/">Back to Test Form</a>
              </div>
            </body>
          </html>
        `);
      }
    }
  } catch (tokenError) {
    console.log('❌ Token acquisition failed');
    
    res.send(`
      <html>
        <head>
          <title>Scope Test Results</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
            h1 { color: #333; }
            .error { background: #fde9e8; padding: 15px; border-left: 5px solid #f44336; margin: 20px 0; }
            .details { background: #f5f5f5; padding: 10px; overflow: auto; }
            .back-link { margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Scope Test Results</h1>
          
          <div class="error">
            <h2>❌ Token Acquisition Failed</h2>
            <p>Failed to get an OAuth token with scope: <strong>${scope || '(empty)'}</strong></p>
            <p>Error: ${tokenError.message}</p>
            ${tokenError.response?.data ? `<div class="details"><pre>${JSON.stringify(tokenError.response.data, null, 2)}</pre></div>` : ''}
          </div>
          
          <div class="back-link">
            <a href="/">Back to Test Form</a>
          </div>
        </body>
      </html>
    `);
  }
});

// Test a specific API URL
app.post('/test-url', async (req, res) => {
  const registration = req.body.registration.toUpperCase().replace(/\s/g, '');
  const apiUrl = req.body.apiUrl;
  
  console.log(`Testing URL "${apiUrl}" with registration: ${registration}`);
  
  try {
    // Get token with default scope
    console.log('Requesting token...');
    const tokenResponse = await axios({
      method: 'post',
      url: AUTH_CONFIG.tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      data: qs.stringify({
        grant_type: 'client_credentials',
        client_id: AUTH_CONFIG.clientId,
        client_secret: AUTH_CONFIG.clientSecret,
        scope: 'https://tapi.dvsa.gov.uk/.default'
      }),
      timeout: 10000
    });
    
    console.log('✅ Token acquired');
    const accessToken = tokenResponse.data.access_token;
    
    // Try API with specified URL
    try {
      console.log(`Calling API URL: ${apiUrl}`);
      const apiResponse = await axios({
        method: 'get',
        url: apiUrl,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': AUTH_CONFIG.apiKey,
          'Accept': 'application/json+v6'
        },
        params: {
          registration: registration
        },
        timeout: 10000
      });
      
      console.log('✅ API call successful!');
      
      res.send(`
        <html>
          <head>
            <title>API URL Test Results</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
              h1 { color: #333; }
              .success { background: #e7f6e7; padding: 15px; border-left: 5px solid #4CAF50; margin: 20px 0; }
              .token-info { background: #f0f4f8; padding: 15px; margin: 20px 0; }
              pre { background: #f5f5f5; padding: 10px; overflow: auto; }
              .back-link { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h1>API URL Test Results</h1>
            
            <div class="success">
              <h2>✅ SUCCESS!</h2>
              <p>The API URL <strong>${apiUrl}</strong> worked correctly with registration: ${registration}</p>
            </div>
            
            <h3>API Response:</h3>
            <pre>${JSON.stringify(apiResponse.data, null, 2)}</pre>
            
            <div class="back-link">
              <a href="/">Back to Test Form</a>
            </div>
          </body>
        </html>
      `);
    } catch (apiError) {
      console.log('❌ API call failed');
      
      res.send(`
        <html>
          <head>
            <title>API URL Test Results</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
              h1 { color: #333; }
              .error { background: #fde9e8; padding: 15px; border-left: 5px solid #f44336; margin: 20px 0; }
              .token-info { background: #f0f4f8; padding: 15px; margin: 20px 0; }
              .details { background: #f5f5f5; padding: 10px; overflow: auto; }
              .back-link { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h1>API URL Test Results</h1>
            
            <div class="error">
              <h2>❌ API Call Failed</h2>
              <p>Failed to call API URL: <strong>${apiUrl}</strong></p>
              <p>Status: ${apiError.response?.status || 'Unknown'}</p>
              <p>Error: ${apiError.message}</p>
              ${apiError.response?.data ? `<div class="details"><pre>${JSON.stringify(apiError.response.data, null, 2)}</pre></div>` : ''}
            </div>
            
            <div class="back-link">
              <a href="/">Back to Test Form</a>
            </div>
          </body>
        </html>
      `);
    }
  } catch (tokenError) {
    console.log('❌ Token acquisition failed');
    
    res.send(`
      <html>
        <head>
          <title>API URL Test Results</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
            h1 { color: #333; }
            .error { background: #fde9e8; padding: 15px; border-left: 5px solid #f44336; margin: 20px 0; }
            .details { background: #f5f5f5; padding: 10px; overflow: auto; }
            .back-link { margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>API URL Test Results</h1>
          
          <div class="error">
            <h2>❌ Token Acquisition Failed</h2>
            <p>Could not test API URL because token acquisition failed.</p>
            <p>Error: ${tokenError.message}</p>
            ${tokenError.response?.data ? `<div class="details"><pre>${JSON.stringify(tokenError.response.data, null, 2)}</pre></div>` : ''}
          </div>
          
          <div class="back-link">
            <a href="/">Back to Test Form</a>
          </div>
        </body>
      </html>
    `);
  }
});

// Test all combinations
app.post('/test-all', async (req, res) => {
  const registration = req.body.registration.toUpperCase().replace(/\s/g, '');
  
  console.log(`Testing all combinations with registration: ${registration}`);
  
  const scopesToTry = [
    'https://tapi.dvsa.gov.uk/.default',
    'api://tapi.dvsa.gov.uk/.default',
    'https://check-mot.service.gov.uk/.default',
    'mot.read',
    'https://tapi.dvsa.gov.uk/mot.read',
    'https://dvsa.gov.uk/.default',
    ''
  ];
  
  const urlsToTry = [
    'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
    'https://api.check-mot.service.gov.uk/trade/vehicles/mot-tests',
    'https://mot.api.gov.uk/trade/vehicles/mot-tests',
    'https://tapi.dvsa.gov.uk/mot/trade/vehicles/mot-tests',
    'https://tapi.dvsa.gov.uk/check-mot/trade/vehicles/mot-tests'
  ];
  
  const results = {
    scopes: {},
    urls: {},
    successfulScopes: [],
    successfulUrls: []
  };
  
  // Test scopes
  for (const scope of scopesToTry) {
    try {
      console.log(`Testing scope: ${scope || '(empty)'}`);
      
      const tokenResponse = await axios({
        method: 'post',
        url: AUTH_CONFIG.tokenUrl,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        data: qs.stringify({
          grant_type: 'client_credentials',
          client_id: AUTH_CONFIG.clientId,
          client_secret: AUTH_CONFIG.clientSecret,
          scope: scope
        }),
        timeout: 10000
      });
      
      const accessToken = tokenResponse.data.access_token;
      results.scopes[scope || '(empty)'] = { 
        tokenAcquired: true,
        tokenType: tokenResponse.data.token_type,
        expiresIn: tokenResponse.data.expires_in
      };
      
      try {
        await axios({
          method: 'get',
          url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-api-key': AUTH_CONFIG.apiKey,
            'Accept': 'application/json+v6'
          },
          params: {
            registration: registration
          },
          timeout: 10000
        });
        
        results.scopes[scope || '(empty)'].apiAccess = true;
        results.successfulScopes.push(scope || '(empty)');
      } catch (apiError) {
        results.scopes[scope || '(empty)'].apiAccess = false;
        results.scopes[scope || '(empty)'].apiError = {
          status: apiError.response?.status,
          message: apiError.message
        };
      }
    } catch (tokenError) {
      results.scopes[scope || '(empty)'] = { 
        tokenAcquired: false,
        error: tokenError.message,
        status: tokenError.response?.status
      };
    }
  }
  
  // Test URLs with default scope token
  let defaultToken = null;
  try {
    const tokenResponse = await axios({
      method: 'post',
      url: AUTH_CONFIG.tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      data: qs.stringify({
        grant_type: 'client_credentials',
        client_id: AUTH_CONFIG.clientId,
        client_secret: AUTH_CONFIG.clientSecret,
        scope: 'https://tapi.dvsa.gov.uk/.default'
      }),
      timeout: 10000
    });
    
    defaultToken = tokenResponse.data.access_token;
    
    for (const url of urlsToTry) {
      try {
        await axios({
          method: 'get',
          url: url,
          headers: {
            'Authorization': `Bearer ${defaultToken}`,
            'x-api-key': AUTH_CONFIG.apiKey,
            'Accept': 'application/json+v6'
          },
          params: {
            registration: registration
          },
          timeout: 10000
        });
        
        results.urls[url] = { success: true };
        results.successfulUrls.push(url);
      } catch (apiError) {
        results.urls[url] = { 
          success: false,
          status: apiError.response?.status,
          message: apiError.message
        };
      }
    }
  } catch (tokenError) {
    results.urlTestFailed = {
      error: 'Could not get token for URL tests',
      details: tokenError.message
    };
  }
  
  // Generate HTML results
  let html = `
    <html>
      <head>
        <title>All Tests Results</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          h1, h2 { color: #333; }
          .section { margin: 30px 0; }
          .success { background: #e7f6e7; padding: 15px; border-left: 5px solid #4CAF50; margin: 20px 0; }
          .error { background: #fde9e8; padding: 15px; border-left: 5px solid #f44336; margin: 20px 0; }
          .neutral { background: #f0f4f8; padding: 15px; border-left: 5px solid #2196F3; margin: 20px 0; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f2f2f2; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .success-row { background-color: #e7f6e7 !important; }
          .error-row { background-color: #fde9e8 !important; }
          .back-link { margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>All Tests Results</h1>
        
        <div class="section">
          <h2>Summary</h2>
          <p>Registration tested: <strong>${registration}</strong></p>
          <p>Scopes tested: ${scopesToTry.length}</p>
          <p>URLs tested: ${urlsToTry.length}</p>
          ${results.successfulScopes.length > 0 ? 
            `<div class="success"><p>✅ Working scope(s) found: <strong>${results.successfulScopes.join(', ')}</strong></p></div>` :
            `<div class="error"><p>❌ No working scopes found.</p></div>`
          }
          ${results.successfulUrls.length > 0 ? 
            `<div class="success"><p>✅ Working URL(s) found: <strong>${results.successfulUrls.join(', ')}</strong></p></div>` :
            `<div class="error"><p>❌ No working URLs found.</p></div>`
          }
        </div>
        
        <div class="section">
          <h2>OAuth Scope Tests</h2>
          <table>
            <tr>
              <th>Scope</th>
              <th>Token Acquired</th>
              <th>API Access</th>
              <th>Status/Error</th>
            </tr>
  `;
  
  for (const scope in results.scopes) {
    const result = results.scopes[scope];
    const rowClass = result.apiAccess ? 'success-row' : (result.tokenAcquired ? '' : 'error-row');
    
    html += `
            <tr class="${rowClass}">
              <td>${scope}</td>
              <td>${result.tokenAcquired ? '✅' : '❌'}</td>
              <td>${result.apiAccess ? '✅' : '❌'}</td>
              <td>${result.apiError?.status || result.status || '-'}<br>
                  ${result.apiError?.message || result.error || '-'}</td>
            </tr>
    `;
  }
  
  html += `
          </table>
        </div>
        
        <div class="section">
          <h2>API URL Tests</h2>
          ${defaultToken ? `
          <table>
            <tr>
              <th>URL</th>
              <th>Success</th>
              <th>Status/Error</th>
            </tr>
  `;
  
  for (const url in results.urls) {
    const result = results.urls[url];
    const rowClass = result.success ? 'success-row' : 'error-row';
    
    html += `
            <tr class="${rowClass}">
              <td>${url}</td>
              <td>${result.success ? '✅' : '❌'}</td>
              <td>${result.status || '-'}<br>
                  ${result.message || '-'}</td>
            </tr>
    `;
  }
  
  html += `
          </table>
          ` : `<div class="error"><p>Could not test URLs: ${results.urlTestFailed.error}</p></div>`}
        </div>
        
        <div class="section">
          <h2>Conclusion</h2>
          ${results.successfulScopes.length > 0 || results.successfulUrls.length > 0 ? `
            <div class="success">
              <h3>✅ Success!</h3>
              <p>At least one working configuration was found.</p>
              ${results.successfulScopes.length > 0 ? `<p>Recommended scope: <strong>${results.successfulScopes[0]}</strong></p>` : ''}
              ${results.successfulUrls.length > 0 ? `<p>Recommended URL: <strong>${results.successfulUrls[0]}</strong></p>` : ''}
            </div>
          ` : `
            <div class="error">
              <h3>❌ Authorization Required</h3>
              <p>Your OAuth authentication is working correctly, but you don't have permission to access the MOT API.</p>
              <p>This is likely because your API key needs to be activated by DVSA. Please contact DVSA support.</p>
            </div>
          `}
        </div>
        
        <div class="back-link">
          <a href="/">Back to Test Form</a>
        </div>
      </body>
    </html>
  `;
  
  res.send(html);
});

// Start the server
app.listen(port, () => {
  console.log(`DVSA MOT API Scope Tester running on port ${port}`);
  
  // Check for missing credentials
  const missingCredentials = [];
  if (!AUTH_CONFIG.clientId) missingCredentials.push('DVSA_CLIENT_ID');
  if (!AUTH_CONFIG.clientSecret) missingCredentials.push('DVSA_CLIENT_SECRET');
  if (!AUTH_CONFIG.apiKey) missingCredentials.push('DVSA_API_KEY');
  if (!AUTH_CONFIG.tokenUrl) missingCredentials.push('DVSA_TOKEN_URL');
  
  if (missingCredentials.length > 0) {
    console.warn('⚠️  WARNING: Missing environment variables:', missingCredentials.join(', '));
  } else {
    console.log('✅ All credentials configured');
  }
});
