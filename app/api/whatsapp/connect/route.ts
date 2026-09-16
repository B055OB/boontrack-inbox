import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL ||
  "https://evolution-api-production-abb7.up.railway.app";
const EVOLUTION_API_KEY =
  process.env.EVOLUTION_API_KEY ||
  "4398809d97f770b1a2b243ed0ee33bf3312d02dec42be8789ea3512f487f4c5e";

function cleanBase64(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:image/png;base64,")) {
    return trimmed;
  }

  if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx !== -1) {
      return `data:image/png;base64,${trimmed.slice(commaIdx + 1)}`;
    }
  }

  return `data:image/png;base64,${trimmed}`;
}

async function checkConnectionState(instanceName: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: EVOLUTION_API_KEY },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return { status: 500, state: null };
  const data = await res.json().catch(() => ({}));
  const state = data?.instance?.state || data?.state || null;
  return { status: res.status, state, data };
}

async function deleteInstance(instanceName: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/delete/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { apikey: EVOLUTION_API_KEY },
  }).catch(() => null);

  if (!res) return { ok: false };
  const data = await res.json().catch(() => ({}));
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
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function fetchConnect(instanceName: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: EVOLUTION_API_KEY },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return { status: 500, data: {} };
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
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

    // 1. RELOAD / RESET FLOW: Bersihkan stale session storage Baileys untuk tenant aktif
    if (isReload) {
      console.log(`[WhatsAppConnect] Resetting instance session for tenant: ${tenantSlug}`);
      await deleteInstance(tenantSlug);
      // Jeda singkat untuk flush state
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Re-create instance fresh
      await createInstance(tenantSlug);

      // Fetch fresh QR connect
      const connectResult = await fetchConnect(tenantSlug);
      const rawBase64 =
        connectResult.data?.base64 ||
        connectResult.data?.qrcode?.base64 ||
        null;
      const base64 = cleanBase64(rawBase64);
      const code =
        connectResult.data?.code ||
        connectResult.data?.qrcode?.code ||
        null;

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

    // 2. REGULAR FLOW: Cek status koneksi instance di Evolution API v2
    const stateCheck = await checkConnectionState(tenantSlug);

    if (stateCheck.state === "open" || stateCheck.state === "CONNECTED") {
      return NextResponse.json({
        success: true,
        tenant_slug: tenantSlug,
        instance: tenantSlug,
        status: "CONNECTED",
        base64: null,
        code: null,
        connected_phone:
          stateCheck.data?.instance?.ownerJid ||
          stateCheck.data?.connected_phone ||
          null,
      });
    }

    // Jika instance belum ada (404), buat instance baru
    if (stateCheck.status === 404) {
      console.log(`[WhatsAppConnect] Instance ${tenantSlug} not found (404), creating fresh instance...`);
      await createInstance(tenantSlug);
    }

    // Ambil auth string / QR code connect
    let connectResult = await fetchConnect(tenantSlug);

    // Jika saat connect mengembalikan 404, create lalu connect ulang
    if (connectResult.status === 404) {
      await createInstance(tenantSlug);
      connectResult = await fetchConnect(tenantSlug);
    }

    const { data } = connectResult;

    // Periksa apakah status instance sudah open
    const instanceState =
      data?.instance?.state ||
      data?.state ||
      data?.status;

    if (instanceState === "open" || instanceState === "CONNECTED") {
      return NextResponse.json({
        success: true,
        tenant_slug: tenantSlug,
        instance: tenantSlug,
        status: "CONNECTED",
        base64: null,
        code: null,
        connected_phone: data?.instance?.ownerJid || data?.connected_phone || null,
      });
    }

    const rawBase64 =
      data?.base64 ||
      data?.qrcode?.base64 ||
      data?.qr_image ||
      data?.qr ||
      null;

    const base64 = cleanBase64(rawBase64);
    const code =
      data?.code ||
      data?.pairingCode ||
      data?.qrcode?.code ||
      null;

    // Jika base64 belum terbit, coba restart instance agar Baileys socket menerbitkan token
    if (!base64 && connectResult.status === 200) {
      const restartUrl = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/restart/${encodeURIComponent(tenantSlug)}`;
      await fetch(restartUrl, {
        method: "POST",
        headers: { apikey: EVOLUTION_API_KEY },
      }).catch(() => null);

      await new Promise((resolve) => setTimeout(resolve, 800));
      const retryConn = await fetchConnect(tenantSlug);
      const retryBase64 = cleanBase64(retryConn.data?.base64 || retryConn.data?.qrcode?.base64);
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
    const msg = err instanceof Error ? err.message : "Gagal berkomunikasi dengan Evolution API";
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