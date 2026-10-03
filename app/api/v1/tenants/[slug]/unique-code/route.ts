import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateUniqueCodeForTenant } from '@/lib/unique-code-generator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug?: string }> }
) {
  try {
    const resolvedParams = await params;
    const slug = String(resolvedParams?.slug || '').trim();

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Parameter slug tenant wajib diisi' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const baseAmount = Number(searchParams.get('amount') || searchParams.get('baseAmount') || 0);
    const paymentMethod = String(searchParams.get('method') || searchParams.get('paymentMethod') || 'manual_transfer').toLowerCase();

    const uniqueCode = await generateUniqueCodeForTenant({
      tenantSlug: slug,
      baseAmount,
      paymentMethod,
    });

    const finalAmount =
      baseAmount > 0
        ? paymentMethod === 'qris'
          ? Math.max(1000, baseAmount - uniqueCode)
          : baseAmount + uniqueCode
        : 0;

    return NextResponse.json({
      success: true,
      tenant_slug: slug,
      unique_code: uniqueCode,
      base_amount: baseAmount,
      payment_method: paymentMethod,
      final_amount: finalAmount,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
