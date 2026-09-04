import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { INITIAL_PARTNERS, PartnerItem, isValidSlugFormat } from '@/lib/partner-service';
import { getSupabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('affiliates')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: PartnerItem[] = data.map((a: any) => ({
          id: a.id,
          name: a.name || 'Mitra Partner',
          phone: a.phone_number || '-',
          email: a.email,
          role: (a.role as 'AM' | 'AFFILIATE') || 'AFFILIATE',
          referral_code: a.referral_code || 'PARTNER',
          is_ref_customized: Boolean(a.is_ref_customized),
          status: (a.status as 'ACTIVE' | 'SUSPENDED') || 'ACTIVE',
          am_pembina: a.metadata?.am_pembina || (a.role === 'AM' ? undefined : 'Andi Pratama'),
          commission_rate: a.commission_rate || 15,
          bank_name: a.metadata?.bank_name,
          bank_account_number: a.metadata?.bank_account_number,
          bank_account_holder: a.metadata?.bank_account_holder,
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

  return NextResponse.json({ success: true, partners: INITIAL_PARTNERS });
}

export async function POST(req: NextRequest) {
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

    const newPartner: PartnerItem = {
      id: `partner-${Date.now()}`,
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || undefined,
      role: role === 'AM' ? 'AM' : 'AFFILIATE',
      referral_code: cleanCode,
      is_ref_customized: Boolean(ref_code),
      status: 'ACTIVE',
      am_pembina: role === 'AM' ? undefined : (am_pembina || 'Andi Pratama'),
      commission_rate: role === 'AM' ? 20 : 15,
      balance: 0,
      total_withdrawn: 0,
      created_at: new Date().toISOString(),
    };

    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('affiliates').insert({
          id: newPartner.id,
          name: newPartner.name,
          phone_number: newPartner.phone,
          email: newPartner.email,
          role: newPartner.role,
          referral_code: newPartner.referral_code,
          status: newPartner.status,
          commission_rate: newPartner.commission_rate,
          metadata: {
            am_pembina: newPartner.am_pembina,
            is_ref_customized: newPartner.is_ref_customized,
          },
          created_at: newPartner.created_at,
        });
      }
    } catch (e) {
      console.warn('Supabase insert partner note:', e);
    }

    return NextResponse.json({
      success: true,
      message: `Mitra ${newPartner.name} (${newPartner.referral_code}) berhasil didaftarkan ke Whitelist!`,
      partner: newPartner,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creating partner';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
