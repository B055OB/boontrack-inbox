import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';
import { sendBoonPilotVerificationEmail } from '@/lib/boonpilot-email';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, type = 'merchant', slug } = body;

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return NextResponse.json(
        { success: false, error: 'Alamat email wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database tidak terhubung.' },
        { status: 500 }
      );
    }

    // Generate new token & 24h expiry
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const baseUrl = process.env.NEXT_PUBLIC_SHOP_URL || 'https://shop.boontrack.com';

    // ── CASE A: AFFILIATE RESEND ──
    if (type === 'affiliate') {
      const { data: aff, error: affErr } = await supabase
        .from('affiliates')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (affErr || !aff) {
        return NextResponse.json(
          { success: false, error: 'Akun affiliate dengan email ini tidak ditemukan.' },
          { status: 404 }
        );
      }

      const updatedMeta = {
        ...(aff.metadata || {}),
        verification_token: newToken,
        verification_expires_at: expiresAt,
        email_verified: false,
      };

      await supabase
        .from('affiliates')
        .update({ metadata: updatedMeta })
        .eq('id', aff.id);

      const verificationUrl = `${baseUrl}/auth/verify?token=${newToken}&type=affiliate&id=${aff.id}`;

      const emailResult = await sendBoonPilotVerificationEmail({
        to: cleanEmail,
        name: aff.name || 'Mitra Affiliate',
        role: 'affiliate',
        verificationUrl,
        expiresInHours: 24,
      });

      return NextResponse.json({
        success: true,
        message: 'Email aktivasi berhasil dikirim ulang oleh Boon Pilot!',
        emailResult,
      });
    }

    // ── CASE B: MERCHANT / STORE RESEND ──
    let tenantQuery = supabase.from('tenants').select('*');
    if (slug) {
      tenantQuery = tenantQuery.eq('slug', slug);
    } else {
      tenantQuery = tenantQuery.ilike('metadata->>email', cleanEmail);
    }

    const { data: tenant, error: tErr } = await tenantQuery.maybeSingle();

    if (tErr || !tenant) {
      return NextResponse.json(
        { success: false, error: 'Toko mitra dengan data ini tidak ditemukan.' },
        { status: 404 }
      );
    }

    const currentMeta = tenant.metadata || {};
    const updatedMeta = {
      ...currentMeta,
      verification_token: newToken,
      verification_expires_at: expiresAt,
      email_verified: false,
    };

    await supabase
      .from('tenants')
      .update({ metadata: updatedMeta })
      .eq('id', tenant.id);

    const verificationUrl = `${baseUrl}/auth/verify?token=${newToken}&type=merchant&slug=${tenant.slug}&id=${tenant.id}`;

    const emailResult = await sendBoonPilotVerificationEmail({
      to: cleanEmail,
      name: currentMeta.merchant_name || tenant.name || 'Merchant',
      role: 'merchant',
      verificationUrl,
      storeName: tenant.name || tenant.slug,
      expiresInHours: 24,
    });

    return NextResponse.json({
      success: true,
      message: 'Email aktivasi berhasil dikirim ulang oleh Boon Pilot!',
      emailResult,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal mengirim ulang email aktivasi.';
    console.error('[ResendVerification] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
