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

// Enable CORS for all routes
app.use(cors({
  origin: true,
  credentials: true
}));

// Parse JSON request bodies
app.use(express.json());

// Authentication configuration from environment variables
const AUTH_CONFIG = {
  clientId: process.env.DVSA_CLIENT_ID,
  clientSecret: process.env.DVSA_CLIENT_SECRET,
  apiKey: process.env.DVSA_API_KEY,
  tokenUrl: process.env.DVSA_TOKEN_URL,
  scope: process.env.DVSA_SCOPE_URL || 'https://tapi.dvsa.gov.uk/.default'
};

// Token storage - in production, consider using Redis or database
let tokenCache = {
  accessToken: null,
  expiresAt: null
};

// Function to get access token with caching
async function getAccessToken() {
  const now = Date.now();
  
  // Check if we have a valid cached token
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt) {
    console.log('Using cached access token');
    return tokenCache.accessToken;
  }

  // Get new token if no valid cached token
  try {
    console.log('Requesting new access token...');
    console.log('Token URL:', AUTH_CONFIG.tokenUrl);
    console.log('Client ID exists:', !!AUTH_CONFIG.clientId);
    console.log('Client Secret exists:', !!AUTH_CONFIG.clientSecret);
    console.log('Scope:', AUTH_CONFIG.scope);
    
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
    const expiresIn = tokenResponse.data.expires_in * 1000; // convert to milliseconds
    tokenCache = {
      accessToken: tokenResponse.data.access_token,
      expiresAt: now + expiresIn - 60000 // Subtract 1 minute for safety
    };

    console.log('New access token acquired, expires in:', expiresIn / 1000, 'seconds');
    return tokenCache.accessToken;
    
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    if (error.response) {
      console.error('Error response status:', error.response.status);
      console.error('Error response data:', JSON.stringify(error.response.data));
    }
    
    // Clear cache on error
    tokenCache = { accessToken: null, expiresAt: null };
    
    if (error.response) {
      throw new Error(`Authentication failed: ${error.response.status} - ${error.response.data?.error || error.response.statusText}`);
    }
    throw new Error('Failed to authenticate with DVSA API');
  }
}

// Alternative authentication method (may be needed for some Azure AD configurations)
async function getAccessTokenAlternative() {
  try {
    console.log('Trying alternative authentication method...');
    
    const tokenResponse = await axios({
      method: 'post',
      url: AUTH_CONFIG.tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: {
        username: AUTH_CONFIG.clientId,
        password: AUTH_CONFIG.clientSecret
      },
      data: qs.stringify({
        grant_type: 'client_credentials',
        scope: AUTH_CONFIG.scope
      }),
      timeout: 10000
    });
    
    const expiresIn = tokenResponse.data.expires_in * 1000;
    tokenCache = {
      accessToken: tokenResponse.data.access_token,
      expiresAt: Date.now() + expiresIn - 60000
    };
    
    console.log('Alternative authentication succeeded');
    return tokenCache.accessToken;
  } catch (error) {
    console.error('Alternative auth error:', error.response?.data || error.message);
    throw error;
  }
}

// Validate registration format
function validateRegistration(registration) {
  // UK registration patterns
  const patterns = [
    /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/, // AB12 CDE
    /^[A-Z][0-9]{1,3}[A-Z]{3}$/, // A123 ABC
    /^[A-Z]{3}[0-9]{1,3}[A-Z]$/, // ABC 123A
    /^[0-9]{1,4}[A-Z]{1,3}$/, // 1234 AB
    /^[A-Z]{1,3}[0-9]{1,4}$/ // AB 1234
  ];
  
  return patterns.some(pattern => pattern.test(registration));
}

