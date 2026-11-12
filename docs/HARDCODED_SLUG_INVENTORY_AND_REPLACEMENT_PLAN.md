# HARDCODED SLUG INVENTORY AND REPLACEMENT PLAN (PHASE 2 — TASK A.4)

- **Status:** Audit & Mapping Artifact (Read-Only Analysis — Zero Runtime Code Modified)
- **Baseline Checkpoint:** `main` @ `08c7368154656fccc8219aee4e82373119f90897`
- **Policy Authority:** `AGENTS.md` §1 (Zero Hardcoding Policy), §2 (Single Source of Truth: Supabase), §5 (Strict Multi-Tenant Data Isolation)
- **Deliverable Scope:** Exhaustive inventory of static tenant slug checks, hardcoded domain/asset paths, tenant-specific UI components, and static fixture fallbacks, paired with their target Supabase dynamic schema/metadata replacements (deferred to Phase 3 execution).

---

## 1. Executive Summary

Forensic static analysis across `app/[tenant]/`, `components/`, and `lib/` identified active violations of the **Zero Hardcoding Policy** (`AGENTS.md` §1 & §5) grouped around six recurring tenant/product archetypes:
1. **`onlineboost` / `kelas-inkubasi-ctwa-batch-1-scale`** — Global dark `#0a0a0a` layout CSS injection, mock drawer DOM hiding, funnel landing overrides, and dashboard WhatsApp/warehouse placeholders.
2. **`shabu-ajhi`** — Hardcoded F&B template defaults, global imports from `@/components/shabu-ajhi/*`, WhatsApp admin numbers, VIP card branding, instant courier checks, and delivery rate tables.
3. **`tumbuh-kembang-anak`** — Hardcoded custom domain mapping (`konsul.littlebitefeeding.com`), static OG image paths, landing page `/p/[slug]/` forks, and consultation intake phone numbers.
4. **`margasari` / `kelurahan-margasari` / `pelayanan-publik`** — Static slug routing to public-service B2G templates and hardcoded Kelurahan address/leadership/contact fixtures.
5. **Static Fallbacks (`getTenantConfig`)** — Shared storefront entrypoints falling back to in-memory tenant dictionaries instead of failing closed (`404 Not Found`) when a tenant row is missing or unconfigured.

None of these references were altered in Phase 2 (`STOREFRONT PHASE 2`). This document defines the exact Supabase-backed replacements required before Phase 3 cleanup.

---

## 2. Master Hardcoded Slug & Static Fixture Inventory

### 2.1 Public Layout, Metadata & Landing Routes (`app/[tenant]/`)

