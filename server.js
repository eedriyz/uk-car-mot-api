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
app.use(cors());
app.use(express.json());

// Authentication configuration
const AUTH_CONFIG = {
  clientId: process.env.DVSA_CLIENT_ID,
  clientSecret: process.env.DVSA_CLIENT_SECRET,
  apiKey: process.env.DVSA_API_KEY,
  tokenUrl: process.env.DVSA_TOKEN_URL,
  scope: process.env.DVSA_SCOPE_URL || 'https://tapi.dvsa.gov.uk/.default'
};

// Token storage - in production, consider using Redis or another cache solution
let tokenCache = {
  accessToken: null,
  expiresAt: null
};

// Function to get access token (with caching)
async function getAccessToken() {
  // Check if we have a valid token cached
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  // If no valid token, get a new one
  try {
    const tokenResponse = await axios({
      method: 'post',
      url: AUTH_CONFIG.tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: qs.stringify({
        grant_type: 'client_credentials',
        client_id: AUTH_CONFIG.clientId,
        client_secret: AUTH_CONFIG.clientSecret,
        scope: AUTH_CONFIG.scope
      })
    });

    // Cache the token
    const expiresIn = tokenResponse.data.expires_in * 1000; // convert to ms
    tokenCache = {
      accessToken: tokenResponse.data.access_token,
      expiresAt: now + expiresIn - 60000 // Subtract a minute to be safe
    };

    console.log('New access token acquired');
    return tokenCache.accessToken;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with DVSA API');
  }
}

// Main API endpoint for MOT checks
app.get('/api/mot/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  
  // Validate credentials exist
  if (!AUTH_CONFIG.clientId || !AUTH_CONFIG.clientSecret || !AUTH_CONFIG.apiKey) {
    return res.status(500).json({
      error: "API credentials not configured",
      registration: registration
    });
  }
  
  try {
    // Get access token
    const accessToken = await getAccessToken();
    
    // Call the DVSA MOT API
    const apiResponse = await axios({
      method: 'get',
      url: `https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': AUTH_CONFIG.apiKey,
        'Accept': 'application/json+v6'
      },
      params: {
        registration: registration
      }
    });
    
    res.json(apiResponse.data);
    
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    
    // Handle specific error cases
    if (error.response) {
      if (error.response.status === 404) {
        return res.status(404).json({
          error: "Vehicle not found",
          registration: registration
        });
      } 
      
      if (error.response.status === 401 || error.response.status === 403) {
        // Clear token cache on auth errors
        tokenCache = { accessToken: null, expiresAt: null };
        return res.status(500).json({
          error: "Authentication failed",
          details: "API credentials may be invalid or expired",
          registration: registration
        });
      }
    }
    
    // Generic error response
    res.status(500).json({
      error: "Failed to fetch MOT data",
      details: error.response?.data?.message || error.message,
      registration: registration
    });
  }
});

// Home route
app.get('/', (req, res) => {
  res.send('DVSA MOT API - OAuth Version');
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    credentials: {
      clientId: !!AUTH_CONFIG.clientId,
      clientSecret: !!AUTH_CONFIG.clientSecret,
      apiKey: !!AUTH_CONFIG.apiKey
    }
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  if (!AUTH_CONFIG.clientId || !AUTH_CONFIG.clientSecret || !AUTH_CONFIG.apiKey) {
    console.warn('⚠️ WARNING: DVSA API credentials not fully configured');
  }
});
