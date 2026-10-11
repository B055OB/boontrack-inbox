import {
  buildMenuRegistry,
  findParentGroupId,
  isTabActiveInItem,
  getVerticalCatalogConfig,
  NavMenuGroup,
} from '../app/[tenant]/dashboard/components/sidebar/menuRegistry';

describe('Navigation Sidebar Menu Registry Architecture', () => {
  describe('1. Struktur Hierarki & Grup Utama', () => {
    it('harus menghasilkan 4 grup utama sesuai arahan CTO', () => {
      const groups = buildMenuRegistry({});
      expect(groups).toHaveLength(4);

      const [ringkasan, kelolaToko, pesanPelanggan, kembangkanBisnis] = groups;

      expect(ringkasan.id).toBe('ringkasan');
      expect(ringkasan.label).toBe('Ringkasan');
      expect(ringkasan.isCollapsible).toBe(false);

      expect(kelolaToko.id).toBe('kelola-toko');
      expect(kelolaToko.label).toBe('Kelola Toko');
      expect(kelolaToko.isCollapsible).toBe(true);

      expect(pesanPelanggan.id).toBe('pesan-pelanggan');
      expect(pesanPelanggan.label).toBe('Pesan & Pelanggan');
      expect(pesanPelanggan.isCollapsible).toBe(true);

      expect(kembangkanBisnis.id).toBe('kembangkan-bisnis');
      expect(kembangkanBisnis.label).toBe('Kembangkan Bisnis');
      expect(kembangkanBisnis.isCollapsible).toBe(true);
    });

    it('Kelola Toko harus memuat item wajib: Katalog & Produk, Pesanan, Unduhan & Lisensi, Tema', () => {
      const groups = buildMenuRegistry({
        capabilities: { shipping: false }, // suppress physical shipping to test core list
      });
      const kelolaToko = groups.find((g) => g.id === 'kelola-toko');
      expect(kelolaToko).toBeDefined();

      const itemIds = kelolaToko!.items.map((i) => i.id);
      expect(itemIds).toContain('catalog');
      expect(itemIds).toContain('orders');
      expect(itemIds).toContain('downloads');
      expect(itemIds).toContain('themes');

      const downloadsItem = kelolaToko!.items.find((i) => i.id === 'downloads');
      expect(downloadsItem?.label).toBe('Unduhan & Lisensi');

      const themesItem = kelolaToko!.items.find((i) => i.id === 'themes');
      expect(themesItem?.label).toBe('Tema');

      const ordersItem = kelolaToko!.items.find((i) => i.id === 'orders');
      expect(ordersItem?.label).toBe('Pesanan');
    });

    it('Pesan & Pelanggan harus memuat item wajib: Smart Chatbox, Pelanggan, Broadcast WhatsApp', () => {
      const groups = buildMenuRegistry({});
      const group = groups.find((g) => g.id === 'pesan-pelanggan');
      expect(group).toBeDefined();

      const itemLabels = group!.items.map((i) => i.label);
      expect(itemLabels).toEqual([
        'Smart Chatbox',
        'Pelanggan',
        'Broadcast WhatsApp',
      ]);
    });

    it('Kembangkan Bisnis harus memuat item wajib: AI & Knowledge, Ads Tracking, Reseller, Keuangan', () => {
      const groups = buildMenuRegistry({});
      const group = groups.find((g) => g.id === 'kembangkan-bisnis');
      expect(group).toBeDefined();

      const itemLabels = group!.items.map((i) => i.label);
      expect(itemLabels).toEqual([
        'AI & Knowledge',
        'Ads Tracking',
        'Reseller',
        'Keuangan',
      ]);
    });
  });

  describe('2. State-Aware Routing & Helper Functions', () => {
    let groups: NavMenuGroup[];

    beforeEach(() => {
      groups = buildMenuRegistry({});
    });

    it('findParentGroupId harus menemukan parent group dari activeTab', () => {
      // Ringkasan
      expect(findParentGroupId('dashboard', groups)).toBe('ringkasan');
      expect(findParentGroupId('overview', groups)).toBe('ringkasan');

      // Kelola Toko
      expect(findParentGroupId('catalog', groups)).toBe('kelola-toko');
      expect(findParentGroupId('products', groups)).toBe('kelola-toko');
      expect(findParentGroupId('orders', groups)).toBe('kelola-toko');
      expect(findParentGroupId('downloads', groups)).toBe('kelola-toko');
      expect(findParentGroupId('themes', groups)).toBe('kelola-toko');
      expect(findParentGroupId('storefront', groups)).toBe('kelola-toko');

      // Pesan & Pelanggan
      expect(findParentGroupId('inbox', groups)).toBe('pesan-pelanggan');
      expect(findParentGroupId('customers', groups)).toBe('pesan-pelanggan');
      expect(findParentGroupId('crm', groups)).toBe('pesan-pelanggan');
      expect(findParentGroupId('whatsapp', groups)).toBe('pesan-pelanggan');
      expect(findParentGroupId('broadcast', groups)).toBe('pesan-pelanggan');

      // Kembangkan Bisnis
      expect(findParentGroupId('ai_knowledge', groups)).toBe('kembangkan-bisnis');
      expect(findParentGroupId('ads_tracking', groups)).toBe('kembangkan-bisnis');
      expect(findParentGroupId('reseller', groups)).toBe('kembangkan-bisnis');
      expect(findParentGroupId('finance', groups)).toBe('kembangkan-bisnis');
    });

    it('isTabActiveInItem harus mendukung targetTab dan matchedTabs aliases', () => {
      const kelolaToko = groups.find((g) => g.id === 'kelola-toko')!;
      const catalogItem = kelolaToko.items.find((i) => i.id === 'catalog')!;

      expect(isTabActiveInItem(catalogItem, 'catalog')).toBe(true);
      expect(isTabActiveInItem(catalogItem, 'products')).toBe(true);
      expect(isTabActiveInItem(catalogItem, 'inbox')).toBe(false);

      const pesanGroup = groups.find((g) => g.id === 'pesan-pelanggan')!;
      const whatsappItem = pesanGroup.items.find((i) => i.id === 'whatsapp')!;

      expect(isTabActiveInItem(whatsappItem, 'whatsapp')).toBe(true);
      expect(isTabActiveInItem(whatsappItem, 'broadcast')).toBe(true);
      expect(isTabActiveInItem(whatsappItem, 'rotator')).toBe(true);
      expect(isTabActiveInItem(whatsappItem, 'telegram_alerts')).toBe(true);
    });

    it('mengembalikan null jika activeTab tidak valid atau kosong', () => {
      expect(findParentGroupId('', groups)).toBeNull();
      expect(findParentGroupId('random_unknown_tab', groups)).toBeNull();
    });
  });

  describe('3. Dynamic Vertical & Tier Handling', () => {
    it('mengadaptasi label katalog sesuai vertikal kategori toko', () => {
      const proService = getVerticalCatalogConfig('PRO_SERVICE');
      expect(proService.label).toBe('Katalog Jasa & Konsultasi');
      expect(proService.badge).toBe('Jasa');

      const fnb = getVerticalCatalogConfig('FNB_CULINARY');
      expect(fnb.label).toBe('Menu Kuliner & FnB');
      expect(fnb.badge).toBe('FnB');

      const digital = getVerticalCatalogConfig('DIGITAL_PRODUCT');
      expect(digital.label).toBe('Produk & Materi Digital');
      expect(digital.badge).toBe('Digital');

      const defaultPhysical = getVerticalCatalogConfig('PHYSICAL_RETAIL');
      expect(defaultPhysical.label).toBe('Katalog & Produk');
      expect(defaultPhysical.badge).toBe('Fisik');
    });

    it('menampilkan indikator kuota aktif pada tier Checkout Lite', () => {
      const groups = buildMenuRegistry({
        isCheckoutLite: true,
        productCount: 2,
        activeProductCount: 2,
      });

      const kelolaToko = groups.find((g) => g.id === 'kelola-toko')!;
      const catalogItem = kelolaToko.items.find((i) => i.id === 'catalog')!;
      expect(catalogItem.badge?.text).toBe('2/3 Aktif');
      expect(catalogItem.badge?.variant).toBe('warning');
    });

    it('menampilkan badge unread inbox jika inboxCount > 0', () => {
      const groups = buildMenuRegistry({
        inboxCount: 15,
      });

      const pesanGroup = groups.find((g) => g.id === 'pesan-pelanggan')!;
      const inboxItem = pesanGroup.items.find((i) => i.id === 'inbox')!;
      expect(inboxItem.badge?.text).toBe('15');
      expect(inboxItem.badge?.variant).toBe('info');
    });

    it('menandai item terkunci untuk tier yang belum memenuhi syarat', () => {
      const groups = buildMenuRegistry({
        isTeamScale: false,
        isCrmEffective: false,
        isSoloOrTrial: true,
      });

      const pesanGroup = groups.find((g) => g.id === 'pesan-pelanggan')!;
      const customersItem = pesanGroup.items.find((i) => i.id === 'customers')!;
      expect(customersItem.isLocked).toBe(true);
      expect(customersItem.badge?.isLock).toBe(true);

      const kembangkanGroup = groups.find((g) => g.id === 'kembangkan-bisnis')!;
      const financeItem = kembangkanGroup.items.find((i) => i.id === 'finance')!;
      expect(financeItem.isLocked).toBe(true);
      expect(financeItem.badge?.isLock).toBe(true);
    });
  });
});
