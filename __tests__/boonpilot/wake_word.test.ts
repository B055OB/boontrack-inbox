import { isBoonPilotWakeWordTriggered } from '@/lib/boonpilot/wake-word';

describe('BoonPilot Wake Word & Mention Logic', () => {
  describe('Group Chat Rules', () => {
    const isGroup = true;

    it('triggers on "boon" keyword in group and strips it cleanly', () => {
      const res = isBoonPilotWakeWordTriggered('boon tolong cek pesanan saya', isGroup);
      expect(res.triggered).toBe(true);
      expect(res.cleanText).toBe('tolong cek pesanan saya');
    });

    it('triggers on "@boon" keyword in group and strips it cleanly', () => {
      const res = isBoonPilotWakeWordTriggered('@boon halo apa kabar', isGroup);
      expect(res.triggered).toBe(true);
      expect(res.cleanText).toBe('halo apa kabar');
    });

    it('triggers on "@boontrack_bot" (Telegram specific) and strips it', () => {
      const res = isBoonPilotWakeWordTriggered('@boontrack_bot bagaimana cara registrasi?', isGroup);
      expect(res.triggered).toBe(true);
      expect(res.cleanText).toBe('bagaimana cara registrasi?');
    });

    it('triggers when "boon" is in the middle of a sentence', () => {
      const res = isBoonPilotWakeWordTriggered('halo boon, ada kendala di checkout', isGroup);
      expect(res.triggered).toBe(true);
      expect(res.cleanText).toBe('halo ada kendala di checkout');
    });

    it('silently ignores ordinary group chatter without wake word', () => {
      const res1 = isBoonPilotWakeWordTriggered('selamat pagi semua rekan-rekan', isGroup);
      expect(res1.triggered).toBe(false);
      expect(res1.cleanText).toBe('');

      const res2 = isBoonPilotWakeWordTriggered('saya sedang makan abon sapi enak', isGroup);
      expect(res2.triggered).toBe(false);
    });

    it('silently ignores empty or whitespace messages in group', () => {
      const res = isBoonPilotWakeWordTriggered('   ', isGroup);
      expect(res.triggered).toBe(false);
    });
  });

  describe('Private DM Rules', () => {
    const isGroup = false;

    it('responds to all messages normally without requiring wake words', () => {
      const res = isBoonPilotWakeWordTriggered('halo saya mau tanya fitur', isGroup);
      expect(res.triggered).toBe(true);
      expect(res.cleanText).toBe('halo saya mau tanya fitur');
    });

    it('handles messages that happen to contain wake words in DM', () => {
      const res = isBoonPilotWakeWordTriggered('@boon tolong bantu', isGroup);
      expect(res.triggered).toBe(true);
      expect(res.cleanText).toBe('@boon tolong bantu');
    });
  });
});
