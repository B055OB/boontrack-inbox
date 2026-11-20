import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseClient";
import { resolveVerifiedTenantContext } from "@/lib/auth/tenant-context";
import { isInternalMachineAuthorized } from "@/lib/auth/merchant-session";
import { hasTierAccess } from "@/lib/subscription-tiers";

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

function cleanDigits(raw: unknown): string | null {
  if (!raw) return null;
  const str = String(raw).replace(/@s\.whatsapp\.net/gi, "").replace(/[^0-9]/g, "");
  return str || null;
}

async function syncWhatsAppConnectionRecord(
  supabaseAdmin: any,
  tenantId: string,
  tenantSlug: string,
  instanceName: string,
  status: string,
  isConnected: boolean,
  phoneNumber: string | null
) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id")
      .or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabaseAdmin
        .from("whatsapp_connections")
        .update({
          instance_name: instanceName,
          provider: "EVOLUTION",
          channel_type: "BAILEYS",
          phone_number: phoneNumber,
          status,
          is_connected: isConnected,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("whatsapp_connections")
        .insert({
          tenant_id: tenantId,
          tenant_slug: tenantSlug,
          instance_name: instanceName,
          provider: "EVOLUTION",
          channel_type: "BAILEYS",
          phone_number: phoneNumber,
          status,
          is_connected: isConnected,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    }
  } catch (err) {
    console.warn("[WA Connect] syncWhatsAppConnectionRecord warning:", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let tenantSlug = (
      searchParams.get("tenant") ||
      searchParams.get("tenant_slug") ||
      searchParams.get("slug") ||
      ""
    ).trim().toLowerCase();

    if (!tenantSlug && req.method === "POST") {
      try {
        const cloned = req.clone();
        const body = await cloned.json().catch(() => ({}));
        tenantSlug = String(
          body.tenant || body.tenant_slug || body.slug || body.tenant_id || ""
        ).trim().toLowerCase();
      } catch {}
    }

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: "Parameter tenant slug / tenant ID wajib diisi." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database service client tidak tersedia." },
        { status: 500 }
      );
    }

    // ── AUTH GUARD & SERVER-SIDE TENANT CONTEXT (WP1 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    let verifiedTenantId = '';
    let verifiedTenantSlug = '';
    let verifiedTier = 'PRO_SCALE';
    let verifiedMetadata: Record<string, any> = {};

    if (!isInternalAuth) {
      const authResult = await resolveVerifiedTenantContext(req, tenantSlug);
      if (!authResult.success) {
        return NextResponse.json(
          { success: false, error: authResult.error, code: authResult.code },
          { status: authResult.status }
        );
      }

      // Role check: Only OWNER, MERCHANT, OPERATOR, SUPERADMIN can manage WhatsApp engine connection
      const allowedRoles = ['OWNER', 'MERCHANT', 'OPERATOR', 'SUPERADMIN'];
      if (!allowedRoles.includes(authResult.context.role)) {
        return NextResponse.json(
          {
            success: false,
            error: `Forbidden: Peran '${authResult.context.role}' tidak memiliki izin untuk mengelola koneksi WhatsApp.`,
            code: 'FORBIDDEN',
          },
          { status: 403 }
        );
      }

      verifiedTenantId = authResult.context.tenantId;
      verifiedTenantSlug = authResult.context.tenantSlug;
      verifiedTier = authResult.context.tier;
      verifiedMetadata = authResult.context.metadata || {};

      // Canonical Capability Gate: whatsapp_engine
      const tenantContext = {
        id: verifiedTenantId,
        slug: verifiedTenantSlug,
        tier: verifiedTier,
        metadata: verifiedMetadata,
      };

      if (!hasTierAccess(tenantContext, 'whatsapp_engine')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: Fitur WhatsApp Engine (Evolution/Baileys) eksklusif untuk paket Ads Performance atau Team Scale.',
            code: 'FORBIDDEN',
          },
          { status: 403 }
        );
      }
    } else {
      const { data: canonTenant } = await supabaseAdmin
        .from('tenants')
        .select('id, slug, tier, metadata')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (!canonTenant) {
        return NextResponse.json(
          { success: false, error: `Tenant '${tenantSlug}' tidak ditemukan di database.` },
          { status: 404 }
        );
      }

      verifiedTenantId = canonTenant.id;
      verifiedTenantSlug = canonTenant.slug;
      verifiedTier = canonTenant.tier || 'PRO_SCALE';
      verifiedMetadata = canonTenant.metadata || {};

      if (!hasTierAccess(canonTenant, 'whatsapp_engine')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: Fitur WhatsApp Engine (Evolution/Baileys) eksklusif untuk paket Ads Performance atau Team Scale.',
            code: 'FORBIDDEN',
          },
          { status: 403 }
        );
      }
    }

    const tenantId = verifiedTenantId;
    tenantSlug = verifiedTenantSlug;

    const isReload =
      searchParams.get("action") === "reload" ||
      searchParams.get("force") === "true" ||
      searchParams.get("force_refresh") === "true";

    // 1. Resolve WhatsApp Connection Record from Supabase Database
    const tenantWhatsapp = cleanDigits(verifiedMetadata?.whatsapp_number || verifiedMetadata?.phone);

    const { data: waConn } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("*")
      .or(`tenant_slug.eq.${verifiedTenantSlug},tenant_id.eq.${verifiedTenantId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const instanceName = waConn?.instance_name || verifiedTenantSlug;
    const evoUrl = (
      process.env.NEXT_PUBLIC_EVOLUTION_API_URL ||
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-production-abb7.up.railway.app"
    ).replace(/\/+$/, "");
    const evoKey = (process.env.EVOLUTION_API_KEY || "").trim();

    // 2. Direct Evolution API v2 Integration (if credentials available)
    if (evoUrl && evoKey) {
      try {
        const evoHeaders = {
          apikey: evoKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        };

        // Fallback: If instance is stuck in connecting or reload requested, logout session first
        if (isReload) {
          try {
            await fetch(`${evoUrl}/instance/logout/${encodeURIComponent(instanceName)}`, {
              method: "DELETE",
              headers: evoHeaders,
            });
          } catch (logoutErr) {
            console.debug("[WA Connect] Evolution logout note:", logoutErr);
          }
        }

        // Call GET /instance/connect/{instance}
        const evoRes = await fetch(`${evoUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
          method: "GET",
          headers: evoHeaders,
          cache: "no-store",
        });

        if (evoRes.ok) {
          const evoData = await evoRes.json().catch(() => ({}));
          const state = String(
            evoData?.instance?.state ||
            evoData?.connectionStatus ||
            evoData?.status ||
            ""
          ).toLowerCase();

          // Extract QR code formats
          const rawQr =
            evoData?.base64 ||
            evoData?.qrcode?.base64 ||
            evoData?.qrcode ||
            evoData?.code ||
            evoData?.qr_raw ||
            evoData?.qr ||
            null;
          const formattedBase64 = cleanBase64(rawQr);
          const pairingCode = evoData?.code || evoData?.pairingCode || null;

          // Case A: Instance is OPEN / CONNECTED
          if (state === "open" || state === "connected") {
            const rawOwner = evoData?.instance?.owner || evoData?.ownerJid || evoData?.owner || waConn?.phone_number || tenantWhatsapp;
            const resolvedPhone = cleanDigits(rawOwner) || tenantWhatsapp;

            // Sync to database
            await syncWhatsAppConnectionRecord(
              supabaseAdmin,
              tenantId,
              tenantSlug,
              instanceName,
              "open",
              true,
              resolvedPhone
            );

            return NextResponse.json({
              success: true,
              status: "CONNECTED",
              is_connected: true,
              connected: true,
              tenant_slug: tenantSlug,
              instance_name: instanceName,
              phone_number: resolvedPhone,
              connected_phone: resolvedPhone,
              base64: null,
              code: null,
              message: "WhatsApp terhubung.",
            });
          }

          // Case B: QR Code generated
          if (formattedBase64) {
            await syncWhatsAppConnectionRecord(
              supabaseAdmin,
              tenantId,
              tenantSlug,
              instanceName,
              "connecting",
              false,
              null
            );

            return NextResponse.json({
              success: true,
              status: "CONNECTING",
              is_connected: false,
              connected: false,
              tenant_slug: tenantSlug,
              instance_name: instanceName,
              base64: formattedBase64,
              code: pairingCode,
              message: "Silakan scan QR Code WhatsApp.",
            });
          }
        }
      } catch (evoErr) {
        console.warn("[WA Connect] Evolution direct bridge note, falling back to core:", evoErr);
      }
    }

    // 3. Fallback ke Core Backend Gateway
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

    const isConnected =
      data?.status === "CONNECTED" ||
      data?.status === "open" ||
      data?.connected === true ||
      data?.is_connected === true;

    const resolvedPhone = cleanDigits(data?.phone_number || data?.connected_phone) || tenantWhatsapp;

    // Persist to whatsapp_connections
    if (isConnected) {
      await syncWhatsAppConnectionRecord(
        supabaseAdmin,
        tenantId,
        tenantSlug,
        data?.instance_name || instanceName,
        "open",
        true,
        resolvedPhone
      );
    }

    return NextResponse.json(
      {
        ...data,
        success: data?.success !== false,
        status: isConnected ? "CONNECTED" : (formattedBase64 ? "CONNECTING" : "DISCONNECTED"),
        is_connected: isConnected,
        connected: isConnected,
        phone_number: resolvedPhone,
        connected_phone: resolvedPhone,
        tenant_slug: tenantSlug,
        instance_name: data?.instance_name || instanceName,
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