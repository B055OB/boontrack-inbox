import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { verifyOrderMutationAuthorization } from '@/lib/auth/order-auth-guard';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/orders/[id]/archive
 * Endpoint Soft-Archive pesanan (SPRINT 3).
 *
 * Rules:
 * 1. Strict No-Hard-Delete: Dilarang keras melakukan DELETE FROM orders.
 * 2. Idempotent: Mengembalikan status 200 OK dengan status is_archived terkini.
 * 3. Tenant Isolation: Memvalidasi kepemilikan tenant order.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const orderId = String(id || '').trim();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'Parameter id pesanan wajib diisi.' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    // Default true untuk arsip, false untuk pulihkan/unarchive
    const isArchived = typeof body.is_archived === 'boolean' ? body.is_archived : true;

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNREACHABLE', message: 'Database connection unreachable.' },
        { status: 500 }
      );
    }

    // 1. Ambil order yang ada di Supabase
    let order: any = null;
    const { data: primaryOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (primaryOrder) {
      order = primaryOrder;
    } else {
      const { data: altOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('correlation_id', orderId)
        .maybeSingle();
      if (altOrder) order = altOrder;
    }

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'ORDER_NOT_FOUND', message: `Pesanan #${orderId} tidak ditemukan.` },
        { status: 404 }
      );
    }

    // 2. Validasi Tenant Isolation & Sesi Pengguna (P0 Security Guard)
    const authRes = await verifyOrderMutationAuthorization(req, order);
    if (!authRes.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: authRes.status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED',
          message: authRes.error || 'Akses ditolak: Autentikasi diperlukan.',
        },
        { status: authRes.status }
      );
    }

    // 3. Update kolom is_archived secara idempotent
    const nowIso = new Date().toISOString();
    let { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update({
        is_archived: isArchived,
        updated_at: nowIso,
      })
      .eq('id', order.id)
      .select('*')
      .maybeSingle();

    // Fallback: Jika kolom is_archived belum ada di skema, simpan di metadata JSONB
    if (updateErr && (updateErr.message?.includes('is_archived') || updateErr.message?.includes('does not exist'))) {
      console.warn('[Archive Order API] Column update failed, persisting to metadata JSONB fallback:', updateErr.message);
      const currentMeta = (typeof order.metadata === 'object' && order.metadata !== null) ? order.metadata : {};
      const newMeta = { ...currentMeta, is_archived: isArchived };
      const fallbackRes = await supabase
        .from('orders')
        .update({
          metadata: newMeta,
          updated_at: nowIso,
        })
        .eq('id', order.id)
        .select('*')
        .maybeSingle();
      updatedOrder = fallbackRes.data;
      updateErr = fallbackRes.error;
    }

    if (updateErr) {
      console.error('[Archive Order API] Error updating order:', updateErr);
      return NextResponse.json(
        { success: false, error: 'UPDATE_FAILED', message: updateErr.message },
        { status: 500 }
      );
    }

    const finalOrder = updatedOrder || {
      ...order,
      is_archived: isArchived,
      updated_at: nowIso,
    };

    return NextResponse.json(
      {
        success: true,
        order_id: order.id,
        is_archived: isArchived,
        message: isArchived
          ? `Pesanan #${order.id} berhasil disembunyikan/diarsipkan.`
          : `Pesanan #${order.id} berhasil dipulihkan ke daftar aktif.`,
        order: finalOrder,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Archive Order API Exception]:', errorMsg);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * LARANGAN KERAS: DELETE endpoint dilarang keras pada tabel orders.
 */
export async function DELETE() {
  return NextResponse.json(
    {
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Penghapusan fisik (Hard Delete) dilarang keras demi integritas data dan audit trail. Gunakan PATCH /archive.',
    },
    { status: 405 }
  );
}
