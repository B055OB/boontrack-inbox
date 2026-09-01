import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get("tenant") || "onlineboost";

    // URL Backend FastAPI Core (Ganti dengan IP VPS/Port backend atau URL internal jika ada)
    const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.boontrack.com";

    const response = await fetch(`${BACKEND_URL}/api/v1/whatsapp/sessions/${tenantSlug}/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // Jika backend core belum aktif/bisa dijangkau, kembalikan sesi fallback dinamis
      return NextResponse.json({
        success: true,
        tenant_slug: tenantSlug,
        qr_image: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BoonTrack-${tenantSlug.toUpperCase()}-Session`,
        is_fallback: true
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: any) {
    // Graceful fallback agar frontend tetap memunculkan QR Code untuk pairing
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get("tenant") || "onlineboost";
    
    return NextResponse.json({
      success: true,
      tenant_slug: tenantSlug,
      qr_image: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BoonTrack-${tenantSlug.toUpperCase()}-Session`,
      is_fallback: true
    });
  }
}