const CLINIKO_BASE = 'https://api.au2.cliniko.com/v1';

async function clinikoFetch(path, method, body, apiKey) {
  const creds = btoa(`${apiKey}:`);
  const res = await fetch(`${CLINIKO_BASE}/${path}`, {
    method,
    headers: {
      'Authorization': `Basic ${creds}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'BEP-Kiosk/1.0 (beachsideep@example.com)',
    },
    body: method !== 'GET' ? body : undefined,
  });
  return res;
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 200, headers: corsHeaders });
    }

    const API_KEY = env.CLINIKO_API_KEY;
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500, headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';
    const body = request.method !== 'GET' ? await request.text() : undefined;

    let clinikoPath = '';

    if (action === 'search_patients') {
      const lastName = url.searchParams.get('last_name') || '';
      clinikoPath = `patients?q=${encodeURIComponent(lastName)}&per_page=50`;

    } else if (action === 'get_appointments') {
      // Regular (non-recurring) appointments for a patient today
      const patientId = url.searchParams.get('patient_id') || '';
      const today = url.searchParams.get('today') || new Date().toISOString().slice(0, 10);
      clinikoPath = `appointments?patient_id=${patientId}&starts_at[gte]=${today}T00:00:00Z&starts_at[lte]=${today}T23:59:59Z&per_page=50`;

    } else if (action === 'get_individual_appointments') {
      // Individual appointments (includes recurring) for a patient today
      const patientId = url.searchParams.get('patient_id') || '';
      const today = url.searchParams.get('today') || new Date().toISOString().slice(0, 10);
      clinikoPath = `individual_appointments?patient_id=${patientId}&starts_at[gte]=${today}T00:00:00Z&starts_at[lte]=${today}T23:59:59Z&per_page=50`;

    } else if (action === 'arrived') {
      const appointmentId = url.searchParams.get('appointment_id') || '';
      clinikoPath = `appointments/${appointmentId}/arrived`;

    } else {
      // Legacy pass-through (path param)
      const rawPath = url.searchParams.get('path') || '';
      clinikoPath = decodeURIComponent(rawPath);
    }

    try {
      const res = await clinikoFetch(clinikoPath, request.method, body, API_KEY);
      const data = await res.text();

      // Normalise response: both endpoints return different shapes.
      // individual_appointments returns { individual_appointments: [...] }
      // We re-map it to { appointments: [...] } so the kiosk code stays consistent.
      if (action === 'get_individual_appointments' && res.ok) {
        try {
          const parsed = JSON.parse(data);
          const items = parsed.individual_appointments || [];
          // Map individual_appointment fields to appointment fields the kiosk expects
          const mapped = items.map(ia => ({
            id: ia.id,
            starts_at: ia.starts_at,
            ends_at: ia.ends_at,
            practitioner_name: ia.practitioner
              ? `${ia.practitioner.first_name || ''} ${ia.practitioner.last_name || ''}`.trim()
              : (ia.practitioner_name || 'Practitioner'),
            appointment_type_name: ia.appointment_type
              ? (ia.appointment_type.name || 'Appointment')
              : (ia.appointment_type_name || 'Appointment'),
          }));
          return new Response(JSON.stringify({ appointments: mapped }), {
            status: 200, headers: corsHeaders,
          });
        } catch (_) {
          // Fall through to raw response
        }
      }

      return new Response(data, { status: res.status, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: corsHeaders,
      });
    }
  }
};
