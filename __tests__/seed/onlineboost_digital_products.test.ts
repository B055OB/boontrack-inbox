import fs from 'fs';
import path from 'path';
import { ONLINEBOOST_DIGITAL_PRODUCTS as SEED_PRODUCTS } from '@/lib/services/onlineboost-seed.service';

describe('Backend Seeding: 2 SKU Digital & Cover Image untuk Tenant onlineboost', () => {
  const starterImgPath = path.join(process.cwd(), 'public/images/products/onlineboost-batch1-starter.png');
  const scaleImgPath = path.join(process.cwd(), 'public/images/products/onlineboost-batch1-scale.png');
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261010_seed_onlineboost_digital_products.sql');
  const seedScriptPath = path.join(process.cwd(), 'scripts/seed-onlineboost-digital-products.mjs');

  describe('1. Static Cover Images Verification', () => {
    it('should have onlineboost-batch1-starter.png in public/images/products/ with valid file size', () => {
      expect(fs.existsSync(starterImgPath)).toBe(true);
      const stat = fs.statSync(starterImgPath);
      expect(stat.size).toBeGreaterThan(100000); // High-res image > 100KB
    });

    it('should have onlineboost-batch1-scale.png in public/images/products/ with valid file size', () => {
      expect(fs.existsSync(scaleImgPath)).toBe(true);
      const stat = fs.statSync(scaleImgPath);
      expect(stat.size).toBeGreaterThan(100000); // High-res image > 100KB
    });
  });

  describe('2. Data Record Produk Specification', () => {
    it('should contain exactly 2 digital product records in seed configuration', () => {
      expect(SEED_PRODUCTS).toHaveLength(2);
    });

    it('should match exact specification for Produk 1 (Sel A: ACADEMY_CTWA_BATCH1_A)', () => {
      const prodA = SEED_PRODUCTS.find(p => p.sku === 'ACADEMY_CTWA_BATCH1_A');
      expect(prodA).toBeDefined();
      expect(prodA?.name).toBe('Kelas Inkubasi CTWA Batch 1 - Paket Starter');
      expect(prodA?.price).toBe(99000);
      expect(prodA?.is_digital).toBe(true);
      expect(prodA?.description).toBe(
        'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 3 Kredit Studio.'
      );
      expect(prodA?.image_url).toBe('/images/products/onlineboost-batch1-starter.png');
      expect(prodA?.status).toBe('ACTIVE');
    });

    it('should match exact specification for Produk 2 (Sel B: ACADEMY_CTWA_BATCH1_B)', () => {
      const prodB = SEED_PRODUCTS.find(p => p.sku === 'ACADEMY_CTWA_BATCH1_B');
      expect(prodB).toBeDefined();
      expect(prodB?.name).toBe('Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)');
      expect(prodB?.price).toBe(149000);
      expect(prodB?.is_digital).toBe(true);
      expect(prodB?.description).toBe(
        'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + SOP Objection Handling + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 15 Kredit Studio HD + Status Member Toko Selamanya.'
      );
      expect(prodB?.image_url).toBe('/images/products/onlineboost-batch1-scale.png');
      expect(prodB?.status).toBe('ACTIVE');
    });
  });

  describe('3. SQL Migration File Integrity', () => {
    it('should have 20261010_seed_onlineboost_digital_products.sql present in supabase/migrations/', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

      // Check tenant target
      expect(sqlContent).toContain("WHERE slug = 'onlineboost'");

      // Check both SKUs present
      expect(sqlContent).toContain('ACADEMY_CTWA_BATCH1_A');
      expect(sqlContent).toContain('ACADEMY_CTWA_BATCH1_B');

      // Check prices
      expect(sqlContent).toContain('99000');
      expect(sqlContent).toContain('149000');

      // Check images
      expect(sqlContent).toContain('/images/products/onlineboost-batch1-starter.png');
      expect(sqlContent).toContain('/images/products/onlineboost-batch1-scale.png');

      // Check idempotency upsert
      expect(sqlContent).toContain('ON CONFLICT (id) DO UPDATE SET');
      expect(sqlContent).toContain('v_filtered_products');
    });
  });

  describe('4. Zero Hardcoding Policy Compliance (AGENTS.md)', () => {
    it('seed script should operate dynamically via Supabase tables and metadata without hardcoded bypasses', () => {
      const scriptCode = fs.readFileSync(seedScriptPath, 'utf-8');
      expect(scriptCode).toContain("from('tenants')");
      expect(scriptCode).toContain("from('products')");
      expect(scriptCode).toContain('metadata');
    });
  });
});
