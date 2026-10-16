import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PartnerItem, isValidSlugFormat } from '@/lib/partner-service';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendNewAffiliateRegistrationNotification } from '@/lib/affiliate-notification-service';
import { verifyManagerRole } from '@/lib/auth/rbac-guard';

export async function GET(req: NextRequest) {
  // 1. RBAC Guard: Hanya izinkan SUPERADMIN atau AFFILIATE_MANAGER
  const auth = await verifyManagerRole(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, message: auth.errorMessage || 'Unauthorized' },
      { status: auth.errorStatus || 401 }
    );
  }

  // 2. Panggilan getSupabaseAdmin() HANYA dieksekusi setelah lolos pemeriksaan RBAC
  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data, error } = await supabase
        .from('affiliates')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: PartnerItem[] = data.map((a: any) => ({
          id: a.id,
          name: a.name || 'Mitra Partner',
          phone: a.phone_number || a.phone || '-',
          email: a.email,
          role: (a.role as 'AM' | 'AFFILIATE') || 'AFFILIATE',
          referral_code: a.referral_code || 'PARTNER',
          is_ref_customized: Boolean(a.is_ref_customized || a.metadata?.is_ref_customized),
          status: (a.status as 'ACTIVE' | 'SUSPENDED') || 'ACTIVE',
          am_pembina: a.metadata?.am_pembina || (a.role === 'AM' ? undefined : undefined),
          commission_rate: a.commission_rate || 15,
          bank_name: a.metadata?.bank_name || a.bank_name,
          bank_account_number: a.metadata?.bank_account_number || a.bank_account_number,
          bank_account_holder: a.metadata?.bank_account_holder || a.bank_account_holder,
          balance: a.balance || 0,
          total_withdrawn: a.total_withdrawn || 0,
          created_at: a.created_at || new Date().toISOString(),
        }));
        return NextResponse.json({ success: true, partners: mapped });
      }
    }
  } catch (err) {
    console.warn('Supabase fetch partners note:', err);
  }

  // Tidak ada data fallback lokal — kembalikan empty array jika Supabase tidak menghasilkan data
  return NextResponse.json({ success: true, partners: [] });
}

