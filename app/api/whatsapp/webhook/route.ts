/**
 * app/api/whatsapp/webhook/route.ts
 * Alias route for Meta WABA Webhook Ingress (/api/whatsapp/webhook -> /api/whatsapp/webhook/waba).
 */

export const dynamic = 'force-dynamic';

export { GET, POST, verifyMetaWebhookSignature } from './waba/route';
