const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// --- DVSA API Credentials from Environment Variables ---
const { CLIENT_ID, CLIENT_SECRET, TENANT_ID, DVSA_API_KEY } = process.env;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const API_BASE_URL = 'https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests';
const SCOPE = 'https://tapi.dvsa.gov.uk/.default';

// --- In-memory cache for the OAuth token ---
let tokenCache = {
    accessToken: null,
    expiresAt: null,
};

// --- Function to get a valid OAuth token ---
async function getDVSAToken() {
    // If we have a valid, non-expired token, return it
    if (tokenCache.accessToken && tokenCache.expiresAt > Date.now()) {
        console.log('Using cached token.');
        return tokenCache.accessToken;
    }

    console.log('Fetching new DVSA token...');
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('scope', SCOPE);

        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Token request failed with status ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        
        // Cache the new token and set its expiry time (e.g., 55 minutes)
        tokenCache.accessToken = data.access_token;
        tokenCache.expiresAt = Date.now() + (data.expires_in - 300) * 1000; // expires_in is in seconds, subtract 5 mins for buffer

        console.log('Successfully fetched new token.');
        return tokenCache.accessToken;
    } catch (error) {
        console.error('Error fetching DVSA token:', error);
        tokenCache.accessToken = null; // Clear invalid token
        throw error;
    }
}

// --- API Endpoint for the Frontend to Call ---
app.get('/api/mot-check/:registration', async (req, res) => {
    const { registration } = req.params;
    if (!registration) {
        return res.status(400).json({ error: 'Registration number is required' });
    }

    try {
        const accessToken = await getDVSAToken();
        const apiUrl = `${API_BASE_URL}?registration=${registration}`;

        const apiResponse = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/json+v6',
                'x-api-key': DVSA_API_KEY,
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!apiResponse.ok) {
             if (apiResponse.status === 404) {
                return res.status(404).json({ error: 'Vehicle not found.' });
            }
            const errorBody = await apiResponse.text();
            throw new Error(`DVSA API request failed with status ${apiResponse.status}: ${errorBody}`);
        }

        const dvsaData = await apiResponse.json();
        // The API returns an array, we take the first element
        const vehicleInfo = dvsaData[0];

        // --- Transform DVSA data into the structure the frontend expects ---
        const transformedData = {
            vehicle: {
                registration: vehicleInfo.registration,
                make: vehicleInfo.make,
                model: vehicleInfo.model,
                year: parseInt(vehicleInfo.firstUsedDate.substring(0, 4)),
                colour: vehicleInfo.primaryColour,
                fuel_type: vehicleInfo.fuelType,
                engine_size: vehicleInfo.engineCapacity,
                // Find the latest MOT test with an expiry date
                mot_expiry: vehicleInfo.motTests?.find(t => t.expiryDate)?.expiryDate || null,
                tax_expiry: null, // DVSA Trade API does not provide tax data
                mot_status: vehicleInfo.motTests?.[0]?.testResult === 'PASSED' ? 'valid' : 'expired',
            },
            motTests: (vehicleInfo.motTests || []).map(test => ({
                test_date: test.completedDate,
                test_result: test.testResult,
                mileage: parseInt(test.odometerValue),
                expiry_date: test.expiryDate,
                test_station: test.motTestNumber, // No station name in this API version
                defects: (test.rfrAndComments || []).map(defect => ({
                    type: defect.type, // e.g., 'ADVISORY', 'FAIL'
                    description: defect.text,
                    location: null, // No location data in this API version
                })),
            })),
        };

        res.json(transformedData);

    } catch (error) {
        console.error(`Error processing registration ${registration}:`, error.message);
        res.status(500).json({ error: 'Failed to retrieve vehicle data from DVSA.' });
    }
});

// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
