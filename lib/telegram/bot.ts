/**
 * lib/telegram/bot.ts
 * Entrypoint and Re-export for BoonPilot Telegram Bot Service
 *
 * Implements full integration with BoonPilot Conversation Engine.
 */

export * from './boonpilot-telegram';
export { handleTelegramUpdate as default } from './boonpilot-telegram';
