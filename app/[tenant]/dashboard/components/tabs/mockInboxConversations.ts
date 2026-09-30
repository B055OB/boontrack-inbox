import { ChatConversation } from './TeamChatTab';

/**
 * DEPRECATED / REMOVED PER ARCHITECTURAL RULE BAB 0.1 & BAB 9.
 * ZERO HARDCODING & ZERO MOCK SERVER IN PRODUCTION CODE.
 * All inbox conversations MUST be loaded directly from Supabase `conversations` table.
 */
export function generateConversationsFromOrders(_orders: any[]): ChatConversation[] {
  return [];
}
