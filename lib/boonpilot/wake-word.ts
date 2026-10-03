/**
 * lib/boonpilot/wake-word.ts
 * Wake Word and Mention Detector for BoonPilot (WhatsApp & Telegram)
 *
 * Rules:
 * - Group Chat:
 *   Only responds if message starts with or contains trigger keywords (case-insensitive):
 *   * "boon"
 *   * "@boon"
 *   * "@boontrack_bot" (Telegram)
 *   * "@boontrack"
 *   * "@081215567168" / "@6281215567168" (WhatsApp)
 *   Ordinary group chatter without trigger word is silently ignored.
 * - Private DM:
 *   Responds to all messages normally.
 */

export interface WakeWordResult {
  triggered: boolean;
  cleanText: string;
  matchedTrigger?: string;
}

export function isBoonPilotWakeWordTriggered(
  text: string,
  isGroup: boolean,
  channel: 'WHATSAPP' | 'TELEGRAM' = 'TELEGRAM'
): WakeWordResult {
  const raw = (text || '').trim();

  // Chat Pribadi (DM): Selalu merespons secara normal
  if (!isGroup) {
    return {
      triggered: true,
      cleanText: raw,
    };
  }

  if (!raw) {
    return {
      triggered: false,
      cleanText: '',
    };
  }

  // Regex pemicu: diawali atau mengandung "boon", "@boon", "@boontrack_bot", "@boontrack", "@081215567168"
  const triggerPattern = /(?:^|\s|[^\w@])(@boontrack_bot|@boontrack|@boon|@081215567168|@6281215567168|\bboon\b)/i;
  const match = triggerPattern.exec(raw);

  if (!match) {
    return {
      triggered: false,
      cleanText: '',
    };
  }

  const matched = match[1];

  // Bersihkan token mention dari teks agar AI engine menerima prompt yang bersih
  let clean = raw
    .replace(/@boontrack_bot\b/gi, '')
    .replace(/@boontrack\b/gi, '')
    .replace(/@boon\b/gi, '')
    .replace(/@081215567168\b/gi, '')
    .replace(/@6281215567168\b/gi, '')
    .replace(/\bboon\b/gi, '');

  // Bersihkan koma/titik dua/tanda hubung yang menggantung setelah mention dihapus (misal "halo boon, tolong" -> "halo tolong")
  clean = clean.replace(/\s+[,:;\-]+\s*/g, ' ');
  clean = clean.replace(/^[\:\-\s,]+/, '').replace(/[\:\-\s,]+$/, '').trim();
  clean = clean.replace(/\s+/g, ' ').trim();

  return {
    triggered: true,
    cleanText: clean || 'Halo BoonPilot',
    matchedTrigger: matched,
  };
}
