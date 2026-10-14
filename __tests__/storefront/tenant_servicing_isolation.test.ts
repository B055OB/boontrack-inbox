import fs from 'fs';
import path from 'path';
import { resolveSinglePageProduct, DEFAULT_PRODUCTS } from '@/lib/product-catalog';

describe('TENANT SERVICING PROTOCOL & ZERO HARDCODING AUDIT', () => {
  const rootDir = process.cwd();
  const singleProductPagePath = path.join(rootDir, 'app/[tenant]/p/[slug]/page.tsx');
  const inboxCursorRulesPath = path.join(rootDir, '.cursorrules');
  const inboxAntigravityRulesPath = path.join(rootDir, '.antigravityrules');
  const inboxAgentsPath = path.join(rootDir, 'AGENTS.md');

  const coreCursorRulesPath = 'C:/boontrack-core/.cursorrules';
  const coreAntigravityRulesPath = 'C:/boontrack-core/.antigravityrules';

  describe('1. Product Catalog Isolation (Zero Cross-Tenant Product Leakage)', () => {
    it('should resolve DEFAULT_PRODUCTS only for tenant onlineboost', () => {
      const obResult = resolveSinglePageProduct('onlineboost', 'step-by-step-rahasia-menghasilkan-dollar');
      expect(obResult.product.slug).toBe('step-by-step-rahasia-menghasilkan-dollar');
      expect(obResult.product.price).toBe(499000);
    });

    it('should NOT leak DEFAULT_PRODUCTS to other tenants (e.g. lala, boon, foundry)', () => {
      const otherTenants = ['lala', 'boon', 'foundry', 'suhu-ads', 'toko-kue'];

      for (const tenantSlug of otherTenants) {
        const result = resolveSinglePageProduct(tenantSlug, 'step-by-step-rahasia-menghasilkan-dollar');
        // Must NOT match DEFAULT_PRODUCTS
        expect(result.product.price).toBe(0);
        expect(result.product.stock).toBe(0);
        expect(result.product.download_url).toBeFalsy();
      }
    });

    it('should never leak CPM courses from DEFAULT_PRODUCTS to tenant boon', () => {
      const result = resolveSinglePageProduct('boon', 'masterclass-cpm');
      expect(result.product.price).toBe(0);
      expect(result.product.stock).toBe(0);
    });
  });

  describe('2. Single Product Route (app/[tenant]/p/[slug]/page.tsx) Strict Scoping Audit', () => {
    let pageCode: string;

    beforeAll(() => {
      pageCode = fs.readFileSync(singleProductPagePath, 'utf-8');
    });

    it('should strictly query relational SQL products with tenant_id filter', () => {
      expect(pageCode).toContain('.from("products")');
      expect(pageCode).toContain('.eq("tenant_id", tenantRow.id)');
      expect(pageCode).toContain('.eq("slug", slug)');
    });

    it('should NOT query products globally without tenant_id', () => {
      // Must not do un-scoped query
      expect(pageCode).not.toMatch(/\.from\(["']products["']\)\s*\.select\([^)]*\)\s*\.eq\(["']slug["']/);
    });

    it('should implement fail-closed pageStatus for unregistered tenants and missing products', () => {
      expect(pageCode).toContain("setPageStatus('tenant_not_found')");
      expect(pageCode).toContain("setPageStatus('product_not_found')");
      expect(pageCode).toContain('Toko Belum Terdaftar');
      expect(pageCode).toContain('Produk Tidak Ditemukan');
    });
  });

  describe('3. Rule Files Audit (Sections 5, 6, and 7 Enactment)', () => {
    it('should contain Sections 5, 6, and 7 in inbox .cursorrules', () => {
      const content = fs.readFileSync(inboxCursorRulesPath, 'utf-8');
      expect(content).toContain('5. STRICT MULTI-TENANT DATA ISOLATION');
      expect(content).toContain('6. MANDATORY EXECUTION SCOPE DECLARATION');
      expect(content).toContain('7. TENANT SERVICING PROTOCOL & ZERO HARDCODING GUARDRAILS');
      expect(content).toContain('DILARANG KERAS HARDCODE DATA TENANT DI SHARED FRONTEND/BACKEND');
    });

    it('should contain Sections 5, 6, and 7 in inbox .antigravityrules', () => {
      const content = fs.readFileSync(inboxAntigravityRulesPath, 'utf-8');
      expect(content).toContain('5. STRICT MULTI-TENANT DATA ISOLATION');
      expect(content).toContain('6. MANDATORY EXECUTION SCOPE DECLARATION');
      expect(content).toContain('7. TENANT SERVICING PROTOCOL & ZERO HARDCODING GUARDRAILS');
    });

    it('should contain Sections 5, 6, and 7 in inbox AGENTS.md', () => {
      const content = fs.readFileSync(inboxAgentsPath, 'utf-8');
      expect(content).toContain('5. STRICT MULTI-TENANT DATA ISOLATION');
      expect(content).toContain('6. MANDATORY EXECUTION SCOPE DECLARATION');
      expect(content).toContain('7. TENANT SERVICING PROTOCOL & ZERO HARDCODING GUARDRAILS');
    });

    it('should contain Section 7 in boontrack-core .cursorrules', () => {
      if (fs.existsSync(coreCursorRulesPath)) {
        const content = fs.readFileSync(coreCursorRulesPath, 'utf-8');
        expect(content).toContain('7. TENANT SERVICING PROTOCOL & ZERO HARDCODING GUARDRAILS');
        expect(content).toContain('DILARANG KERAS HARDCODE DATA TENANT DI SHARED FRONTEND/BACKEND');
      }
    });

    it('should contain Section 7 in boontrack-core .antigravityrules', () => {
      if (fs.existsSync(coreAntigravityRulesPath)) {
        const content = fs.readFileSync(coreAntigravityRulesPath, 'utf-8');
        expect(content).toContain('7. TENANT SERVICING PROTOCOL & ZERO HARDCODING GUARDRAILS');
        expect(content).toContain('DILARANG KERAS HARDCODE DATA TENANT DI SHARED FRONTEND/BACKEND');
      }
    });
  });
});
