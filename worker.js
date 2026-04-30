/**
 * Cloudflare Worker — BEP Kiosk → Cliniko API proxy
 * Handles action-based routing from the kiosk frontend.
 *
 * Actions:
 *   search_patients              GET  /patients?q[last_name]=...
 *   get_appointments             GET  /individual_appointments?patient_id=...  (covers recurring too)
 *   get_individual_appointments  (alias, for compatibility)
 *   arrived                      POST /individual_appointments/:id/arrived
 */

const CLINIKO_BASE = 'https://api.au2.cliniko.com/v1';

// Brisbane is UTC+10 year-round (no DST). Convert a local YYYY-MM-DD string
// to a UTC window covering that full day.
function todayWindow(localDateStr) {
  const startUTC = new Date(`${localDateStr}T00:00:00+10:00`).toISOString();
  const endUTC   = new Date(`${localDateStr}T23:59:59+10:00`).toISOString();
  return { startUTC, endUTC };
}

async function clinikoFetch(path, method, bodyText, apiKey) {
  const creds = btoa(`${apiKey}:`);
  const res = await fetch(`${CLINIKO_BASE}/${path}`, {
    method,
    headers: {
      'Authorization': `Basic ${creds}`,
      'Accept':        'application/json',
      'Content-Type':  'application/json',
      'User-Agent':    'BEP-Kiosk/1.0 (beachsideep@example.com)',
    },
    body: method !== 'GET' ? bodyText : undefined,
  });
  return res;
}

function normaliseAppt(ia) {
  let pracName = 'Practitioner';
  if (ia.practitioner) {
    pracName = [ia.practitioner.first_name, ia.practitioner.last_name]
      .filter(Boolean).join(' ') || 'Practitioner';
  } else if (ia.practitioner_name) {
    pracName = ia.practitioner_name;
  }
  let typeName = 'Appointment';
  if (ia.appointment_type) {
    typeName = ia.appointment_type.name || 'Appointment';
  } else if (ia.appointment_type_name) {
    typeName = ia.appointment_type_name;
  }
  return {
    id:                    ia.id,
    starts_at:             ia.starts_at,
    ends_at:               ia.ends_at,
    practitioner_name:     pracName,
    appointment_type_name: typeName,
  };
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type':                 'application/json',
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

    const url      = new URL(request.url);
    const action   = url.searchParams.get('action') || '';
    const bodyText = request.method !== 'GET' ? await request.text() : undefined;

    let clinikoPath = '';
    let postProcess = null;

    if (action === 'search_patients') {
      const lastName = url.searchParams.get('last_name') || '';
      clinikoPath = `patients?q[last_name]=${encodeURIComponent(lastName)}&per_page=50&sort=last_name`;

    } else if (action === 'get_appointments' || action === 'get_individual_appointments') {
      const patientId = url.searchParams.get('patient_id') || '';
      const localDate = url.searchParams.get('today') || new Date().toISOString().slice(0, 10);
      const { startUTC, endUTC } = todayWindow(localDate);
      clinikoPath = `individual_appointments?patient_id=${patientId}`
        + `&starts_at[gte]=${encodeURIComponent(startUTC)}`
        + `&starts_at[lte]=${encodeURIComponent(endUTC)}`
        + `&per_page=50&sort=starts_at`;
      postProcess = (raw) => {
        const parsed = JSON.parse(raw);
        const items  = parsed.individual_appointments || [];
        return JSON.stringify({ appointments: items.map(normaliseAppt) });
      };

    } else if (action === 'arrived') {
      const appointmentId = url.searchParams.get('appointment_id') || '';
      clinikoPath = `individual_appointments/${appointmentId}/arrived`;

    } else {
      // Legacy pass-through
      const rawPath = url.searchParams.get('path') || '';
      clinikoPath = decodeURIComponent(rawPath);
    }

    try {
      const res = await clinikoFetch(clinikoPath, request.method, bodyText, API_KEY);
      const raw = await res.text();

      if (!res.ok) {
        return new Response(raw || JSON.stringify({ error: `Cliniko ${res.status}` }), {
          status: res.status, headers: corsHeaders,
        });
      }

      let body = raw;
      if (postProcess && raw) {
        try { body = postProcess(raw); } catch (_) {}
      }

      return new Response(body, { status: res.status, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: corsHeaders,
      });
    }
  },
};
