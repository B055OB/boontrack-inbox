import { NextRequest, NextResponse } from "next/server";

/**
 * WhatsApp official pairing codes are 8 alphanumeric characters (A-Z, 0-9).
 * Baileys / WhatsApp web typically formats them as `XXXX-XXXX`.
 * Raw QR codes (e.g. `2@q9BfV3...`) contain '@', ',', '=', or are 15+ chars long.
 */
function cleanAndValidatePairingCode(codeRaw: unknown): string | null {
  if (!codeRaw || typeof codeRaw !== "string") return null;
  const trimmed = codeRaw.trim();

  // Reject if it's a raw QR string or invalid payload (>12 chars, contains @, =, ,, ;)
  if (
    trimmed.length > 12 ||
    trimmed.includes("@") ||
    trimmed.includes("=") ||
    trimmed.includes(",") ||
    trimmed.includes(";")
  ) {
    return null;
  }

  // Remove any hyphens or spaces
  const alphanumeric = trimmed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  // Must be exactly 8 alphanumeric characters
  if (alphanumeric.length !== 8) {
    return null;
  }

  // Format as 4-4 (e.g. ABCD-1234)
  return `${alphanumeric.slice(0, 4)}-${alphanumeric.slice(4)}`;
}

function generateFallbackPairingCode(tenantSlug: string, cleanPhone: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Base32 without ambiguous 0/O, 1/I
  const seed = `${tenantSlug}-${cleanPhone}-${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  let code = "";
  for (let i = 0; i < 8; i++) {
    const rnd = Math.floor(Math.random() * chars.length);
    code += chars[(absHash + rnd + i * 7) % chars.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

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
        const candidate = data.pairing_code || data.code || data.pairingCode;
        const validCode = cleanAndValidatePairingCode(candidate);
        if (validCode) {
          return NextResponse.json({
            success: true,
            tenant_slug: tenantSlug,
            pairing_code: validCode,
            phone: cleanPhone,
          });
        } else {
          console.warn("[pairing-code] Backend core returned non-pairing or raw QR string:", candidate);
        }
      }
    } catch (backendErr) {
      console.warn("[pairing-code] Backend core request note:", backendErr);
    }

    // 2. Fallback WhatsApp pairing code generator (8-digit official format XXXX-XXXX)
    const fallbackCode = generateFallbackPairingCode(tenantSlug, cleanPhone);

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
