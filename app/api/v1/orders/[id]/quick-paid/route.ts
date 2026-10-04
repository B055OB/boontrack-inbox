import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { POST as tenantQuickPaidHandler } from '@/app/api/v1/tenants/[slug]/orders/[id]/quick-paid/route';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return tenantQuickPaidHandler(req, {
    params: Promise.resolve({ slug: '', id }),
  });
}
