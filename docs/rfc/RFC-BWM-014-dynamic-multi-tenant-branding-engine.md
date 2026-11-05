# RFC-BWM-014: Dynamic Multi-Tenant Branding Engine & Tenant Resolution

- **Status**: APPROVED (Documentation & Technical Design Only)
- **Author**: BWM Architecture Working Group
- **Reviewers**: CTO, Head of Product Engineering
- **Target Subsystem**: Workforce Web PWA (`workforce-web/`)
- **Blast Radius**: ISOLATED (Zero DNS modification, Zero production infrastructure change)

---

## 1. Executive Summary

BWM serves both direct enterprise clients and Master Reseller BUJP partners (e.g., PT Satya Garda Perkasa) who operate white-label security operations.
RFC-BWM-014 defines the architectural specification for the **Dynamic Multi-Tenant Branding Engine**, enabling:
1. **Subdomain-Based Tenant Resolution**: Dynamically resolving tenants from hostnames (e.g. `satya.workforce.boontrack.com` or custom CNAMEs).
2. **Dynamic Asset & Theme Injection**: Runtime injection of tenant logos, brand color palettes (Tailwind CSS variables), and portal titles without hardcoding or re-building static bundles.
3. **Dynamic Web App Manifest**: Generating dynamic `manifest.json` and Apple Touch metadata so that when field personnel select "Add to Home Screen", the PWA app title, splash screen, and icons dynamically reflect their specific BUJP agency.

> [!IMPORTANT]
> **Boundary Notice**: Per CTO Directive, RFC-BWM-014 is restricted to technical design and documentation. Live DNS changes and custom domain edge routing are not implemented in Gate E8.

---

## 2. Architecture & Subdomain Resolution Pipeline

```
+---------------------------------------------------------------------------------+
|                       Client Browser / PWA Mobile Shell                         |
|                     https://satya.workforce.boontrack.com                       |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|               Next.js Edge Middleware (workforce-web/middleware.ts)             |
|  1. Extract Hostname: 'satya.workforce.boontrack.com'                           |
|  2. Parse Subdomain Slug: 'satya'                                               |
|  3. Lookup Tenant Branding Metadata in Cache / DB (tenants table)               |
|  4. Rewrite Request with Header: 'x-workforce-tenant-id: tenant_satya_001'     |
+---------------------------------------------------------------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
+--------------------------------------+ +----------------------------------------+
|          App Route Layout            | |        Dynamic PWA Manifest Route      |
|     (workforce-web/app/layout.tsx)   | |      (/api/manifest/[tenant_slug])     |
|  - Injects CSS Theme Variables       | |  - Injects dynamic name & short_name   |
|  - Renders Tenant Logo & Agency Title| |  - Dynamic icons (192x192, 512x512)    |
|  - Dynamic Favicon & Apple Touch Icon| |  - Dynamic theme_color & background    |
+--------------------------------------+ +----------------------------------------+
```

---

## 3. Dynamic Next.js Middleware Tenant Resolution

```typescript
// Architectural Pattern (Design Specification)
export function resolveTenantFromHost(host: string | null): TenantContext {
  if (!host) {
    return { tenantSlug: 'default', tenantId: 'tenant_default', isWhiteLabel: false };
  }

  // Handle subdomain matching: <subdomain>.workforce.boontrack.com
  const cleanHost = host.split(':')[0].toLowerCase();
  const parts = cleanHost.split('.');

  if (cleanHost.endsWith('.workforce.boontrack.com')) {
    const subdomain = parts[0];
    if (subdomain !== 'www' && subdomain !== 'workforce') {
      return {
        tenantSlug: subdomain,
        tenantId: `tenant_${subdomain}`,
        isWhiteLabel: true,
      };
    }
  }

  // Direct workforce domain fallback
  return { tenantSlug: 'satya', tenantId: 'tenant_satya_001', isWhiteLabel: false };
}
```

---

## 4. Theme & Brand Asset Injection

To preserve the **Zero Hardcoding Policy**, all brand assets are loaded dynamically from the tenant record (`tenants.metadata.branding`):

```json
{
  "agency_name": "PT Satya Garda Perkasa",
  "brand_title": "SATYA WORKFORCE",
  "portal_subtitle": "Enterprise BUJP Workforce & Patrol Operations",
  "logo_url": "https://cdn.boontrack.com/tenants/satya/logo.png",
  "favicon_url": "https://cdn.boontrack.com/tenants/satya/favicon.ico",
  "colors": {
    "primary": "#059669",
    "primary_hover": "#047857",
    "primary_surface": "#ecfdf5",
    "accent": "#0d9488",
    "header_gradient_from": "#064e3b",
    "header_gradient_to": "#0f766e"
  }
}
```

In the root layout, these are applied via CSS variables:
```html
<style>
  :root {
    --brand-primary: #059669;
    --brand-primary-hover: #047857;
    --brand-primary-surface: #ecfdf5;
  }
</style>
```

---

## 5. Dynamic Web App Manifest (`manifest.json`) Specification

When field officers install the PWA on Android / iOS devices, the PWA manifest route dynamically serves the tenant-tailored manifest:

### 5.1 Route Definition: `/api/manifest` (or `workforce.webmanifest`)

```typescript
export async function GET(req: Request) {
  const host = req.headers.get('host');
  const tenant = resolveTenantFromHost(host);
  const brand = await getTenantBranding(tenant.tenantSlug);

  const manifest = {
    name: `${brand.agency_name} — Workforce`,
    short_name: brand.brand_title,
    description: `Portal Presensi & Patroli Keamanan ${brand.agency_name}`,
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: brand.colors.primary,
    icons: [
      {
        src: brand.icon_192 || '/icons/workforce-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: brand.icon_512 || '/icons/workforce-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
```

---

## 6. Security & Isolation Invariants

1. **Strict Multi-Tenant Scoping**: A personnel authenticated under tenant `satya` cannot access data, sites, or checkpoints belonging to another agency (`tenant_wuling` or `tenant_bujp_beta`).
2. **No Global Mutation**: Shared components consume CSS variables and props derived from the tenant context; hardcoding tenant names or colors in JSX is strictly prohibited.
3. **Fail-Closed on Unknown Host**: If an unknown custom domain or unmapped subdomain hits the edge, the system fails-closed to a clean 404 or default Satya preview, preventing any cross-tenant data leakage.
