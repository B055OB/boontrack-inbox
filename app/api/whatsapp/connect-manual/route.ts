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
    let coreHandled = false;

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
          coreHandled = true;

          if (coreRes.ok && coreData) {
            return NextResponse.json({
              success: true,
              ...coreData,
            });
          }

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
    } catch (coreErr) {
      console.warn("[WABA Connect-Manual Proxy] Core endpoint call note:", coreErr);
    }

    // ── 2. Fallback Gateway: Handshake Langsung ke Meta Graph API & Persist Supabase ──
    // Dijalankan jika core endpoint mengembalikan 404 (belum ter-deploy) atau network unreachable
    if (!coreHandled) {
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

      // Upsert ke Supabase `whatsapp_connections` dan `tenant_settings`
      const nowIso = new Date().toISOString();
      const verifiedName = metaData.verified_name || "";
      const displayPhone = metaData.display_phone_number || "";
      const qualityRating = metaData.quality_rating || "GREEN";

      const supabase = getSupabaseAdmin();
      if (supabase) {
        // 1. Upsert whatsapp_connections
        await supabase.from("whatsapp_connections").upsert(
          {
            tenant_id: tenantSlug,
            tenant_slug: tenantSlug,
            phone_number_id: phoneNumberId,
            phone_number: displayPhone,
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
          },
          { onConflict: "phone_number_id" }
        );

        // 2. Upsert tenant_settings
        await supabase.from("tenant_settings").upsert(
          {
            tenant_slug: tenantSlug,
            waba_config: {
              waba_id: wabaId,
              phone_number_id: phoneNumberId,
              permanent_access_token: accessToken,
              status: "CONNECTED",
              verified_name: verifiedName,
              display_phone_number: displayPhone,
              quality_rating: qualityRating,
              updated_at: nowIso,
            },
            updated_at: nowIso,
          },
          { onConflict: "tenant_slug" }
        );
      }

      return NextResponse.json({
        success: true,
        status: "connected",
        message: `WABA berhasil terhubung dan terverifikasi untuk tenant '${tenantSlug}'.`,
        tenant_id: tenantSlug,
        tenant_slug: tenantSlug,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        verified_name: verifiedName,
        display_phone_number: displayPhone,
        quality_rating: qualityRating,
      });
    }

    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan internal saat memproses WABA." },
      { status: 500 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
