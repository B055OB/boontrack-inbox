'use client';

import React, { useEffect, useRef } from 'react';

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
}: Section10CustomHtmlProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Dynamic resolution across theme_config, storefront_sections, sections, and root metadata
  const sec =
    sectionConfig ||
    metadata?.theme_config?.section_10 ||
    metadata?.storefront_sections?.section_10 ||
    metadata?.sections?.section_10 ||
    metadata?.section_10;

  const isEnabled = Boolean(sec?.is_enabled ?? sec?.is_active ?? false);
  const rawHtml = sec?.custom_html || sec?.html || '';

  // 2. Fail-closed: Zero vertical placeholder leakage if disabled or empty
  if (!isEnabled || !rawHtml || typeof rawHtml !== 'string' || !rawHtml.trim()) {
    return null;
  }

  // 3. Browser script re-hydration: HTML5 spec ignores script tags in innerHTML / dangerouslySetInnerHTML
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
      id="section-10-custom-html"
      className={`w-full overflow-hidden transition-all ${className}`}
      dangerouslySetInnerHTML={{ __html: rawHtml }}
    />
  );
}
