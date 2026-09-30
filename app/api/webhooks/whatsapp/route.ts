/**
 * app/api/webhooks/whatsapp/route.ts
 * Multi-tenant WhatsApp Webhook Route (Plural alias for /api/webhook/whatsapp)
 *
 * Supports both Evolution API v2 and Meta Cloud API WABA webhooks.
 */

export const dynamic = 'force-dynamic';

export { GET, POST } from '@/app/api/webhook/whatsapp/route';
