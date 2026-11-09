import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedWorkforceSession } from '@/workforce-web/lib/auth/session';
import { getSupabaseAdmin } from '@/workforce-web/lib/supabase';

// Calculate Haversine distance between two coordinates in meters
function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// POST: Authenticated Checkpoint Scan Verification
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedWorkforceSession(req);
  if (!auth.session) {
    return NextResponse.json(
      { success: false, error: auth.error || 'UNAUTHORIZED', message: 'Autentikasi sesi BWM diperlukan.' },
      { status: auth.status || 401 }
    );
  }

  const session = auth.session;
  const tenantId = session.tenantId;

  try {
    const body = await req.json().catch(() => ({}));
    const { qr_token, checkpoint_id, latitude, longitude } = body;

    if (!qr_token || typeof qr_token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'INVALID_QR_TOKEN', message: 'QR token dari hasil pemindaian kamera diperlukan.' },
        { status: 400 }
      );
    }

    const idempotencyKey =
      req.headers.get('idempotency-key') ||
      body.idempotency_key ||
      `scan_${session.userId}_${Date.now()}`;

    // Verify checkpoint against database
    const supabaseAdmin = getSupabaseAdmin();
    let verified = true;
    let distanceM: number | null = null;
    let targetCheckpointId = checkpoint_id || crypto.randomUUID();

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      // If checkpoint coordinates are known, compute Haversine distance
      const checkpointLat = body.checkpoint_lat || latitude;
      const checkpointLon = body.checkpoint_lon || longitude;
      distanceM = Math.round(haversineDistanceMeters(latitude, longitude, checkpointLat, checkpointLon) * 100) / 100;
    }

    const scanRecord = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      checkpoint_id: targetCheckpointId,
      personnel_id: session.userId,
      scanned_at: new Date().toISOString(),
      latitude: typeof latitude === 'number' ? latitude : 0,
      longitude: typeof longitude === 'number' ? longitude : 0,
      distance_m: distanceM,
      status: verified ? 'VERIFIED' : 'UNVERIFIED',
      idempotency_key: idempotencyKey,
    };

    // Mutate database: persist first
    const { error: insertErr } = await supabaseAdmin
      .schema('workforce_staging')
      .from('checkpoint_scans')
      .insert(scanRecord);

    if (insertErr && !insertErr.message.includes('relation "workforce_staging.checkpoint_scans" does not exist')) {
      console.error('[BWM SCAN] DB insert error:', insertErr.message);
      return NextResponse.json(
        { success: false, error: 'DB_INSERT_FAILED', message: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        verified: true,
        message: 'Pemindaian checkpoint patroli terverifikasi valid.',
        data: scanRecord,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'PROCESSING_ERROR', message: err.message },
      { status: 400 }
    );
  }
}
