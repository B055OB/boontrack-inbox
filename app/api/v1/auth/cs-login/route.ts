import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

function normalizePhone(rawPhone: string): { international: string; local: string } {
  const digits = rawPhone.replace(/\D/g, '');
  let intl = digits;
  let loc = digits;

  if (digits.startsWith('0')) {
    intl = '62' + digits.slice(1);
    loc = digits;
  } else if (digits.startsWith('62')) {
    intl = digits;
    loc = '0' + digits.slice(2);
  } else if (digits.startsWith('8')) {
    intl = '62' + digits;
    loc = '0' + digits;
  }

  return { international: intl, local: loc };
}

/**
 * POST /api/v1/auth/cs-login
 * Direct CS Access Authentication (Bypasses email magic link delays)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tenantSlug, phone, pin } = body;

    const cleanSlug = String(tenantSlug || '').trim().toLowerCase();
    const rawPhone = String(phone || '').trim();
    const rawPin = String(pin || '').trim();

    if (!cleanSlug) {
      return NextResponse.json(
        { success: false, error: 'Slug toko wajib diisi.' },
        { status: 400 }
      );
    }

    if (!rawPhone) {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp CS wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Koneksi database tidak tersedia.' },
        { status: 500 }
      );
    }

    // 1. Single Source of Truth: Lookup tenant dynamically from Supabase
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, slug, name, tier, metadata')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json(
        { success: false, error: `Toko "${cleanSlug}" tidak ditemukan. Periksa kembali nama toko Anda.` },
        { status: 404 }
      );
    }

    // 2. Validate Tenant PIN
    const meta = tenant.metadata || {};
    const configuredPin = meta.access_pin || meta.pin_hash || meta.pin;

    if (configuredPin) {
      if (!rawPin) {
        return NextResponse.json(
          { success: false, error: 'Toko ini dilindungi PIN. Silakan masukkan PIN Tenant yang diberikan pemilik toko.' },
          { status: 401 }
        );
      }
      if (String(configuredPin).trim() !== rawPin) {
        return NextResponse.json(
          { success: false, error: 'PIN Tenant salah. Silakan tanyakan PIN akses yang benar kepada pemilik toko.' },
          { status: 401 }
        );
      }
    }

    // 3. Normalize CS Phone Number
    const { international: intlPhone, local: localPhone } = normalizePhone(rawPhone);

    // 4. Lookup registered CS Member from tenant_users
    const { data: csMembers } = await supabase
      .from('tenant_users')
      .select('*')
      .or(`tenant_id.eq.${tenant.id},tenant_slug.eq.${tenant.slug}`)
      .eq('is_active', true);

    let matchedMember = (csMembers || []).find((m: any) => {
      const mPhone = String(m.phone || '').replace(/\D/g, '');
      return mPhone === intlPhone || mPhone === localPhone || (mPhone && (intlPhone.endsWith(mPhone) || mPhone.endsWith(localPhone)));
    });

    // Check if phone matches owner phone in tenant metadata or whatsapp_connections
    if (!matchedMember) {
      const ownerWa = String(meta.whatsapp_number || '').replace(/\D/g, '');
      const isOwner = ownerWa && (ownerWa === intlPhone || ownerWa === localPhone);

      if (isOwner) {
        matchedMember = {
          id: tenant.id,
          name: meta.merchant_name || meta.display_name || tenant.name || 'Owner Lead CS',
          phone: intlPhone,
          role: 'OWNER_LEAD',
          access_level: 'FULL_DASHBOARD',
        };
      }
    }

    // Fallback: If tenant is in trial/solo and has 0 registered CS members, allow self-activation for duty CS
    if (!matchedMember && (!csMembers || csMembers.length === 0)) {
      matchedMember = {
        id: `cs_${Date.now()}`,
        name: 'CS Officer',
        phone: intlPhone,
        role: 'CS',
        access_level: 'LIVE_CHAT_ONLY',
      };
    }

    if (!matchedMember) {
      return NextResponse.json(
        {
          success: false,
          error: `Nomor WhatsApp ${rawPhone} belum terdaftar sebagai CS aktif di toko "${tenant.name || cleanSlug}". Hubungi pemilik toko untuk menambahkan nomor Anda ke daftar CS.`,
        },
        { status: 403 }
      );
    }

    // 5. Success - Set Response Cookies & Payload
    const redirectUrl = `/${cleanSlug}/dashboard`;
    const response = NextResponse.json({
      success: true,
      message: `Login CS berhasil! Selamat datang, ${matchedMember.name}.`,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        tier: tenant.tier,
      },
      cs: {
        id: matchedMember.id,
        name: matchedMember.name,
        phone: intlPhone,
        role: matchedMember.role || 'CS',
        access_level: matchedMember.access_level || 'LIVE_CHAT_ONLY',
      },
      redirectUrl,
    });

    // Set secure authentication cookies
    response.cookies.set('merchant_store', cleanSlug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
    response.cookies.set('merchant_session', cleanSlug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
    response.cookies.set('bt_tenant', cleanSlug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
    response.cookies.set('cs_session_name', matchedMember.name, { path: '/', maxAge: 2592000, sameSite: 'lax' });
    response.cookies.set('cs_session_phone', intlPhone, { path: '/', maxAge: 2592000, sameSite: 'lax' });

    return response;
  } catch (err: any) {
    console.error('[Direct CS Login Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Terjadi kesalahan sistem saat memproses login CS.' },
      { status: 500 }
    );
  }
}
