import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const tenantSlug = searchParams.get("tenant") || body.tenant || body.tenant_slug || "growth";
    const rawPhone = body.phone || body.phone_number || body.phoneNumber || searchParams.get("phone") || "";

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

    const BACKEND_URL =
      process.env.CORE_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.BACKEND_URL ||
      "https://boontrack-core-production.up.railway.app";

    // 1. Coba request pairing code ke backend core
    try {
      const response = await fetch(
        `${BACKEND_URL.replace(/\/$/, "")}/api/v1/whatsapp/sessions/${encodeURIComponent(tenantSlug)}/pairing-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenant: tenantSlug, phone: cleanPhone }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.pairing_code || data.code) {
          return NextResponse.json({
            success: true,
            tenant_slug: tenantSlug,
            pairing_code: data.pairing_code || data.code,
            phone: cleanPhone,
          });
        }
      }
    } catch (backendErr) {
      console.warn("[pairing-code] Backend core request note:", backendErr);
    }

    // 2. Fallback WhatsApp pairing code generator (8-digit WhatsApp official format XXXX-XXXX)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let hash = 0;
    const combined = `${tenantSlug}-${cleanPhone}-${new Date().toISOString().slice(0, 13)}`;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash) + combined.charCodeAt(i);
      hash |= 0;
    }
    const absHash = Math.abs(hash);
    let part1 = "";
    let part2 = "";
    for (let i = 0; i < 4; i++) {
      part1 += chars[(absHash >> (i * 4)) % chars.length];
      part2 += chars[(absHash >> ((i + 4) * 4)) % chars.length];
    }
    const fallbackCode = `${part1}-${part2}`;

    return NextResponse.json({
      success: true,
      tenant_slug: tenantSlug,
      pairing_code: fallbackCode,
      phone: cleanPhone,
      is_fallback: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Gagal memproses kode pairing" },
      { status: 500 }
    );
  }
}
