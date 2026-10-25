'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { resolveCustomHtmlTenantAssets } from '@/lib/product-catalog';
import { isSection10TakeoverEligible } from '@/lib/product-catalog';

export interface Section10Config {
  is_enabled?: boolean;
  is_active?: boolean;
  custom_html?: string;
  html?: string;
  [key: string]: any;
}

interface Section10CustomHtmlProps {
  metadata?: Record<string, any> | null;
  sectionConfig?: Section10Config | null;
  className?: string;
  tenantSlug?: string;
}

/**
 * Section10CustomHtml
 * Dynamic custom HTML & script injection for Storefront Section 10 (Zero Hardcoding Policy).
 * STRICT GUARDRAIL: Tag <script> dan <style> DILARANG di-strip / dipotong.
 * Script tags are dynamically re-hydrated & executed in browser runtime per HTML5 spec.
 */
export default function Section10CustomHtml({
  metadata,
  sectionConfig,
  className = '',
  tenantSlug: propTenantSlug,
}: Section10CustomHtmlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const routeParams = useParams();
  const pathname = usePathname();

  // STRICT GUARDRAIL (Anti-Leakage / Visual QA PR #78):
  // Wajibkan pathname mengandung segmen /p/ (contoh: /\/p\/[^/]+/.test(pathname || '')).
  // Jika pathname tidak mengandung /p/, Section10CustomHtml WAJIB return null secepatnya.
  const isProductRoute = Boolean(pathname && /\/p\/[^/]+/.test(pathname || ''));
  if (!isProductRoute) {
    return null;
  }

  // 1. Dynamic resolution across theme_config, storefront_sections, sections, and root metadata
  const sec =
    sectionConfig ||
    metadata?.theme_config?.section_10 ||
    metadata?.storefront_sections?.section_10 ||
    metadata?.sections?.section_10 ||
    metadata?.section_10;

  const isEnabled = Boolean(sec?.is_enabled ?? sec?.is_active ?? false);
  const rawSourceHtml = sec?.html_content || sec?.custom_html || sec?.html || '';

  // 2. Strict tenant-scoped asset base resolution (Zero Cross-Tenant Leakage)
  const effectiveSlug =
    propTenantSlug ||
    (routeParams?.tenant as string) ||
    metadata?.slug ||
    metadata?.tenant_slug ||
    sectionConfig?.tenant_slug ||
    '';

  const assetBase = effectiveSlug ? `/tenants/${encodeURIComponent(effectiveSlug)}/` : '';

  // Dynamically resolve relative asset references (CSS, JS, images, lightboxes) to tenant directory
  let rawHtml = resolveCustomHtmlTenantAssets(rawSourceHtml, effectiveSlug);
  if (rawHtml && assetBase) {
    rawHtml = rawHtml.replace(
      /(href|src)=["'](?!https?:\/\/|\/|#|data:)([^"']+)["']/gi,
      (_match: string, attr: string, val: string) => `${attr}="${assetBase}${val}"`
    );
  }

  // STRICT GUARDRAIL (CTO Mandate - Issue #77):
  // Section 10 Takeover HANYA boleh dievaluasi dan dirender pada rute detail produk dinamis (/[tenant]/p/[slug] atau /[tenant]/p/[sku]).
  // Di halaman root storefront (/[tenant]), Section 10 DILARANG KERAS dievaluasi atau dirender.
  // Halaman root storefront wajib selalu merender frontpage standar toko.
  // This component may be mounted by shared storefront templates, so metadata/config
  // must never be treated as proof that the current URL is a product-detail route.
  // The canonical Next.js route is /[tenant]/p/[slug]; require its actual URL slug.
  const routeSlug = (routeParams?.slug as string) || '';
  const routeSku = (routeParams?.sku as string) || '';

  const isTakeoverAllowed = Boolean(
    routeSlug &&
    isSection10TakeoverEligible(effectiveSlug, routeSku, routeSlug)
  );

  if (!isTakeoverAllowed) {
    return null;
  }

  // 3. Fail-closed: Zero vertical placeholder leakage if disabled or empty
  if (!isEnabled || !rawHtml || typeof rawHtml !== 'string' || !rawHtml.trim()) {
    return null;
  }

  // STRICT DARK THEME ALIGNMENT (HOTFIX & STYLING):
  // Pastikan tema gelap total diterapkan pada takeover Section 10 untuk menghindari tabrakan kontras visual (belang)
  if (isTakeoverAllowed && rawHtml) {
    rawHtml = rawHtml
      .replace(/\bbg-white\b/g, 'bg-[#0a0a0a]')
      .replace(/\bbg-zinc-50\b/g, 'bg-zinc-950')
      .replace(/\bbg-slate-50\b/g, 'bg-zinc-950')
      .replace(/\bbg-gray-50\b/g, 'bg-zinc-950')
      .replace(/\btext-slate-900\b/g, 'text-zinc-100')
      .replace(/\btext-gray-900\b/g, 'text-zinc-100')
      .replace(/\btext-black\b/g, 'text-zinc-100')
      .replace(/\btext-slate-800\b/g, 'text-zinc-200')
      .replace(/\btext-slate-700\b/g, 'text-zinc-200')
      .replace(/\btext-slate-600\b/g, 'text-zinc-300')
      .replace(/\btext-slate-500\b/g, 'text-zinc-400');

    const darkStyleOverride = `
<style id="ob-sec10-dark-theme-override">
  #onlineboost-landing-root,
  .ob-sec10-wrap {
    background-color: #0a0a0a !important;
    color: #f4f4f5 !important;
  }
  .site-header {
    background: rgba(10, 10, 10, 0.92) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border-bottom: 1px solid rgba(245, 158, 11, 0.2) !important;
  }
  .hero-section {
    background-color: #0a0a0a !important;
  }
  .hero-headline {
    color: #ffffff !important;
  }
  .hero-headline .text-gradient-gold,
  .text-gradient-gold {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%) !important;
    -webkit-background-clip: text !important;
    -webkit-text-fill-color: transparent !important;
    color: #fbbf24 !important;
    text-shadow: 0 0 24px rgba(251, 191, 36, 0.25);
  }
  .hero-subheadline {
    color: #d4d4d8 !important;
  }
  .badge-pill {
    background: rgba(245, 158, 11, 0.1) !important;
    border: 1px solid rgba(245, 158, 11, 0.2) !important;
    color: #fcd34d !important;
  }
  .hero-trust-bar {
    border-top-color: rgba(255, 255, 255, 0.08) !important;
  }
  .trust-item {
    color: #e4e4e7 !important;
  }
  .trust-item svg,
  .trust-item svg polyline {
    color: #fbbf24 !important;
    stroke: #fbbf24 !important;
    filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.6));
  }
  .hero-micro-copy {
    color: #e4e4e7 !important;
  }
  .hero-sub-checkout-trigger {
    color: #fef08a !important;
    text-shadow: 0 0 10px rgba(254, 240, 138, 0.3);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .hero-sub-checkout-trigger:hover {
    color: #facc15 !important;
  }
  .glass-card,
  .hero-showcase-card,
  .comparison-panel,
  .price-card,
  .faq-item {
    background: #11141a !important;
    border-color: rgba(245, 158, 11, 0.18) !important;
    color: #e4e4e7 !important;
  }
  section.section-padding,
  .section-padding {
    background-color: #0a0a0a !important;
  }
</style>`;

    if (!rawHtml.includes('id="ob-sec10-dark-theme-override"')) {
      rawHtml = darkStyleOverride + rawHtml;
    }
  }

  // 4. Browser script re-hydration: HTML5 spec ignores script tags in innerHTML / dangerouslySetInnerHTML
  useEffect(() => {
    if (!rawHtml || typeof window === 'undefined') return;

    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      const scripts = container.querySelectorAll('script');
      scripts.forEach((oldScript) => {
        if (oldScript.dataset.hydrated === 'true') return;

        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value);
        });
        newScript.dataset.hydrated = 'true';
        newScript.async = false; // Preserve sequential script execution order

        // Copy script content
        if (oldScript.innerHTML) {
          newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        }

        oldScript.parentNode?.replaceChild(newScript, oldScript);
      });
    }, 40);

    return () => clearTimeout(timer);
  }, [rawHtml]);

  return (
    <div
      ref={containerRef}
      id="onlineboost-landing-root"
      className={`ob-sec10-wrap w-full overflow-hidden transition-all ${isTakeoverAllowed ? 'bg-[#0a0a0a] text-zinc-100' : ''} ${className}`}
      dangerouslySetInnerHTML={{ __html: rawHtml }}
    />
  );
}
