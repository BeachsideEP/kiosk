/**
 * Cloudflare Worker — BEP Kiosk proxy for Cliniko API
 */

const CLINIKO_BASE = 'https://api.au2.cliniko.com/v1';

function todayWindow(localDateStr) {
  // Brisbane is UTC+10, no DST
  const start = new Date(localDateStr + 'T00:00:00+10:00').toISOString();
  const end   = new Date(localDateStr + 'T23:59:59+10:00').toISOString();
  return { start, end };
}

function normaliseAppt(a) {
  let prac = 'Practitioner';
  if (a.practitioner) {
    prac = ((a.practitioner.first_name || '') + ' ' + (a.practitioner.last_name || '')).trim() || prac;
  } else if (a.practitioner_name) {
    prac = a.practitioner_name;
  }
  let type = 'Appointment';
  if (a.appointment_type) {
    type = a.appointment_type.name || type;
  } else if (a.appointment_type_name) {
    type = a.appointment_type_name;
  }
  return { id: a.id, starts_at: a.starts_at, ends_at: a.ends_at, practitioner_name: prac, appointment_type_name: type };
}

async function cliniko(path, method, body, apiKey) {
  const creds = btoa(apiKey + ':');
  return fetch(CLINIKO_BASE + '/' + path, {
    method,
    headers: {
      'Authorization': 'Basic ' + creds,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'BEP-Kiosk/1.0 (beachsideep@example.com)',
    },
    body: method !== 'GET' ? body : undefined,
  });
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: cors });

    const key = env.CLINIKO_API_KEY;
    if (!key) return new Response(JSON.stringify({ error: 'No API key' }), { status: 500, headers: cors });

    const u       = new URL(request.url);
    const action  = u.searchParams.get('action') || '';
    const reqBody = request.method !== 'GET' ? await request.text() : undefined;

    let path = '';
    let transform = null;

    if (action === 'search_patients') {
      const ln = u.searchParams.get('last_name') || '';
      // Correct Cliniko filter syntax: q[]=last_name:~Smith (contains operator)
      path = 'patients?q[]=' + encodeURIComponent('last_name:~' + ln) + '&per_page=50&sort=last_name';

    } else if (action === 'get_appointments') {
      const pid  = u.searchParams.get('patient_id') || '';
      const date = u.searchParams.get('today') || new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });
      const { start, end } = todayWindow(date);
      // q[]=starts_at:>X&q[]=starts_at:<Y is the correct Cliniko datetime filter syntax
      path = 'individual_appointments'
           + '?q[]=' + encodeURIComponent('patient_id:=' + pid)
           + '&q[]=' + encodeURIComponent('starts_at:>' + start)
           + '&q[]=' + encodeURIComponent('starts_at:<' + end)
           + '&per_page=50&sort=starts_at';
      transform = raw => {
        const d = JSON.parse(raw);
        return JSON.stringify({ appointments: (d.individual_appointments || []).map(normaliseAppt) });
      };

    } else if (action === 'arrived') {
      // arrived is a two-step process:
      // 1. GET the attendee id from the appointment
      // 2. PATCH the attendee with arrived timestamp
      const aid = u.searchParams.get('appointment_id') || '';
      const attendeesRes = await cliniko('individual_appointments/' + aid + '/attendees', 'GET', undefined, key);
      const attendeesData = await attendeesRes.json();
      const attendee = (attendeesData.attendees || [])[0];
      if (!attendee) {
        return new Response(JSON.stringify({ error: 'No attendee found' }), { status: 404, headers: cors });
      }
      path = 'attendees/' + attendee.id;

    } else {
      // legacy pass-through
      path = decodeURIComponent(u.searchParams.get('path') || '');
    }

    try {
      // arrived action needs PATCH + body regardless of what kiosk sends
      const effectiveMethod = (action === 'arrived') ? 'PATCH' : request.method;
      const effectiveBody   = (action === 'arrived') ? JSON.stringify({ arrived: new Date().toISOString() }) : reqBody;
      const res  = await cliniko(path, effectiveMethod, effectiveBody, key);
      const text = await res.text();
      if (!res.ok) return new Response(text, { status: res.status, headers: cors });
      const out = (transform && text) ? (() => { try { return transform(text); } catch { return text; } })() : text;
      return new Response(out, { status: res.status, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }
};
