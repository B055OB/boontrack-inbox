import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, detail: 'Database Supabase tidak terhubung.' }, { status: 500 });
    }

    // 1. Fetch all Affiliate Managers (role == 'am')
    const { data: amList, error: amError } = await supabase
      .from('affiliates')
      .select('*')
      .eq('role', 'am')
      .order('created_at', { ascending: false });

    if (amError) {
      return NextResponse.json({ success: false, detail: amError.message }, { status: 500 });
    }

    // 2. Fetch all sub-affiliates to compute network size
    const { data: allAffiliates } = await supabase
      .from('affiliates')
      .select('id, name, referral_code, parent_am_id, status, commission_rate, region');

    // 3. Fetch tenants to compute pipeline
    const { data: allTenants } = await supabase
      .from('tenants')
      .select('id, name, slug, tier, status, monthly_fee, metadata');

    const result = (amList || []).map((am: any) => {
      const subs = (allAffiliates || []).filter((sub: any) => sub.parent_am_id === am.id);
      const networkIds = new Set([am.id, ...subs.map((s: any) => s.id)]);
      const networkCodes = new Set([
        (am.referral_code || '').toLowerCase().trim(),
        ...subs.map((s: any) => (s.referral_code || '').toLowerCase().trim()).filter(Boolean)
      ]);

      const networkTenants = (allTenants || []).filter((t: any) => {
        const m = t.metadata || {};
        const ref = (m.referral_code || m.ref || m.affiliate_code || '').toString().trim().toLowerCase();
        const metaAffId = (m.affiliate_id || m.referrer_id || '').toString().trim();
        return (ref && networkCodes.has(ref)) || (metaAffId && networkIds.has(metaAffId));
      });

      const totalPipeline = networkTenants.reduce((sum: number, t: any) => {
        const fee = Number(t.monthly_fee) || 199000;
        return sum + fee;
      }, 0);

      return {
        id: am.id,
        name: am.name,
        email: am.email,
        phone: am.phone || am.phone_number || '-',
        referral_code: am.referral_code,
        region: am.region || 'ID-NATIONAL',
        role: am.role || 'am',
        status: am.status || 'ACTIVE',
        commission_rate: am.commission_rate || 30,
        sub_affiliates_count: subs.length,
        sub_affiliates: subs.map((s: any) => ({
          id: s.id,
          name: s.name,
          referral_code: s.referral_code,
          region: s.region,
          status: s.status,
        })),
        total_tenants_brought: networkTenants.length,
        total_pipeline_omzet: totalPipeline,
        created_at: am.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat mengambil data AM.';
    return NextResponse.json({ success: false, detail: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, referral_code, region } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, detail: 'Nama Affiliate Manager wajib diisi.' }, { status: 400 });
    }

    if (!email || !email.trim()) {
      return NextResponse.json({ success: false, detail: 'Email Affiliate Manager wajib diisi.' }, { status: 400 });
    }

    if (!phone || !phone.trim()) {
      return NextResponse.json({ success: false, detail: 'Nomor WhatsApp wajib diisi.' }, { status: 400 });
    }

    if (!referral_code || !referral_code.trim()) {
      return NextResponse.json({ success: false, detail: 'Kode Referral AM wajib diisi.' }, { status: 400 });
    }

    const cleanRef = referral_code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const cleanPhone = phone.trim().replace(/\D/g, '');
    const cleanEmail = email.trim().toLowerCase();
    const cleanRegion = (region && region.trim()) ? region.trim().toUpperCase() : 'ID-NATIONAL';

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, detail: 'Database Supabase tidak terhubung.' }, { status: 500 });
    }

    // Check duplicate referral code
    const { data: existingRef } = await supabase
      .from('affiliates')
      .select('id')
      .eq('referral_code', cleanRef)
      .maybeSingle();

    if (existingRef) {
      return NextResponse.json({
        success: false,
        detail: `Kode referral '${cleanRef}' sudah digunakan oleh mitra lain. Silakan pilih kode lain.`
      }, { status: 400 });
    }

    // Insert new AM
    const newAmPayload = {
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      phone_number: cleanPhone,
      referral_code: cleanRef,
      role: 'am',
      parent_am_id: null,
      region: cleanRegion,
      commission_rate: 30,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    const { data: createdAm, error: insertError } = await supabase
      .from('affiliates')
      .insert(newAmPayload)
      .select('*')
      .single();

    if (insertError) {
      return NextResponse.json({ success: false, detail: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Affiliate Manager baru '${createdAm.name}' (${createdAm.referral_code}) berhasil didaftarkan!`,
      data: createdAm,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal membuat Affiliate Manager baru.';
    return NextResponse.json({ success: false, detail: msg }, { status: 500 });
  }
}
