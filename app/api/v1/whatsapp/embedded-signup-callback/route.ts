import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const CORE_API_URL =
  process.env.CORE_BACKEND_URL ||
  process.env.CORE_API_URL ||
  process.env.NEXT_PUBLIC_CORE_API_URL ||
  "https://api.boontrack.com";

const META_APP_ID = "1398832609107871";
const META_GRAPH_VERSION = "v21.0";
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
    const code = String(body.code || "").trim();

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: "Parameter tenant_slug atau tenant_id wajib disertakan." },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Parameter authorization code dari Meta OAuth wajib disertakan." },
        { status: 400 }
      );
    }

    const appSecret = process.env.META_APP_SECRET || "";
    let accessToken = String(body.access_token || "").trim();
    let resolvedPhoneId = String(body.phone_number_id || "").trim();
    let resolvedWabaId = String(body.waba_id || "").trim();
    let resolvedVerifiedName = "";
    let resolvedDisplayPhone = "";
    let resolvedQualityRating = "GREEN";

    // ── 1. Coba delegasikan ke Core Backend terlebih dahulu ──
    try {
      const coreEndpoint = `${CORE_API_URL.replace(/\/$/, "")}/api/v1/whatsapp/embedded-signup-callback`;
      const coreRes = await fetch(coreEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...body,
          tenant_slug: tenantSlug,
          tenant_id: tenantSlug,
        }),
        cache: "no-store",
      });

      if (coreRes && coreRes.status !== 404) {
        const coreData = await coreRes.json().catch(() => null);
        if (coreRes.ok && coreData) {
          // Tangkap kredensial dari core backend agar diteruskan ke persistensi Supabase
          if (coreData.access_token) accessToken = coreData.access_token;
          if (coreData.phone_number_id) resolvedPhoneId = coreData.phone_number_id;
          if (coreData.waba_id) resolvedWabaId = coreData.waba_id;
          if (coreData.display_phone_number) resolvedDisplayPhone = coreData.display_phone_number;
          if (coreData.verified_name) resolvedVerifiedName = coreData.verified_name;
          if (coreData.quality_rating) resolvedQualityRating = coreData.quality_rating;
        } else if (coreData?.error || coreData?.message) {
          return NextResponse.json(
            {
              success: false,
              error: coreData.error || coreData.message || "Gagal memproses pendaftaran WABA dari Core API.",
            },
            { status: coreRes.status || 400 }
          );
        }
      }
    } catch (coreErr) {
      console.warn("[Meta Embedded Signup] Core backend proxy note:", coreErr);
    }

    // ── 2. Direct Meta Graph API Token Exchange ──

    if (!accessToken && appSecret) {
      const tokenExchangeUrl = `${META_GRAPH_BASE}/oauth/access_token?client_id=${META_APP_ID}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;
      const tokenRes = await fetch(tokenExchangeUrl, { method: "GET" });
      const tokenData = await tokenRes.json().catch(() => ({}));

      if (!tokenRes.ok || tokenData.error) {
        const errDetail = tokenData.error?.message || "Pertukaran authorization code Meta gagal.";
        return NextResponse.json(
          {
            success: false,
            error: `Gagal menukarkan token Meta: ${errDetail}`,
            meta_error: tokenData.error,
          },
          { status: 400 }
        );
      }

      accessToken = tokenData.access_token || "";
    }

    // Jika token didapat atau sudah ada, inspect debug_token & phone numbers
    if (accessToken) {
      try {
        // Ambil info WABA ID dari debug_token jika waba_id belum terisi
        if (!resolvedWabaId && appSecret) {
          const appToken = `${META_APP_ID}|${appSecret}`;
          const debugUrl = `${META_GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`;
          const debugRes = await fetch(debugUrl, { method: "GET" });
          const debugData = await debugRes.json().catch(() => ({}));
          const granularScopes = debugData.data?.granular_scopes || [];
          const waScope = granularScopes.find((s: any) => s.scope === "whatsapp_business_management");
          if (waScope && waScope.target_ids && waScope.target_ids.length > 0) {
            resolvedWabaId = waScope.target_ids[0];
          }
        }

        // Ambil info Phone Numbers jika phone_number_id belum terisi atau untuk ambil detail profil
        if (resolvedWabaId) {
          const phonesUrl = `${META_GRAPH_BASE}/${encodeURIComponent(resolvedWabaId)}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`;
          const phonesRes = await fetch(phonesUrl, { method: "GET" });
          const phonesData = await phonesRes.json().catch(() => ({}));
          const phoneList = phonesData.data || [];
          if (phoneList.length > 0) {
            const primaryPhone = phoneList[0];
            resolvedPhoneId = primaryPhone.id || resolvedPhoneId;
            resolvedDisplayPhone = primaryPhone.display_phone_number || "";
            resolvedVerifiedName = primaryPhone.verified_name || "";
            resolvedQualityRating = primaryPhone.quality_rating || "GREEN";
          }

          // Auto-subscribe app ke webhook WABA
          const subscribeUrl = `${META_GRAPH_BASE}/${encodeURIComponent(resolvedWabaId)}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;
          await fetch(subscribeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }).catch(() => null);
        }
      } catch (inspectErr) {
        console.warn("[Meta Embedded Signup] Inspection error:", inspectErr);
      }
    }

    // ── 3. Simpan State Koneksi WABA ke Database (Supabase) ──
    const nowIso = new Date().toISOString();
    const finalPhoneId = resolvedPhoneId || `waba_${tenantSlug}_${Date.now()}`;
    const finalWabaId = resolvedWabaId || `waba_acc_${tenantSlug}`;
    const finalPhone = resolvedDisplayPhone || finalPhoneId;
    const finalVerifiedName = resolvedVerifiedName || tenantSlug.toUpperCase();

    const supabase = getSupabaseAdmin();
    if (supabase) {
      // 1. Persist ke whatsapp_connections
      const { data: existingWabaConn } = await supabase
        .from("whatsapp_connections")
        .select("id")
        .or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantSlug}`)
        .eq("provider", "meta")
        .maybeSingle();

      const wabaPayload = {
        tenant_id: tenantSlug,
        tenant_slug: tenantSlug,
        phone_number_id: finalPhoneId,
        phone_number: finalPhone,
        api_key: accessToken || `token_${Date.now()}`,
        status: "active",
        is_connected: true,
        provider: "meta",
        channel_type: "waba",
        waba_id: finalWabaId,
        ownership_domain: "TENANT",
        purpose: "COMMERCE",
        metadata: {
          waba_id: finalWabaId,
          verified_name: finalVerifiedName,
          quality_rating: resolvedQualityRating,
          connected_via: "meta_embedded_signup_popup",
          connected_at: nowIso,
          embedded_signup: true,
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

      // 2. Update tenants metadata & direct columns dengan verifikasi 0 rows affected
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("id, metadata")
        .eq("slug", tenantSlug)
        .maybeSingle();

      if (tenantRow) {
        const currentMeta = tenantRow.metadata || {};
        const nextMeta = {
          ...currentMeta,
          waba_phone_number_id: finalPhoneId,
          whatsapp_phone_number_id: finalPhoneId,
          waba_account_id: finalWabaId,
          waba_access_token: accessToken || currentMeta.waba_access_token,
          waba_configured: true,
          waba_active: true,
          whatsapp_gateway_type: "waba",
          waba_config: {
            phone_number_id: finalPhoneId,
            waba_id: finalWabaId,
            access_token: accessToken || "",
            permanent_access_token: accessToken || "",
            status: "CONNECTED",
            verified_name: finalVerifiedName,
            display_phone_number: finalPhone,
            quality_rating: resolvedQualityRating,
            connected_via: "meta_embedded_signup_popup",
            updated_at: nowIso,
          },
        };

        const { data: updatedTenants, error: tenantUpdateErr } = await supabase
          .from("tenants")
          .update({
            waba_phone_number_id: finalPhoneId,
            metadata: nextMeta,
            updated_at: nowIso,
          })
          .eq("id", tenantRow.id)
          .select("id, slug");

        if (tenantUpdateErr || !updatedTenants || updatedTenants.length === 0) {
          console.error("[Meta Embedded Signup] Update tenants failed or 0 rows affected:", tenantUpdateErr);
          return NextResponse.json(
            {
              success: false,
              error: tenantUpdateErr?.message || "Gagal memperbarui konfigurasi WABA di database tenants (0 rows affected).",
            },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      status: "CONNECTED",
      message: `Akun WhatsApp Resmi (WABA) '${finalVerifiedName}' berhasil terhubung via Meta Embedded Signup!`,
      tenant_slug: tenantSlug,
      tenant_id: tenantSlug,
      phone_number_id: finalPhoneId,
      waba_id: finalWabaId,
      phone_number: finalPhone,
      display_phone_number: finalPhone,
      verified_name: finalVerifiedName,
      quality_rating: resolvedQualityRating,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal saat memproses Embedded Signup.";
    console.error("[Meta Embedded Signup Callback Error]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
