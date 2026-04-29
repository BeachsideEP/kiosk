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
    // Use %3A%3A which Node's fetch will NOT decode - it stays encoded
    url = CLINIKO_BASE + '/patients?q%5B%5D=last_name%3A%3A' + encodeURIComponent(lastName) + '&q%5B%5D=date_of_birth%3A%3A' + encodeURIComponent(dob) + '&per_page=10';
  } else if (action === 'get_appointments') {
    const patientId = q.patient_id || '';
    const today = q.today || '';
    url = CLINIKO_BASE + '/patients/' + patientId + '/appointments?q%5B%5D=starts_at>%3D' + today + 'T00%3A00%3A00Z&sort=starts_at&order=asc&per_page=5';
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
