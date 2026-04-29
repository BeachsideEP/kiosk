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

    async function clinikoGet(path) {
      const res = await fetch(`${CLINIKO_BASE}/${path}`, { headers: authHeaders });
      return res.json();
    }

    if (url.pathname === '/api/cliniko') {
      const action = url.searchParams.get('action') || '';

      if (action === 'search_patients') {
        const lastName = (url.searchParams.get('last_name') || '').toLowerCase();
        const dob = url.searchParams.get('dob') || '';

        let allPatients = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
          const data = await clinikoGet(`patients?per_page=100&page=${page}`);
          const patients = data.patients || [];
          allPatients = allPatients.concat(patients);
          hasMore = !!data.links?.next && patients.length === 100;
          page++;
        }

        const filtered = allPatients.filter(p => {
          const lastNameMatch = p.last_name && p.last_name.toLowerCase() === lastName;
          const dobMatch = !dob || p.date_of_birth === dob;
          return lastNameMatch && dobMatch;
        });

        return new Response(JSON.stringify({ patients: filtered }), { status: 200, headers: corsHeaders });

      } else if (action === 'get_appointments') {
        const patientId = url.searchParams.get('patient_id') || '';
        const today = url.searchParams.get('today') || '';

        const data = await clinikoGet(`patients/${patientId}/appointments?sort=starts_at&order=asc&per_page=20`);
        const appts = (data.appointments || []).filter(a => a.starts_at >= today);

        // Fetch practitioner and appointment type details for each appointment
        const enriched = await Promise.all(appts.map(async (a) => {
          let pracName = 'Practitioner';
          let typeName = 'Appointment';

          if (a.practitioner?.links?.self) {
            try {
              const pracId = a.practitioner.links.self.split('/').pop();
              const prac = await clinikoGet(`practitioners/${pracId}`);
              pracName = `${prac.first_name} ${prac.last_name}`;
            } catch(e) {}
          }

          if (a.appointment_type?.links?.self) {
            try {
              const typeId = a.appointment_type.links.self.split('/').pop();
              const type = await clinikoGet(`appointment_types/${typeId}`);
              typeName = type.name;
            } catch(e) {}
          }

          return { ...a, practitioner_name: pracName, appointment_type_name: typeName };
        }));

        return new Response(JSON.stringify({ appointments: enriched }), { status: 200, headers: corsHeaders });

      } else if (action === 'arrived') {
        const apptId = url.searchParams.get('appointment_id') || '';
        const res = await fetch(`${CLINIKO_BASE}/appointments/${apptId}/patient_arrived`, {
          method: 'POST',
          headers: authHeaders,
          body: '{}',
        });
        const text = await res.text();
        return new Response(text || '{}', { status: res.status, headers: corsHeaders });

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
