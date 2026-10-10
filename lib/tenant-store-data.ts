import { cache } from 'react';
import { normalizeTenantSlug, getTenantConfig } from '@/lib/tenant-config';

// ── Cache fetch per request agar generateMetadata & TenantStoreLayout tidak melakukan duplikasi query ──
// Menggunakan native fetch + next:{revalidate:60} agar Vercel Edge Cache aktif.
// Supabase JS SDK tidak mendukung Next.js fetch cache — gunakan REST API langsung.
export const getTenantStoreData = cache(async (rawTenant: string) => {
  const RESERVED_SLUGS = ['login', 'register', 'admin', 'auth', 'checkout'];
  const cleanTenant = normalizeTenantSlug((rawTenant || '').toLowerCase().trim());
  if (!cleanTenant || RESERVED_SLUGS.includes(cleanTenant)) {
    return { store: null, settings: null };
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
  const currentKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const supabaseKey =
    (currentKey && !currentKey.startsWith('sb_secret_'))
      ? currentKey
      : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_OXETaOPFYI_AKCrKpLEr0Q__RUHScg7');

  const headers: HeadersInit = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const [tenantRes, settingsRes] = await Promise.all([
      // next:{revalidate:60} → Vercel Data Cache caches this for 60s at the Edge
      fetch(
        `${supabaseUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(cleanTenant)}&select=id,name,slug,category,tier,status,business_type,template_code,metadata&limit=1`,
        { headers, next: { revalidate: 60, tags: [`tenant-${cleanTenant}`] } }
      ),
      fetch(
        `${supabaseUrl}/rest/v1/tenant_settings?tenant_slug=eq.${encodeURIComponent(cleanTenant)}&select=ads_tracking_config&limit=1`,
        { headers, next: { revalidate: 60 } }
      ),
    ]);

    const tenantRows = tenantRes.ok ? await tenantRes.json().catch(() => []) : [];
    const settingsRows = settingsRes.ok ? await settingsRes.json().catch(() => []) : [];

    let store = Array.isArray(tenantRows) && tenantRows.length > 0 ? tenantRows[0] : null;
    const settings = Array.isArray(settingsRows) && settingsRows.length > 0 ? settingsRows[0] : null;

    if (!store) {
      const localConfig = getTenantConfig(cleanTenant);
      if (localConfig && (localConfig.category === 'public_service' || localConfig.business_type === 'B2G')) {
        store = {
          name: localConfig.name,
          metadata: {
            title: localConfig.title,
            subtitle: localConfig.subtitle,
            lurah: localConfig.lurah,
            address: localConfig.address,
            business_type: localConfig.business_type,
            category: localConfig.category,
            description: localConfig.persona?.system_prompt,
            products: localConfig.pricing?.custom_packages,
          },
        };
      }
    }

    return {
      store,
      settings,
    };
  } catch (err) {
    console.warn('[TenantStoreLayout] Cached fetch error:', err);
    const localConfig = getTenantConfig(cleanTenant);
    if (localConfig && (localConfig.category === 'public_service' || localConfig.business_type === 'B2G')) {
      return {
        store: {
          name: localConfig.name,
          metadata: {
            title: localConfig.title,
            subtitle: localConfig.subtitle,
            lurah: localConfig.lurah,
            address: localConfig.address,
            business_type: localConfig.business_type,
            category: localConfig.category,
            description: localConfig.persona?.system_prompt,
            products: localConfig.pricing?.custom_packages,
          },
        },
        settings: null,
      };
    }
    return { store: null, settings: null };
  }
});
