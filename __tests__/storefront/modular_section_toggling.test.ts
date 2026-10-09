import {
  resolveStorefrontSections,
  isSectionActive,
  resolveStorefrontCopy,
} from '@/lib/resolvers/tenant-runtime-resolver';

describe('Modular Section Toggling & Zero-Hardcoded Copy (Tahap 3)', () => {
  describe('resolveStorefrontSections & isSectionActive', () => {
    it('returns default active state for all core storefront sections when unspecified', () => {
      const sections = resolveStorefrontSections({});

      expect(sections.hero?.is_active).toBe(true);
      expect(sections.lead_form?.is_active).toBe(true);
      expect(sections.benefits?.is_active).toBe(true);
      expect(sections.catalog?.is_active).toBe(true);
      expect(sections.operating_hours?.is_active).toBe(true);
      expect(sections.visual_feed?.is_active).toBe(true);
      expect(sections.testimonials?.is_active).toBe(true);
      expect(sections.floating_chat?.is_active).toBe(true);

      expect(isSectionActive(sections.hero)).toBe(true);
      expect(isSectionActive(sections.catalog)).toBe(true);
      expect(isSectionActive(sections.floating_chat)).toBe(true);
    });

    it('honors explicit section deactivation toggles from tenant metadata', () => {
      const metadata = {
        storefront_sections: {
          hero: { is_active: true },
          lead_form: { is_active: false },
          operating_hours: { is_active: false },
          floating_chat: { is_active: false },
          catalog: { is_active: true },
        },
      };

      const sections = resolveStorefrontSections(metadata);

      expect(sections.hero?.is_active).toBe(true);
      expect(sections.lead_form?.is_active).toBe(false);
      expect(sections.operating_hours?.is_active).toBe(false);
      expect(sections.floating_chat?.is_active).toBe(false);
      expect(sections.catalog?.is_active).toBe(true);

      expect(isSectionActive(sections.lead_form)).toBe(false);
      expect(isSectionActive(sections.operating_hours)).toBe(false);
      expect(isSectionActive(sections.floating_chat)).toBe(false);
      expect(isSectionActive(sections.hero)).toBe(true);
    });

    it('respects backward-compatible legacy flags (chat_enabled, enable_hero, etc.)', () => {
      const metadata = {
        chat_enabled: false,
        enable_hero: false,
        enable_testimonials: false,
        theme: {
          chat_enabled: false,
        },
      };

      const sections = resolveStorefrontSections(metadata);

      expect(sections.floating_chat?.is_active).toBe(false);
      expect(sections.hero?.is_active).toBe(false);
      expect(sections.testimonials?.is_active).toBe(false);
      expect(isSectionActive(sections.floating_chat)).toBe(false);
    });
  });

  describe('resolveStorefrontCopy & Zero-Hardcoded Fallbacks', () => {
    it('resolves custom copy from storefront_copy schema', () => {
      const metadata = {
        storefront_copy: {
          headline: 'Spesialis Kuras Toren & Pipa Karawang',
          subheadline: 'Pembersihan higienis cepat tanpa kuras air berlebih',
          hero_badge: 'Teknisi Tersertifikasi',
          cta_label: 'Pesan Teknisi Sekarang',
          booking_title: 'Jadwalkan Servis Kuras Toren',
          booking_subtitle: 'Pilih slot kunjungan teknisi ke lokasi Anda',
          booking_topics: [
            'Kuras Toren Rumah Tinggal',
            'Kuras Toren Ruko / Kantor',
            'Pembersihan Jalur Pipa Mampet',
          ],
        },
      };

      const copy = resolveStorefrontCopy(metadata, 'Kuras Toren Karawang');

      expect(copy.headline).toBe('Spesialis Kuras Toren & Pipa Karawang');
      expect(copy.subheadline).toBe('Pembersihan higienis cepat tanpa kuras air berlebih');
      expect(copy.hero_badge).toBe('Teknisi Tersertifikasi');
      expect(copy.cta_label).toBe('Pesan Teknisi Sekarang');
      expect(copy.booking_title).toBe('Jadwalkan Servis Kuras Toren');
      expect(copy.booking_subtitle).toBe('Pilih slot kunjungan teknisi ke lokasi Anda');
      expect(copy.booking_topics).toHaveLength(3);
      expect(copy.booking_topics?.[0]).toBe('Kuras Toren Rumah Tinggal');
    });

    it('ensures service/technical tenants do NOT receive clinical/pediatric copy by default', () => {
      const serviceMetadata = {
        business_type: 'FIELD_SERVICE',
        category: 'FIELD_SERVICE',
      };

      const copy = resolveStorefrontCopy(serviceMetadata, 'Kuras Toren Karawang');

      // Booking title & subtitle should be generic or service-oriented, never mentioning clinic or pediatric
      const fullText = JSON.stringify(copy).toLowerCase();
      expect(fullText).not.toContain('klinis');
      expect(fullText).not.toContain('ayah & bunda');
      expect(fullText).not.toContain('si kecil');
      expect(fullText).not.toContain('dokter anak');
      expect(fullText).not.toContain('tumbuh kembang');
    });

    it('dynamically formats fallbacks with active storeName instead of static dummy brand', () => {
      const copy = resolveStorefrontCopy({}, 'Bengkel Las Abadi');

      expect(copy.visual_feed_title).toBe('Galeri & Feed Bengkel Las Abadi');
      expect(copy.catalog_title).toBe('Pilihan Terbaik dari Bengkel Las Abadi');
      expect(copy.booking_title).toBe('Jadwalkan Sesi Konsultasi Bengkel Las Abadi');
    });
  });

  describe('Modular Section Component Guards (return null when deactivated)', () => {
    it('returns null for HeroBannerSection when sectionConfig.is_active is false', async () => {
      const { HeroBannerSection } = await import('@/app/[tenant]/components/templates/PersonalAuthorityTemplate');
      const result = HeroBannerSection({
        sectionConfig: { is_active: false },
        activeName: 'Toko Test',
        heroBadge: 'Official',
        headline: 'Headline',
        benefitsList: [],
        heroCtaLabel: 'Beli',
        doctorsList: [],
        displayAvatar: '',
        avatarError: false,
        setAvatarError: () => {},
        onPrimaryClick: () => {},
        onOutboundClick: () => {},
      });
      expect(result).toBeNull();
    });

    it('returns null for LeadIntakeFormSection when sectionConfig.is_active is false', async () => {
      const { LeadIntakeFormSection } = await import('@/app/[tenant]/components/templates/PersonalAuthorityTemplate');
      const result = LeadIntakeFormSection({
        sectionConfig: { is_active: false },
        activeName: 'Toko Test',
        isClinicTenant: false,
        formSchema: null,
        copy: {},
        doctorsList: [],
        whatsappNumber: '',
        dynamicTopics: [],
        handleIntakeSubmit: () => {},
        intakeCustomerName: '',
        setIntakeCustomerName: () => {},
        intakeCustomerPhone: '',
        setIntakeCustomerPhone: () => {},
        intakeDetail: '',
        setIntakeDetail: () => {},
        intakeTopic: '',
        setIntakeTopic: () => {},
        intakeError: null,
        intakeSuccess: false,
        setIntakeSuccess: () => {},
        isIntakeSubmitting: false,
      });
      expect(result).toBeNull();
    });

    it('returns null for OperatingHoursBookingSection when sectionConfig.is_active is false', async () => {
      const { OperatingHoursBookingSection } = await import('@/app/[tenant]/components/templates/PersonalAuthorityTemplate');
      const result = OperatingHoursBookingSection({
        sectionConfig: { is_active: false },
        tenantSlug: 'test',
        activeName: 'Toko Test',
        storeProducts: [],
        onInitiateCheckout: () => {},
        onOutboundClick: () => {},
      });
      expect(result).toBeNull();
    });

    it('returns null for BenefitAuthoritySection and TestimonialsSection when sectionConfig.is_active is false', async () => {
      const { BenefitAuthoritySection, TestimonialsSection } = await import('@/app/[tenant]/components/templates/PersonalAuthorityTemplate');
      const bResult = BenefitAuthoritySection({
        sectionConfig: { is_active: false },
        badgeText: 'Badge',
        titleText: 'Title',
        dynamicPillars: [],
      });
      expect(bResult).toBeNull();

      const tResult = TestimonialsSection({
        sectionConfig: { is_active: false },
        badgeText: 'Badge',
        titleText: 'Title',
        dynamicTestimonials: [{ name: 'Buyer', text: 'Good' }],
      });
      expect(tResult).toBeNull();
    });

    it('returns null for ScheduleBookingWidget when sectionConfig.is_active is false', async () => {
      const { default: ScheduleBookingWidget } = await import('@/app/[tenant]/components/ScheduleBookingWidget');
      const result = ScheduleBookingWidget({
        tenantSlug: 'test',
        storeName: 'Toko Test',
        sectionConfig: { is_active: false },
      });
      expect(result).toBeNull();
    });

    it('returns null for InstagramVisualGrid when sectionConfig.is_active is false', async () => {
      const { default: InstagramVisualGrid } = await import('@/app/[tenant]/components/templates/InstagramVisualGrid');
      const result = InstagramVisualGrid({
        tenantSlug: 'test',
        storeName: 'Toko Test',
        sectionConfig: { is_active: false },
      });
      expect(result).toBeNull();
    });

    it('returns null for FloatingWebchat when sectionConfig.is_active is false', async () => {
      const { default: FloatingWebchat } = await import('@/app/[tenant]/components/templates/FloatingWebchat');
      const result = FloatingWebchat({
        tenantSlug: 'test',
        storeName: 'Toko Test',
        displayName: 'Toko Test',
        sectionConfig: { is_active: false },
      });
      expect(result).toBeNull();
    });
  });
});
