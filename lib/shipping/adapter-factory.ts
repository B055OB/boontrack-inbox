/**
 * @module lib/shipping/adapter-factory
 * ShippingAdapterFactory (§10.2)
 *
 * Reads `tenants.metadata.shipping_config.active_aggregator` from Supabase and
 * instantiates the correct concrete adapter. This is the ONLY place where adapter
 * selection occurs — all call-sites receive a `BaseShippingAdapter` interface.
 *
 * Principle: No adapter name or credential is hardcoded here. 100% data-driven (§0.1).
 */

import { LincahShippingAdapter } from './adapters/lincah';
import { BaseShippingAdapter, ShippingAdapterError } from './base-adapter';
import type { ShippingConfig } from './types';

export class ShippingAdapterFactory {
  /**
   * Instantiates the correct adapter for a tenant based on their shipping_config.
   *
   * @param config - Parsed `tenants.metadata.shipping_config` from Supabase
   * @throws ShippingAdapterError(400) when the selected aggregator is missing credentials
   */
  static create(config: ShippingConfig): BaseShippingAdapter {
    const { active_aggregator } = config;

    switch (active_aggregator) {
      case 'lincah': {
        const cfg = config.lincah;
        if (!cfg?.api_key || !cfg?.secret) {
          throw new ShippingAdapterError(
            'Konfigurasi Lincah tidak lengkap: api_key atau secret kosong di tenants.metadata.shipping_config.',
            400,
            'lincah',
          );
        }
        return new LincahShippingAdapter(cfg.api_key, cfg.secret, {
          partnerId: cfg.partner_id,
          isSandbox: cfg.is_sandbox,
        });
      }

      default:
        throw new ShippingAdapterError(
          `Aggregator pengiriman '${active_aggregator}' belum didukung.`,
          400,
          active_aggregator,
        );
    }
  }
}
