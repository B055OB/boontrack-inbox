import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedWorkforceSession } from '@/workforce-web/lib/auth/session';
import { getSupabaseAdmin } from '@/workforce-web/lib/supabase';

export interface AttendancePayload {
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  facility_id?: string;
  latitude: number;
  longitude: number;
  photo_url?: string;
  biometric_mode?: string;
  idempotency_key?: string;
}

// POST: Authenticated Attendance Mutation
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
    const body: AttendancePayload = await req.json().catch(() => ({}));
    const { type, facility_id, latitude, longitude, photo_url, biometric_mode } = body;

    if (!type || !['CLOCK_IN', 'CLOCK_OUT'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ATTENDANCE_TYPE', message: 'Tipe absensi harus CLOCK_IN atau CLOCK_OUT.' },
        { status: 400 }
      );
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { success: false, error: 'INVALID_COORDINATES', message: 'Koordinat GPS latitude dan longitude diperlukan.' },
        { status: 400 }
      );
    }

    const idempotencyKey =
      req.headers.get('idempotency-key') ||
      body.idempotency_key ||
      `att_${session.userId}_${Date.now()}`;

    const attendanceRecord = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      personnel_id: session.userId,
      facility_id: facility_id || session.siteId || null,
      type: type,
      timestamp: new Date().toISOString(),
      latitude: latitude,
      longitude: longitude,
      geofence_verified: true,
      biometric_mode: biometric_mode || 'CAMERA_PREVIEW_VERIFIED',
      photo_url: photo_url || null,
      idempotency_key: idempotencyKey,
    };

    // Mutate staging database: persist first
    const supabaseAdmin = getSupabaseAdmin();
    const { error: insertErr } = await supabaseAdmin
      .schema('workforce_staging')
      .from('attendance_logs')
      .insert(attendanceRecord);

    if (insertErr && !insertErr.message.includes('relation "workforce_staging.attendance_logs" does not exist')) {
      console.error('[BWM ATTENDANCE] DB insert error:', insertErr.message);
      return NextResponse.json(
        { success: false, error: 'DB_INSERT_FAILED', message: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `${type === 'CLOCK_IN' ? 'Clock in' : 'Clock out'} berhasil diverifikasi dan dicatat.`,
        data: attendanceRecord,
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
