import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const tenantSlug = searchParams.get("tenant") || body.tenant || body.tenant_slug || "onlineboost";
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

    const response = await fetch(
      `${BACKEND_URL.replace(/\/$/, "")}/api/v1/whatsapp/sessions/${encodeURIComponent(tenantSlug)}/pairing-code`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: tenantSlug, phone: cleanPhone }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success && data.pairing_code) {
      const code = String(data.pairing_code).trim();
      // Pastikan bukan raw QR code
      if (code.includes("@") || code.includes("=") || code.length > 12) {
        return NextResponse.json(
          {
            success: false,
            error: "Gateway mengembalikan raw QR string, bukan kode pairing. Pastikan WhatsApp session berstatus SCAN_QR_CODE.",
            detail: code,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        tenant_slug: tenantSlug,
        pairing_code: code,
        phone: cleanPhone,
        instance: data.instance || data.session,
      });
    }

    // Kembalikan status error asli dari Evolution API tanpa silent fallback
    return NextResponse.json(
      {
        success: false,
        error: data.error || data.detail || `Server Evolution API Error (${response.status})`,
        detail: data.detail || data,
        status_code: response.status,
      },
      { status: response.status >= 400 ? response.status : 502 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Gagal menghubungi backend Evolution API Gateway" },
      { status: 500 }
    );
  }
}