export async function POST(req: NextRequest) {
  // 1. RBAC Guard: Hanya izinkan SUPERADMIN atau AFFILIATE_MANAGER
  const auth = await verifyManagerRole(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, message: auth.errorMessage || 'Unauthorized' },
      { status: auth.errorStatus || 401 }
    );
  }

  try {
    const body = await req.json();
    const { name, phone, email, role, ref_code, am_pembina } = body;

    if (!name || !phone) {
      return NextResponse.json(
        { success: false, message: 'Nama dan Nomor WhatsApp wajib diisi.' },
        { status: 400 }
      );
    }

    const cleanCode = (ref_code || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)).trim().toUpperCase();
    const validation = isValidSlugFormat(cleanCode);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, message: `Kode referral tidak valid: ${validation.reason}` },
        { status: 400 }
      );
    }

    const targetSlug = (body.slug || body.store_slug || cleanCode).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const storeName = (body.store_name || body.business_name || name).trim();
    const defaultPassword = body.password || body.pin || 'BoonTrack123!';
    const trialDays = 7;
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();

    const newPartner: PartnerItem = {
      id: `partner-${Date.now()}`,
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || undefined,
      role: role === 'AM' ? 'AM' : 'AFFILIATE',
      referral_code: cleanCode,
      is_ref_customized: Boolean(ref_code),
      status: 'ACTIVE',
      am_pembina: role === 'AM' ? undefined : (am_pembina || undefined),
      commission_rate: role === 'AM' ? 20 : 15,
      balance: 0,
      total_withdrawn: 0,
      created_at: new Date().toISOString(),
    };

    let supabaseAdmin;
    try {
      supabaseAdmin = getSupabaseAdmin();
    } catch (adminClientErr) {
      console.error('[Affiliate Registration Failed] Supabase Admin client init failed:', adminClientErr);
      return NextResponse.json(
        { success: false, message: 'Layanan database admin tidak dapat diinisialisasi.' },
        { status: 500 }
      );
    }

    // 1. Simpan ke tabel affiliates dengan getSupabaseAdmin (Bypass RLS secara sah)
    const { data, error } = await supabaseAdmin.from('affiliates').insert({
      id: newPartner.id,
      tenant_id: targetSlug,
      name: newPartner.name,
      phone_number: newPartner.phone,
      phone: newPartner.phone,
      email: newPartner.email,
      role: newPartner.role,
      referral_code: newPartner.referral_code,
      status: newPartner.status,
      commission_rate: newPartner.commission_rate,
      metadata: {
        am_pembina: newPartner.am_pembina,
        is_ref_customized: newPartner.is_ref_customized,
        slug: targetSlug,
        store_name: storeName,
      },
      created_at: newPartner.created_at,
    });

    if (error) {
      console.error('[Affiliate Registration Failed]', error);
      return NextResponse.json(
        { success: false, message: 'Gagal mencatat data ke database: ' + error.message },
        { status: 500 }
      );
    }

    // 2. Hubungkan Jembatan Auto-Provisioning ke Tabel tenants
    // Buat/pastikan row di tabel tenants dengan status ACTIVE dan tier TRIAL_7D / PRO_SCALE
    const { error: tenantError } = await supabaseAdmin
      .from('tenants')
      .upsert(
        {
          slug: targetSlug,
          name: storeName,
          category: body.category || 'COMMERCE',
          business_type: body.business_type || 'COMMERCE',
          tier: 'PRO_SCALE', // Canonical enum tier (PRO_SCALE / TRIAL_7D)
          status: 'ACTIVE',
          subscription_status: 'trial',
          subscription_tier: 'PRO_SCALE',
          is_active: true,
          trial_ends_at: trialEndsAt,
          subscription_ends_at: trialEndsAt,
          access_username: targetSlug,
          access_password: defaultPassword,
          metadata: {
            store_name: storeName,
            shop_name: storeName,
            name: storeName,
            email: email?.trim() || null,
            phone: phone.trim(),
            wa_number: phone.trim(),
            whatsapp_number: phone.trim(),
            access_pin: defaultPassword,
            pin: defaultPassword,
            pin_hash: defaultPassword,
            password_raw: defaultPassword,
            tier: 'PRO_SCALE',
            plan_tier: 'TRIAL_7D',
            selected_plan: 'Trial 7 Hari',
            subscription_status: 'trial',
            is_trial: true,
            trial_days: trialDays,
            trial_ends_at: trialEndsAt,
            is_active: true,
            status: 'ACTIVE',
            referral_code: cleanCode,
            am_pembina: am_pembina || null,
            auto_provisioned: true,
            created_via: 'partner_auto_provision',
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' }
      );

    if (tenantError) {
      console.error('[Tenant Auto-Provisioning Warning]', tenantError);
    }

    // Aturan Kritis: Pengiriman email notifikasi (sendNewAffiliateRegistrationNotification)
    // hanya boleh dieksekusi SETELAH database berhasil mengonfirmasi row baru tersimpan tanpa error.
    if (newPartner.role === 'AFFILIATE' && newPartner.am_pembina) {
      try {
        await sendNewAffiliateRegistrationNotification({
          affiliateName: newPartner.name,
          affiliateEmail: newPartner.email || '',
          affiliatePhone: newPartner.phone,
          affiliateCode: newPartner.referral_code,
          amCodeOrId: newPartner.am_pembina,
        });
      } catch (notifErr) {
        console.warn('[ManagerPartners] Non-fatal new affiliate alert note:', notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Mitra ${newPartner.name} (${newPartner.referral_code}) berhasil didaftarkan ke Whitelist dan toko (${targetSlug}) siap digunakan!`,
      partner: newPartner,
      tenant_slug: targetSlug,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creating partner';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

