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

// Endpoint to test multiple scopes with a registration number
app.get('/test-scopes/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  const results = {};
  
  console.log(`Testing scopes for registration: ${registration}`);
  console.log('Using token URL:', AUTH_CONFIG.tokenUrl);
  
  // Array of potential scopes to try
  const scopesToTry = [
    'https://tapi.dvsa.gov.uk/.default',           // Standard default scope
    'api://tapi.dvsa.gov.uk/.default',             // API URI format
    'https://check-mot.service.gov.uk/.default',   // Check-MOT service
    'https://beta.check-mot.service.gov.uk/.default', // Beta service
    'mot.read',                                    // Simple permission name
    'https://tapi.dvsa.gov.uk/mot.read',           // Specific permission
    'https://tapi.dvsa.gov.uk/mot.api',            // Alternative permission
    'https://dvsa.gov.uk/.default',                // Organization domain
    ''                                             // Empty scope
  ];
  
  for (const scope of scopesToTry) {
    try {
      console.log(`\nTrying scope: ${scope || '(empty)'}`);
      
      // Step 1: Get token with this scope
      let tokenResponse;
      try {
        const tokenStart = Date.now();
        tokenResponse = await axios({
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
        
        const tokenDuration = Date.now() - tokenStart;
        console.log(`✅ Token acquired in ${tokenDuration}ms`);
        
        const accessToken = tokenResponse.data.access_token;
        const tokenDetails = {
          acquired: true,
          type: tokenResponse.data.token_type,
          expiresIn: tokenResponse.data.expires_in,
          scope: tokenResponse.data.scope || '(none returned)'
        };
        
        results[scope || '(empty)'] = { token: tokenDetails };
        
        // Step 2: Test API with this token
        try {
          const apiStart = Date.now();
          console.log(`Testing API with token from scope: ${scope || '(empty)'}`);
          
          // First try with API key
          try {
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
            
            const apiDuration = Date.now() - apiStart;
            console.log(`✅ API call succeeded with API key in ${apiDuration}ms`);
            
            results[scope || '(empty)'].withApiKey = {
              success: true,
              status: apiResponse.status,
              contentType: apiResponse.headers['content-type'],
              dataSize: JSON.stringify(apiResponse.data).length
            };
          } catch (withKeyError) {
            console.log(`❌ API call with API key failed: ${withKeyError.message}`);
            if (withKeyError.response) {
              console.log(`Status: ${withKeyError.response.status}`);
            }
            
            results[scope || '(empty)'].withApiKey = {
              success: false,
              status: withKeyError.response?.status,
              error: withKeyError.message
            };
            
            // If API key failed with 403, try without API key
            if (withKeyError.response?.status === 403) {
              try {
                console.log('Trying without API key...');
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
                
                console.log('✅ API call without API key succeeded');
                
                results[scope || '(empty)'].withoutApiKey = {
                  success: true,
                  status: noKeyResponse.status,
                  contentType: noKeyResponse.headers['content-type'],
                  dataSize: JSON.stringify(noKeyResponse.data).length
                };
              } catch (noKeyError) {
                console.log(`❌ API call without API key also failed: ${noKeyError.message}`);
                
                results[scope || '(empty)'].withoutApiKey = {
                  success: false,
                  status: noKeyError.response?.status,
                  error: noKeyError.message
                };
              }
            }
          }
        } catch (apiError) {
          console.log(`❌ Error testing API: ${apiError.message}`);
          
          results[scope || '(empty)'].apiError = {
            message: apiError.message
          };
        }
        
      } catch (tokenError) {
        console.log(`❌ Failed to get token: ${tokenError.message}`);
        if (tokenError.response) {
          console.log(`Status: ${tokenError.response.status}`);
          console.log('Error data:', tokenError.response.data);
        }
        
        results[scope || '(empty)'] = { 
          token: {
            acquired: false,
            error: tokenError.message,
            status: tokenError.response?.status,
            details: tokenError.response?.data
          }
        };
      }
      
    } catch (error) {
      console.log(`❌ Unexpected error with scope "${scope}": ${error.message}`);
      results[scope || '(empty)'] = { error: error.message };
    }
  }
  
  // Find any successful scope
  const successfulScopes = Object.keys(results).filter(scope => 
    (results[scope].withApiKey && results[scope].withApiKey.success) || 
    (results[scope].withoutApiKey && results[scope].withoutApiKey.success)
  );
  
  // Determine which scopes got tokens
  const tokenObtained = Object.keys(results).filter(scope => 
    results[scope].token && results[scope].token.acquired
  );
  
  const response = {
    registration: registration,
    results: results,
    tokenObtainedFor: tokenObtained,
    successfulScopes: successfulScopes,
    recommendation: successfulScopes.length > 0 
      ? `Use scope: ${successfulScopes[0]}` 
      : tokenObtained.length > 0
        ? "Token obtained but API access denied. Contact DVSA for access."
        : "Authentication failed. Check credentials."
  };
  
  console.log('Testing complete.');
  res.json(response);
});

// Try various API URLs with a single token
app.get('/test-urls/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  const results = {};
  
  try {
    // Get a token using the default scope
    console.log('Getting access token with default scope...');
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
    
    const accessToken = tokenResponse.data.access_token;
    console.log('✅ Access token acquired');
    
    // Array of potential URLs to try
    const urlsToTry = [
      'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
      'https://api.check-mot.service.gov.uk/trade/vehicles/mot-tests',
      'https://mot.api.gov.uk/trade/vehicles/mot-tests',
      'https://tapi.dvsa.gov.uk/mot/trade/vehicles/mot-tests',
      'https://tapi.dvsa.gov.uk/check-mot/trade/vehicles/mot-tests',
      'https://check-mot.service.gov.uk/trade/vehicles/mot-tests'
    ];
    
    // Try each URL
    for (const url of urlsToTry) {
      try {
        console.log(`Testing URL: ${url}`);
        
        const apiResponse = await axios({
          method: 'get',
          url: url,
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
        
        console.log(`✅ Success with URL: ${url}`);
        
        results[url] = {
          success: true,
          status: apiResponse.status,
          contentType: apiResponse.headers['content-type'],
          dataSize: JSON.stringify(apiResponse.data).length
        };
      } catch (error) {
        console.log(`❌ Error with URL ${url}: ${error.message}`);
        
        results[url] = {
          success: false,
          status: error.response?.status,
          error: error.message,
          details: error.response?.data
        };
      }
    }
    
    // Find any successful URL
    const successfulUrls = Object.keys(results).filter(url => results[url].success);
    
    res.json({
      registration: registration,
      results: results,
      successfulUrls: successfulUrls,
      recommendation: successfulUrls.length > 0 
        ? `Use URL: ${successfulUrls[0]}` 
        : "No working URL found. Contact DVSA for support."
    });
    
  } catch (error) {
    console.error('Error in test-urls:', error);
    res.status(500).json({
      error: "Failed to test URLs",
      message: error.message
    });
  }
});

// Simple health check endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'DVSA MOT API Scope Tester',
    status: 'running',
    endpoints: {
      testScopes: '/test-scopes/:registration',
      testUrls: '/test-urls/:registration'
    },
    credentials: {
      hasClientId: !!AUTH_CONFIG.clientId,
      hasClientSecret: !!AUTH_CONFIG.clientSecret,
      hasApiKey: !!AUTH_CONFIG.apiKey,
      hasTokenUrl: !!AUTH_CONFIG.tokenUrl
    }
  });
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
