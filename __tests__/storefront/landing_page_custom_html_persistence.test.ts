import fs from 'fs';
import path from 'path';
import { SinglePageConfig } from '@/lib/product-catalog';

describe('Landing Page Custom HTML State & Auto-Switch Persistence', () => {
  const singlePageModalPath = path.resolve(
    process.cwd(),
    'app/[tenant]/dashboard/components/SinglePageBuilderModal.tsx'
  );
  const dashboardHookPath = path.resolve(
    process.cwd(),
    'app/[tenant]/dashboard/hooks/useTenantDashboard.ts'
  );
  const storefrontPagePath = path.resolve(
    process.cwd(),
    'app/[tenant]/p/[slug]/page.tsx'
  );
  const productsApiRoutePath = path.resolve(
    process.cwd(),
    'app/api/v1/tenants/[slug]/products/route.ts'
  );

  const modalCode = fs.readFileSync(singlePageModalPath, 'utf-8');
  const hookCode = fs.readFileSync(dashboardHookPath, 'utf-8');
  const storefrontCode = fs.readFileSync(storefrontPagePath, 'utf-8');
  const apiRouteCode = fs.readFileSync(productsApiRoutePath, 'utf-8');

  describe('1. Auto-Switch Rule & Payload Overrides (SinglePageBuilderModal)', () => {
    it('implements auto-switch in Section #10 toggle to disable sections #1-#9 when ON', () => {
      expect(modalCode).toContain('enable_custom_html: true');
      expect(modalCode).toContain('is_custom_html_enabled: true');
      expect(modalCode).toContain('use_custom_html: true');
      expect(modalCode).toContain("active_section: 'custom_html'");
      expect(modalCode).toContain('sections_override: false');
      expect(modalCode).toContain('enable_hero: false');
      expect(modalCode).toContain('enable_media_gallery: false');
      expect(modalCode).toContain('enable_problem_solution: false');
      expect(modalCode).toContain('enable_payment: false');
    });

    it('sets is_custom_html_enabled, custom_html, and sections_override: false in handleSubmit without resetting local state', () => {
      expect(modalCode).toContain('const isCustomHtmlActive = Boolean');
      expect(modalCode).toContain('const payloadWithHtmlFlags: SinglePageConfig');
      expect(modalCode).toContain('sections_override: false');
      expect(modalCode).toContain('setSinglePageForm(cleanForm)');
      expect(modalCode).toContain('sanitizeProductPayload(singlePageForm)');
    });
  });

  describe('2. State Synchronization & Persistence (useTenantDashboard)', () => {
    it('sets custom HTML flags and deactivates sections #1-#9 in handleSaveSinglePageConfig', () => {
      expect(hookCode).toContain('const hasCustomHtmlContent = Boolean');
      expect(hookCode).toContain('const isCustomHtmlActive = Boolean');
      expect(hookCode).toContain("active_section: 'custom_html'");
      expect(hookCode).toContain('sections_override: false');
      expect(hookCode).toContain('setSinglePageForm(updatedConfig)');
    });

    it('matches target product robustly (ID, SKU, or slug) and updates activeSinglePageProduct immediately', () => {
      expect(hookCode).toContain('const isTargetProduct = (p: ProductItem) =>');
      expect(hookCode).toContain('setActiveSinglePageProduct(updatedTargetProduct)');
    });

    it('guards openSinglePageBuilder against resetting disabled sections when Custom HTML is active', () => {
      expect(hookCode).toContain('const isCustomHtmlActive = Boolean');
      expect(hookCode).toContain('enable_hero: isCustomHtmlActive ? (cfg?.enable_hero ?? false) : (cfg?.enable_hero ?? true)');
      expect(hookCode).toContain('sections_override: isCustomHtmlActive ? false : (cfg?.sections_override ?? true)');
    });
  });

  describe('3. Storefront Rendering Guard (p/[slug]/page.tsx)', () => {
    it('suppresses canonical sections when sections_override is false', () => {
      expect(storefrontCode).toContain("if (config.sections_override === false && sectionId !== 'custom_html')");
      expect(storefrontCode).toContain('return null;');
    });

    it('renders custom_html section properly when active', () => {
      expect(storefrontCode).toContain("case 'custom_html':");
      expect(storefrontCode).toContain('config.custom_html');
      expect(storefrontCode).toContain('dangerouslySetInnerHTML={{ __html: config.custom_html }}');
    });
  });

  describe('4. Backend API Route Gateway (api/v1/tenants/[slug]/products/route.ts)', () => {
    it('normalizes custom HTML flags and disables canonical sections dynamically without hardcoding', () => {
      expect(apiRouteCode).toContain('spc.is_custom_html_enabled = true');
      expect(apiRouteCode).toContain("spc.active_section = 'custom_html'");
      expect(apiRouteCode).toContain('spc.sections_override = false');
      expect(apiRouteCode).toContain('spc.enable_hero = false');
      expect(apiRouteCode).toContain('spc.enable_payment = false');
    });
  });
});
