"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowRight, Layers } from "lucide-react";
import ControlledProvisioningError from "@/components/ControlledProvisioningError";
import {
  executeStorefrontRuntimePipeline,
  resolveStorefrontSections,
  resolveStorefrontCopy,
} from "@/lib/resolvers/tenant-runtime-resolver";
import { TenantRuntimeProvider } from "@/lib/context/tenant-runtime-context";
import { trackInitiateCheckout } from "@/lib/tracking";
import { getSupabase } from "@/lib/supabaseClient";
import { sanitizeImageUrl } from "@/lib/image-utils";
import { getTenantConfig, normalizeTenantSlug } from "@/lib/tenant-config";
import type { Product, StoreChatMessage } from "./types";
import {
  formatCategoryBadge,
  getStoreChatGreeting,
  isPhysicalOrFoodProduct,
  isPublicServiceTenant,
} from "./types";

// ── HERMETIC DYNAMIC TEMPLATE CHUNKING (CTO Mandate) ──
const ShopClaimSection = dynamic(
  () => import("@/app/components/ShopClaimSection"),
  { ssr: true }
);

const PublicServicePortalTemplate = dynamic(
  () => import("./components/templates/PublicServicePortalTemplate"),
  { ssr: true }
);

const PersonalAuthorityTemplate = dynamic(
  () => import("./components/templates/PersonalAuthorityTemplate"),
  { ssr: true }
);

const MicrositeBioTemplate = dynamic(
  () => import("./components/templates/MicrositeBioTemplate"),
  { ssr: true }
);

const StorefrontTemplate = dynamic(
  () => import("./components/templates/StorefrontTemplate"),
  { ssr: true }
);

