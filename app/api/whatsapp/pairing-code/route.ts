import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL ||
  "https://evolution-api-production-abb7.up.railway.app";
const EVOLUTION_API_KEY =
  process.env.EVOLUTION_API_KEY ||
  "4398809d97f770b1a2b243ed0ee33bf3312d02dec42be8789ea3512f487f4c5e";

const EVOLUTION_GATEWAY_INSTANCE =
  process.env.EVOLUTION_GATEWAY_INSTANCE || "boontrack-gateway";

async function checkConnectionState(instanceName: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: EVOLUTION_API_KEY },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return { status: 500, state: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  const state: string | null = data?.instance?.state || data?.state || null;
  return { status: res.status, state, data };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPairing(instanceName: string, phone: string): Promise<{ status: number; data: any }> {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(phone)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: EVOLUTION_API_KEY,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return { status: 500, data: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function recreateInstanceForPairing(instanceName: string, phone: string) {
  const coreBase = (
    process.env.CORE_API_URL ||
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    "https://api.boontrack.com"
  ).replace(/\/$/, "");

  // Delete previous instance
  await fetch(`${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
    headers: { apikey: EVOLUTION_API_KEY },
  }).catch(() => null);

  await new Promise((r) => setTimeout(r, 600));

  // Re-create instance configured with number and qrcode: false
  await fetch(`${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      number: phone,
      qrcode: false,
      webhook: `${coreBase}/webhook/whatsapp`,
      webhook_by_events: false,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    }),
  }).catch(() => null);

  await new Promise((r) => setTimeout(r, 800));

  // Connect to retrieve pairing code
  return await fetchPairing(instanceName, phone);
}

function extractPairingCode(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const raw =
    (data.pairingCode as string) ||
    (data.code as string) ||
    ((data.qrcode as Record<string, unknown>)?.pairingCode as string) ||
    null;

  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();

  // Filter out QR code strings: ignore if contains '@', '=', or length > 12
  if (trimmed.includes("@") || trimmed.includes("=") || trimmed.length > 12) {
    return null;
  }

  // Official pairing code format (e.g. EBX3TAQL, XXXX-XXXX, or 8 alphanumeric chars)
  const isValid =
    /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(trimmed) ||
    /^[A-Za-z0-9]{8}$/.test(trimmed) ||
    (trimmed.length >= 8 && trimmed.length <= 10 && !/[^A-Za-z0-9-]/.test(trimmed));

  return isValid ? trimmed : null;
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
        { success: false, error: "Missing required parameter: tenant slug" },
        { status: 400 }
      );
    }

    // ── 1. CEK STATUS KONEKSI AKTIF (FALLBACK KE GATEWAY UTAMA) ────────────────
    // Jika instance per-tenant sudah open
    const directCheck = await checkConnectionState(tenantSlug);
    if (directCheck.state === "open" || directCheck.state === "CONNECTED") {
      return NextResponse.json({
        success: true,
        status: "CONNECTED",
        connected: true,
        message: "WhatsApp sudah terhubung aktif.",
        tenant_slug: tenantSlug,
        instance: tenantSlug,
      });
    }

    // Jika variasi tenant_{slug} sudah open
    if (!tenantSlug.startsWith("tenant_")) {
      const prefCheck = await checkConnectionState(`tenant_${tenantSlug}`);
      if (prefCheck.state === "open" || prefCheck.state === "CONNECTED") {
        return NextResponse.json({
          success: true,
          status: "CONNECTED",
          connected: true,
          message: "WhatsApp sudah terhubung aktif.",
          tenant_slug: tenantSlug,
          instance: `tenant_${tenantSlug}`,
        });
      }
    }

    // Jika shared gateway utama sudah open
    if (EVOLUTION_GATEWAY_INSTANCE) {
      const gwCheck = await checkConnectionState(EVOLUTION_GATEWAY_INSTANCE);
      if (gwCheck.state === "open" || gwCheck.state === "CONNECTED") {
        return NextResponse.json({
          success: true,
          status: "CONNECTED",
          connected: true,
          message: "WhatsApp sudah terhubung aktif melalui BoonTrack WhatsApp Engine.",
          tenant_slug: tenantSlug,
          instance: EVOLUTION_GATEWAY_INSTANCE,
        });
      }
    }

    // ── 2. PROSES GENERATE PAIRING CODE ──────────────────────────────────────
    const rawPhone =
      body.phone ||
      body.phone_number ||
      body.phoneNumber ||
      searchParams.get("phone") ||
      "";

    // Normalisasi nomor telepon: E.164 (628...)
    let cleanPhone = String(rawPhone).replace(/\D/g, "");
    if (cleanPhone.startsWith("08")) {
      cleanPhone = "628" + cleanPhone.slice(2);
    } else if (cleanPhone.startsWith("0")) {
      cleanPhone = "62" + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith("62") && cleanPhone.length > 0) {
      cleanPhone = "62" + cleanPhone;
    }

    if (!cleanPhone || cleanPhone.length < 9) {
      return NextResponse.json(
        { success: false, error: "Nomor WhatsApp tidak valid. Format: 628xxxxxxxxxx" },
        { status: 400 }
      );
    }

    const targetInstance = tenantSlug;

    // Coba panggil connect dengan number
    let pairingResult = await fetchPairing(targetInstance, cleanPhone);
    let pairingCode = extractPairingCode(pairingResult.data);

    // Jika belum dapat, poll 1 kali jeda 1 detik (Baileys async generation)
    if (!pairingCode && pairingResult.status === 200) {
      await new Promise((r) => setTimeout(r, 1200));
      pairingResult = await fetchPairing(targetInstance, cleanPhone);
      pairingCode = extractPairingCode(pairingResult.data);
    }

    // Jika masih belum terbit atau instance belum ada (404), re-inisialisasi instance khusus pairing
    if (!pairingCode) {
      console.log(`[WhatsAppPairing] Inisialisasi pairing koneksi dengan nomor untuk instance: ${targetInstance}`);
      const retryResult = await recreateInstanceForPairing(targetInstance, cleanPhone);
      pairingCode = extractPairingCode(retryResult.data);

      // Poll sekali lagi jika Baileys sedang menerbitkan kode
      if (!pairingCode) {
        await new Promise((r) => setTimeout(r, 1200));
        const finalPoll = await fetchPairing(targetInstance, cleanPhone);
        pairingCode = extractPairingCode(finalPoll.data);
      }
    }

    if (pairingCode) {
      return NextResponse.json({
        success: true,
        pairing_code: pairingCode,
        tenant_slug: tenantSlug,
      });
    }

    // Jika engine masih warming up
    return NextResponse.json(
      {
        success: false,
        retry: true,
        error:
          "BoonTrack Engine sedang menyiapkan koneksi WhatsApp. Silakan tunggu beberapa detik lalu klik Dapatkan Kode sekali lagi atau gunakan Scan QR Code di atas.",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    let msg = err instanceof Error ? err.message : "Gagal berkomunikasi dengan BoonTrack Engine";
    msg = msg.replace(/Evolution API/gi, "BoonTrack Engine").replace(/socket/gi, "koneksi");
    return NextResponse.json(
      {
        success: false,
        retry: true,
        error: msg,
      },
      { status: 200 }
    );
  }
}

export const GET = POST;
