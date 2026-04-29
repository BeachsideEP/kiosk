const CLINIKO_BASE = 'https://api.au2.cliniko.com/v1';
const API_KEY = process.env.CLINIKO_API_KEY;
 
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
 
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
 
  if (!API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }
 
  const path = event.queryStringParameters?.path || '';
  const method = event.httpMethod;
  const body = event.body;
 
  // Decode the path so query params are not double-encoded
  const decodedPath = decodeURIComponent(path);
  const url = `${CLINIKO_BASE}/${decodedPath}`;
  const creds = Buffer.from(`${API_KEY}:`).toString('base64');
 
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Basic ${creds}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'BEP-Kiosk/1.0 (beachsideep@example.com)',
      },
      body: method !== 'GET' ? body : undefined,
    });
 
    const data = await response.text();
    return {
      statusCode: response.status,
      headers,
      body: data,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
