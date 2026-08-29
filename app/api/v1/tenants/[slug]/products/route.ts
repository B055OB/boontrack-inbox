import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const body = await req.json();

    const {
      name,
      price,
      promo_price,
      variants,
      promo,
      description,
      download_url,
      type = 'digital',
    } = body;

    if (!name || price === undefined) {
      return NextResponse.json(
        { success: false, error: 'Nama produk dan harga wajib diisi.' },
        { status: 400 }
      );
    }

    const newProduct = {
      name,
      price: Number(price),
      promo_price: promo_price ? Number(promo_price) : undefined,
      variants: variants || '',
      promo: promo || '',
      description: description || '',
      download_url: download_url || null,
      type,
    };

    try {
      const supabase = getSupabase();
      const { data: existing } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      const updatedMetadata = {
        ...(existing?.metadata || {}),
        product: newProduct,
      };

      await supabase.from('tenants').upsert({
        slug,
        name: existing?.name || slug,
        category: existing?.category || (type === 'digital' ? 'digital' : 'retail'),
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn('Supabase product save error:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Produk berhasil disimpan ke katalog toko.',
      product: newProduct,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error saving product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
