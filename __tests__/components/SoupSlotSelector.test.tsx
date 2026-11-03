/**
 * __tests__/components/SoupSlotSelector.test.tsx
 *
 * Unit Test Suite for SoupSlotSelector Component,
 * Quota Enforcement (2 slots for Oishii/Ichiban, 3 slots for Mabar A/B),
 * Counter Behavior (+/-), Duplicate Variants, and Submit Locking.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SoupSlotSelector,
  getSoupQuotaForPackage,
  validateSoupSelection,
  formatSoupSelection,
  DEFAULT_SOUP_VARIANTS,
} from '@/components/shabu-ajhi/SoupSlotSelector';
// Also verify import from src/components alias
import { SoupSlotSelector as SoupSlotSelectorFromSrc } from '@/src/components/SoupSlotSelector';

describe('SoupSlotSelector Component & Quota Validation Suite', () => {
  // =========================================================================
  // 1. QUOTA RULES PER PACKAGE TYPE
  // =========================================================================
  describe('1. Quota Rules Resolution', () => {
    it('Paket Oishii & Paket Ichiban should resolve to exactly 2 soup slots', () => {
      expect(getSoupQuotaForPackage('Paket Oishii')).toBe(2);
      expect(getSoupQuotaForPackage('Paket Oishi (Shabu & BBQ)')).toBe(2);
      expect(getSoupQuotaForPackage('Paket Ichiban Premium')).toBe(2);
      expect(getSoupQuotaForPackage('ICHIBAN SHABU')).toBe(2);
    });

    it('Paket Mabar A & Paket Mabar B should resolve to exactly 3 soup slots', () => {
      expect(getSoupQuotaForPackage('Paket Mabar A')).toBe(3);
      expect(getSoupQuotaForPackage('Paket Mabar A (Shabu & BBQ 10 Pax)')).toBe(3);
      expect(getSoupQuotaForPackage('Paket Mabar B (15 Pax)')).toBe(3);
      expect(getSoupQuotaForPackage('Mabar Spesial Family')).toBe(3);
    });

    it('should fallback to 2 slots for undefined, empty, or generic package names', () => {
      expect(getSoupQuotaForPackage(undefined)).toBe(2);
      expect(getSoupQuotaForPackage('')).toBe(2);
      expect(getSoupQuotaForPackage('Paket Reguler')).toBe(2);
      expect(getSoupQuotaForPackage('Custom Package', 4)).toBe(4);
    });
  });

  // =========================================================================
  // 2. SELECTION VALIDATION & FORMATTING LOGIC
  // =========================================================================
  describe('2. Selection Validation & Duplicate Variants', () => {
    it('should mark selection invalid and incomplete when slots are below quota (0 of 2)', () => {
      const result = validateSoupSelection({}, 2);
      expect(result.isValid).toBe(false);
      expect(result.isComplete).toBe(false);
      expect(result.allocatedSlots).toBe(0);
      expect(result.remainingSlots).toBe(2);
    });

    it('should mark selection invalid when partially filled (1 of 2)', () => {
      const result = validateSoupSelection({ Tomyum: 1 }, 2);
      expect(result.isValid).toBe(false);
      expect(result.isComplete).toBe(false);
      expect(result.allocatedSlots).toBe(1);
      expect(result.remainingSlots).toBe(1);
    });

    it('should allow identical soup combination (e.g. Tomyum: 2) and validate successfully for 2-slot quota', () => {
      const result = validateSoupSelection({ Tomyum: 2 }, 2);
      expect(result.isValid).toBe(true);
      expect(result.isComplete).toBe(true);
      expect(result.allocatedSlots).toBe(2);
      expect(result.remainingSlots).toBe(0);
    });

    it('should allow mixed soup combination (e.g. Tomyum: 1, Sukiyaki: 1) for 2-slot quota', () => {
      const result = validateSoupSelection({ Tomyum: 1, Sukiyaki: 1 }, 2);
      expect(result.isValid).toBe(true);
      expect(result.isComplete).toBe(true);
      expect(result.allocatedSlots).toBe(2);
      expect(result.remainingSlots).toBe(0);
    });

    it('should validate 3-slot quota correctly for Mabar packages (e.g. Tomyum: 2, Kaldu Ayam: 1)', () => {
      const result = validateSoupSelection({ Tomyum: 2, 'Kaldu Ayam': 1 }, 3);
      expect(result.isValid).toBe(true);
      expect(result.isComplete).toBe(true);
      expect(result.allocatedSlots).toBe(3);
      expect(result.remainingSlots).toBe(0);
    });

    it('should format selection dictionary into clean human readable string', () => {
      const formatted = formatSoupSelection({ Tomyum: 2, 'Kaldu Ayam': 1 });
      expect(formatted).toBe('Tomyum: 2, Kaldu Ayam: 1');

      const formattedSingle = formatSoupSelection({ Sukiyaki: 2 });
      expect(formattedSingle).toBe('Sukiyaki: 2');

      const formattedEmpty = formatSoupSelection({});
      expect(formattedEmpty).toBe('');
    });
  });

  // =========================================================================
  // 3. UI RENDERING & COUNTER CONTROLS
  // =========================================================================
  describe('3. UI Component Rendering & Button States', () => {
    it('should render all 4 standard soup variants with quota badge (0 / 2 Slot)', () => {
      const html = renderToStaticMarkup(
        <SoupSlotSelector
          packageName="Paket Oishii"
          availableSoups={DEFAULT_SOUP_VARIANTS as string[]}
          value={{}}
        />
      );

      expect(html).toContain('Paket Oishii');
      expect(html).toContain('0 / 2 Slot');
      expect(html).toContain('Tomyum');
      expect(html).toContain('Sukiyaki');
      expect(html).toContain('Kaldu Ayam');
      expect(html).toContain('Gurih Gurih');
      expect(html).toContain('Pilih <strong>2</strong> slot kuah lagi');
    });

    it('should lock submit button when allocated slots do not meet quota limit (0 / 2)', () => {
      const html = renderToStaticMarkup(
        <SoupSlotSelector
          packageName="Paket Oishii"
          value={{}}
          submitButtonText="Tambah ke Keranjang"
        />
      );

      // The submit button must have disabled attribute
      expect(html).toMatch(/<button[^>]*data-testid="soup-selector-submit-btn"[^>]*disabled=""/);
      expect(html).toContain('Tambah ke Keranjang');
    });

    it('should lock submit button when partially filled (1 / 2)', () => {
      const html = renderToStaticMarkup(
        <SoupSlotSelector
          packageName="Paket Oishii"
          value={{ Tomyum: 1 }}
          submitButtonText="Lanjut ke Pembayaran"
        />
      );

      expect(html).toContain('1 / 2 Slot');
      expect(html).toContain('Pilih <strong>1</strong> slot kuah lagi');
      expect(html).toMatch(/<button[^>]*data-testid="soup-selector-submit-btn"[^>]*disabled=""/);
    });

    it('should unlock submit button and disable plus buttons when quota is reached (2 / 2)', () => {
      const html = renderToStaticMarkup(
        <SoupSlotSelector
          packageName="Paket Oishii"
          value={{ Tomyum: 2 }}
          submitButtonText="Tambah ke Keranjang"
        />
      );

      // Quota reached indicator
      expect(html).toContain('2 / 2 Slot');
      expect(html).toContain('Kuota kuah terpenuhi');

      // Submit button is NOT disabled
      expect(html).not.toMatch(/<button[^>]*data-testid="soup-selector-submit-btn"[^>]*disabled=""/);

      // All plus buttons should be disabled because quota has been reached
      expect(html).toMatch(/<button[^>]*data-testid="btn-plus-Tomyum"[^>]*disabled=""/);
      expect(html).toMatch(/<button[^>]*data-testid="btn-plus-Sukiyaki"[^>]*disabled=""/);
      expect(html).toMatch(/<button[^>]*data-testid="btn-plus-Kaldu Ayam"[^>]*disabled=""/);
      expect(html).toMatch(/<button[^>]*data-testid="btn-plus-Gurih Gurih"[^>]*disabled=""/);

      // Minus button for Tomyum should be active (not disabled)
      expect(html).not.toMatch(/<button[^>]*data-testid="btn-minus-Tomyum"[^>]*disabled=""/);

      // Minus button for Sukiyaki (count 0) should be disabled
      expect(html).toMatch(/<button[^>]*data-testid="btn-minus-Sukiyaki"[^>]*disabled=""/);
    });

    it('should support 3-slot quota for Mabar A package and show (3 / 3 Slot)', () => {
      const html = renderToStaticMarkup(
        <SoupSlotSelector
          packageName="Paket Mabar A"
          value={{ Tomyum: 2, 'Gurih Gurih': 1 }}
        />
      );

      expect(html).toContain('3 / 3 Slot');
      expect(html).toContain('Kuota kuah terpenuhi');
      expect(html).not.toMatch(/<button[^>]*data-testid="soup-selector-submit-btn"[^>]*disabled=""/);
    });

    it('should confirm SoupSlotSelectorFromSrc alias renders identically', () => {
      const directHtml = renderToStaticMarkup(
        <SoupSlotSelector packageName="Paket Oishii" value={{ Tomyum: 2 }} />
      );
      const aliasHtml = renderToStaticMarkup(
        <SoupSlotSelectorFromSrc packageName="Paket Oishii" value={{ Tomyum: 2 }} />
      );
      expect(aliasHtml).toEqual(directHtml);
    });
  });
});

