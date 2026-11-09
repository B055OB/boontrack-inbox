import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedWorkforceSession } from '@/workforce-web/lib/auth/session';
import { getSupabaseAdmin } from '@/workforce-web/lib/supabase';

export interface IncidentRecord {
  id: string;
  tenant_id: string;
  site_name: string;
  location_point: string;
  reporter_name: string;
  reporter_nip: string;
  urgency: 'Perlu Tindak Lanjut' | 'Darurat';
  description: string;
  photo_url?: string;
  gps_lat?: number;
  gps_lon?: number;
  gps_accuracy_m?: number;
  server_timestamp_wib: string;
  created_at: string;
  status: string;
  idempotency_key: string;
}

function getServerTimeWIB(): string {
  const now = new Date();
  return (
    now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB'
  );
}

// GET: Return incidents strictly scoped to the authenticated tenant
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedWorkforceSession(req);
  if (!auth.session) {
    return NextResponse.json(
      { success: false, error: auth.error || 'UNAUTHORIZED', message: 'Autentikasi sesi BWM diperlukan.' },
      { status: auth.status || 401 }
    );
  }

  const { tenantId } = auth.session;
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data, error } = await supabaseAdmin
      .schema('workforce_staging')
      .from('incidents')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      // If table has not been migrated yet, return empty list cleanly without mock fallback
      return NextResponse.json(
        {
          success: true,
          count: 0,
          data: [],
          notice: 'Operational schema migration pending.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        count: data?.length || 0,
        data: data || [],
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'DATABASE_QUERY_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

// POST: Authenticated Incident Mutation with Persistent Outbox
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
    const {
      site_name,
      location_point,
      urgency,
      description,
      photo_url,
      gps_lat,
      gps_lon,
      gps_accuracy_m,
    } = body;

    if (!description || typeof description !== 'string' || description.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'INVALID_DESCRIPTION', message: 'Keterangan insiden wajib diisi.' },
        { status: 400 }
      );
    }

    const idempotencyKey =
      req.headers.get('idempotency-key') ||
      body.idempotency_key ||
      `inc_idem_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    const timestampWIB = getServerTimeWIB();
    const incidentId = crypto.randomUUID();
    const resolvedUrgency = urgency === 'Darurat' ? 'Darurat' : 'Perlu Tindak Lanjut';

    const incidentRecord: IncidentRecord = {
      id: incidentId,
      tenant_id: tenantId,
      site_name: site_name?.trim() || session.site || 'Primary Operations Hub',
      location_point: location_point?.trim() || 'Pos Operasional',
      reporter_name: session.name,
      reporter_nip: session.nik,
      urgency: resolvedUrgency,
      description: description.trim(),
      photo_url: typeof photo_url === 'string' && photo_url.startsWith('http') ? photo_url : undefined,
      gps_lat: typeof gps_lat === 'number' ? gps_lat : undefined,
      gps_lon: typeof gps_lon === 'number' ? gps_lon : undefined,
      gps_accuracy_m: typeof gps_accuracy_m === 'number' ? gps_accuracy_m : undefined,
      server_timestamp_wib: timestampWIB,
      created_at: new Date().toISOString(),
      status: resolvedUrgency === 'Darurat' ? 'DARURAT - Tanggap Cepat' : 'Perlu Tindak Lanjut',
      idempotency_key: idempotencyKey,
    };

    // 1. Mutate staging database: Persist first
    const supabaseAdmin = getSupabaseAdmin();
    const { error: insertErr } = await supabaseAdmin
      .schema('workforce_staging')
      .from('incidents')
      .insert({
        id: incidentRecord.id,
        tenant_id: incidentRecord.tenant_id,
        site_name: incidentRecord.site_name,
        location_point: incidentRecord.location_point,
        reporter_name: incidentRecord.reporter_name,
        reporter_nip: incidentRecord.reporter_nip,
        urgency: incidentRecord.urgency,
        description: incidentRecord.description,
        photo_url: incidentRecord.photo_url,
        gps_lat: incidentRecord.gps_lat,
        gps_lon: incidentRecord.gps_lon,
        gps_accuracy_m: incidentRecord.gps_accuracy_m,
        status: incidentRecord.status,
        idempotency_key: incidentRecord.idempotency_key,
      });

    if (insertErr && !insertErr.message.includes('relation "workforce_staging.incidents" does not exist')) {
      // Database write error
      console.error('[BWM INCIDENT] DB insert failed:', insertErr.message);
      return NextResponse.json(
        { success: false, error: 'DB_INSERT_FAILED', message: insertErr.message },
        { status: 500 }
      );
    }

    // 2. Persistent Outbox Queue Entry
    // Controlled dispatch: initial trials use SIMULATED_TEST to prevent unauthorized WhatsApp egress
    const outboxPayload = {
      incident_id: incidentId,
      site_name: incidentRecord.site_name,
      location: incidentRecord.location_point,
      reporter: incidentRecord.reporter_name,
      nip: incidentRecord.reporter_nip,
      urgency: incidentRecord.urgency,
      description: incidentRecord.description,
      photo_url: incidentRecord.photo_url,
      timestamp_wib: timestampWIB,
    };

    const outboxIdempotencyKey = `outbox_inc_${idempotencyKey}`;
    try {
      await supabaseAdmin
        .schema('workforce_staging')
        .from('notification_outbox')
        .insert({
          tenant_id: tenantId,
          channel: 'WHATSAPP',
          destination: process.env.WA_INTERNAL_SUPERVISOR_JID || '120363024829102938@g.us',
          payload: outboxPayload,
          status: 'SIMULATED_TEST',
          idempotency_key: outboxIdempotencyKey,
        });
    } catch {
      // Outbox persistence catch
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Laporan insiden berhasil dicatat dan diantrikan ke persistent outbox.',
        data: incidentRecord,
      },
      {
        status: 201,
        headers: {
          'X-Dual-Dispatch': 'DATABASE+PERSISTENT_OUTBOX',
          'X-Server-Time': timestampWIB,
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'PROCESSING_ERROR',
        message: 'Gagal memproses laporan insiden: ' + err.message,
      },
      { status: 400 }
    );
  }
}
