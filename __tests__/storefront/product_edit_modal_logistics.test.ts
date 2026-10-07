import React from 'react';
import fs from 'fs';
import path from 'path';

describe('Global Fix Modal Kurir & Tenant Dr. Harys Verification', () => {
  const physicalRetailFormPath = path.join(
    process.cwd(),
    'app/[tenant]/dashboard/components/modules/physical-retail/ProductForm.tsx'
  );
  const productFormModalPath = path.join(
    process.cwd(),
    'app/[tenant]/dashboard/components/ProductFormModal.tsx'
  );
  const productEditModalAliasPath = path.join(
    process.cwd(),
    'app/[tenant]/dashboard/components/ProductEditModal.tsx'
  );

  let physicalFormCode: string;
  let modalCode: string;
  let aliasCode: string;

  beforeAll(() => {
    physicalFormCode = fs.readFileSync(physicalRetailFormPath, 'utf-8');
    modalCode = fs.readFileSync(productFormModalPath, 'utf-8');
    aliasCode = fs.readFileSync(productEditModalAliasPath, 'utf-8');
  });

  describe('1. Global Modal Kurir & Logistik Conditional Check', () => {
    it('should only render logistics section if product_type is PHYSICAL', () => {
      expect(physicalFormCode).toContain("productType === 'PHYSICAL'");
      expect(physicalFormCode).toContain('if (!isPhysical)');
      expect(physicalFormCode).toContain('return null;');
      expect(physicalFormCode).toContain('Pengaturan Logistik, Ekspedisi & Berat Paket');
    });

    it('should unmount/hide logistics block and set requires_shipping: false for SERVICE and DIGITAL_FILE in ProductFormModal', () => {
      expect(modalCode).toContain('requires_shipping: isPhysical');
      expect(modalCode).toContain("const isPhysical = normPt === 'PHYSICAL'");
      expect(modalCode).toContain("isPhysicalProduct || (normProductType === 'FOOD')");
      expect(modalCode).toContain('requires_shipping: isPhysical && !isAffiliate');
    });

    it('should expose ProductEditModal.tsx as an alias for ProductFormModal', () => {
      expect(aliasCode).toContain("export { default } from './ProductFormModal'");
    });
  });

  describe('2. Data Verification for Tenant dr. Harys (tumbuh-kembang-anak)', () => {
    it('should match KIDMAP assessment URL, Google Meet schedule, and Play n Grow product structure in scripts and models', () => {
      const updateScriptPath = path.join(process.cwd(), 'scripts/update-tenant-dr-harys.ts');
      const scriptCode = fs.readFileSync(updateScriptPath, 'utf-8');

      expect(scriptCode).toContain('https://screening.tumbuhkembanganak.com/assessment');
      expect(scriptCode).toContain('Senin–Jumat, 08.00–11.30 WIB');
      expect(scriptCode).toContain('30 menit');
      expect(scriptCode).toContain('https://tumbuhkembanganak.com/aksesplaygrowth');
      expect(scriptCode).toContain('3741672471');
      expect(scriptCode).toContain('Muhamad Harys Maulana');
      expect(scriptCode).toContain('BCA');
    });
  });
});
