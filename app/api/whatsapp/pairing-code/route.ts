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

    let cleanPhone = String(rawPhone).replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("0")) {
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

    // 1. Coba request pairing code dengan nama instance tenantSlug
    let pairingResult = await fetchPairing(tenantSlug, cleanPhone);

    // Jika 404 dan slug belum memiliki prefix "tenant_", periksa apakah ada instance "tenant_{slug}"
    if (pairingResult.res.status === 404 && !tenantSlug.startsWith("tenant_")) {
      const fallbackResult = await fetchPairing(`tenant_${tenantSlug}`, cleanPhone);
      if (fallbackResult.res.ok || fallbackResult.res.status !== 404) {
        pairingResult = fallbackResult;
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
          instanceName: tenantSlug,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      }).catch(() => null);

      pairingResult = await fetchPairing(tenantSlug, cleanPhone);
    }

    const { res, data } = pairingResult;

    // Tangkap atribut pairingCode atau code dari Evolution API
    const code =
      data.pairingCode ||
      data.code ||
      data.pairing_code ||
      data.qrcode?.pairingCode ||
      data.qrcode?.code ||
      null;

    if (code) {
      return NextResponse.json({
        success: true,
        pairing_code: code,
      });
    }

    // Jika Evolution API mengembalikan error
    return NextResponse.json(
      {
        success: false,
        error:
          data.error ||
          data.response?.message?.[0] ||
          data.message ||
          `Evolution API Error (${res.status})`,
        detail: data,
      },
      { status: res.status >= 400 ? res.status : 502 }
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
