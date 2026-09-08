import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  try {
    const { tenantSlug, customDomain } = await req.json();

    if (!tenantSlug || !customDomain) {
      return NextResponse.json({ message: 'Domain wajib diisi' }, { status: 400 });
    }

    const cleanDomain = customDomain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const supabase = getSupabase();

    // Pastikan tenant terdaftar di paket Team Scale
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, settings')
      .eq('slug', tenantSlug)
      .maybeSingle();

    const planTier = tenant?.settings?.plan_tier || tenant?.settings?.tier || '';
    const isTeamScale = planTier.includes('team_scale') || planTier.includes('pro_scale');

    if (!isTeamScale) {
      return NextResponse.json({ 
        message: 'Fitur Custom Domain hanya tersedia untuk paket Team Scale.' 
      }, { status: 403 });
    }

    // Daftarkan ke Edge Router Vercel jika env token tersedia
    if (process.env.VERCEL_PROJECT_ID && process.env.VERCEL_AUTH_TOKEN) {
      await fetch(`https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: cleanDomain }),
      });
    }

    // Simpan domain di setting tenant
    const currentSettings = tenant?.settings || {};
    await supabase
      .from('tenants')
      .update({
        custom_domain: cleanDomain,
        settings: {
          ...currentSettings,
          custom_domain: cleanDomain,
          domain_status: 'PENDING_DNS',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('slug', tenantSlug);

    return NextResponse.json({
      success: true,
      domain: cleanDomain,
      cname_target: 'cname.boontrack.com',
      status: 'PENDING_DNS',
    });
  } catch (err: any) {
    return NextResponse.json({ message: 'Gagal mengatur custom domain' }, { status: 500 });
  }
}