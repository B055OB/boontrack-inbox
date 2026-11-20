import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseClient";
import { updateTenantWithOccCas } from "@/lib/tenants/atomic-tenant-metadata-writer";
import { resolveVerifiedTenantContext } from "@/lib/auth/tenant-context";
import { isInternalMachineAuthorized } from "@/lib/auth/merchant-session";
import { hasTierAccess } from "@/lib/subscription-tiers";

export const dynamic = "force-dynamic";

const CORE_API_URL =
  process.env.CORE_BACKEND_URL ||
  process.env.CORE_API_URL ||
  process.env.NEXT_PUBLIC_CORE_API_URL ||
  "https://api.boontrack.com";

const META_GRAPH_VERSION = "v26.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);

    const rawTenant =
      body.tenant_slug ||
      body.tenant_id ||
      body.tenant ||
      body.slug ||
      searchParams.get("tenant") ||
      searchParams.get("slug") ||
      "";
    const tenantSlug = typeof rawTenant === "string" ? rawTenant.trim().toLowerCase() : "";

    const phoneNumberId = String(body.phone_number_id || "").trim();
    const wabaId = String(body.waba_id || "").trim();
    const accessToken = String(body.access_token || body.permanent_access_token || "").trim();

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: "Parameter tenant slug / tenant ID wajib diisi." },
        { status: 400 }
      );
    }

    if (!phoneNumberId || !wabaId || !accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Harap lengkapi seluruh field: Phone Number ID, WABA ID, dan Meta Permanent Access Token.",
        },
        { status: 400 }
      );
    }

    // ── AUTH GUARD & SERVER-SIDE TENANT CONTEXT (WP1 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    let verifiedTenantId = '';
    let verifiedTenantSlug = '';
    let verifiedTier = 'ENTERPRISE';
    let verifiedMetadata: Record<string, any> = {};

    if (!isInternalAuth) {
      const authResult = await resolveVerifiedTenantContext(req, tenantSlug);
      if (!authResult.success) {
        return NextResponse.json(
          { success: false, error: authResult.error, code: authResult.code },
          { status: authResult.status }
        );
      }

      // RBAC Role Gate: Only OWNER, MERCHANT, SUPERADMIN can configure Official WABA credentials
      const allowedRoles = ['OWNER', 'MERCHANT', 'SUPERADMIN'];
      if (!allowedRoles.includes(authResult.context.role)) {
        return NextResponse.json(
          {
            success: false,
            error: `Forbidden: Peran '${authResult.context.role}' tidak memiliki izin untuk mengonfigurasi Official WhatsApp (WABA).`,
            code: 'FORBIDDEN',
          },
          { status: 403 }
        );
      }

      verifiedTenantId = authResult.context.tenantId;
      verifiedTenantSlug = authResult.context.tenantSlug;
      verifiedTier = authResult.context.tier;
      verifiedMetadata = authResult.context.metadata || {};

      // Canonical Capability Gate: whatsapp_official
      const tenantContext = {
        id: verifiedTenantId,
        slug: verifiedTenantSlug,
        tier: verifiedTier,
        metadata: verifiedMetadata,
      };

      if (!hasTierAccess(tenantContext, 'whatsapp_official')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: Fitur Official WhatsApp Business API (WABA) eksklusif untuk paket Team Scale atau tenant dengan lisensi resmi.',
            code: 'FORBIDDEN',
          },
          { status: 403 }
        );
      }
    } else {
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        return NextResponse.json(
          { success: false, error: 'Database service client tidak tersedia.' },
          { status: 500 }
        );
      }
      const { data: canonTenant } = await supabase
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
      verifiedTier = canonTenant.tier || 'ENTERPRISE';
      verifiedMetadata = canonTenant.metadata || {};

      if (!hasTierAccess(canonTenant, 'whatsapp_official')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: Fitur Official WhatsApp Business API (WABA) eksklusif untuk paket Team Scale atau tenant dengan lisensi resmi.',
            code: 'FORBIDDEN',
          },
          { status: 403 }
        );
      }
    }

    const payload = {
      tenant_id: verifiedTenantId,
      tenant_slug: verifiedTenantSlug,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      access_token: accessToken,
    };

    // ── 1. Coba Panggil Core Backend Endpoint Terlebih Dahulu ──
    let coreRes: Response | null = null;
    let coreData: any = null;
    let verifiedMetaInfo: {
      verified_name?: string;
      display_phone_number?: string;
      quality_rating?: string;
    } | null = null;

    try {
      const coreEndpoint = `${CORE_API_URL.replace(/\/$/, "")}/api/v1/whatsapp/connect-manual`;
      coreRes = await fetch(coreEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      if (coreRes) {
        coreData = await coreRes.json().catch(() => null);

        // Jika core merespons selain 404 (baik 200 sukses maupun 400/422 validation/Meta error)
        if (coreRes.status !== 404) {
          if (coreRes.ok && coreData) {
            verifiedMetaInfo = {
              verified_name: coreData.verified_name || coreData.name || "",
              display_phone_number: coreData.display_phone_number || coreData.phone_number || "",
              quality_rating: coreData.quality_rating || "GREEN",
            };
          } else {
            // Format error message yang ramah pengguna dari core backend
            const detailMsg =
              coreData?.detail?.message ||
              (typeof coreData?.detail === "string" ? coreData.detail : null) ||
              coreData?.message ||
              coreData?.error ||
              "Verifikasi Meta Graph API gagal. Pastikan Phone Number ID dan Access Token valid.";

            return NextResponse.json(
              {
                success: false,
                error: detailMsg,
                detail: coreData?.detail || coreData,
              },
              { status: coreRes.status || 400 }
            );
          }
        }
      }
    } catch (coreErr) {
      console.warn("[WABA Connect-Manual Proxy] Core endpoint call note:", coreErr);
    }

    // ── 2. Fallback Gateway: Handshake Langsung ke Meta Graph API ──
    // Dijalankan jika core endpoint mengembalikan 404 (belum ter-deploy) atau network unreachable
    if (!verifiedMetaInfo) {
      console.log(`[WABA Connect-Manual Proxy] Performing direct Meta handshake for tenant '${tenantSlug}'...`);

      // Verifikasi Phone Number ID dan token via Meta Graph API
      const metaUrl = `${META_GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}?fields=verified_name,display_phone_number,quality_rating&access_token=${encodeURIComponent(accessToken)}`;
      const metaRes = await fetch(metaUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      }).catch(() => null);

      if (!metaRes) {
        return NextResponse.json(
          {
            success: false,
            error: "Gagal menghubungi Meta Graph API. Periksa koneksi internet atau status Meta Platform.",
          },
          { status: 502 }
        );
      }

      const metaData = await metaRes.json().catch(() => ({}));

      if (!metaRes.ok || metaData.error) {
        const metaErrorMsg =
          metaData.error?.message ||
          metaData.error?.error_user_msg ||
          "Meta Graph API menolak kredensial. Pastikan Phone Number ID dan Access Token valid.";

        return NextResponse.json(
          {
            success: false,
            error: `Verifikasi Meta Gagal: ${metaErrorMsg}`,
            meta_error: metaData.error,
          },
          { status: 400 }
        );
      }

      // Auto-subscribe webhook WABA app (non-blocking)
      try {
        const subscribeUrl = `${META_GRAPH_BASE}/${encodeURIComponent(wabaId)}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;
        await fetch(subscribeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (subErr) {
        console.warn("[WABA Connect-Manual Proxy] Subscribed apps note:", subErr);
      }

      verifiedMetaInfo = {
        verified_name: metaData.verified_name || "",
        display_phone_number: metaData.display_phone_number || "",
        quality_rating: metaData.quality_rating || "GREEN",
      };
    }

    // ── 3. Persistensi Mutlak ke Supabase dengan Admin Client (Bypass RLS) ──
    const nowIso = new Date().toISOString();
    const verifiedName = verifiedMetaInfo.verified_name || "";
    const displayPhone = verifiedMetaInfo.display_phone_number || "";
    const qualityRating = verifiedMetaInfo.quality_rating || "GREEN";

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.error("[WABA Connect-Manual Proxy] Fatal: Supabase Admin Client tidak tersedia.");
      return NextResponse.json(
        { success: false, error: "Database admin client tidak tersedia di server." },
        { status: 500 }
      );
    }

    // Authoritative tenant row resolved from validated server-side context
    const tenantRow = {
      id: verifiedTenantId,
      slug: verifiedTenantSlug,
      metadata: verifiedMetadata,
    };

    // 1. Persist whatsapp_connections
    const { data: existingWabaConn } = await supabase
      .from("whatsapp_connections")
      .select("id")
      .or(`tenant_slug.eq.${tenantRow.slug},tenant_id.eq.${tenantRow.id}`)
      .eq("provider", "meta")
      .maybeSingle();

    const wabaPayload = {
      tenant_id: tenantRow.id,
      tenant_slug: tenantRow.slug,
      phone_number_id: phoneNumberId,
      phone_number: displayPhone || phoneNumberId,
      api_key: accessToken,
      status: "active",
      is_connected: true,
      provider: "meta",
      channel_type: "waba",
      waba_id: wabaId,
      ownership_domain: "TENANT",
      purpose: "COMMERCE",
      metadata: {
        waba_id: wabaId,
        verified_name: verifiedName,
        quality_rating: qualityRating,
        token: accessToken,
        connected_via: "self_service_manual",
        connected_at: nowIso,
      },
      updated_at: nowIso,
    };

    if (existingWabaConn?.id) {
      await supabase
        .from("whatsapp_connections")
        .update(wabaPayload)
        .eq("id", existingWabaConn.id);
    } else {
      await supabase
        .from("whatsapp_connections")
        .insert(wabaPayload);
    }

    // 2. Update tenants table metadata & direct columns dengan verifikasi 0 rows affected
    const currentMeta = tenantRow.metadata || {};
    const nextMeta = {
      ...currentMeta,
      waba_phone_number_id: phoneNumberId,
      whatsapp_phone_number_id: phoneNumberId,
      waba_account_id: wabaId,
      waba_access_token: accessToken,
      waba_configured: true,
      waba_active: true,
      whatsapp_gateway_type: "waba",
      waba_config: {
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        access_token: accessToken,
        permanent_access_token: accessToken,
        status: "CONNECTED",
        verified_name: verifiedName,
        display_phone_number: displayPhone,
        quality_rating: qualityRating,
        updated_at: nowIso,
      },
    };

    const occResult = await updateTenantWithOccCas(
      supabase,
      tenantRow.id,
      (freshTenant) => {
        const freshMeta = freshTenant.metadata || {};
        return {
          waba_phone_number_id: phoneNumberId,
          metadata: {
            ...freshMeta,
            ...nextMeta,
          },
        };
      }
    );

    if (!occResult.success) {
      console.error("[WABA Connect-Manual Proxy] Update tenants failed:", occResult.error);
      return NextResponse.json(
        {
          success: false,
          error: occResult.message || occResult.error || "Gagal memperbarui konfigurasi WABA di database tenants.",
        },
        { status: occResult.error === 'OCC_CONFLICT' ? 409 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "connected",
      message: `WABA berhasil terhubung dan tersimpan permanen untuk tenant '${tenantRow.slug}'.`,
      tenant_id: tenantRow.id,
      tenant_slug: tenantRow.slug,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      verified_name: verifiedName,
      display_phone_number: displayPhone,
      quality_rating: qualityRating,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    console.error("[WABA Connect-Manual Exception]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
