const CLINIKO_BASE = 'https://api.au2.cliniko.com/v1';
const API_KEY = process.env.CLINIKO_API_KEY;

exports.handler = async function(event) {
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

  const creds = Buffer.from(API_KEY + ':').toString('base64');
  const authHeaders = {
    'Authorization': 'Basic ' + creds,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'BEP-Kiosk/1.0 (admin@beachsideep.com.au)',
  };

  const q = event.queryStringParameters || {};
  const action = q.action || '';
  const method = event.httpMethod;
  let url = '';

  if (action === 'search_patients') {
    const lastName = q.last_name || '';
    const dob = q.dob || '';
    // Build URL object so Node handles encoding correctly
    const base = new URL(CLINIKO_BASE + '/patients');
    base.searchParams.append('q[]', 'last_name::' + lastName);
    if (dob) base.searchParams.append('q[]', 'date_of_birth::' + dob);
    base.searchParams.append('per_page', '10');
    url = base.toString();
  } else if (action === 'get_appointments') {
    const patientId = q.patient_id || '';
    const today = q.today || '';
    const base = new URL(CLINIKO_BASE + '/patients/' + patientId + '/appointments');
    base.searchParams.append('q[]', 'starts_at>=' + today + 'T00:00:00Z');
    base.searchParams.append('sort', 'starts_at');
    base.searchParams.append('order', 'asc');
    base.searchParams.append('per_page', '5');
    url = base.toString();
  } else if (action === 'arrived') {
    const apptId = q.appointment_id || '';
    url = CLINIKO_BASE + '/appointments/' + apptId + '/patient_arrived';
  } else if (action === 'create_patient') {
    url = CLINIKO_BASE + '/patients';
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
  }

  try {
    const fetchOpts = { method: method, headers: authHeaders };
    if (method !== 'GET' && event.body) {
      fetchOpts.body = event.body;
    }
    const response = await fetch(url, fetchOpts);
    const data = await response.text();
    return { statusCode: response.status, headers, body: data };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
