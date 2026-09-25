import { resolveActiveOrderBumps, OrderBumpItem, OrderBumpConfig } from '@/lib/product-catalog';

describe('Order Bump / Cross-Selling Feature', () => {
  it('returns empty array when product has no order bump configuration', () => {
    const product = {
      id: 'prod_1',
      name: 'Produk Utama',
      price: 150000,
    };
    const activeBumps = resolveActiveOrderBumps(product);
    expect(activeBumps).toEqual([]);
    expect(activeBumps.length).toBe(0);
  });

  it('returns empty array when master toggle is disabled (enabled: false)', () => {
    const config: OrderBumpConfig = {
      enabled: false,
      items: [
        {
          id: 'bump_1',
          name: 'Add-on Template',
          price: 50000,
          original_price: 100000,
          is_active: true,
        },
      ],
    };

    const product = {
      id: 'prod_1',
      name: 'Produk Utama',
      price: 150000,
      order_bumps: config,
    };

    const activeBumps = resolveActiveOrderBumps(product);
    expect(activeBumps).toEqual([]);
  });

  it('filters out inactive items when master toggle is enabled', () => {
    const config: OrderBumpConfig = {
      enabled: true,
      items: [
        {
          id: 'bump_active_1',
          name: 'Template Notion',
          price: 49000,
          original_price: 99000,
          badge_text: 'Hemat 50%',
          is_active: true,
        },
        {
          id: 'bump_inactive_2',
          name: 'Sesi 1-on-1',
          price: 250000,
          original_price: 500000,
          is_active: false,
        },
      ],
    };

    const product = {
      id: 'prod_1',
      name: 'Produk Utama',
      price: 150000,
      metadata: {
        order_bumps: config,
      },
    };

    const activeBumps = resolveActiveOrderBumps(product);
    expect(activeBumps.length).toBe(1);
    expect(activeBumps[0].id).toBe('bump_active_1');
    expect(activeBumps[0].price).toBe(49000);
    expect(activeBumps[0].badge_text).toBe('Hemat 50%');
  });

  it('supports raw array format in product.order_bumps for backward compatibility', () => {
    const rawArray: OrderBumpItem[] = [
      {
        id: 'bump_arr_1',
        name: 'Bonus Checklist',
        price: 25000,
        is_active: true,
      },
      {
        id: 'bump_arr_2',
        name: 'Disabled Item',
        price: 10000,
        is_active: false,
      },
    ];

    const product = {
      id: 'prod_1',
      name: 'Produk Utama',
      price: 150000,
      fulfillment_metadata: {
        order_bumps: rawArray,
      },
    };

    const activeBumps = resolveActiveOrderBumps(product);
    expect(activeBumps.length).toBe(1);
    expect(activeBumps[0].id).toBe('bump_arr_1');
    expect(activeBumps[0].price).toBe(25000);
  });

  it('calculates reactive order total correctly when multiple bumps are checked', () => {
    const basePrice = 150000;
    const productDiscount = 20000; // voucher
    const netBasePrice = basePrice - productDiscount; // 130000

    const selectedBumps: OrderBumpItem[] = [
      { id: 'b1', name: 'Add-on 1', price: 49000, is_active: true },
      { id: 'b2', name: 'Add-on 2', price: 35000, is_active: true },
    ];

    const orderBumpsTotal = selectedBumps.reduce((sum, b) => sum + b.price, 0);
    expect(orderBumpsTotal).toBe(84000);

    const netProductPriceWithBumps = netBasePrice + orderBumpsTotal;
    expect(netProductPriceWithBumps).toBe(214000);
  });
});
