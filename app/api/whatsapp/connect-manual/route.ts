import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseClient";

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

    const payload = {
      tenant_id: tenantSlug,
      tenant_slug: tenantSlug,
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

    // Cari tenant berdasarkan slug atau UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantSlug);
    let tenantRow: any = null;
    if (isUuid) {
      const { data } = await supabase.from("tenants").select("id, slug, metadata").eq("id", tenantSlug).maybeSingle();
      tenantRow = data;
    }
    if (!tenantRow) {
      const { data } = await supabase.from("tenants").select("id, slug, metadata").eq("slug", tenantSlug).maybeSingle();
      tenantRow = data;
    }

    if (!tenantRow) {
      return NextResponse.json(
        { success: false, error: `Tenant '${tenantSlug}' tidak ditemukan di database.` },
        { status: 404 }
      );
    }

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

    const { data: updatedTenants, error: tenantUpdateErr } = await supabase
      .from("tenants")
      .update({
        waba_phone_number_id: phoneNumberId,
        metadata: nextMeta,
        updated_at: nowIso,
      })
      .eq("id", tenantRow.id)
      .select("id, slug");

    if (tenantUpdateErr || !updatedTenants || updatedTenants.length === 0) {
      console.error("[WABA Connect-Manual Proxy] Update tenants failed or 0 rows affected:", tenantUpdateErr);
      return NextResponse.json(
        {
          success: false,
          error: tenantUpdateErr?.message || "Gagal memperbarui konfigurasi WABA di database tenants (0 rows affected).",
        },
        { status: 500 }
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