// Main MOT API endpoint
app.get('/api/mot/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  
  console.log(`MOT request for registration: ${registration}`);
  
  // Validate registration format
  if (!validateRegistration(registration)) {
    return res.status(400).json({
      error: "Invalid registration format",
      registration: registration,
      message: "Please enter a valid UK registration number"
    });
  }
  
  // Check if all required credentials are configured
  if (!AUTH_CONFIG.clientId || !AUTH_CONFIG.clientSecret || !AUTH_CONFIG.apiKey || !AUTH_CONFIG.tokenUrl) {
    console.error('Missing API credentials');
    return res.status(500).json({
      error: "API credentials not configured",
      message: "Server configuration error. Please contact administrator."
    });
  }
  
  try {
    // Get access token
    let accessToken;
    try {
      accessToken = await getAccessToken();
    } catch (authError) {
      console.log('Standard auth failed, trying alternative...');
      try {
        accessToken = await getAccessTokenAlternative();
      } catch (altAuthError) {
        console.error('All authentication methods failed');
        throw authError; // Throw the original error
      }
    }
    
    // Make request to DVSA MOT API
    console.log('Making MOT API request...');
    console.log('API Key exists:', !!AUTH_CONFIG.apiKey);
    
    const apiResponse = await axios({
      method: 'get',
      url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': AUTH_CONFIG.apiKey,
        'Accept': 'application/json+v6',
        'User-Agent': 'MOT-API-Client/1.0'
      },
      params: {
        registration: registration
      },
      timeout: 15000
    });
    
    console.log(`MOT API response status: ${apiResponse.status}`);
    
    // Return the data
    res.json({
      success: true,
      data: apiResponse.data,
      registration: registration,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('MOT API Error:', error.response?.data || error.message);
    
    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      if (status === 404) {
        return res.status(404).json({
          error: "Vehicle not found",
          registration: registration,
          message: "No MOT data found for this registration number"
        });
      }
      
      if (status === 401 || status === 403) {
        // Clear token cache on auth errors
        tokenCache = { accessToken: null, expiresAt: null };
        return res.status(500).json({
          error: "Authentication failed",
          message: "API authentication error. Please try again.",
          details: errorData?.error_description || errorData?.message || "Unauthorized access",
          registration: registration
        });
      }
      
      if (status === 429) {
        return res.status(429).json({
          error: "Rate limit exceeded",
          message: "Too many requests. Please wait a moment and try again.",
          registration: registration
        });
      }
      
      // Other HTTP errors
      return res.status(500).json({
        error: "API request failed",
        message: `DVSA API returned status ${status}`,
        details: errorData?.message || errorData?.error,
        registration: registration
      });
    }
    
    // Network or other errors
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        error: "Request timeout",
        message: "The request took too long to complete. Please try again.",
        registration: registration
      });
    }
    
    // Generic error response
    res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred while fetching MOT data",
      details: error.message,
      registration: registration
    });
  }
});

// New test authentication endpoint
app.get('/test-auth', async (req, res) => {
  try {
    console.log('Testing authentication...');
    console.log('Token URL:', AUTH_CONFIG.tokenUrl);
    console.log('Client ID exists:', !!AUTH_CONFIG.clientId);
    console.log('Client Secret exists:', !!AUTH_CONFIG.clientSecret);
    console.log('API Key exists:', !!AUTH_CONFIG.apiKey);
    console.log('Scope:', AUTH_CONFIG.scope);
    
    // Try standard auth
    try {
      console.log('Trying standard authentication method...');
      
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
      
      res.json({
        success: true,
        method: 'standard',
        tokenReceived: true,
        tokenType: tokenResponse.data.token_type,
        expiresIn: tokenResponse.data.expires_in,
        scope: tokenResponse.data.scope,
        rawResponse: tokenResponse.data
      });
      return;
    } catch (standardError) {
      console.log('Standard authentication failed, trying alternative...');
      console.error('Standard auth error:', standardError.response?.data || standardError.message);
      
      // Try alternative auth
      try {
        console.log('Trying alternative authentication method...');
        
        const altTokenResponse = await axios({
          method: 'post',
          url: AUTH_CONFIG.tokenUrl,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          auth: {
            username: AUTH_CONFIG.clientId,
            password: AUTH_CONFIG.clientSecret
          },
          data: qs.stringify({
            grant_type: 'client_credentials',
            scope: AUTH_CONFIG.scope
          }),
          timeout: 10000
        });
        
        res.json({
          success: true,
          method: 'alternative',
          tokenReceived: true,
          tokenType: altTokenResponse.data.token_type,
          expiresIn: altTokenResponse.data.expires_in,
          scope: altTokenResponse.data.scope,
          rawResponse: altTokenResponse.data
        });
        return;
      } catch (altError) {
        console.error('Alternative authentication also failed');
        console.error('Alt auth error:', altError.response?.data || altError.message);
        
        res.status(500).json({
          success: false,
          error: 'Both authentication methods failed',
          standardAuthError: standardError.response?.data || standardError.message,
          standardAuthStatus: standardError.response?.status,
          alternativeAuthError: altError.response?.data || altError.message,
          alternativeAuthStatus: altError.response?.status,
          config: {
            tokenUrl: AUTH_CONFIG.tokenUrl,
            hasClientId: !!AUTH_CONFIG.clientId,
            hasClientSecret: !!AUTH_CONFIG.clientSecret,
            hasApiKey: !!AUTH_CONFIG.apiKey,
            scope: AUTH_CONFIG.scope
          }
        });
      }
    }
  } catch (error) {
    console.error('Authentication test error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Authentication test failed with unexpected error',
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
      config: {
        tokenUrl: AUTH_CONFIG.tokenUrl,
        hasClientId: !!AUTH_CONFIG.clientId,
        hasClientSecret: !!AUTH_CONFIG.clientSecret,
        hasApiKey: !!AUTH_CONFIG.apiKey,
        scope: AUTH_CONFIG.scope
      }
    });
  }
});

