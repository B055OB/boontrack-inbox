import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
  if (trimmed.startsWith("2@")) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = (
      searchParams.get("tenant") ||
      searchParams.get("tenant_slug") ||
      searchParams.get("slug") ||
      ""
    ).trim().toLowerCase();

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: "Parameter tenant slug / tenant ID wajib diisi." },
        { status: 400 }
      );
    }

    const isReload =
      searchParams.get("action") === "reload" ||
      searchParams.get("force") === "true" ||
      searchParams.get("force_refresh") === "true";

    const coreBase = (
      process.env.CORE_BACKEND_URL ||
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "https://api.boontrack.com"
    ).replace(/\/+$/, "");

    const targetUrl = `${coreBase}/api/v1/whatsapp/sessions/${encodeURIComponent(tenantSlug)}/connect${isReload ? "?force=true" : ""}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 202) {
      return NextResponse.json(
        {
          success: true,
          status: "IN_PROGRESS",
          message: "Sedang menyiapkan sesi aman...",
          tenant_slug: tenantSlug,
        },
        { status: 202 }
      );
    }

    const data = await res.json().catch(() => ({}));

    // Format base64 QR jika tersedia
    const rawQr =
      data?.base64 ||
      data?.qrcode?.base64 ||
      data?.qr_image ||
      data?.qrcode ||
      data?.qr ||
      data?.code ||
      data?.qr_raw;
    const formattedBase64 = cleanBase64(rawQr);

    return NextResponse.json(
      {
        ...data,
        success: data?.success !== false,
        status: data?.status || (formattedBase64 ? "CONNECTING" : "DISCONNECTED"),
        tenant_slug: tenantSlug,
        instance_name: data?.instance_name || tenantSlug,
        base64: formattedBase64 || data?.base64 || null,
        code: data?.code || data?.qr_raw || data?.pairingCode || null,
      },
      { status: res.status }
    );
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    return NextResponse.json(
      {
        success: false,
        status: "DEGRADED",
        disconnect_reason: isTimeout ? "GATEWAY_TIMEOUT" : "GATEWAY_UNREACHABLE",
        error: isTimeout
          ? "Koneksi ke canonical Core timeout (15 detik)."
          : err?.message || "Gagal memuat sesi dari canonical Core",
      },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}