import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL ||
  "https://evolution-api-production-abb7.up.railway.app";
const EVOLUTION_API_KEY =
  process.env.EVOLUTION_API_KEY ||
  "4398809d97f770b1a2b243ed0ee33bf3312d02dec42be8789ea3512f487f4c5e";

// Instance fallback gateway Baileys utama BoonTrack
const EVOLUTION_GATEWAY_INSTANCE =
  process.env.EVOLUTION_GATEWAY_INSTANCE || "boontrack-gateway";

function cleanPhoneJid(jid?: string | null): string | null {
  if (!jid || typeof jid !== "string") return null;
  const match = jid.match(/^(\d+)/);
  return match ? match[1] : jid.replace(/\D/g, "") || null;
}

function cleanBase64(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:image/png;base64,")) return trimmed;
  if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx !== -1) {
      return `data:image/png;base64,${trimmed.slice(commaIdx + 1)}`;
    }
  }
  return `data:image/png;base64,${trimmed}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkConnectionState(instanceName: string): Promise<{ status: number; state: string | null; data: any }> {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: EVOLUTION_API_KEY },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return { status: 500, state: null, data: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  const state: string | null = data?.instance?.state || data?.state || null;
  return { status: res.status, state, data };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchInstanceInfo(instanceName: string): Promise<any | null> {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: EVOLUTION_API_KEY },
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any = await res.json().catch(() => null);
  if (Array.isArray(list) && list.length > 0) {
    return list[0];
  }
  return null;
}

async function deleteInstance(instanceName: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/delete/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { apikey: EVOLUTION_API_KEY },
  }).catch(() => null);
  if (!res) return { ok: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function createInstance(instanceName: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/create`;
  const coreBase = (
    process.env.CORE_API_URL ||
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    "https://api.boontrack.com"
  ).replace(/\/$/, "");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      webhook: `${coreBase}/webhook/whatsapp`,
      webhook_by_events: false,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    }),
  }).catch(() => null);

  if (!res) return { ok: false, data: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchConnect(instanceName: string): Promise<{ status: number; data: any }> {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: EVOLUTION_API_KEY },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return { status: 500, data: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

/**
 * Resolusi instance WhatsApp:
 * 1. Cek instance per-tenant ({tenantSlug} atau tenant_{tenantSlug})
 * 2. Jika tidak terhubung / belum ada, cek shared gateway (boontrack-gateway)
 */
async function resolveConnectedInstance(tenantSlug: string): Promise<{
  instanceName: string;
  state: string | null;
  httpStatus: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  ownerJid: string | null;
  isSharedGateway: boolean;
}> {
  // 1. Cek instance per-tenant ({tenantSlug})
  const directCheck = await checkConnectionState(tenantSlug);
  if (directCheck.state === "open" || directCheck.state === "CONNECTED") {
    const info = await fetchInstanceInfo(tenantSlug);
    return {
      instanceName: tenantSlug,
      state: directCheck.state,
      httpStatus: directCheck.status,
      data: directCheck.data,
      ownerJid: cleanPhoneJid(info?.ownerJid || directCheck.data?.instance?.ownerJid),
      isSharedGateway: false,
    };
  }

  // 1b. Cek variasi prefix tenant_{tenantSlug} jika ada
  if (!tenantSlug.startsWith("tenant_")) {
    const prefixedSlug = `tenant_${tenantSlug}`;
    const prefCheck = await checkConnectionState(prefixedSlug);
    if (prefCheck.state === "open" || prefCheck.state === "CONNECTED") {
      const info = await fetchInstanceInfo(prefixedSlug);
      return {
        instanceName: prefixedSlug,
        state: prefCheck.state,
        httpStatus: prefCheck.status,
        data: prefCheck.data,
        ownerJid: cleanPhoneJid(info?.ownerJid || prefCheck.data?.instance?.ownerJid),
        isSharedGateway: false,
      };
    }
  }

  // 2. Cek shared gateway utama (boontrack-gateway)
  if (EVOLUTION_GATEWAY_INSTANCE && EVOLUTION_GATEWAY_INSTANCE !== tenantSlug) {
    const gatewayCheck = await checkConnectionState(EVOLUTION_GATEWAY_INSTANCE);
    if (gatewayCheck.state === "open" || gatewayCheck.state === "CONNECTED") {
      const info = await fetchInstanceInfo(EVOLUTION_GATEWAY_INSTANCE);
      return {
        instanceName: EVOLUTION_GATEWAY_INSTANCE,
        state: gatewayCheck.state,
        httpStatus: gatewayCheck.status,
        data: gatewayCheck.data,
        ownerJid: cleanPhoneJid(info?.ownerJid || gatewayCheck.data?.instance?.ownerJid),
        isSharedGateway: true,
      };
    }
  }

  // 3. Fallback: tidak ada yang connected
  return {
    instanceName: tenantSlug,
    state: directCheck.state,
    httpStatus: directCheck.status,
    data: directCheck.data,
    ownerJid: null,
    isSharedGateway: false,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const rawTenant =
      searchParams.get("tenant") ||
      searchParams.get("slug") ||
      body.tenant ||
      body.tenant_slug ||
      body.slug ||
      "";
    const tenantSlug = typeof rawTenant === "string" ? rawTenant.trim() : "";

    if (!tenantSlug) {
      return NextResponse.json(
        {
          success: false,
          status: "DISCONNECTED",
          error: "Missing required parameter: tenant slug",
        },
        { status: 400 }
      );
    }

    const isReload =
      searchParams.get("action") === "reload" ||
      searchParams.get("action") === "reset" ||
      searchParams.get("reload") === "true" ||
      body.action === "reload" ||
      body.action === "reset";

    // ── FLOW 1: RELOAD / RESET ────────────────────────────────────────────────
    if (isReload) {
      console.log(`[WhatsAppConnect] Reload requested for tenant: ${tenantSlug}`);

      // SAFETY CHECK: Periksa koneksi aktif sebelum mereset apapun.
      // Jika instance (per-tenant atau shared boontrack-gateway) sudah CONNECTED ("open"),
      // langsung kembalikan status CONNECTED tanpa mereset sesi.
      const resolved = await resolveConnectedInstance(tenantSlug);
      if (resolved.state === "open" || resolved.state === "CONNECTED") {
        console.log(`[WhatsAppConnect] Instance "${resolved.instanceName}" already connected. Skipping reset.`);
        return NextResponse.json({
          success: true,
          status: "CONNECTED",
          tenant_slug: tenantSlug,
          instance: resolved.instanceName,
          connected_phone: resolved.ownerJid,
          reloaded: false,
          note: "Session already active.",
        });
      }

      // Jangan pernah menghapus shared gateway instance utama
      const isSharedGateway = tenantSlug === EVOLUTION_GATEWAY_INSTANCE;
      if (!isSharedGateway) {
        console.log(`[WhatsAppConnect] Resetting per-tenant instance: ${tenantSlug}`);
        await deleteInstance(tenantSlug);
        await new Promise((resolve) => setTimeout(resolve, 600));
        await createInstance(tenantSlug);
      }

      // Fetch fresh QR connect untuk instance per-tenant
      const connectResult = await fetchConnect(tenantSlug);
      const rawBase64 =
        connectResult.data?.base64 ||
        connectResult.data?.qrcode?.base64 ||
        null;
      const base64 = cleanBase64(rawBase64);
      const code = connectResult.data?.code || connectResult.data?.qrcode?.code || null;

      return NextResponse.json({
        success: true,
        status: "CONNECTING",
        base64,
        code,
        tenant_slug: tenantSlug,
        instance: tenantSlug,
        reloaded: true,
      });
    }

    // ── FLOW 2: REGULAR CHECK ─────────────────────────────────────────────────
    // Cek status koneksi: prioritaskan per-tenant, fallback ke boontrack-gateway jika open
    const resolved = await resolveConnectedInstance(tenantSlug);

    if (resolved.state === "open" || resolved.state === "CONNECTED") {
      return NextResponse.json({
        success: true,
        tenant_slug: tenantSlug,
        instance: resolved.instanceName,
        status: "CONNECTED",
        base64: null,
        code: null,
        connected_phone: resolved.ownerJid,
      });
    }

    // Instance per-tenant tidak ditemukan (404) — buat instance baru
    if (resolved.httpStatus === 404) {
      console.log(`[WhatsAppConnect] Instance ${tenantSlug} not found (404), creating fresh instance...`);
      await createInstance(tenantSlug);
    }

    // Ambil QR code / connect token
    let connectResult = await fetchConnect(tenantSlug);

    // Coba create dan connect ulang jika connectResult 404
    if (connectResult.status === 404) {
      await createInstance(tenantSlug);
      connectResult = await fetchConnect(tenantSlug);
    }

    const { data } = connectResult;

    // Cek apakah respons connect langsung open
    const instanceState = data?.instance?.state || data?.state || data?.status;
    if (instanceState === "open" || instanceState === "CONNECTED") {
      return NextResponse.json({
        success: true,
        tenant_slug: tenantSlug,
        instance: tenantSlug,
        status: "CONNECTED",
        base64: null,
        code: null,
        connected_phone: cleanPhoneJid(data?.instance?.ownerJid || data?.connected_phone),
      });
    }

    const rawBase64 =
      data?.base64 ||
      data?.qrcode?.base64 ||
      data?.qr_image ||
      data?.qr ||
      null;

    const base64 = cleanBase64(rawBase64);
    const code = data?.code || data?.pairingCode || data?.qrcode?.code || null;

    // Jika base64 belum terbit pada status 200, restart instance sekali agar token terbit
    if (!base64 && connectResult.status === 200) {
      const restartUrl = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/restart/${encodeURIComponent(tenantSlug)}`;
      await fetch(restartUrl, {
        method: "POST",
        headers: { apikey: EVOLUTION_API_KEY },
      }).catch(() => null);

      await new Promise((resolve) => setTimeout(resolve, 800));
      const retryConn = await fetchConnect(tenantSlug);
      const retryBase64 = cleanBase64(
        retryConn.data?.base64 || retryConn.data?.qrcode?.base64
      );
      if (retryBase64) {
        return NextResponse.json({
          success: true,
          status: "CONNECTING",
          base64: retryBase64,
          code: retryConn.data?.code || null,
          tenant_slug: tenantSlug,
          instance: tenantSlug,
        });
      }
    }

    return NextResponse.json({
      success: true,
      status: "CONNECTING",
      base64,
      code,
      tenant_slug: tenantSlug,
      instance: tenantSlug,
    });
  } catch (err: unknown) {
    let msg =
      err instanceof Error ? err.message : "Gagal berkomunikasi dengan BoonTrack Engine";
    msg = msg
      .replace(/Evolution API/gi, "BoonTrack Engine")
      .replace(/socket/gi, "koneksi");
    return NextResponse.json(
      {
        success: false,
        status: "DISCONNECTED",
        disconnect_reason: "GATEWAY_UNREACHABLE",
        error: msg,
      },
      { status: 502 }
    );
  }
}

export const GET = POST;