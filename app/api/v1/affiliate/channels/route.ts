import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { validateDemoUrl, resolveChannelBinding } from '@/lib/channels';

export const dynamic = 'force-dynamic';

function parseJwt(token: string): { sub?: string; email?: string; phone?: string; affiliate_code?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function resolveAffiliate(req: NextRequest, supabase: any) {
  const authHeader = req.headers.get('authorization') || '';
  let token = '';

  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }

  if (!token) {
    token = req.headers.get('x-affiliate-token') || req.cookies.get('affiliate_token')?.value || '';
  }

  if (!token) return null;

  // Case A: Dev bypass
  if (token.startsWith('bt_aff_dev_') || token === 'aff_dev_sakti') {
    const { data: devAff } = await supabase
      .from('affiliates')
      .select('*')
      .or('referral_code.eq.buzzerukm,phone.eq.087822706930,phone_number.eq.087822706930')
      .maybeSingle();
    return devAff;
  }

  // Case B: JWT
  const jwt = parseJwt(token);
  if (jwt) {
    if (jwt.sub) {
      const { data } = await supabase.from('affiliates').select('*').eq('id', jwt.sub).maybeSingle();
      if (data) return data;
    }
    if (jwt.email) {
      const { data } = await supabase.from('affiliates').select('*').ilike('email', jwt.email.trim()).maybeSingle();
      if (data) return data;
    }
    if (jwt.affiliate_code) {
      const { data } = await supabase.from('affiliates').select('*').ilike('referral_code', jwt.affiliate_code.trim()).maybeSingle();
      if (data) return data;
    }
  }

  // Case C: Supabase Auth User
  try {
    const { data: authData } = await supabase.auth.getUser(token);
    const authUser = authData?.user;
    if (authUser?.email) {
      const { data } = await supabase.from('affiliates').select('*').ilike('email', authUser.email.trim()).maybeSingle();
      if (data) return data;
    }
    if (authUser?.id) {
      const { data } = await supabase.from('affiliates').select('*').eq('id', authUser.id).maybeSingle();
      if (data) return data;
    }
  } catch {}

  // Case D: Direct UUID match
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    const { data } = await supabase.from('affiliates').select('*').eq('id', token).maybeSingle();
    if (data) return data;
  }

  return null;
}

