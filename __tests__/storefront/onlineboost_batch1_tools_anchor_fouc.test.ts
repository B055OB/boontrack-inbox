import fs from 'fs';
import path from 'path';
import { buildWabaStorefrontConsultationUrl } from '@/app/[tenant]/p/[slug]/page';

describe('TASK: OnlineBoost Batch 1 #tools Anchor & Dark Theme Rehydration Guard', () => {
  const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
  const layoutPath = path.join(process.cwd(), 'app/[tenant]/layout.tsx');

  const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');
  const layoutContent = fs.readFileSync(layoutPath, 'utf-8').replace(/\r\n/g, '\n');

  describe('1. Anchor #tools pada Tabel Komparasi Biaya', () => {
    it('ensures id="tools" is injected into comparison container in custom HTML', () => {
      expect(pageContent).toContain("if (!resolvedCustomHtml.includes('id=\"tools\"'))");
      expect(pageContent).toContain("'$1 id=\"tools\"'");
    });

    it('ensures comparison section and table containers have scroll-margin-top: 100px', () => {
      expect(pageContent).toContain('#tools,\n  .comparison-section {\n    scroll-margin-top: 100px !important;\n  }');
      expect(pageContent).toContain('.comparison-panel,\n  .comparison-table-wrap {\n    scroll-margin-top: 100px !important;\n  }');
    });

    it('enforces smooth scroll behavior on html and body in darkStyleOverride', () => {
      expect(pageContent).toContain('scroll-behavior: smooth !important;');
    });

    it('sanitizes any instant scroll snap in custom HTML to preserve smooth scrolling', () => {
      expect(pageContent).toContain("resolvedCustomHtml.replace(/behavior:\\s*['\"]instant['\"]/gi, \"behavior: 'smooth'\")");
    });

    it('implements deep-link anchor scroll with staggered retries for reliable landing', () => {
      expect(pageContent).toContain('const hash = window.location.hash;');
      expect(pageContent).toContain("el.scrollIntoView({ behavior: 'smooth', block: 'start' });");
      expect(pageContent).toContain('setTimeout(scrollToTarget, 200)');
      expect(pageContent).toContain('setTimeout(scrollToTarget, 500)');
      expect(pageContent).toContain('setTimeout(scrollToTarget, 1000)');
    });
  });

  describe('2. Optimasi CTA WhatsApp & Rehidrasi Tema', () => {
    it('routes canonical WhatsApp URL to 6288226098088 with "Saya tertarik ikut kelas nya Kang"', () => {
      const res = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Inkubasi CTWA Batch 1 Scale',
        storeName: 'OnlineBoost ID',
        tenantSlug: 'onlineboost',
        productSlug: 'kelas-inkubasi-ctwa-batch-1-scale',
        tenantWhatsApp: '6288226098088',
        customMessage: 'Saya tertarik ikut kelas nya Kang',
      });

      expect(res.number).toBe('6288226098088');
      expect(res.text).toBe('Saya tertarik ikut kelas nya Kang');
      expect(res.url).toBe('https://wa.me/6288226098088?text=Saya%20tertarik%20ikut%20kelas%20nya%20Kang');
    });

    it('intercepts .btn-cta-onlineboost clicks and routes them to WhatsApp consultation', () => {
      expect(pageContent).toContain('.btn-cta-onlineboost');
      expect(pageContent).toContain('handleOpenCheckout();');
    });

    it('eliminates FOUC by injecting early dark theme style in TenantStoreLayout for onlineboost tenant', () => {
      expect(layoutContent).toContain("isOnlineBoost = cleanTenant === 'onlineboost';");
      expect(layoutContent).toContain('background-color: #0a0a0a !important;');
      expect(layoutContent).toContain('color-scheme: dark !important;');
    });

    it('ensures SingleProductPage Suspense fallback renders in dark theme to avoid hydration flash', () => {
      expect(pageContent).toContain('min-h-screen bg-[#0a0a0a] text-zinc-400');
    });

    it('strictly preserves zero mutation to payment flow or bot conversation logic in this repo', () => {
      expect(pageContent).not.toContain('createPaymentOrder');
      expect(pageContent).not.toContain('xendit');
      expect(pageContent).not.toContain('ONLINEBOOST_PAYMENT_STRICT_HOLD');
    });
  });
});

