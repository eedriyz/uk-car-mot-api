const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('querystring');

// Load environment variables in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Authentication configuration from environment variables
const AUTH_CONFIG = {
  clientId: process.env.DVSA_CLIENT_ID,
  clientSecret: process.env.DVSA_CLIENT_SECRET,
  apiKey: process.env.DVSA_API_KEY,
  tokenUrl: process.env.DVSA_TOKEN_URL,
  scope: process.env.DVSA_SCOPE_URL || 'https://tapi.dvsa.gov.uk/.default'
};

// Token storage
let tokenCache = {
  accessToken: null,
  expiresAt: null
};

// Function to get access token with caching
async function getAccessToken() {
  const now = Date.now();
  
  // Check if we have a valid cached token
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  try {
    console.log('Requesting new access token...');
    
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

    console.log('New access token acquired');
    return tokenCache.accessToken;
    
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    tokenCache = { accessToken: null, expiresAt: null };
    throw new Error('Failed to authenticate with DVSA API');
  }
}

// Main MOT API endpoint
app.get('/api/mot/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  
  // Check if credentials are configured
  if (!AUTH_CONFIG.clientId || !AUTH_CONFIG.clientSecret) {
    return res.status(500).json({
      error: "API credentials not configured",
      message: "Server configuration error"
    });
  }
  
  try {
    // Get access token
    const accessToken = await getAccessToken();
    
    // Try both with and without API key
    let apiResponse;
    let useApiKey = true;
    
    try {
      // First attempt with API key
      apiResponse = await axios({
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
        timeout: 15000
      });
    } catch (apiKeyError) {
      // If that fails, try without API key
      if (apiKeyError.response && apiKeyError.response.status === 403) {
        console.log('API key rejected, trying without API key...');
        useApiKey = false;
        
        apiResponse = await axios({
          method: 'get',
          url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json+v6'
          },
          params: {
            registration: registration
          },
          timeout: 15000
        });
      } else {
        // If error wasn't 403, rethrow it
        throw apiKeyError;
      }
    }
    
    // Return the data
    res.json({
      success: true,
      data: apiResponse.data,
      registration: registration,
      usedApiKey: useApiKey,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('MOT API Error:', error.response?.data || error.message);
    
    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      
      if (status === 404) {
        return res.status(404).json({
          error: "Vehicle not found",
          registration: registration,
          message: "No MOT data found for this registration number"
        });
      }
      
      if (status === 401 || status === 403) {
        return res.status(500).json({
          error: "API access denied",
          message: "The system cannot access the MOT database at this time",
          registration: registration
        });
      }
    }
    
    // Generic error response
    res.status(500).json({
      error: "Failed to fetch MOT data",
      message: "There was a problem retrieving the vehicle data",
      registration: registration
    });
  }
});

// Simple diagnostic test endpoint
app.get('/test-all/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  const results = {};
  
  try {
    // Step 1: Test token acquisition
    try {
      const accessToken = await getAccessToken();
      results.tokenAcquisition = {
        success: true,
        message: "Successfully got access token"
      };
      
      // Step 2: Test with API key
      try {
        await axios({
          method: 'get',
          url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-api-key': AUTH_CONFIG.apiKey,
            'Accept': 'application/json+v6'
          },
          params: { registration },
          timeout: 10000
        });
        
        results.withApiKey = {
          success: true,
          message: "API request succeeded with API key"
        };
      } catch (apiKeyError) {
        results.withApiKey = {
          success: false,
          status: apiKeyError.response?.status,
          message: apiKeyError.message
        };
        
        // Step 3: If API key failed, try without it
        try {
          await axios({
            method: 'get',
            url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json+v6'
            },
            params: { registration },
            timeout: 10000
          });
          
          results.withoutApiKey = {
            success: true,
            message: "API request succeeded without API key"
          };
        } catch (noKeyError) {
          results.withoutApiKey = {
            success: false,
            status: noKeyError.response?.status,
            message: noKeyError.message
          };
        }
      }
    } catch (tokenError) {
      results.tokenAcquisition = {
        success: false,
        message: tokenError.message
      };
    }
    
    // Final recommendation based on results
    if (results.withApiKey?.success) {
      results.recommendation = "Use the API with API key";
    } else if (results.withoutApiKey?.success) {
      results.recommendation = "Use the API without API key";
    } else if (!results.tokenAcquisition.success) {
      results.recommendation = "Fix token authentication issues";
    } else {
      results.recommendation = "Contact DVSA for API access";
    }
    
    res.json(results);
    
  } catch (error) {
    res.status(500).json({
      error: "Test failed",
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    credentials: {
      clientId: !!AUTH_CONFIG.clientId,
      clientSecret: !!AUTH_CONFIG.clientSecret,
      apiKey: !!AUTH_CONFIG.apiKey,
      tokenUrl: !!AUTH_CONFIG.tokenUrl
    }
  });
});

// Home route
app.get('/', (req, res) => {
  res.json({
    service: 'DVSA MOT API',
    version: '1.1.0',
    status: 'running',
    endpoints: {
      mot: '/api/mot/:registration',
      test: '/test-all/:registration',
      health: '/health'
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  
  // Check configuration on startup
  const missingConfig = [];
  if (!AUTH_CONFIG.clientId) missingConfig.push('DVSA_CLIENT_ID');
  if (!AUTH_CONFIG.clientSecret) missingConfig.push('DVSA_CLIENT_SECRET');
  if (!AUTH_CONFIG.tokenUrl) missingConfig.push('DVSA_TOKEN_URL');
  
  if (missingConfig.length > 0) {
    console.warn('⚠️  WARNING: Missing environment variables:', missingConfig.join(', '));
  } else {
    console.log('✅ All essential DVSA API credentials configured');
  }
});
