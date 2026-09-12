import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get("tenant");

    // Validasi multi-tenant: Tolak request jika slug tidak ada
    if (!tenantSlug || tenantSlug.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          status: "DISCONNECTED",
          error: "Missing required query parameter: tenant",
        },
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
      `${BACKEND_URL}/api/v1/whatsapp/sessions/${encodeURIComponent(tenantSlug.trim())}/connect`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      return NextResponse.json(
        {
          success: false,
          tenant_slug: tenantSlug,
          status: "DISCONNECTED",
          error: data.error || data.detail || `Evolution API Gateway Error (${response.status})`,
          disconnect_reason: data.disconnect_reason || "GATEWAY_SESSION_PENDING",
          detail: data,
        },
        { status: response.status >= 400 ? response.status : 502 }
      );
    }

    // Normalisasi struktur output QR Base64 dan Pairing Code
    const base64 =
      data.base64 ||
      data.qrcode?.base64 ||
      data.qr_image ||
      data.qr_raw ||
      data.qr ||
      null;

    const code =
      data.code ||
      data.pairingCode ||
      data.pairing_code ||
      null;

    return NextResponse.json({
      success: true,
      tenant_slug: tenantSlug,
      status: data.status === "open" || data.status === "CONNECTED" ? "CONNECTED" : "CONNECTING",
      base64,
      code,
      connected_phone: data.connected_phone || data.phone || null,
      instance: data.instance || tenantSlug,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        status: "DISCONNECTED",
        disconnect_reason: "GATEWAY_UNREACHABLE",
        error: err.message || "Gagal menghubungi backend Evolution API Gateway",
      },
      { status: 502 }
    );
  }
}

export const GET = POST;