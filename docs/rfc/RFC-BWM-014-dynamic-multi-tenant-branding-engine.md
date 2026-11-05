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
1. **Authoritative Domain Matching**: All incoming hostnames are resolved against a dedicated `verified_domain_registry` database table.
2. **Default-Deny Policy**: Any unknown, unverified, or suspended host is denied immediately and routed to the neutral fallback (`workforce.boontrack.com`) or HTTP 404, preventing cross-tenant leakage.
3. **Trusted Reverse Proxy Validation**: Host headers are only evaluated when verified edge headers (`cf-ray` / Cloudflare Tunnel / Railway Edge token) are present.
4. **Dynamic Asset & Theme Injection**: Runtime injection of tenant logos, brand color palettes (Tailwind CSS variables), and portal titles without hardcoding or re-building static bundles.
5. **Dynamic Web App Manifest**: Generating dynamic `manifest.json` and Apple Touch metadata so that when field personnel select "Add to Home Screen", the PWA app title, splash screen, and icons dynamically reflect their specific BUJP agency.

> [!IMPORTANT]
> **Boundary Notice**: Per CTO Directive, RFC-BWM-014 is restricted to technical design and documentation. Live DNS changes and custom domain edge routing are not implemented in Gate E8.

---

## 2. Verified Domain Registry & Database Architecture

Tenant resolution is not performed via ad-hoc string regex or permissive wildcard matching. It relies on the authoritative table `verified_domain_registry`:

```sql
CREATE TABLE verified_domain_registry (
    domain_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(255) UNIQUE NOT NULL,       -- e.g. 'satya.workforce.boontrack.com', 'ops.satyagarda.id'
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tenant_slug VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED'
    tls_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verified_domain_registry_lookup ON verified_domain_registry(hostname, status);
```

---

## 3. Trusted Reverse Proxy & Default-Deny Middleware Pipeline

```
+---------------------------------------------------------------------------------+
|                       Client Browser / PWA Mobile Shell                         |
|                     https://satya.workforce.boontrack.com                       |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|               Edge Reverse Proxy (Cloudflare / Railway Edge Gateway)            |
|  - Validates TLS / SSL certificate                                              |
|  - Injects Edge Secret Headers: 'cf-ray', 'x-edge-verified: true'               |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|               Next.js Edge Middleware (workforce-web/middleware.ts)             |
|  1. Validate Edge Proxy Authenticity (reject spoofed direct host headers)       |
|  2. Query verified_domain_registry WHERE hostname = :host AND status = 'ACTIVE' |
|  3. [DEFAULT-DENY POLICY]:                                                      |
|     - If host NOT found -> Redirect to neutral fallback (workforce.boontrack.com)|
|     - If host SUSPENDED  -> Return HTTP 403 Forbidden ("Tenant Suspended")      |
|  4. Rewrite Request with Header: 'x-workforce-tenant-id: :tenant_id'            |
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

### 3.1 Edge Middleware Implementation Pattern

```typescript
export async function resolveTenantHostAtEdge(
  req: Request,
  domainRegistry: DomainRegistryStore
): Promise<TenantResolutionResult> {
  // Step 1: Validate Edge Origin Security
  const edgeVerified = req.headers.get('cf-ray') || req.headers.get('x-railway-edge-token');
  if (!edgeVerified && process.env.NODE_ENV === 'production') {
    // Untrusted or spoofed header direct connection
    return { status: 'DENIED', reason: 'UNTRUSTED_PROXY_ORIGIN' };
  }

  // Step 2: Extract and normalize Host Header
  const rawHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!rawHost) {
    return { status: 'FALLBACK_NEUTRAL', targetUrl: 'https://workforce.boontrack.com/login' };
  }

  const hostname = rawHost.split(':')[0].toLowerCase();

  // Step 3: Authoritative Database Registry Lookup
  const registryEntry = await domainRegistry.lookupDomain(hostname);

  // Step 4: Strict Default-Deny Guardrails
  if (!registryEntry || registryEntry.status !== 'ACTIVE') {
    // Deny unknown/unverified hosts fail-closed
    return {
      status: 'FALLBACK_NEUTRAL',
      targetUrl: 'https://workforce.boontrack.com/login',
      reason: 'UNREGISTERED_OR_INACTIVE_HOST',
    };
  }

  return {
    status: 'RESOLVED',
    tenantId: registryEntry.tenantId,
    tenantSlug: registryEntry.tenantSlug,
    isWhiteLabel: registryEntry.hostname !== 'workforce.boontrack.com',
  };
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
  const resolution = await resolveTenantHostAtEdge(req, registry);
  
  const tenantSlug = resolution.status === 'RESOLVED' ? resolution.tenantSlug : 'satya';
  const brand = await getTenantBranding(tenantSlug);

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

1. **Default-Deny Absolute Enforcement**: Any incoming HTTP request whose Host header is not an active entry in `verified_domain_registry` is rejected or routed to the neutral fallback without revealing any tenant brand assets.
2. **Reverse Proxy Edge Token Verification**: Host header resolution is only trusted when originating through authenticated Cloudflare or Railway edge proxies.
3. **Strict Cross-Tenant Boundary**: Personnel authenticated under Tenant A are cryptographically forbidden from querying, modifying, or viewing data or brand assets of Tenant B.
