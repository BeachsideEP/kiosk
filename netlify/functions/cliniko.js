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

  const method = event.httpMethod;
  const body = event.body;
  const creds = Buffer.from(`${API_KEY}:`).toString('base64');

  // Get the action and params
  const action = event.queryStringParameters?.action || 'raw';
  
  let url;

  if (action === 'search_patients') {
    const lastName = event.queryStringParameters?.last_name || '';
    const dob = event.queryStringParameters?.dob || '';
    const params = new URLSearchParams();
    params.append('q[]', `last_name::${lastName}`);
    if (dob) params.append('q[]', `date_of_birth::${dob}`);
    params.append('per_page', '10');
    url = `${CLINIKO_BASE}/patients?${params.toString()}`;
  } else if (action === 'get_appointments') {
    const patientId = event.queryStringParameters?.patient_id || '';
    const today = event.queryStringParameters?.today || '';
    const params = new URLSearchParams();
    params.append('q[]', `starts_at>=${today}T00:00:00Z`);
    params.append('sort', 'starts_at');
    params.append('order', 'asc');
    params.append('per_page', '5');
    url = `${CLINIKO_BASE}/patients/${patientId}/appointments?${params.toString()}`;
  } else if (action === 'arrived') {
    const apptId = event.queryStringParameters?.appointment_id || '';
    url = `${CLINIKO_BASE}/appointments/${apptId}/patient_arrived`;
  } else if (action === 'create_patient') {
    url = `${CLINIKO_BASE}/patients`;
  } else {
    const path = decodeURIComponent(event.queryStringParameters?.path || '');
    url = `${CLINIKO_BASE}/${path}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Basic ${creds}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'BEP-Kiosk/1.0 (admin@beachsideep.com.au)',
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
