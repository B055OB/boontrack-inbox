/**
 * lib/formatting/universal-chat-formatter.ts
 * Universal Outbound Formatter for Telegram & WhatsApp
 *
 * Implements:
 * 1. formatToWhatsAppMarkdown: Converts AI Markdown (**bold**) into WhatsApp native (*bold*).
 * 2. formatToTelegramHtml: Converts AI Markdown into Telegram HTML (<b>bold</b>, <i>italic</i>, etc.).
 * 3. formatToTelegramMarkdown: Converts AI Markdown into Telegram Markdown V1 (*bold*).
 */

export function formatToWhatsAppMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\*\*\*([^*\n]+?)\*\*\*/g, '*_$1_*')
    .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');
}

export function formatToTelegramMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\*\*\*([^*\n]+?)\*\*\*/g, '*$1*')
    .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');
}

export function formatToTelegramHtml(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let str = text;

  // 1. Protect code blocks ```...``` and inline code `...`
  const codeBlocks: string[] = [];
  str = str.replace(/```(?:[a-zA-Z0-9_\-]+)?\n?([\s\S]*?)```/g, (_, code) => {
    const idx = codeBlocks.length;
    const escaped = code
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
    return `___CODE_BLOCK_${idx}___`;
  });

  const inlineCodes: string[] = [];
  str = str.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    inlineCodes.push(`<code>${escaped}</code>`);
    return `___INLINE_CODE_${idx}___`;
  });

  // 2. Escape HTML special characters (&, <, >) outside allowed tags
  str = str.replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;');
  str = str.replace(/<(?!(\/?(?:b|i|u|s|code|pre|a|strong|em)(?:\s+[^>]*>|>)))/gi, '&lt;');
  str = str.replace(/(?<!(<\/?(?:b|i|u|s|code|pre|a|strong|em)(?:\s+[^>]*)?))>/gi, (m, p1) => (p1 ? m : '&gt;'));

  // 3. Convert Markdown syntax to HTML
  // **bold** -> <b>bold</b>
  str = str.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');

  // *italic* (single asterisk) -> <i>italic</i>
  str = str.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<i>$1</i>');

  // _italic_ -> <i>italic</i> (standalone word, avoid variable_names like chat_id)
  str = str.replace(/(?<=^|[\s.,!?;:()\[\]])_([^_]+)_(?=$|[\s.,!?;:()\[\]])/g, '<i>$1</i>');

  // Markdown links: [text](url) -> <a href="url">text</a>
  str = str.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  // 4. Restore code blocks & inline code
  str = str.replace(/___CODE_BLOCK_(\d+)___/g, (_, idx) => codeBlocks[Number(idx)] || '');
  str = str.replace(/___INLINE_CODE_(\d+)___/g, (_, idx) => inlineCodes[Number(idx)] || '');

  return str;
}
