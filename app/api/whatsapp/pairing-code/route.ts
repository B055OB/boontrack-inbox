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
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function restartInstance(instanceName: string) {
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/restart/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: EVOLUTION_API_KEY,
    },
  }).catch(() => null);
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const rawTenant = searchParams.get("tenant") || body.tenant || body.tenant_slug;
    const tenantSlug = typeof rawTenant === "string" ? rawTenant.trim() : "";

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: tenant" },
        { status: 400 }
      );
    }

    const rawPhone =
      body.phone ||
      body.phone_number ||
      body.phoneNumber ||
      searchParams.get("phone") ||
      "";

    // Normalisasi nomor telepon:
    // Bersihkan karakter non-angka, spasi, tanda plus (+), atau strip (-)
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

    // Format target instance langsung presisi (tenant_{tenantSlug})
    const targetInstance = tenantSlug.startsWith("tenant_")
      ? tenantSlug
      : `tenant_${tenantSlug}`;

    // 1. Ambil pairing code pertama via GET /instance/connect/${targetInstance}?number=${cleanPhone}
    let pairingResult = await fetchPairing(targetInstance, cleanPhone);

    // Jika instance belum ada di Evolution API (404), buat instance terlebih dahulu
    if (pairingResult.res.status === 404) {
      await fetch(`${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          instanceName: targetInstance,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      }).catch(() => null);

      pairingResult = await fetchPairing(targetInstance, cleanPhone);
    }

    // Ekstraksi pairing code (memeriksa pairingCode, code, atau qrcode.pairingCode)
    const data = pairingResult.data;
    let pairingCode = data?.pairingCode || data?.code || data?.qrcode?.pairingCode || null;

    // Jika pairingCode masih null atau belum terbit:
    if (!pairingCode) {
      // 1. Kirim POST /instance/restart/${targetInstance}
      await restartInstance(targetInstance);

      // 2. Beri jeda 2000 ms
      await new Promise((r) => setTimeout(r, 2000));

      // 3. Panggil ulang GET /instance/connect/${targetInstance}?number=${cleanPhone}
      const retryResult = await fetchPairing(targetInstance, cleanPhone);
      pairingCode = retryResult.data?.pairingCode || retryResult.data?.code || retryResult.data?.qrcode?.pairingCode || null;
    }

    // Validasi dan format pairing code jika valid
    let cleanPairingCode: string | null = null;
    if (pairingCode && typeof pairingCode === "string") {
      const trimmed = pairingCode.trim();
      // Pastikan bukan raw QR string (tidak mengandung @ atau = dan panjang <= 12)
      if (!trimmed.includes("@") && !trimmed.includes("=") && trimmed.length <= 12) {
        cleanPairingCode = trimmed;
      }
    }

    if (cleanPairingCode) {
      return NextResponse.json({
        success: true,
        pairing_code: cleanPairingCode,
      });
    }

    // Cegah intersepsi HTML Cloudflare 502: kembalikan status 200 dengan flag retry
    return NextResponse.json(
      {
        success: false,
        retry: true,
        error:
          "Evolution API sedang menyiapkan socket pairing. Silakan klik Dapatkan Kode sekali lagi atau scan barcode QR di sebelah.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        retry: true,
        error: err.message || "Gagal berkomunikasi dengan Evolution API",
      },
      { status: 200 }
    );
  }
}

export const GET = POST;