| File | Verified Lines | Hardcoded Pattern / Static Value | Functional Impact | Target Dynamic Replacement (Supabase SSOT) |
| :--- | :--- | :--- | :--- | :--- |
| [app/[tenant]/layout.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/layout.tsx) | `L55` | `'tumbuh-kembang-anak'` -> `'konsul.littlebitefeeding.com'` | Hardcodes custom domain ownership check to a single slug. | Read `tenants.custom_domain` or `tenants.metadata.custom_domain` indexed by host header lookup. |
| [app/[tenant]/layout.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/layout.tsx) | `L125` | `'/tenants/tumbuh-kembang-anak/og-image.png'` | Hardcodes OG image asset path conditional on slug. | Read `tenants.metadata.og_image_url` (or `tenants.logo_url`) dynamically for all tenants. |
| [app/[tenant]/layout.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/layout.tsx) | `L228, L233, L256-L275` | `isOnlineBoost = cleanTenant === 'onlineboost'` injecting `<style>` `#0a0a0a` override + hiding `#bt-mock-backdrop`, `#bt-mock-drawer` | Mutates global `[tenant]` layout shell for one slug; forces dark theme outside token contract. | Replace with `normalizeStorefrontTheme(metadata).tokens.mode === 'dark'` (`midnight_luxe` / declarative `tokens.brandColor`) + capability flag `metadata.features.hide_mock_drawer`. |
| [app/[tenant]/page.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/page.tsx) | `L16, L174, L230, L348` | Static fallback calls to `getTenantConfig(tenantSlug)` | Serves code-resident fixture configs when Supabase row is absent or incomplete (`AGENTS.md` §3 violation). | Query Supabase `tenants` + `tenant_settings`; return fail-closed `notFound()` (`404`) when row does not exist (`AGENTS.md` §5). |
| [app/[tenant]/types.ts](file:///c:/boontrack-inbox/app/%5Btenant%5D/types.ts) | `L87-L89` | `normSlug === 'margasari' \|\| 'kelurahan-margasari' \|\| 'pelayanan-publik'` | Couples vertical/template detection to literal municipal slugs. | Drive exclusively via `tenants.business_type` / `tenants.metadata.vertical_type === 'PUBLIC_SERVICE'`. |
| [app/[tenant]/p/[slug]/layout.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/p/%5Bslug%5D/layout.tsx) | `L25, L95` | `'tumbuh-kembang-anak'` custom domain & metadata branch | Duplicates custom-domain/SEO slug branching inside product layout. | Consume shared tenant metadata resolver (`tenants.custom_domain`, `metadata.seo`). |
| [app/[tenant]/p/[slug]/page.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/p/%5Bslug%5D/page.tsx) | `L600-608, L660, L716-743, L812, L1116-1124, L2301-2959, L5219-5231, L5409, L5797, L5822-5823, L5896-5986` | Extensive branches on `'onlineboost'`, `'kelas-inkubasi-ctwa-batch-1-scale'`, `'tumbuh-kembang-anak'`, and `#onlineboost-landing-root` | Encodes bespoke product landing UI, CTWA funnel copy, and DOM hooks directly inside shared `/p/[slug]/page.tsx`. | Store structured landing blocks inside `tenants.metadata.products[i].landing_config` (or normalized `landing_pages` JSONB keyed by `(tenant_id, product_slug)`). Use generic `#tenant-landing-root`. |
| [app/[tenant]/components/Section10CustomHtml.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/components/Section10CustomHtml.tsx) | `L120, L231` | `#onlineboost-landing-root` selector dependency | Couples shared HTML section renderer to one tenant ID selector. | Target generic scoped container `[data-tenant-landing-root]` + declarative CSS variables from `GlobalThemeTokens`. |

### 2.2 Public Vertical Storefront Templates (`app/[tenant]/components/templates/`)

| File | Verified Lines | Hardcoded Pattern / Static Value | Functional Impact | Target Dynamic Replacement (Supabase SSOT) |
| :--- | :--- | :--- | :--- | :--- |
| [PublicServicePortalTemplate.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/components/templates/PublicServicePortalTemplate.tsx) | `L110-L1183` | Kelurahan Margasari fixtures: address `'Jl. Cipagalo Girang No. 09, Margasari'`, Lurah `'Wahyu A. Affandi'`, WA `'+6281977655099'`, email `'kelurahan.margasari@bandung.go.id'` | Risks exposing Margasari government contact info and official names to any newly created `PUBLIC_SERVICE` tenant if metadata is unset. | Move all civic identity fields into `tenants.metadata.portal_profile` (`agency_name`, `head_official`, `office_address`, `hotline_whatsapp`, `official_email`, `service_catalog[]`); render empty/unconfigured state cleanly if null. |
| [FnbCateringStorefrontView.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/components/templates/FnbCateringStorefrontView.tsx) | `L45, L50, L58, L234, L254-255, L290, L540, L578, L584, L874, L896, L1040, L1080, L1914, L2010, L2020, L2121` | Imports `@/components/shabu-ajhi/*`; defaults store name `'Shabu Ajhi'`; logo `'/tenants/shabu-ajhi/logo.png'`; hardcoded WA `'6285861091103'` & `'6289617799878'`; VIP badge `'SHABU AJHI CLUB'` | High cross-tenant leakage risk: unconfigured F&B tenants inherit Shabu Ajhi's logo, VIP club branding, and route leads/orders to Shabu Ajhi's WhatsApp numbers. | Source strictly from current tenant row: `tenants.name`, `tenants.logo_url`, `tenants.whatsapp_number` / `metadata.cs_whatsapp`, `metadata.fnb_catering.vip_club_label`, `metadata.fnb_catering.slots`, and neutral generic `components/fnb/*` widgets. |

### 2.3 Shared UI Components (`components/`)

| File | Verified Lines | Hardcoded Pattern / Static Value | Functional Impact | Target Dynamic Replacement (Supabase SSOT) |
| :--- | :--- | :--- | :--- | :--- |
| [OnlineBoostLandingPage.tsx](file:///c:/boontrack-inbox/components/OnlineBoostLandingPage.tsx) | `L68-L1130` | Monolithic tenant-specific landing page living in shared `components/` | Violates `AGENTS.md` §5 subfolder isolation (`tenants/[slug]/...` or DB dynamic injection). | Migrate landing content/sections into tenant's DB `metadata.landing_sections` or move component under isolated tenant registry until deprecated. |
| [SoupSlotSelector.tsx](file:///c:/boontrack-inbox/components/SoupSlotSelector.tsx) | `L6-L7` | Shabu Ajhi-coupled soup slot configuration | Mixes tenant-specific F&B domain options into root `components/`. | Read selectable variant/slot schedules from `product.variants` / `tenants.metadata.fnb_catering.slot_options`. |
| [EquipmentReturnPicker.tsx](file:///c:/boontrack-inbox/components/shabu-ajhi/EquipmentReturnPicker.tsx) | `L15` | Tenant-named component folder (`components/shabu-ajhi/`) | Tenant-bound rental return logic stored globally instead of schema-driven rental metadata. | Generalize into reusable `components/storefront/EquipmentReturnPicker.tsx` parameterized by `metadata.fnb_catering.return_windows`. |
| [MiniIntakeForm.tsx](file:///c:/boontrack-inbox/components/storefront/MiniIntakeForm.tsx) | `L68, L74, L213` | `'tumbuh-kembang-anak'`, hardcoded fallback WA `'6285129992305'` | Consultation leads can silently route to LittleBite/Tumbuh Kembang Anak WA if tenant WA is absent or slug matches. | Require `tenant.metadata.intake_form` (fields + `target_whatsapp` / `tenants.whatsapp_number`); fail closed (disable submit) if target WA is missing. |
| [WhatsAppChatTestimonials.tsx](file:///c:/boontrack-inbox/components/storefront/WhatsAppChatTestimonials.tsx) | `L79, L82` | `'kelas-inkubasi-ctwa-batch-1-scale'` product/slug condition | Injects product-specific chat screenshots conditionally inside shared testimonial component (`AGENTS.md` §5 Asset Isolation violation). | Query `tenants.metadata.testimonials` / `product.metadata.testimonials` scoped strictly by `current_tenant`; render nothing if empty. |

### 2.4 Merchant Dashboard Modules (`app/[tenant]/dashboard/`)

| File | Verified Lines | Hardcoded Pattern / Static Value | Functional Impact | Target Dynamic Replacement (Supabase SSOT) |
| :--- | :--- | :--- | :--- | :--- |
| [InstantCourier.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/modules/fnb-culinary/InstantCourier.tsx) | `L93` | `tenantSlug === 'shabu-ajhi'` | Grants custom instant courier UI behavior exclusively by hardcoded slug. | Gate via `tenants.metadata.features.instant_courier_pricing` (`custom_zone_rates` / `biteship_instant`). |
| [ThemeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/ThemeTab.tsx) | `L85, L364` | Default Section 10 / hero title `'OnlineBoost Batch 1'` | Pre-fills unrelated merchants' theme editor inputs with OnlineBoost copy when unset. | Use empty string `""` with neutral placeholder (`"Masukkan judul headline toko Anda"`). |
| [WhatsAppTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/WhatsAppTab.tsx) | `L149` | `\|\| tenantSlug === 'onlineboost'` | Hardcodes capability visibility / bypass logic specifically for `'onlineboost'`. | Replace with tier/feature check against `tenants.tier` and `tenants.metadata.features.whatsapp_rotator` / `baileys_enabled`. |
| [BiteshipCourierConfig.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/settings/BiteshipCourierConfig.tsx) | `L935` | Hardcoded sender fallback `'Admin Gudang OnlineBoost'` | Risks printing OnlineBoost's warehouse name on other merchants' shipping labels/configs if field is blank. | Default to `tenant.name` or neutral placeholder `'Admin Gudang'` (never another tenant's brand). |

### 2.5 Core Resolvers, Catalog, Checkout, Shipping & Funnel Services (`lib/`)

| File | Verified Lines | Hardcoded Pattern / Static Value | Functional Impact | Target Dynamic Replacement (Supabase SSOT) |
| :--- | :--- | :--- | :--- | :--- |
| [lib/tenant-store-data.ts](file:///c:/boontrack-inbox/lib/tenant-store-data.ts) | `L1-L93` | Falls back to static `getTenantConfig(cleanTenant)` when `public_service \|\| B2G` | Maintains dependency on code-based fixture catalog for B2G/selected slugs. | Backfill Margasari/B2G row completely in Supabase `tenants` + `metadata`, then remove `getTenantConfig` import completely. |
| [lib/resolvers/tenant-runtime-resolver.ts](file:///c:/boontrack-inbox/lib/resolvers/tenant-runtime-resolver.ts) | `L34, L52, L284-286, L491-493` | `'tumbuh-kembang-anak'` / `'konsul.littlebitefeeding.com'`; `'margasari'`, `'kelurahan-margasari'`, `'pelayanan-publik'` | Couples domain resolution and vertical template routing to hardcoded slugs. | Resolve host domain via DB lookup (`tenants.custom_domain = host`); derive vertical strictly from `tenants.business_type` / `metadata.vertical_type`. |
| [lib/product-catalog.ts](file:///c:/boontrack-inbox/lib/product-catalog.ts) | `L14-21, L60, L156, L799-1413` | Static per-tenant product definitions & fixture catalogs | Duplicates `tenants.metadata.products` / `products` table in TypeScript source. | Eliminate static dictionaries once all active tenant SKUs exist in Supabase (`products` / `tenants.metadata.products`). |
| [lib/tenant-config.ts](file:///c:/boontrack-inbox/lib/tenant-config.ts) | `L100-L500+` | Static `DEFAULT_TENANT_CONFIGS` / slug dictionary | Direct contradiction of `AGENTS.md` §3 (`NO MOCK SERVER IN PRODUCTION CODE`). | Deprecate and remove after verifying Supabase seed parity for legacy tenants. |
| [lib/checkout-service.ts](file:///c:/boontrack-inbox/lib/checkout-service.ts) | `L185, L859` | Hardcoded tenant slug branching in checkout flow | Bypasses unified multi-tenant checkout state machine. | Parameterize checkout behaviors via `metadata.checkout_config` (`require_dp`, `skip_shipping`, `catering_slot_required`). |
| [lib/payment-webhook-service.ts](file:///c:/boontrack-inbox/lib/payment-webhook-service.ts) | `L1338-L1609` | Tenant-specific post-payment webhook logic | Special-cases fulfillment/notifications by slug inside shared webhook handler. | Move post-payment actions into declarative `metadata.fulfillment_hooks` / `automation_rules` scoped by `tenant_id`. |
| [lib/delivery/shabuAjhiRates.ts](file:///c:/boontrack-inbox/lib/delivery/shabuAjhiRates.ts) | Entire file | Tenant-named delivery rate matrix | Encodes custom regional courier pricing as TypeScript code instead of tenant configuration. | Store zone distance/fee table inside `tenants.metadata.shipping.custom_zones` and delete tenant-named module. |
| [lib/shipping/deliveryCalculator.ts](file:///c:/boontrack-inbox/lib/shipping/deliveryCalculator.ts) | `L4, L53, L607` | Imports & delegates to `shabuAjhiRates` by slug | Embeds single-merchant rate logic in global delivery calculator. | Evaluate `metadata.shipping.custom_zones` generically for any tenant configured with manual zone rates. |
| [lib/checkout/cateringCheckoutRouting.ts](file:///c:/boontrack-inbox/lib/checkout/cateringCheckoutRouting.ts) | `L4-L302` | Hardcoded catering routing branches keyed by tenant/slug | Prevents other F&B merchants from configuring deposit/equipment rules dynamically. | Load catering routing rules from `tenants.metadata.fnb_catering.checkout_rules`. |
| [lib/funnel/consultation-lead-funnel.ts](file:///c:/boontrack-inbox/lib/funnel/consultation-lead-funnel.ts) | `L70, L354` | Hardcoded consultation funnel slug logic | Restricts lead qualification / intake workflow to hardcoded tenant slug. | Configure lead funnel steps in `tenants.metadata.funnel_config` scoped by `tenant_id`. |

---

## 3. Target Unified Supabase Metadata Contract (Migration Mapping)

Before removing any static slug check in Phase 3, each affected tenant's Supabase row (`tenants` + `tenants.metadata`) must hold equivalent structured configuration so live storefronts experience **zero breaking changes**:

```jsonc
// Target fields inside tenants (table) & tenants.metadata (JSONB)
{
  // Table columns (tenants)
  "slug": "<tenant-slug>",
  "custom_domain": "konsul.example.com",     // Replaces hardcoded domain checks
  "tier": "PRO_SCALE",                       // Replaces slug-based feature overrides
  "business_type": "FNB_CATERING",           // Replaces slug-based vertical detection

  // Declarative JSONB (tenants.metadata)
  "metadata": {
    "og_image_url": "https://cdn.../og.png", // Replaces /tenants/<slug>/og-image.png
    "cs_whatsapp": "628xxxxxxxxxx",          // Replaces fallback WA numbers
    "storefront_v2": {
      "version": 2,
      "preset": "retail_classic",            // Consumed via normalizeStorefrontTheme()
      "tokens": {
        "brandColor": "#2563EB",
        "mode": "dark",                      // Replaces #0a0a0a CSS injection in layout.tsx
        "fontFamily": "plus_jakarta_sans",
        "borderRadius": "rounded",
        "buttonStyle": "solid"
      }
    },
    "features": {
      "hide_mock_drawer": true,              // Replaces layout.tsx CSS mock drawer hiding
      "whatsapp_rotator": true,              // Replaces WhatsAppTab.tsx slug bypass
      "instant_courier_pricing": true        // Replaces InstantCourier.tsx slug check
    },
    "shipping": {
      "sender_name": "Nama Gudang Toko",     // Replaces 'Admin Gudang OnlineBoost'
      "custom_zones": []                     // Replaces lib/delivery/shabuAjhiRates.ts
    },
    "fnb_catering": {                        // Replaces hardcoded Shabu Ajhi constants
      "vip_club_label": "...",
      "return_windows": [],
      "checkout_rules": {}
    },
    "portal_profile": {                      // Replaces Kelurahan Margasari fixtures
      "agency_name": "...",
      "head_official": "...",
      "office_address": "...",
      "official_email": "..."
    },
    "intake_form": {},                       // Replaces MiniIntakeForm.tsx slug checks
    "testimonials": []                       // Replaces WhatsAppChatTestimonials.tsx slug checks
  }
}
```

---

## 4. Phased Decommissioning Order (Recommended for Phase 3)

1. **Wave 1 (P0 — Cross-Tenant Leakage Elimination):**
   Remove fallback names, logos, VIP club labels, and WhatsApp numbers from [FnbCateringStorefrontView.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/components/templates/FnbCateringStorefrontView.tsx), [PublicServicePortalTemplate.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/components/templates/PublicServicePortalTemplate.tsx), [MiniIntakeForm.tsx](file:///c:/boontrack-inbox/components/storefront/MiniIntakeForm.tsx), [ThemeTab.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/tabs/ThemeTab.tsx), and [BiteshipCourierConfig.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/dashboard/components/settings/BiteshipCourierConfig.tsx) once live DB rows for `shabu-ajhi`, `margasari`, and `tumbuh-kembang-anak` are verified populated.
2. **Wave 2 (P1 — Layout & Theme Harmonization):**
   Replace [app/[tenant]/layout.tsx](file:///c:/boontrack-inbox/app/%5Btenant%5D/layout.tsx) dark CSS slug injection (`onlineboost`) and custom domain check (`tumbuh-kembang-anak`) with `normalizeStorefrontTheme(metadata)` + DB `custom_domain`.
3. **Wave 3 (P2 — Vertical Resolvers, Delivery Rates & Static Dictionaries):**
   Migrate [lib/delivery/shabuAjhiRates.ts](file:///c:/boontrack-inbox/lib/delivery/shabuAjhiRates.ts), [lib/tenant-config.ts](file:///c:/boontrack-inbox/lib/tenant-config.ts), [lib/product-catalog.ts](file:///c:/boontrack-inbox/lib/product-catalog.ts), and `app/[tenant]/p/[slug]/page.tsx` conditional blocks after DB parity audits pass staging tests.
