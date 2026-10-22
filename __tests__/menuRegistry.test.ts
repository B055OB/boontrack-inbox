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
      expect(ringkasan.label).toBe('Dashboard');
      expect(ringkasan.description).toBe('Aktivitas & Info Update');
      expect(ringkasan.isCollapsible).toBe(false);

      expect(kelolaToko.id).toBe('kelola-toko');
      expect(kelolaToko.label).toBe('Kelola Toko');
      expect(kelolaToko.isCollapsible).toBe(true);

      expect(pesanPelanggan.id).toBe('pesan-pelanggan');
      expect(pesanPelanggan.label).toBe('Pesan & Pelanggan');
      expect(pesanPelanggan.isCollapsible).toBe(true);

      expect(kembangkanBisnis.id).toBe('kembangkan-bisnis');
      expect(kembangkanBisnis.label).toBe('Marketing Tools');
      expect(kembangkanBisnis.isCollapsible).toBe(true);
    });

    it('Kelola Toko harus memuat item wajib: Katalog & Produk, Pesanan, Keuangan, AI Knowledge, Tema', () => {
      const groups = buildMenuRegistry({
        capabilities: { shipping: false }, // suppress physical shipping to test core list
      });
      const kelolaToko = groups.find((g) => g.id === 'kelola-toko');
      expect(kelolaToko).toBeDefined();

      const itemIds = kelolaToko!.items.map((i) => i.id);
      expect(itemIds).toContain('catalog');
      expect(itemIds).toContain('orders');
      expect(itemIds).toContain('finance');
      expect(itemIds).toContain('ai_knowledge');
      expect(itemIds).toContain('themes');

      const financeItem = kelolaToko!.items.find((i) => i.id === 'finance');
      expect(financeItem?.label).toBe('Keuangan');

      const themesItem = kelolaToko!.items.find((i) => i.id === 'themes');
      expect(themesItem?.label).toBe('Tema');

      const ordersItem = kelolaToko!.items.find((i) => i.id === 'orders');
      expect(ordersItem?.label).toBe('Pesanan');
    });

    it('Pesan & Pelanggan harus memuat item wajib: Smart Chatbox, Pelanggan, Whatsapp Connect, Telegram Connect', () => {
      const groups = buildMenuRegistry({});
      const group = groups.find((g) => g.id === 'pesan-pelanggan');
      expect(group).toBeDefined();

      const itemLabels = group!.items.map((i) => i.label);
      expect(itemLabels).toEqual([
        'Smart Chatbox',
        'Pelanggan',
        'Whatsapp Connect',
        'Telegram Connect',
      ]);
    });

    it('Marketing Tools harus memuat item wajib: Ads Tracking, Broadcast WA, Program Reseller', () => {
      const groups = buildMenuRegistry({});
      const group = groups.find((g) => g.id === 'kembangkan-bisnis');
      expect(group).toBeDefined();

      const itemLabels = group!.items.map((i) => i.label);
      expect(itemLabels).toEqual([
        'Ads Tracking',
        'Broadcast WA',
        'Program Reseller',
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
      expect(findParentGroupId('finance', groups)).toBe('kelola-toko');
      expect(findParentGroupId('ai_knowledge', groups)).toBe('kelola-toko');
      expect(findParentGroupId('themes', groups)).toBe('kelola-toko');
      expect(findParentGroupId('storefront', groups)).toBe('kelola-toko');

      // Pesan & Pelanggan
      expect(findParentGroupId('inbox', groups)).toBe('pesan-pelanggan');
      expect(findParentGroupId('customers', groups)).toBe('pesan-pelanggan');
      expect(findParentGroupId('crm', groups)).toBe('pesan-pelanggan');
      expect(findParentGroupId('whatsapp', groups)).toBe('pesan-pelanggan');
      expect(findParentGroupId('telegram_alerts', groups)).toBe('pesan-pelanggan');

      // Marketing Tools (kembangkan-bisnis)
      expect(findParentGroupId('ads_tracking', groups)).toBe('kembangkan-bisnis');
      expect(findParentGroupId('broadcast', groups)).toBe('kembangkan-bisnis');
      expect(findParentGroupId('reseller', groups)).toBe('kembangkan-bisnis');
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
      expect(isTabActiveInItem(whatsappItem, 'auto_reply')).toBe(true);
      expect(isTabActiveInItem(whatsappItem, 'rotator')).toBe(true);
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
      expect(digital.label).toBe('Katalog & Produk');
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

      const kelolaGroup = groups.find((g) => g.id === 'kelola-toko')!;
      const financeItem = kelolaGroup.items.find((i) => i.id === 'finance')!;
      expect(financeItem.isLocked).toBe(true);
      expect(financeItem.badge?.isLock).toBe(true);
    });
  });

  describe('4. Multi-Open Accordion State Behavior', () => {
    it('mempertahankan kategori lain tetap terbuka ketika kategori baru diklik (independent toggle)', () => {
      // Simulasikan state Set<string>
      const openGroupIds = new Set<string>();

      // Fungsi toggle independen
      const toggleGroup = (groupId: string) => {
        if (openGroupIds.has(groupId)) {
          openGroupIds.delete(groupId);
        } else {
          openGroupIds.add(groupId);
        }
      };

      // 1. User membuka 'kelola-toko'
      toggleGroup('kelola-toko');
      expect(openGroupIds.has('kelola-toko')).toBe(true);
      expect(openGroupIds.size).toBe(1);

      // 2. User membuka 'pesan-pelanggan' (tidak boleh menutup 'kelola-toko')
      toggleGroup('pesan-pelanggan');
      expect(openGroupIds.has('kelola-toko')).toBe(true);
      expect(openGroupIds.has('pesan-pelanggan')).toBe(true);
      expect(openGroupIds.size).toBe(2);

      // 3. User membuka 'kembangkan-bisnis'
      toggleGroup('kembangkan-bisnis');
      expect(openGroupIds.has('kelola-toko')).toBe(true);
      expect(openGroupIds.has('pesan-pelanggan')).toBe(true);
      expect(openGroupIds.has('kembangkan-bisnis')).toBe(true);
      expect(openGroupIds.size).toBe(3);

      // 4. User menutup 'pesan-pelanggan' secara eksplisit
      toggleGroup('pesan-pelanggan');
      expect(openGroupIds.has('pesan-pelanggan')).toBe(false);
      expect(openGroupIds.has('kelola-toko')).toBe(true);
      expect(openGroupIds.has('kembangkan-bisnis')).toBe(true);
      expect(openGroupIds.size).toBe(2);
    });

    it('otomatis memasukkan parent group dari route aktif ke dalam daftar terbuka', () => {
      const groups = buildMenuRegistry({});
      const initialOpenGroupIds = new Set<string>();

      const activeTab = 'inbox';
      const parent = findParentGroupId(activeTab, groups);
      if (parent && parent !== 'ringkasan') {
        initialOpenGroupIds.add(parent);
      }

      expect(initialOpenGroupIds.has('pesan-pelanggan')).toBe(true);
    });
  });
});

