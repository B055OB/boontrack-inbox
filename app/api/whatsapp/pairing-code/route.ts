import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL ||
  "https://evolution-api-production-abb7.up.railway.app";
const EVOLUTION_API_KEY =
  process.env.EVOLUTION_API_KEY ||
  "4398809d97f770b1a2b243ed0ee33bf3312d02dec42be8789ea3512f487f4c5e";

async function fetchPairing(instanceName: string, phone: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(phone)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: EVOLUTION_API_KEY,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return { status: 500, data: {} };
  const data = await res.json().catch(() => ({}));
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

  // Re-create instance configured with number
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

    // Instance name wajib dinamis membaca slug tenant aktif 1:1
    const targetInstance = tenantSlug;

    // 1. Coba ambil pairing code via GET /instance/connect/${targetInstance}?number=${cleanPhone}
    let pairingResult = await fetchPairing(targetInstance, cleanPhone);

    let pairingCode =
      pairingResult.data?.pairingCode ||
      pairingResult.data?.code ||
      pairingResult.data?.qrcode?.pairingCode ||
      null;

    // Filter kode: jika kode berupa QR string mentah (mengandung @ atau panjang > 12), abaikan
    if (typeof pairingCode === "string" && (pairingCode.includes("@") || pairingCode.includes("=") || pairingCode.length > 12)) {
      pairingCode = null;
    }

    // 2. Jika pairingCode belum terbit atau instance 404, re-inisialisasi instance dengan number parameter
    if (!pairingCode) {
      console.log(`[WhatsAppPairing] Inisialisasi pairing koneksi dengan nomor untuk instance: ${targetInstance}`);
      const retryResult = await recreateInstanceForPairing(targetInstance, cleanPhone);
      pairingCode =
        retryResult.data?.pairingCode ||
        retryResult.data?.code ||
        retryResult.data?.qrcode?.pairingCode ||
        null;

      if (typeof pairingCode === "string" && (pairingCode.includes("@") || pairingCode.includes("=") || pairingCode.length > 12)) {
        pairingCode = null;
      }
    }

    // Validasi format resmi 8 digit alfanumerik (misal: XXXX-XXXX atau 8 karakter)
    let cleanPairingCode: string | null = null;
    if (pairingCode && typeof pairingCode === "string") {
      const trimmed = pairingCode.trim();
      const isValid =
        /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(trimmed) ||
        /^[A-Za-z0-9]{8}$/.test(trimmed) ||
        (trimmed.length >= 8 && trimmed.length <= 10 && !/[^A-Za-z0-9-]/.test(trimmed));

      if (isValid) {
        cleanPairingCode = trimmed;
      }
    }

    if (cleanPairingCode) {
      return NextResponse.json({
        success: true,
        pairing_code: cleanPairingCode,
        tenant_slug: tenantSlug,
      });
    }

    // Jika koneksi masih warming up
    return NextResponse.json(
      {
        success: false,
        retry: true,
        error:
          "BoonTrack Engine sedang menyiapkan koneksi WhatsApp. Silakan tunggu beberapa detik lalu coba lagi atau gunakan Scan QR Code di atas.",
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
