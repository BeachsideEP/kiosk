const CLINIKO_BASE = 'https://api.au2.cliniko.com/v1';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response('', { headers: corsHeaders });
    }

    const API_KEY = env.CLINIKO_API_KEY;
    const creds = btoa(API_KEY + ':');
    const authHeaders = {
      'Authorization': 'Basic ' + creds,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'BEP-Kiosk/1.0 (admin@beachsideep.com.au)',
    };

    if (url.pathname === '/api/cliniko') {
      const action = url.searchParams.get('action') || '';
      let clinikoUrl = '';

      if (action === 'search_patients') {
        const lastName = url.searchParams.get('last_name') || '';
        // Build URL string directly without any encoding of ::
        clinikoUrl = CLINIKO_BASE + '/patients?q[]=last_name::' + lastName + '&per_page=50';
      } else if (action === 'get_appointments') {
        const patientId = url.searchParams.get('patient_id') || '';
        const today = url.searchParams.get('today') || '';
        clinikoUrl = CLINIKO_BASE + '/patients/' + patientId + '/appointments?q[]=starts_at>=' + today + 'T00:00:00Z&sort=starts_at&order=asc&per_page=5';
      } else if (action === 'arrived') {
        const apptId = url.searchParams.get('appointment_id') || '';
        clinikoUrl = CLINIKO_BASE + '/appointments/' + apptId + '/patient_arrived';
      } else if (action === 'create_patient') {
        clinikoUrl = CLINIKO_BASE + '/patients';
      } else {
        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
      }

      const body = request.method !== 'GET' ? await request.text() : undefined;

      // Use Request object to prevent fetch from re-encoding the URL
      const clinikoRequest = new Request(clinikoUrl, {
        method: request.method,
        headers: authHeaders,
        body,
      });

      const response = await fetch(clinikoRequest);
      const data = await response.text();
      return new Response(data, { status: response.status, headers: corsHeaders });
    }

    return new Response('Not found', { status: 404 });
  }
};
