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

  // Jika sudah merupakan format data URI data:image/png;base64,...
  if (trimmed.startsWith("data:image/png;base64,")) {
    return trimmed;
  }

  // Jika memiliki prefix data URI lain (misal data:image/jpeg atau data:application/...)
  if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx !== -1) {
      return `data:image/png;base64,${trimmed.slice(commaIdx + 1)}`;
    }
  }

  // Base64 mentah tanpa prefix
  return `data:image/png;base64,${trimmed}`;
}

async function fetchConnect(instanceName: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: EVOLUTION_API_KEY,
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { res, data, url };
}

async function createInstance(instanceName: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/create`;
  const coreBase = (
    process.env.CORE_API_URL ||
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    "https://boontrack-core-production.up.railway.app"
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
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let tenantSlug = searchParams.get("tenant")?.trim();

    if (!tenantSlug) {
      const body = await req.json().catch(() => ({}));
      tenantSlug = (body.tenant || body.tenant_slug || "")?.trim();
    }

    if (!tenantSlug) {
      return NextResponse.json(
        {
          success: false,
          status: "DISCONNECTED",
          error: "Missing required parameter: tenant",
        },
        { status: 400 }
      );
    }

    // 1. Coba hubungkan ke instance dengan nama tenantSlug
    let connectResult = await fetchConnect(tenantSlug);
    let targetInstance = tenantSlug;

    // Jika 404 dan slug belum memiliki prefix "tenant_", periksa apakah ada instance "tenant_{slug}"
    if (connectResult.res.status === 404 && !tenantSlug.startsWith("tenant_")) {
      const fallbackResult = await fetchConnect(`tenant_${tenantSlug}`);
      if (fallbackResult.res.ok || fallbackResult.res.status !== 404) {
        connectResult = fallbackResult;
        targetInstance = `tenant_${tenantSlug}`;
      }
    }

    // 2. Jika instance belum ada di Evolution API (404), buat instance baru
    if (connectResult.res.status === 404) {
      const createResult = await createInstance(tenantSlug);
      targetInstance = tenantSlug;

      if (createResult.data?.qrcode?.base64 || createResult.data?.qrcode?.code) {
        connectResult = {
          res: createResult.res,
          data: {
            base64: createResult.data.qrcode.base64,
            code: createResult.data.qrcode.code,
            pairingCode: createResult.data.qrcode.pairingCode,
            instance: createResult.data.instance,
          },
          url: `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(tenantSlug)}`,
        };
      } else {
        // Fetch ulang setelah create
        connectResult = await fetchConnect(tenantSlug);
      }
    }

    const { res, data } = connectResult;

    // Periksa status instance jika sudah open / terhubung
    const instanceState =
      data.instance?.state ||
      data.state ||
      data.status ||
      data.instance?.status;

    if (instanceState === "open" || instanceState === "CONNECTED") {
      return NextResponse.json({
        success: true,
        tenant_slug: tenantSlug,
        instance: targetInstance,
        status: "CONNECTED",
        base64: null,
        code: null,
        connected_phone: data.instance?.ownerJid || data.connected_phone || null,
      });
    }

    // Ekstraksi dan sanitasi QR base64 & code
    const rawBase64 =
      data.base64 ||
      data.qrcode?.base64 ||
      data.qr_image ||
      data.qr_raw ||
      data.qr ||
      null;

    const base64 = cleanBase64(rawBase64);

    const code =
      data.code ||
      data.pairingCode ||
      data.qrcode?.code ||
      data.qrcode?.pairingCode ||
      null;

    if (!base64 && !code && !res.ok) {
      return NextResponse.json(
        {
          success: false,
          status: "DISCONNECTED",
          error:
            data.error ||
            data.response?.message?.[0] ||
            data.message ||
            `Evolution API Error (${res.status})`,
          detail: data,
        },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "CONNECTING",
      base64,
      code,
      tenant_slug: tenantSlug,
      instance: targetInstance,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        status: "DISCONNECTED",
        disconnect_reason: "GATEWAY_UNREACHABLE",
        error: err.message || "Gagal berkomunikasi dengan Evolution API",
      },
      { status: 502 }
    );
  }
}

export const GET = POST;