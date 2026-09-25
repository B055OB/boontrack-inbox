import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { getBackendApiUrl } from '@/lib/api-config';
import { sendNewAffiliateRegistrationNotification } from '@/lib/affiliate-notification-service';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function isValidUuid(val?: string | null): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

/**
 * Normalisasi nomor WhatsApp/HP ke format internasional (628xxx) secara aman.
 * Menangani 08xxx, +628xxx, 628xxx, spasi, tanda strip, atau karakter non-digit.
 */
function cleanPhoneNumber(raw?: string | null): string {
  if (!raw) return '';
  let clean = String(raw).replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const rawName = body.name || body.full_name || '';
    const name = String(rawName).trim();
    const rawEmail = body.email || '';
    const email = String(rawEmail).trim().toLowerCase();
    const rawPhone = body.phone || body.phone_number || '';
    const phone = cleanPhoneNumber(rawPhone);
    const customSlug = String(body.custom_slug || body.referral_code || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const amReferralCode = String(body.am_referral_code || body.am_pembina || body.ref || '').trim().toLowerCase();
    const incomingParentAmId = body.parent_am_id ? String(body.parent_am_id).trim() : null;
    const region = (body.region && String(body.region).trim()) ? String(body.region).trim().toUpperCase() : 'ID-NATIONAL';
    const bankName = String(body.bank_name || '').trim();
    const bankAccountNumber = String(body.bank_account_number || '').trim();
    const bankAccountHolder = String(body.bank_account_holder || '').trim().toUpperCase();

    // 1. Validasi Input Dasar
    if (!name || name.length < 3) {
      return NextResponse.json(
        { success: false, detail: 'Nama lengkap wajib diisi (minimal 3 karakter).' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, detail: 'Alamat email tidak valid. Pastikan format email benar.' },
        { status: 400 }
      );
    }

    if (phone && phone.length < 10) {
      return NextResponse.json(
        { success: false, detail: 'Nomor WhatsApp tidak valid (minimal 10 digit).' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, detail: 'Database Supabase tidak terhubung. Silakan coba beberapa saat lagi.' },
        { status: 503 }
      );
    }

    // 2. Cek apakah email sudah terdaftar
    const { data: existingEmail, error: emailCheckErr } = await supabase
      .from('affiliates')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle();

    if (emailCheckErr) {
      console.warn('[AffiliateRegister] Email check note:', emailCheckErr);
    }

    if (existingEmail) {
      return NextResponse.json(
        { success: false, detail: 'Alamat email ini sudah terdaftar sebagai mitra affiliate. Silakan gunakan email lain atau masuk ke dashboard.' },
        { status: 409 }
      );
    }

    // 3. Generate atau validasi keunikan referral_code / slug
    let finalRefCode = customSlug;
    if (!finalRefCode) {
      const baseCandidate = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
      finalRefCode = (baseCandidate || 'mitra') + Math.floor(100 + Math.random() * 900);
    }

    const { data: existingRef } = await supabase
      .from('affiliates')
      .select('id, referral_code')
      .ilike('referral_code', finalRefCode)
      .maybeSingle();

    if (existingRef) {
      return NextResponse.json(
        { success: false, detail: `Kode referal '${finalRefCode}' sudah digunakan mitra lain. Silakan pilih kode referal kustom lain.` },
        { status: 409 }
      );
    }

    // 4. Resolusi Parent AM Pembina secara Dinamis (Single Source of Truth: affiliates)
    let resolvedParentAm: any = null;

    if (incomingParentAmId && isValidUuid(incomingParentAmId)) {
      const { data: amById } = await supabase
        .from('affiliates')
        .select('id, name, email, referral_code, role, tenant_id')
        .eq('id', incomingParentAmId)
        .maybeSingle();
      if (amById) resolvedParentAm = amById;
    }

    if (!resolvedParentAm && amReferralCode && amReferralCode !== '1' && amReferralCode !== 'null' && amReferralCode !== 'undefined') {
      const { data: amByCode } = await supabase
        .from('affiliates')
        .select('id, name, email, referral_code, role, tenant_id')
        .ilike('referral_code', amReferralCode)
        .maybeSingle();
      if (amByCode) resolvedParentAm = amByCode;
    }

    // Default ke Master AM Aktif (Kang Sakti / role: am) jika tidak terpetakan
    if (!resolvedParentAm) {
      const { data: defaultAm } = await supabase
        .from('affiliates')
        .select('id, name, email, referral_code, role, tenant_id')
        .eq('role', 'am')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (defaultAm) resolvedParentAm = defaultAm;
    }

    // Resolusi tenant_id (NOT NULL column contract di tabel affiliates)
    // Mitra mewarisi tenant_id dari AM pembina, atau default 'onlineboost'
    const resolvedTenantId = resolvedParentAm?.tenant_id || 'onlineboost';

    const newAffiliateId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const insertPayload = {
      id: newAffiliateId,
      tenant_id: resolvedTenantId,
      name,
      email,
      phone,
      phone_number: phone,
      referral_code: finalRefCode,
      role: 'affiliate',
      parent_am_id: resolvedParentAm?.id || null,
      region,
      commission_rate: 25,
      status: 'ACTIVE',
      bank_name: bankName || null,
      bank_account_number: bankAccountNumber || null,
      bank_account_holder: bankAccountHolder || null,
      payout_bank_details: {
        bank_name: bankName,
        account_number: bankAccountNumber,
        account_holder: bankAccountHolder,
      },
      is_bank_verified: false,
      agreed_to_rules: true,
      screening_status: 'PENDING',
      metadata: {
        bank_name: bankName,
        bank_account_number: bankAccountNumber,
        bank_account_holder: bankAccountHolder,
        am_pembina: resolvedParentAm?.referral_code || null,
        parent_am_name: resolvedParentAm?.name || null,
        registered_ip: req.headers.get('x-forwarded-for') || null,
      },
      created_at: createdAt,
      updated_at: createdAt,
    };

    // 5. Simpan akun mitra baru ke Supabase
    const { data: createdAffiliate, error: insertError } = await supabase
      .from('affiliates')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      console.error('[AffiliateRegister] Supabase insert error:', insertError);
      return NextResponse.json(
        { success: false, detail: `Gagal mendaftarkan akun affiliate: ${insertError.message || 'Kesalahan database'}` },
        { status: 500 }
      );
    }

    // 6. Trigger Notifikasi Email ke Parent AM (100% Non-blocking, isolated catch)
    if (resolvedParentAm) {
      sendNewAffiliateRegistrationNotification({
        affiliateName: name,
        affiliateEmail: email,
        affiliatePhone: phone,
        affiliateCode: finalRefCode,
        parentAmId: resolvedParentAm.id,
        region,
      }).catch((notifErr) => {
        console.warn('[AffiliateRegister] Non-fatal notification error:', notifErr);
      });
    }

    // 7. Forward ke Core Backend secara asinkron dengan timeout ketat (non-blocking)
    try {
      const coreUrl = getBackendApiUrl('/api/v1/auth/affiliate/register');
      const abortCtrl = new AbortController();
      const timer = setTimeout(() => abortCtrl.abort(), 2500); // 2.5s hard timeout
      fetch(coreUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortCtrl.signal,
      })
        .catch((coreErr) => console.warn('[AffiliateRegister] Core backend sync skipped (non-fatal):', coreErr))
        .finally(() => clearTimeout(timer));
    } catch (dispatchErr) {
      console.warn('[AffiliateRegister] Core dispatch note:', dispatchErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Pendaftaran kemitraan affiliate BoonTrack berhasil!',
      affiliate: createdAffiliate,
      referral_code: finalRefCode,
      access_token: `aff_${newAffiliateId}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi gangguan internal saat pendaftaran affiliate.';
    console.error('[AffiliateRegister] Exception:', err);
    return NextResponse.json({ success: false, detail: msg }, { status: 500 });
  }
}
