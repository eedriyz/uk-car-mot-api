const express = require('express');
const cors = require('cors');

// Load environment variables in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// API key from environment variables (never stored in code)
const DVSA_API_KEY = process.env.DVSA_API_KEY;

// Home route
app.get('/', (req, res) => {
  res.send('UK MOT API is running! Use /api/mot/:registration to get vehicle data.');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    time: new Date().toISOString(),
    apiConfigured: !!DVSA_API_KEY
  });
});

// Main MOT data endpoint
app.get('/api/mot/:registration', async (req, res) => {
  const registration = req.params.registration.toUpperCase().replace(/\s/g, '');
  
  // Validate registration format
  if (!registration.match(/^[A-Z0-9]{1,7}$/)) {
    return res.status(400).json({
      error: "Invalid registration format",
      registration: registration
    });
  }

  // Check if API key is configured
  if (!DVSA_API_KEY) {
    return res.status(500).json({
      error: "API not properly configured. API key missing.",
      contact: "Please contact the administrator."
    });
  }

  try {
    console.log(`Fetching data for vehicle: ${registration}`);
    
    // Step 1: Get vehicle details
    const vehicleResponse = await fetch(`https://beta.check-mot.service.gov.uk/trade/vehicles/${registration}`, {
      headers: {
        'x-api-key': DVSA_API_KEY,
        'Accept': 'application/json+v6'
      }
    });

    // Handle vehicle not found
    if (vehicleResponse.status === 404) {
      return res.status(404).json({
        error: "Vehicle not found",
        registration: registration
      });
    }
    
    // Handle other errors
    if (!vehicleResponse.ok) {
      throw new Error(`Vehicle API returned status: ${vehicleResponse.status}`);
    }

    const vehicleData = await vehicleResponse.json();
    
    if (!vehicleData || vehicleData.length === 0) {
      return res.status(404).json({
        error: "No data found for this vehicle",
        registration: registration
      });
    }

    // Step 2: Get MOT test history using vehicle ID
    const vehicleId = vehicleData[0].vehicleId;
    
    const motResponse = await fetch(`https://beta.check-mot.service.gov.uk/trade/vehicles/${vehicleId}/mot-tests`, {
      headers: {
        'x-api-key': DVSA_API_KEY,
        'Accept': 'application/json+v6'
      }
    });

    // Handle MOT data errors
    if (!motResponse.ok) {
      throw new Error(`MOT API returned status: ${motResponse.status}`);
    }

    const motData = await motResponse.json();

    // Combine vehicle and MOT data
    const result = {
      vehicle: vehicleData[0],
      motTests: motData
    };

    console.log(`Successfully retrieved MOT data for: ${registration}`);
    res.json(result);
    
  } catch (error) {
    console.error(`Error fetching MOT data: ${error.message}`);
    res.status(500).json({
      error: "Failed to retrieve MOT data",
      details: error.message,
      registration: registration
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  if (!DVSA_API_KEY) {
    console.warn('⚠️  WARNING: DVSA_API_KEY environment variable not set!');
  }
});
