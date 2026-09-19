import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json({ error: 'Tenant slug is required' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const customText =
      searchParams.get('text') || searchParams.get('msg') || searchParams.get('pesan');

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 503 }
      );
    }

    // 1. Fetch tenant data directly from Supabase (Single Source of Truth)
    const { data: tenant, error: dbError } = await supabase
      .from('tenants')
      .select('id, slug, name, metadata')
      .eq('slug', slug.toLowerCase())
      .maybeSingle();

    if (dbError || !tenant) {
      // Jika tenant tidak ditemukan, arahkan ke 404 atau domain utama
      return NextResponse.redirect(new URL('/', req.url), { status: 307 });
    }

    const metadata = tenant.metadata || {};
    const rotator = metadata.rotator;
    const defaultMsg =
      customText ||
      rotator?.default_message ||
      'Halo Admin, saya tertarik untuk order produk di toko Anda. Boleh dibantu infonya? 🙏';

    // 2. Evaluasi Rotator Pool
    if (rotator && rotator.enabled !== false && Array.isArray(rotator.cs_list)) {
      const allCs = rotator.cs_list;
      const activeCs = allCs.filter(
        (cs: any) =>
          cs &&
          cs.is_active !== false &&
          typeof cs.phone === 'string' &&
          cs.phone.replace(/\D/g, '').length >= 8
      );

      if (activeCs.length > 0) {
        // Round-Robin Pointer Calculation
        const lastIndex = typeof rotator.last_index === 'number' ? rotator.last_index : -1;
        const nextIndex = (lastIndex + 1) % activeCs.length;
        const selectedCS = activeCs[nextIndex];

        // Format nomor target
        let targetPhone = selectedCS.phone.replace(/\D/g, '');
        if (targetPhone.startsWith('0')) {
          targetPhone = '62' + targetPhone.slice(1);
        }

        // Update counter & pointer di background/sync
        const updatedCsList = allCs.map((cs: any) => {
          if (cs.id === selectedCS.id) {
            return {
              ...cs,
              lead_count: (Number(cs.lead_count) || 0) + 1,
            };
          }
          return cs;
        });

        const updatedRotator = {
          ...rotator,
          last_index: nextIndex,
          cs_list: updatedCsList,
          last_rotated_at: new Date().toISOString(),
        };

        // Simpan pembaruan counter & index ke Supabase
        await supabase
          .from('tenants')
          .update({
            metadata: {
              ...metadata,
              rotator: updatedRotator,
            },
          })
          .eq('id', tenant.id);

        const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(defaultMsg)}`;

        // Gunakan 307 Temporary Redirect agar browser/CDN tidak melakukan caching
        return NextResponse.redirect(waUrl, {
          status: 307,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
          },
        });
      }
    }

    // 3. Fallback: Jika rotator nonaktif atau belum ada CS terdaftar, gunakan nomor WhatsApp toko
    const fallbackPhoneRaw =
      metadata.whatsapp_number || metadata.whatsapp || metadata.phone;

    if (fallbackPhoneRaw) {
      let fallbackPhone = String(fallbackPhoneRaw).replace(/\D/g, '');
      if (fallbackPhone.startsWith('0')) {
        fallbackPhone = '62' + fallbackPhone.slice(1);
      }
      if (fallbackPhone.length >= 8) {
        const waUrl = `https://wa.me/${fallbackPhone}?text=${encodeURIComponent(defaultMsg)}`;
        return NextResponse.redirect(waUrl, {
          status: 307,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
        });
      }
    }

    // 4. Fallback Terakhir: Redirect ke storefront toko
    return NextResponse.redirect(new URL(`/${slug}`, req.url), { status: 307 });
  } catch (err: unknown) {
    console.error('[Rotator Route] Error:', err);
    return NextResponse.redirect(new URL('/', req.url), { status: 307 });
  }
}
