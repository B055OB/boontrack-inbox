import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseClient";

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

interface WhatsAppConnectionConfig {
  provider: "EVOLUTION" | "WABA";
  mode: "SHARED" | "DEDICATED";
  instance_name: string;
  phone_number: string | null;
  fromDb: boolean;
}


function sanitizeMerchantPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const clean = String(phone).replace(/\D/g, "");
  if (clean.includes("85179555449") || clean.includes("85139555449") || clean.includes("1268977686299719")) {
    return null;
  }
  return clean;
}

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

/**
 * 1. Query Supabase Registry (whatsapp_connections)
 * Mengambil authority instance_name, provider, dan mode.
 * Jika tidak ditemukan di database, default otomatis ke shared gateway "boontrack-gateway".
 */
async function getTenantConnectionRegistry(tenantSlug: string): Promise<WhatsAppConnectionConfig> {
  const defaultFallback: WhatsAppConnectionConfig = {
    provider: "EVOLUTION",
    mode: "SHARED",
    instance_name: EVOLUTION_GATEWAY_INSTANCE,
    phone_number: null,
    fromDb: false,
  };

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return defaultFallback;

    const { data, error } = await supabase
      .from("whatsapp_connections")
      .select("provider, mode, instance_name, phone_number, status")
      .eq("tenant_id", tenantSlug)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data && data.instance_name) {
      return {
        provider: (data.provider as "EVOLUTION" | "WABA") || "EVOLUTION",
        mode: (data.mode as "SHARED" | "DEDICATED") || "SHARED",
        instance_name: String(data.instance_name).trim(),
        phone_number: data.phone_number || null,
        fromDb: true,
      };
    }
  } catch (err) {
    console.warn("[WhatsAppConnect] Registry lookup error, falling back to default:", err);
  }

  return defaultFallback;
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

    // ── 1. AMBIL OTORITAS MAPPING DARI SUPABASE REGISTRY ─────────────────────────
    const registryConfig = await getTenantConnectionRegistry(tenantSlug);
    const targetInstance = registryConfig.instance_name;
    const provider = registryConfig.provider;
    const mode = registryConfig.mode;

    console.log(
      `[WhatsAppConnect] Tenant: ${tenantSlug} -> Instance: ${targetInstance} (Provider: ${provider}, Mode: ${mode})`
    );

    // ── 2. CEK STATUS KONEKSI AKTIF KE EVOLUTION API ─────────────────────────────
    let stateCheck = await checkConnectionState(targetInstance);

    // Fallback: Jika instance yang dimapping bukan boontrack-gateway dan belum open,
    // periksa apakah shared gateway utama berstatus open.
    let activeInstanceName = targetInstance;
    let isConnected = stateCheck.state === "open" || stateCheck.state === "CONNECTED";

    // KUNCI: Jangan pernah hijack toko tenant ke platform shared gateway!
    // Merchant hanya boleh melihat status koneksi toko mereka sendiri.

    // ── 3. HANDLER RELOAD / RESET ───────────────────────────────────────────────
    if (isReload) {
      console.log(`[WhatsAppConnect] Reload requested for tenant: ${tenantSlug}`);

      // Jika sesi sudah open/CONNECTED, JANGAN hapus instance — return CONNECTED langsung
      if (isConnected) {
        const info = await fetchInstanceInfo(activeInstanceName);
        const resolvedPhone =
          sanitizeMerchantPhone(registryConfig.phone_number || cleanPhoneJid(info?.ownerJid || stateCheck.data?.instance?.ownerJid));

        return NextResponse.json({
          success: true,
          status: "CONNECTED",
          provider,
          mode,
          instance_name: activeInstanceName,
          phone_number: resolvedPhone,
          tenant_slug: tenantSlug,
          connected_phone: resolvedPhone,
          reloaded: false,
          note: "Session already active.",
        });
      }

      // Hanya izinkan reset jika instance bersifat DEDICATED (bukan shared gateway)
      if (mode === "DEDICATED" && targetInstance !== EVOLUTION_GATEWAY_INSTANCE) {
        console.log(`[WhatsAppConnect] Resetting dedicated instance: ${targetInstance}`);
        await deleteInstance(targetInstance);
        await new Promise((resolve) => setTimeout(resolve, 600));
        await createInstance(targetInstance);
      }

      // Fetch fresh QR connect
      const connectResult = await fetchConnect(targetInstance);
      const rawBase64 =
        connectResult.data?.base64 ||
        connectResult.data?.qrcode?.base64 ||
        null;
      const base64 = cleanBase64(rawBase64);
      const code = connectResult.data?.code || connectResult.data?.qrcode?.code || null;

      return NextResponse.json({
        success: true,
        status: "CONNECTING",
        provider,
        mode,
        instance_name: targetInstance,
        phone_number: null,
        base64,
        code,
        tenant_slug: tenantSlug,
        reloaded: true,
      });
    }

    // ── 4. REGULAR FLOW: KONEKSI SUDAH OPEN ─────────────────────────────────────
    if (isConnected) {
      const info = await fetchInstanceInfo(activeInstanceName);
      const resolvedPhone =
        registryConfig.phone_number ||
        cleanPhoneJid(info?.ownerJid || stateCheck.data?.instance?.ownerJid) ||
        "6281237450222";

      return NextResponse.json({
        success: true,
        status: "CONNECTED",
        provider,
        mode,
        instance_name: activeInstanceName,
        phone_number: resolvedPhone,
        tenant_slug: tenantSlug,
        connected_phone: resolvedPhone,
        base64: null,
        code: null,
      });
    }

    // ── 5. REGULAR FLOW: INSTANCE BELUM OPEN (AMBIL QR CODE / CONNECT TOKEN) ────
    if (stateCheck.status === 404) {
      console.log(`[WhatsAppConnect] Instance ${targetInstance} not found (404), creating fresh instance...`);
      await createInstance(targetInstance);
    }

    let connectResult = await fetchConnect(targetInstance);
    if (connectResult.status === 404) {
      await createInstance(targetInstance);
      connectResult = await fetchConnect(targetInstance);
    }

    const { data } = connectResult;
    const instanceState = data?.instance?.state || data?.state || data?.status;
    if (instanceState === "open" || instanceState === "CONNECTED") {
      const resolvedPhone =
        sanitizeMerchantPhone(cleanPhoneJid(data?.instance?.ownerJid || data?.connected_phone) || registryConfig.phone_number);

      return NextResponse.json({
        success: true,
        status: "CONNECTED",
        provider,
        mode,
        instance_name: targetInstance,
        phone_number: resolvedPhone,
        tenant_slug: tenantSlug,
        connected_phone: resolvedPhone,
        base64: null,
        code: null,
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

    if (!base64 && connectResult.status === 200) {
      const restartUrl = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/restart/${encodeURIComponent(targetInstance)}`;
      await fetch(restartUrl, {
        method: "POST",
        headers: { apikey: EVOLUTION_API_KEY },
      }).catch(() => null);

      await new Promise((resolve) => setTimeout(resolve, 800));
      const retryConn = await fetchConnect(targetInstance);
      const retryBase64 = cleanBase64(
        retryConn.data?.base64 || retryConn.data?.qrcode?.base64
      );
      if (retryBase64) {
        return NextResponse.json({
          success: true,
          status: "CONNECTING",
          provider,
          mode,
          instance_name: targetInstance,
          phone_number: null,
          base64: retryBase64,
          code: retryConn.data?.code || null,
          tenant_slug: tenantSlug,
        });
      }
    }

    return NextResponse.json({
      success: true,
      status: "CONNECTING",
      provider,
      mode,
      instance_name: targetInstance,
      phone_number: null,
      base64,
      code,
      tenant_slug: tenantSlug,
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