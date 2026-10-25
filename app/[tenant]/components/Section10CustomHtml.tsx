'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
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
      className={`ob-sec10-wrap w-full overflow-hidden transition-all ${className}`}
      dangerouslySetInnerHTML={{ __html: rawHtml }}
    />
  );
}
