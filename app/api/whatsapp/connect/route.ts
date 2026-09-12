import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get("tenant") || "onlineboost";

    const BACKEND_URL =
      process.env.CORE_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.BACKEND_URL ||
      "https://boontrack-core-production.up.railway.app";

    const response = await fetch(`${BACKEND_URL}/api/v1/whatsapp/sessions/${encodeURIComponent(tenantSlug)}/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      return NextResponse.json(
        {
          success: false,
          tenant_slug: tenantSlug,
          status: "DEGRADED",
          error: data.error || data.detail || `Evolution API Gateway Error (${response.status})`,
          disconnect_reason: data.disconnect_reason || "GATEWAY_SESSION_PENDING",
          detail: data,
        },
        { status: response.status >= 400 ? response.status : 502 }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        status: "DEGRADED",
        disconnect_reason: "GATEWAY_UNREACHABLE",
        error: err.message || "Gagal menghubungi backend Evolution API Gateway",
      },
      { status: 502 }
    );
  }
}
