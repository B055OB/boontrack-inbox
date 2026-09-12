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

    // 1. Tentukan target instance dan coba hubungkan
    let targetInstance = tenantSlug;
    let pairingResult = await fetchPairing(targetInstance, cleanPhone);

    // Jika 404 dan slug belum memiliki prefix "tenant_", periksa apakah ada instance "tenant_{slug}"
    if (pairingResult.res.status === 404 && !targetInstance.startsWith("tenant_")) {
      const fallbackResult = await fetchPairing(`tenant_${targetInstance}`, cleanPhone);
      if (fallbackResult.res.ok || fallbackResult.res.status !== 404) {
        pairingResult = fallbackResult;
        targetInstance = `tenant_${targetInstance}`;
      }
    }

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

    const { data } = pairingResult;

    // HANYA ambil data.pairingCode, JANGAN gunakan data.code sebagai fallback
    let pairingCode = data.pairingCode || data.qrcode?.pairingCode || null;

    // Mekanisme Retry Socket Restart (sesuai backend core):
    // Jika respons JSON memiliki pairingCode: null atau belum terbit
    if (!pairingCode) {
      // 1. Kirim request POST /instance/restart/{instance_name}
      await restartInstance(targetInstance);

      // 2. Beri jeda 1.5 detik
      await new Promise((r) => setTimeout(r, 1500));

      // 3. Panggil ulang GET /instance/connect/{instance_name}?number={clean_phone}
      const retryResult = await fetchPairing(targetInstance, cleanPhone);
      pairingCode = retryResult.data?.pairingCode || retryResult.data?.qrcode?.pairingCode || null;
    }

    // Validasi dan format pairing code
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

    // Jika tetap tidak ada pairingCode
    return NextResponse.json(
      {
        success: false,
        error:
          "Evolution API sedang menyiapkan socket pairing. Silakan klik Dapatkan Kode sekali lagi atau scan barcode QR di sebelah.",
      },
      { status: 502 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Gagal berkomunikasi dengan Evolution API",
      },
      { status: 500 }
    );
  }
}

export const GET = POST;