export type { Product, StoreChatMessage };
export {
  formatCategoryBadge,
  getStoreChatGreeting,
  isPhysicalOrFoodProduct,
  isPublicServiceTenant,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProductItemToStoreProduct(p: any, idx: number): Product {
  if (!p || typeof p !== "object") {
    return {
      id: `prod-${idx + 1}`,
      name: `Layanan ${idx + 1}`,
      category: "Layanan",
      type: "service",
      product_type: "SERVICE",
      requires_shipping: false,
      price: 0,
      image: "",
      image_url: "",
      description: "",
      stock: 999,
      sku: `SKU-${idx + 1}`,
    };
  }

  const rawPrice = Number(p.price) || 0;
  const rawPromoPrice =
    p.promo_price !== undefined && p.promo_price !== null && p.promo_price !== ""
      ? Number(p.promo_price)
      : undefined;
  const hasValidPromo =
    rawPromoPrice !== undefined && !isNaN(rawPromoPrice) && rawPromoPrice > 0 && rawPrice > rawPromoPrice;
  const price = hasValidPromo ? rawPromoPrice : rawPrice > 0 ? rawPrice : rawPromoPrice || 0;
  const originalPrice = hasValidPromo ? rawPrice : p.originalPrice ? Number(p.originalPrice) : undefined;

  const categoryBadge = formatCategoryBadge(
    typeof p.category === "string" ? p.category : undefined,
    typeof (p.product_type || p.type) === "string" ? p.product_type || p.type : undefined,
    typeof p.custom_badge === "string" ? p.custom_badge : undefined
  );

  const rawImg = p.image_url || p.image || (Array.isArray(p.images) && p.images[0]) || "";
  const sanitizedImg =
    rawImg === "/logo-shop.png" || rawImg === "null" || rawImg === "undefined" || !rawImg
      ? "/placeholder-product.png"
      : sanitizeImageUrl(rawImg) || "/placeholder-product.png";

  const isExplicitlyInactive =
    (p as any).is_active === false ||
    (p as any).is_active === "false" ||
    (p as any).is_active === 0 ||
    (p as any).is_active === "0" ||
    (typeof (p as any).status === "string" &&
      ['draft', 'inactive', 'archived'].includes((p as any).status.toLowerCase()));

  const rawType = String((p as any).type || (p as any).product_type || "").toLowerCase();
  const rawCat = String(p.category || "").toLowerCase();
  const isFoodType =
    rawType.includes("food") || rawType.includes("fnb") || rawCat.includes("food") || rawCat.includes("kuliner");
  const isPhysicalType =
    rawType.includes("physical") ||
    rawType.includes("fisik") ||
    rawCat.includes("fisik") ||
    isFoodType ||
    Boolean(p.requires_shipping) ||
    Boolean(p.requiresShipping);
  const resolvedType = isFoodType
    ? "food"
    : isPhysicalType
    ? "physical"
    : rawType.includes("service") || rawType.includes("jasa") || rawCat.includes("jasa")
    ? "service"
    : "digital";
  const resolvedProductType =
    p.product_type || (isFoodType ? "FOOD" : isPhysicalType ? "PHYSICAL" : resolvedType.toUpperCase());
  const requiresShipping = Boolean(p.requires_shipping || p.requiresShipping || isPhysicalType || isFoodType);

  return {
    id: p.id !== undefined && p.id !== null ? p.id : `prod-${idx + 1}`,
    name: p.name || p.title || `Layanan ${idx + 1}`,
    category: p.category || categoryBadge,
    type: resolvedType,
    product_type: resolvedProductType,
    requires_shipping: requiresShipping,
    slug: p.slug,
    price,
    originalPrice,
    image: sanitizedImg,
    image_url: sanitizedImg,
    description: typeof p.description === "string" ? p.description : "",
    badge: categoryBadge,
    promo: typeof p.promo === "string" ? p.promo : "",
    custom_badge: typeof p.custom_badge === "string" ? p.custom_badge : undefined,
    features: Array.isArray(p.features) && p.features.length > 0 ? p.features : [],
    modules: Array.isArray(p.modules) ? p.modules : undefined,
    promo_price: rawPromoPrice,
    download_url:
      p.download_url ||
      (p as any).delivery_url ||
      (p as any).link_digital ||
      (p as any).asset_reference ||
      (p as any).fulfillment_metadata?.access_url ||
      "",
    stock: p.stock !== undefined && p.stock !== null ? Number(p.stock) : 999,
    sku: p.sku || `SKU-${idx + 1}`,
    external_url: p.external_url || undefined,
    cta_label: p.cta_label,
    checkout_type: p.checkout_type || "standard",
    metadata: p.metadata || {},
    is_active: !isExplicitlyInactive,
  };
}

export default function TenantStorefrontPage() {
  const params = useParams();
  const router = useRouter();
  const rawTenant = (params?.tenant as string) || "";
  const normalizedSlug = normalizeTenantSlug(rawTenant.toLowerCase().trim());
  const tenantSlug = normalizedSlug || rawTenant.toLowerCase().trim();
  const displayName = tenantSlug.replace(/[-_]/g, " ");

  const initialConfig = getTenantConfig(tenantSlug);
  const isInitialPublicService = isPublicServiceTenant(initialConfig, (initialConfig as any)?.metadata, tenantSlug);

  const [tenant, setTenant] = useState<any>(() => (isInitialPublicService ? initialConfig : null));
  const [tenantMetadata, setTenantMetadata] = useState<any>(() =>
    isInitialPublicService && initialConfig
      ? {
          ...initialConfig,
          title: initialConfig.title,
          subtitle: initialConfig.subtitle,
          lurah: initialConfig.lurah,
          address: initialConfig.address,
          business_type: initialConfig.business_type,
          category: initialConfig.category,
          products: initialConfig.pricing?.custom_packages || [],
        }
      : null
  );
  const [storeStatus, setStoreStatus] = useState<"checking" | "active" | "not_found">(() =>
    isInitialPublicService ? "active" : "checking"
  );
  const [storeName, setStoreName] = useState(() =>
    isInitialPublicService && initialConfig ? initialConfig.name || displayName : ""
  );
  const [storeProducts, setStoreProducts] = useState<Product[]>(() => {
    if (isInitialPublicService && initialConfig) {
      return (initialConfig.pricing?.custom_packages || []).map((p: any, idx: number) =>
        mapProductItemToStoreProduct(
          {
            ...p,
            category: "Layanan Publik",
          },
          idx
        )
      );
    }
    return [];
  });

  const [dynamicQuickReplies, setDynamicQuickReplies] = useState<string[]>([]);

  // 0c. FETCH TENANT DATA (SUPABASE / EDGE DATA)
  useEffect(() => {
    let isMounted = true;

    async function loadTenantAndCatalog() {
      if (!tenantSlug) return;
      try {
        const supabase = getSupabase();
        const { data: tenantData, error } = await supabase
          .from("tenants")
          .select("id, name, slug, category, tier, status, business_type, template_code, metadata")
          .eq("slug", tenantSlug)
          .single();

        if (error || !tenantData) {
          const fallbackConfig = getTenantConfig(tenantSlug);
          if (fallbackConfig) {
            if (isMounted) {
              setTenant(fallbackConfig);
              setStoreName(fallbackConfig.name || displayName);
              setTenantMetadata(fallbackConfig);
              setStoreProducts(
                (fallbackConfig.pricing?.custom_packages || []).map((p: any, idx: number) =>
                  mapProductItemToStoreProduct(p, idx)
                )
              );
              setStoreStatus("active");
            }
            return;
          }

          if (isMounted) {
            setStoreStatus("not_found");
          }
          return;
        }

        const tenantRow = tenantData;
        let sqlProducts: any[] = [];
        try {
          const { data: prodsData } = await supabase
            .from("products")
            .select("*")
            .eq("tenant_id", tenantRow.id);
          sqlProducts = prodsData || [];
        } catch {}

        if (isMounted) {
          setTenant(tenantRow);
          setStoreName(tenantRow.name || displayName);
          const meta = tenantRow.metadata || {};
          setTenantMetadata(meta);

          const rawProds = Array.isArray(meta.products) ? meta.products : [];
          const prodsList = rawProds.filter((p: any) => p !== null && typeof p === "object");
          const combinedProds = [...prodsList];
          const existingSlugs = new Set(prodsList.map((p: any) => (p.slug || "").toLowerCase()));
          const existingIds = new Set(prodsList.map((p: any) => String(p.id)));

          for (const sp of sqlProducts) {
            const spSlug = (sp.slug || "").toLowerCase();
            const spId = String(sp.id);
            if (!existingSlugs.has(spSlug) && !existingIds.has(spId)) {
              combinedProds.push({
                id: sp.id,
                name: sp.title || `Produk`,
                title: sp.title,
                slug: sp.slug,
                category: sp.category || "Digital",
                product_type: sp.product_type || "DIGITAL",
                requires_shipping: Boolean(
                  sp.requires_shipping ||
                    String(sp.product_type || "").toUpperCase() === "PHYSICAL" ||
                    String(sp.product_type || "").toUpperCase() === "FOOD"
                ),
                type:
                  String(sp.product_type || "").toUpperCase() === "FOOD"
                    ? "food"
                    : String(sp.product_type || "").toUpperCase() === "PHYSICAL"
                    ? "physical"
                    : "digital",
                price: Number(sp.price) || 0,
                promo_price: sp.promo_price ? Number(sp.promo_price) : 0,
                download_url: sp.link_digital || sp.fulfillment_metadata?.access_url || "",
                stock: sp.stock ?? 999999,
                is_unlimited: sp.is_unlimited_stock ?? true,
                fulfillment_metadata: sp.fulfillment_metadata,
                single_page_config: sp.fulfillment_metadata?.single_page_config,
              });
            }
          }

          setStoreProducts(
            combinedProds
              .filter(Boolean)
              .map((p: unknown, idx: number) => mapProductItemToStoreProduct(p, idx))
              .filter((p: Product) => p.is_active !== false)
          );
          setStoreStatus("active");
        }
      } catch (err) {
        console.error("[TenantRuntime] Failed to load tenant record:", err);
        if (isMounted) {
          const fallbackConfig = getTenantConfig(tenantSlug);
          if (fallbackConfig) {
            setTenant(fallbackConfig);
            setStoreName(fallbackConfig.name || displayName);
            setTenantMetadata(fallbackConfig);
            setStoreProducts(
              (fallbackConfig.pricing?.custom_packages || []).map((p: any, idx: number) =>
                mapProductItemToStoreProduct(p, idx)
              )
            );
            setStoreStatus("active");
          } else {
            setStoreStatus("not_found");
          }
        }
      }
    }

    loadTenantAndCatalog();

    return () => {
      isMounted = false;
    };
  }, [tenantSlug, displayName]);

  // CANONICAL TENANT RUNTIME BOUNDARY RESOLUTION
  const [host, setHost] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setHost(window.location.host);
    }
  }, []);

  const pipeline = executeStorefrontRuntimePipeline({
    host: host || (typeof window !== "undefined" ? window.location.host : ""),
    tenantSlug,
    tenantRecord: tenant ? { ...tenant, slug: tenantSlug, metadata: tenantMetadata } : null,
  });

  const runtime = pipeline.runtime;
  const templateResult = pipeline.templateResult;

  const rawChatEnabled =
    tenantMetadata?.theme?.chat_enabled ??
    tenant?.metadata?.theme?.chat_enabled ??
    tenantMetadata?.chat_enabled ??
    tenant?.metadata?.chat_enabled;
  const isChatEnabled = rawChatEnabled !== false && rawChatEnabled !== "false";

  const activeLogo =
    tenant?.metadata?.logo_url ||
    tenant?.metadata?.store_logo_url ||
    tenant?.metadata?.avatar_url ||
    tenantMetadata?.logo_url ||
    tenantMetadata?.store_logo_url ||
    tenantMetadata?.avatar_url ||
    tenant?.logo_url ||
    tenant?.avatar_url ||
    "/logo-master.png";
  const sanitizedActiveLogo = sanitizeImageUrl(activeLogo) || activeLogo;

  // RESERVED SYSTEM SLUGS CHECK
  const RESERVED_SYSTEM_SLUGS = new Set([
    "login",
    "register",
    "daftar",
    "api",
    "dashboard",
    "auth",
    "admin",
    "affiliate",
    "manager",
    "checkout",
    "pricing",
    "onboarding",
    "pilot-onboarding",
    "enterprise",
    "gym",
    "terms",
    "privacy",
    "acceptable-use",
    "refund",
    "store-original",
  ]);

  if (tenantSlug === "login" || tenantSlug === "auth") {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  if (tenantSlug === "register" || tenantSlug === "daftar") {
    return (
      <main className="min-h-[100dvh] bg-slate-50 py-12 px-4 flex flex-col items-center justify-center">
        <ShopClaimSection />
      </main>
    );
  }

  if (RESERVED_SYSTEM_SLUGS.has(tenantSlug)) {
    if (typeof window !== "undefined") router.replace("/");
    return null;
  }

  const handleOutboundClick = (url: string, _label: string) => {
    if (typeof window === "undefined") return;
    let finalUrl = url;
    try {
      const storedUtmStr = sessionStorage.getItem("boontrack_utm");
      if (storedUtmStr) {
        const utm = JSON.parse(storedUtmStr);
        if (!url.includes("utm_source")) {
          const separator = url.includes("?") ? "&" : "?";
          const paramsObj: Record<string, string> = {};
          Object.entries(utm).forEach(([k, v]) => {
            if (k.startsWith("utm_") && typeof v === "string" && v) {
              paramsObj[k] = v;
            }
          });
          const query = new URLSearchParams(paramsObj).toString();
          if (query) {
            finalUrl = `${url}${separator}${query}`;
          }
        }
      }
    } catch {}
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  };

  const runtimeContextValue = {
    runtime,
    templateResult,
    tenantId: tenant?.id || null,
    tenantSlug,
  };

  // ── TENANT TYPE DETECTION & PUBLIC SERVICE ROUTING (ADR §50 & §54) ──
  const isPublicServiceMode =
    templateResult.templateCode === "PUBLIC_SERVICE_V1" ||
    isPublicServiceTenant(tenant, tenantMetadata, tenantSlug);

  if (isPublicServiceMode) {
    return (
      <TenantRuntimeProvider value={runtimeContextValue}>
        <PublicServicePortalTemplate
          context={runtime}
          tenantSlug={tenantSlug}
          storeName={storeName || displayName}
          displayName={displayName}
          tenant={tenant}
          tenantMetadata={tenantMetadata}
          storeLogoUrl={sanitizedActiveLogo}
          storeProducts={storeProducts}
          dynamicQuickReplies={dynamicQuickReplies}
          chatEnabled={isChatEnabled}
          onInitiateCheckout={(p) => {
            trackInitiateCheckout(p.title, p.price);
          }}
          onOutboundClick={handleOutboundClick}
        />
      </TenantRuntimeProvider>
    );
  }

  // STORE STATUS CHECKS
  if (storeStatus === "checking") {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center text-xs text-slate-400 font-semibold">
        Memverifikasi portal {displayName}...
      </div>
    );
  }

  if (storeStatus === "not_found") {
    return (
      <div className="min-h-[100dvh] bg-slate-50 py-16 px-4 flex flex-col items-center justify-center text-center">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-5">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Layanan Belum Terdaftar</h2>
            <p className="text-xs text-slate-500 mt-1">
              Alamat layanan <span className="font-bold text-slate-800 font-mono">boontrack.com/{tenantSlug}</span> saat ini belum aktif atau belum didaftarkan.
            </p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left space-y-2">
            <span className="text-[11px] font-bold text-slate-700 block">Apakah Anda pemilik brand atau instansi ini?</span>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Daftarkan nama portal Anda dalam 1 menit dan aktifkan layanan digital terintegrasi otomatis.
            </p>
          </div>
          <button
            onClick={() => router.push(`/register?claim=${tenantSlug}`)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Klaim &amp; Daftarkan Layanan Ini</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // DOMAIN BOUNDARY GUARD (CTO Mandate)
  if (!runtime.isAllowedHost && runtime.statusCode === 404) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 py-16 px-4 flex flex-col items-center justify-center text-center">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-5">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">404 - Halaman Tidak Ditemukan</h2>
            <p className="text-xs text-slate-500 mt-1">
              {runtime.errorMessage || `Alamat portal boontrack.com/${tenantSlug} tidak dapat diakses di domain ini.`}
            </p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left space-y-1">
            <span className="text-[11px] font-bold text-slate-700 block">Domain Routing Boundary</span>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Portal layanan publik atau aplikasi kustom tidak tersedia pada domain katalog commerce (shop.boontrack.com). Silakan akses melalui portal resmi.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // TEMPLATE ROUTING BOUNDARY: FAIL-CLOSED RESOLVER (CTO Mandate)
  if (templateResult.status === "ERROR" || !runtime.isAllowedHost) {
    return (
      <ControlledProvisioningError
        templateCode={templateResult.templateCode || runtime.templateCode}
        tenantSlug={tenantSlug}
        errorMessage={templateResult.errorMessage || runtime.errorMessage}
      />
    );
  }

  // ── DYNAMIC VERTICAL TEMPLATE SWITCHER (Hermetic Isolation) ──
  switch (templateResult.templateCode) {
    case "PUBLIC_SERVICE_V1":
      return (
        <TenantRuntimeProvider value={runtimeContextValue}>
          <PublicServicePortalTemplate
            context={runtime}
            tenantSlug={tenantSlug}
            storeName={storeName || displayName}
            displayName={displayName}
            tenant={tenant}
            tenantMetadata={tenantMetadata}
            storeLogoUrl={sanitizedActiveLogo}
            storeProducts={storeProducts}
            dynamicQuickReplies={dynamicQuickReplies}
            chatEnabled={isChatEnabled}
            onInitiateCheckout={(p) => {
              trackInitiateCheckout(p.title, p.price);
            }}
            onOutboundClick={handleOutboundClick}
          />
        </TenantRuntimeProvider>
      );

    case "DROP_V1":
    case "SHOP_V1": {
      if (templateResult.subVariant === "personal") {
        return (
          <TenantRuntimeProvider value={runtimeContextValue}>
            <PersonalAuthorityTemplate
              tenantSlug={tenantSlug}
              storeName={storeName}
              displayName={displayName}
              tenant={tenant}
              tenantMetadata={tenantMetadata}
              storeLogoUrl={sanitizedActiveLogo}
              storeProducts={storeProducts}
              dynamicQuickReplies={dynamicQuickReplies}
              chatEnabled={isChatEnabled}
              onInitiateCheckout={(p) => {
                trackInitiateCheckout(p.title, p.price);
              }}
              onOutboundClick={handleOutboundClick}
            />
          </TenantRuntimeProvider>
        );
      }

      if (templateResult.subVariant === "microsite") {
        return (
          <TenantRuntimeProvider value={runtimeContextValue}>
            <MicrositeBioTemplate
              tenantSlug={tenantSlug}
              storeName={storeName}
              displayName={displayName}
              tenant={tenant}
              tenantMetadata={tenantMetadata}
              storeLogoUrl={sanitizedActiveLogo}
              storeProducts={storeProducts}
              dynamicQuickReplies={dynamicQuickReplies}
              chatEnabled={isChatEnabled}
              onInitiateCheckout={(p) => {
                trackInitiateCheckout(p.title, p.price);
              }}
              onOutboundClick={handleOutboundClick}
            />
          </TenantRuntimeProvider>
        );
      }

      if (templateResult.subVariant === "storefront") {
        return (
          <TenantRuntimeProvider value={runtimeContextValue}>
            <StorefrontTemplate
              context={runtime}
              tenantSlug={tenantSlug}
              storeName={storeName || displayName}
              displayName={displayName}
              tenant={tenant}
              tenantMetadata={tenantMetadata}
              storeProducts={storeProducts}
              dynamicQuickReplies={dynamicQuickReplies}
              chatEnabled={isChatEnabled}
              onOutboundClick={handleOutboundClick}
            />
          </TenantRuntimeProvider>
        );
      }

      return (
        <ControlledProvisioningError
          templateCode={templateResult.templateCode}
          tenantSlug={tenantSlug}
          errorMessage={`Sub-varian template '${templateResult.subVariant}' tidak didukung atau korup.`}
        />
      );
    }

    default:
      return (
        <ControlledProvisioningError
          templateCode={runtime.tenant?.template_code || runtime.templateCode}
          tenantSlug={tenantSlug}
          errorMessage={runtime.errorMessage}
        />
      );
  }
}