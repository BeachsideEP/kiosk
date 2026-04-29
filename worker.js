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

      if (action === 'search_patients') {
        const lastName = (url.searchParams.get('last_name') || '').toLowerCase();
        const dob = url.searchParams.get('dob') || '';

        // Fetch all patients and filter in the worker
        let allPatients = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
          const res = await fetch(`${CLINIKO_BASE}/patients?per_page=100&page=${page}`, {
            headers: authHeaders,
          });
          const data = await res.json();
          const patients = data.patients || [];
          allPatients = allPatients.concat(patients);
          hasMore = !!data.links?.next && patients.length === 100;
          page++;
        }

        // Filter by last name and DOB
        const filtered = allPatients.filter(p => {
          const lastNameMatch = p.last_name && p.last_name.toLowerCase() === lastName;
          const dobMatch = !dob || p.date_of_birth === dob;
          return lastNameMatch && dobMatch;
        });

        return new Response(JSON.stringify({ patients: filtered }), {
          status: 200,
          headers: corsHeaders,
        });

      } else if (action === 'get_appointments') {
        const patientId = url.searchParams.get('patient_id') || '';
        const today = url.searchParams.get('today') || '';
        const res = await fetch(`${CLINIKO_BASE}/patients/${patientId}/appointments?sort=starts_at&order=asc&per_page=20`, {
          headers: authHeaders,
        });
        const data = await res.json();
        // Filter to today and future only
        const appts = (data.appointments || []).filter(a => a.starts_at >= today);
        return new Response(JSON.stringify({ appointments: appts }), {
          status: 200,
          headers: corsHeaders,
        });

      } else if (action === 'arrived') {
        const apptId = url.searchParams.get('appointment_id') || '';
        const res = await fetch(`${CLINIKO_BASE}/appointments/${apptId}/patient_arrived`, {
          method: 'POST',
          headers: authHeaders,
        });
        const text = await res.text();
        return new Response(text, { status: res.status, headers: corsHeaders });

      } else if (action === 'create_patient') {
        const body = await request.text();
        const res = await fetch(`${CLINIKO_BASE}/patients`, {
          method: 'POST',
          headers: authHeaders,
          body,
        });
        const text = await res.text();
        return new Response(text, { status: res.status, headers: corsHeaders });

      } else {
        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};
