const express = require('express');
const axios = require('axios');
const qs = require('querystring');

const app = express();
const port = process.env.PORT || 3000;

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});
app.use(express.json());

// DVSA Configuration
const AUTH_CONFIG = {
  clientId: process.env.DVSA_CLIENT_ID,
  clientSecret: process.env.DVSA_CLIENT_SECRET,
  apiKey: process.env.DVSA_API_KEY,
  tokenUrl: process.env.DVSA_TOKEN_URL,
  scope: 'https://tapi.dvsa.gov.uk/.default'
};

// Token storage
let tokenCache = {
  accessToken: null,
  expiresAt: null
};

// Function to get OAuth access token (POST request)
async function getAccessToken() {
  const now = Date.now();
  
  // Check if we have a valid cached token
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt) {
    console.log('Using cached access token');
    return tokenCache.accessToken;
  }

  try {
    console.log('Requesting new access token via POST...');
    
    // POST request to get OAuth token
    const tokenResponse = await axios({
      method: 'POST', // OAuth token acquisition is POST
      url: AUTH_CONFIG.tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      data: qs.stringify({
        grant_type: 'client_credentials',
        client_id: AUTH_CONFIG.clientId,
        client_secret: AUTH_CONFIG.clientSecret,
        scope: AUTH_CONFIG.scope
      }),
      timeout: 10000
    });

    // Cache the new token
    const expiresIn = tokenResponse.data.expires_in * 1000;
    tokenCache = {
      accessToken: tokenResponse.data.access_token,
      expiresAt: now + expiresIn - 60000 // Subtract 1 minute for safety
    };

    console.log('✅ New access token acquired');
    return tokenCache.accessToken;
    
  } catch (error) {
    console.error('❌ Error getting access token:', error.response?.data || error.message);
    tokenCache = { accessToken: null, expiresAt: null };
    throw new Error('Failed to authenticate with DVSA API');
  }
}

// GET endpoint for MOT data (this is what you should use)
app.get('/api/mot/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  
  console.log(`🚗 MOT request for registration: ${registration}`);
  
  try {
    // Step 1: Get OAuth access token (POST request)
    const accessToken = await getAccessToken();
    
    // Step 2: Make GET request to MOT API
    console.log('Making GET request to MOT API...');
    const apiResponse = await axios({
      method: 'GET', // MOT API uses GET requests
      url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': AUTH_CONFIG.apiKey,
        'Accept': 'application/json+v6'
      },
      params: {
        registration: registration
      },
      timeout: 15000
    });
    
    console.log(`✅ MOT API GET request successful for: ${registration}`);
    
    res.json({
      success: true,
      data: apiResponse.data,
      registration: registration,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ MOT API Error:', error.response?.data || error.message);
    
    if (error.response) {
      const status = error.response.status;
      
      if (status === 404) {
        return res.status(404).json({
          error: "Vehicle not found",
          registration: registration
        });
      }
      
      if (status === 401 || status === 403) {
        // Clear token cache on auth errors
        tokenCache = { accessToken: null, expiresAt: null };
        return res.status(500).json({
          error: "API access denied",
          message: "Authentication failed or API key not authorized",
          registration: registration
        });
      }
    }
    
    res.status(500).json({
      error: "Failed to fetch MOT data",
      message: error.message,
      registration: registration
    });
  }
});

// Test endpoint - this should work now
app.get('/test/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  
  try {
    console.log(`🧪 Testing with registration: ${registration}`);
    
    // Get access token
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained');
    
    // Test the MOT API with GET request
    const apiResponse = await axios({
      method: 'GET',
      url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': AUTH_CONFIG.apiKey,
        'Accept': 'application/json+v6'
      },
      params: {
        registration: registration
      },
      timeout: 15000
    });
    
    res.json({
      success: true,
      message: "GET request to MOT API successful",
      registration: registration,
      statusCode: apiResponse.status,
      dataReceived: !!apiResponse.data,
      vehicleCount: Array.isArray(apiResponse.data) ? apiResponse.data.length : 1
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    res.json({
      success: false,
      message: "GET request to MOT API failed",
      registration: registration,
      error: {
        status: error.response?.status,
        message: error.message,
        details: error.response?.data
      }
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    credentials: {
      clientId: !!AUTH_CONFIG.clientId,
      clientSecret: !!AUTH_CONFIG.clientSecret,
      apiKey: !!AUTH_CONFIG.apiKey,
      tokenUrl: !!AUTH_CONFIG.tokenUrl
    },
    tokenCache: {
      hasToken: !!tokenCache.accessToken,
      expiresAt: tokenCache.expiresAt ? new Date(tokenCache.expiresAt).toISOString() : null
    }
  });
});

// Home route
app.get('/', (req, res) => {
  res.json({
    service: 'DVSA MOT API - Correct Implementation',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      mot: '/api/mot/:registration (GET)',
      test: '/test/:registration (GET)',
      health: '/health (GET)'
    },
    implementation: {
      tokenRequest: 'POST to OAuth endpoint',
      motApiRequest: 'GET to MOT API endpoint'
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 DVSA MOT API Server running on port ${port}`);
  console.log(`📋 Implementation: OAuth=POST, MOT API=GET`);
  
  const missingConfig = [];
  if (!AUTH_CONFIG.clientId) missingConfig.push('DVSA_CLIENT_ID');
  if (!AUTH_CONFIG.clientSecret) missingConfig.push('DVSA_CLIENT_SECRET');
  if (!AUTH_CONFIG.apiKey) missingConfig.push('DVSA_API_KEY');
  if (!AUTH_CONFIG.tokenUrl) missingConfig.push('DVSA_TOKEN_URL');
  
  if (missingConfig.length > 0) {
    console.warn('⚠️  WARNING: Missing environment variables:', missingConfig.join(', '));
  } else {
    console.log('✅ All DVSA API credentials configured');
  }
});