/**
 * GET /api/v1/affiliate/channels
 * Mengambil daftar kolam komunitas (Telegram & WhatsApp) milik affiliate.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database tidak terhubung' }, { status: 500 });
    }

    const affiliate = await resolveAffiliate(req, supabase);
    if (!affiliate) {
      return NextResponse.json({ success: false, error: 'Sesi login affiliate tidak ditemukan atau tidak valid' }, { status: 401 });
    }

    const affRefCode = affiliate.referral_code || affiliate.id;

    // Ambil dari tabel channel_bindings
    const { data: bindings, error: fetchErr } = await supabase
      .from('channel_bindings')
      .select('*')
      .or(`affiliate_id.eq.${affRefCode},affiliate_id.eq.${affiliate.id}`)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      console.warn('[Affiliate Channels GET Error]:', fetchErr);
    }

    const list = bindings && bindings.length > 0
      ? bindings
      : (Array.isArray(affiliate.metadata?.channel_bindings) ? affiliate.metadata.channel_bindings : []);

    return NextResponse.json({
      success: true,
      data: list,
      affiliate_id: affRefCode,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/v1/affiliate/channels
 * Menghubungkan atau memperbarui kolam komunitas untuk affiliate.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database tidak terhubung' }, { status: 500 });
    }

    const affiliate = await resolveAffiliate(req, supabase);
    if (!affiliate) {
      return NextResponse.json({ success: false, error: 'Sesi login affiliate tidak ditemukan' }, { status: 401 });
    }

    const body = await req.json();
    const {
      channel_type,
      channel_name,
      community_source_id,
      demo_url,
    } = body;

    // 1. Validasi Input Channel
    if (!channel_type || (channel_type !== 'telegram' && channel_type !== 'whatsapp')) {
      return NextResponse.json({ success: false, error: 'Tipe saluran wajib "telegram" atau "whatsapp"' }, { status: 400 });
    }

    const cleanSourceId = String(community_source_id || '').trim();
    if (!cleanSourceId) {
      return NextResponse.json({ success: false, error: 'ID Grup Telegram / WA Group JID wajib diisi' }, { status: 400 });
    }

    const cleanName = String(channel_name || '').trim();
    if (!cleanName) {
      return NextResponse.json({ success: false, error: 'Nama kolam komunitas wajib diisi' }, { status: 400 });
    }

    // 2. Strict Domain Whitelist Validation untuk demo_url (§43 / Task requirement)
    const demoValidation = validateDemoUrl(demo_url);
    if (!demoValidation.valid) {
      return NextResponse.json({
        success: false,
        error: demoValidation.error || 'Tautan demo wajib menggunakan ekosistem boontrack.com',
      }, { status: 400 });
    }

    const validatedDemoUrl = demoValidation.normalizedUrl || 'https://shop.boontrack.com/boon';
    const affRefCode = affiliate.referral_code || affiliate.id;
    const bindingId = `${channel_type}:${cleanSourceId}:affiliate_context`;

    // 3. Cek Isolasi Kolam: Apakah grup sudah terhubung ke affiliate lain?
    const { data: existing } = await supabase
      .from('channel_bindings')
      .select('*')
      .eq('channel_type', channel_type)
      .eq('community_source_id', cleanSourceId)
      .maybeSingle();

    if (existing && existing.affiliate_id && existing.affiliate_id !== affRefCode && existing.affiliate_id !== affiliate.id) {
      return NextResponse.json({
        success: false,
        error: `Grup ini sudah terhubung ke mitra lain (${existing.channel_name || existing.affiliate_id}). Satu grup hanya dapat terikat ke satu mitra.`,
      }, { status: 409 });
    }

    // 4. Construct ChannelBinding object
    const newBindingRecord = {
      binding_id: bindingId,
      affiliate_id: affRefCode,
      community_source_id: cleanSourceId,
      channel_type,
      channel_name: cleanName,
      context: 'AFFILIATE_CONTEXT',
      capabilities: ['referral_acquisition', 'registration_link', 'affiliate_notification'],
      demo_url: validatedDemoUrl,
      is_active: true,
      metadata: {
        affiliate_name: affiliate.name,
        affiliate_email: affiliate.email,
        affiliate_phone: affiliate.phone || affiliate.phone_number,
        updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    let savedData: any = null;

    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('channel_bindings')
        .update(newBindingRecord)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updateErr) {
        return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
      }
      savedData = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('channel_bindings')
        .insert(newBindingRecord)
        .select('*')
        .single();

      if (insertErr) {
        return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
      }
      savedData = inserted;
    }

    // 5. Dual-persistence: Update array di affiliates.metadata.channel_bindings
    try {
      const currentBindings = Array.isArray(affiliate.metadata?.channel_bindings)
        ? affiliate.metadata.channel_bindings
        : [];
      const filtered = currentBindings.filter((b: any) => b.community_source_id !== cleanSourceId);
      filtered.unshift(savedData || newBindingRecord);

      await supabase
        .from('affiliates')
        .update({
          metadata: {
            ...(affiliate.metadata || {}),
            channel_bindings: filtered,
          },
        })
        .eq('id', affiliate.id);
    } catch (e) {
      console.warn('[Affiliate Metadata Sync Warning]:', e);
    }

    return NextResponse.json({
      success: true,
      message: `Kolam "${cleanName}" berhasil diaktifkan! Bot @boon siap mempromosikan tautan demo & registrasi Anda.`,
      data: savedData || newBindingRecord,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/affiliate/channels
 * Memutuskan sambungan kolam komunitas.
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database tidak terhubung' }, { status: 500 });
    }

    const affiliate = await resolveAffiliate(req, supabase);
    if (!affiliate) {
      return NextResponse.json({ success: false, error: 'Sesi login affiliate tidak ditemukan' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const sourceId = searchParams.get('source_id') || searchParams.get('community_source_id');

    if (!id && !sourceId) {
      return NextResponse.json({ success: false, error: 'Parameter "id" atau "source_id" wajib disertakan' }, { status: 400 });
    }

    const affRefCode = affiliate.referral_code || affiliate.id;

    let query = supabase.from('channel_bindings').delete();
    if (id) {
      query = query.eq('id', id);
    } else if (sourceId) {
      query = query.eq('community_source_id', sourceId);
    }

    query = query.or(`affiliate_id.eq.${affRefCode},affiliate_id.eq.${affiliate.id}`);
    const { error: delErr } = await query;

    if (delErr) {
      return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
    }

    // Bersihkan dari metadata
    try {
      const currentBindings = Array.isArray(affiliate.metadata?.channel_bindings)
        ? affiliate.metadata.channel_bindings
        : [];
      const filtered = currentBindings.filter((b: any) => b.id !== id && b.community_source_id !== sourceId);

      await supabase
        .from('affiliates')
        .update({
          metadata: {
            ...(affiliate.metadata || {}),
            channel_bindings: filtered,
          },
        })
        .eq('id', affiliate.id);
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Kolam komunitas berhasil diputuskan.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