// Test MOT API with a known registration
app.get('/test-mot-api/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  
  try {
    console.log(`Testing MOT API with registration: ${registration}`);
    
    // Get access token (we know this works from test-auth)
    const accessToken = await getAccessToken();
    console.log('Access token obtained successfully');
    
    // Test API key directly
    console.log('Testing with API key:', AUTH_CONFIG.apiKey?.substring(0, 5) + '...');
    
    const apiResponse = await axios({
      method: 'get',
      url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': AUTH_CONFIG.apiKey,
        'Accept': 'application/json+v6',
        'User-Agent': 'MOT-API-Client/1.0'
      },
      params: {
        registration: registration
      },
      timeout: 15000
    });
    
    // If we get here, it worked!
    res.json({
      success: true,
      motApiWorking: true,
      statusCode: apiResponse.status,
      dataReceived: !!apiResponse.data,
      registration: registration
    });
    
  } catch (error) {
    console.error('MOT API test error:', error.response?.data || error.message);
    
    // Detailed error response
    res.status(500).json({
      success: false,
      error: 'MOT API test failed',
      statusCode: error.response?.status,
      errorDetails: error.response?.data || error.message,
      request: {
        url: 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests',
        method: 'GET',
        params: { registration },
        hasToken: true,
        hasApiKey: !!AUTH_CONFIG.apiKey,
        accept: 'application/json+v6'
      }
    });
  }
});

// Test access to token endpoint
app.get('/test-token-url', async (req, res) => {
  try {
    console.log('Testing access to token URL...');
    console.log('Token URL:', AUTH_CONFIG.tokenUrl);
    
    // Just try to reach the token URL without authentication
    const response = await axios({
      method: 'get',
      url: AUTH_CONFIG.tokenUrl,
      timeout: 10000,
      validateStatus: () => true // Accept any status code
    });
    
    res.json({
      success: true,
      canReachTokenUrl: true,
      statusCode: response.status,
      contentType: response.headers['content-type'],
      responseSize: response.data ? JSON.stringify(response.data).length : 0
    });
  } catch (error) {
    console.error('Error accessing token URL:', error.message);
    
    res.status(500).json({
      success: false,
      canReachTokenUrl: false,
      error: error.message,
      isNetworkError: error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND',
      errorCode: error.code
    });
  }
});

// Home route
app.get('/', (req, res) => {
  res.json({
    service: 'DVSA MOT API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      mot: '/api/mot/:registration',
      health: '/health',
      testAuth: '/test-auth',
      testMotApi: '/test-mot-api/:registration',
      testTokenUrl: '/test-token-url'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
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
  };
  
  res.json(healthStatus);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Check configuration on startup
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
