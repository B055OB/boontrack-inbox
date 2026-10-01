/**
 * Storefront Canonical URLs (Re-exporting from centralized helper lib/utils/storefrontUrl.ts)
 * Standard: https://boontrack.com/${slug}
 */

export {
  CANONICAL_DOMAIN,
  STOREFRONT_DOMAIN,
  getStorefrontUrl,
  getProductPageUrl,
  getStorefrontShortlink,
  getRotatorUrl,
  getDigitalDeliveryUrl,
  getStorefrontShopUrl,
  getStorefrontInvoiceUrl,
  getStorefrontPayUrl,
} from './utils/storefrontUrl';

export { generatePaymentToken } from './utils/paymentToken';

export const SHOP_BASE = 'https://boontrack.com';

