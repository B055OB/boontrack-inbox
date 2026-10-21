import fs from 'fs';
import path from 'path';

describe('TASK: Dark Mode Contrast & BoonPilot Context Sync', () => {
  const dashboardPagePath = path.resolve(process.cwd(), 'app/[tenant]/dashboard/page.tsx');
  const productsTabPath = path.resolve(process.cwd(), 'app/[tenant]/dashboard/components/tabs/ProductsTab.tsx');
  const dashboardAiPath = path.resolve(process.cwd(), 'lib/boonpilot/dashboard-ai.ts');
  const platformEnginePath = path.resolve(process.cwd(), 'lib/boonpilot/platform-engine.ts');

  describe('1.a Tombol Dark Mode Header (High Contrast)', () => {
    it('enforces solid black high-contrast classes on mobile & desktop theme toggles in dashboard/page.tsx', () => {
      const content = fs.readFileSync(dashboardPagePath, 'utf-8');
      expect(content).toContain('bg-neutral-900 text-white hover:bg-black dark:bg-white dark:text-neutral-900 border-none');
    });
  });

  describe('1.b Halaman Aset & Produk Digital Dark Mode Styling', () => {
    it('contains dark:text-white for header title and dark:text-slate-400 for description in ProductsTab.tsx', () => {
      const content = fs.readFileSync(productsTabPath, 'utf-8');
      expect(content).toContain('text-slate-900 dark:text-white');
      expect(content).toContain('dark:text-slate-400');
    });

    it('contains dark mode classes for search input box in ProductsTab.tsx', () => {
      const content = fs.readFileSync(productsTabPath, 'utf-8');
      expect(content).toContain('dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-400');
    });

    it('replaces static bg-white with dark mode classes on product cards in ProductsTab.tsx', () => {
      const content = fs.readFileSync(productsTabPath, 'utf-8');
      expect(content).toContain('bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white');
    });
  });

  describe('1.c Widget BoonPilot Catalog Context & Model Temperature', () => {
    it('injects active tenant catalog context in dashboard-ai.ts', () => {
      const content = fs.readFileSync(dashboardAiPath, 'utf-8');
      expect(content).toContain('fetchActiveCatalog');
      expect(content).toContain('formatProductCatalogForBotKnowledge');
      expect(content).toContain('KATALOG PRODUK TOKO AKTIF');
    });

    it('sets temperature to 0.2 in dashboard-ai.ts Gemini generationConfig', () => {
      const content = fs.readFileSync(dashboardAiPath, 'utf-8');
      expect(content).toContain('temperature: 0.2');
    });

    it('sets temperature to 0.2 in platform-engine.ts Gemini generationConfig', () => {
      const content = fs.readFileSync(platformEnginePath, 'utf-8');
      expect(content).toContain('temperature: 0.2');
    });
  });
});
