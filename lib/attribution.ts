import { getSupabase } from './supabaseClient';

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

  if (ref) {
    localStorage.setItem(`bt_ref_${tenantId}`, ref.toUpperCase());
  }

  // Jika ada parameter pelacakan, tulis langsung ke Supabase tabel attributions
  if (ref || utm_source || fbclid || ttclid) {
    try {
      const supabase = getSupabase();
      if (!supabase) return sessionId;

      // Cari affiliate_id jika ada kode referral
      let affiliateId: string | null = null;
      if (ref) {
        const { data: aff } = await supabase
          .from('affiliates')
          .select('id')
          .ilike('referral_code', ref.trim())
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (aff) affiliateId = aff.id;
      }

      // Simpan catatan atribusi
      const { data, error } = await supabase
        .from('attributions')
        .insert({
          tenant_id: tenantId,
          session_id: sessionId,
          affiliate_id: affiliateId,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
          fbclid: fbclid || null,
          ttclid: ttclid || null,
          ip_hash: 'client_session',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'browser'
        })
        .select('id')
        .single();

      if (!error && data) {
        sessionStorage.setItem('bt_last_attribution_id', data.id);
      }
    } catch (e) {
      console.warn('Gagal sinkronisasi atribusi ke Supabase:', e);
    }
  }

  return sessionId;
}