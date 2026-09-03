export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = localStorage.getItem('bt_session_id');
  if (!sid) {
    sid = 'bt_sid_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('bt_session_id', sid);
  }
  return sid;
}

export async function syncAttributionSession(tenantId: string, searchParams: URLSearchParams) {
  const sessionId = getOrCreateSessionId();
  const ref = searchParams.get('ref') || searchParams.get('aff');
  const utm_source = searchParams.get('utm_source');
  const utm_medium = searchParams.get('utm_medium');
  const utm_campaign = searchParams.get('utm_campaign');
  const utm_content = searchParams.get('utm_content');
  const utm_term = searchParams.get('utm_term');
  const fbclid = searchParams.get('fbclid');
  const ttclid = searchParams.get('ttclid');

  // Simpan ref ke localStorage/cookie sebagai backup fallback
  if (ref) {
    localStorage.setItem(`bt_ref_${tenantId}`, ref.toUpperCase());
  }

  // Jika ada parameter tracking, tembakkan ke backend ingestion
  if (ref || utm_source || fbclid || ttclid) {
    try {
      const res = await fetch('https://api.boontrack.com/api/v1/attribution/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          session_id: sessionId,
          ref_code: ref,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          utm_term,
          fbclid,
          ttclid
        })
      });
      const data = await res.json();
      if (data.attribution_id) {
        sessionStorage.setItem('bt_last_attribution_id', data.attribution_id);
      }
    } catch (e) {
      console.warn('Gagal sinkronisasi atribusi:', e);
    }
  }

  return sessionId;
}