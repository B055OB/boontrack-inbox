import { processBoonPilotPlatformChat } from '@/lib/boonpilot/platform-engine';

describe('BoonPilot Persona, Escalation & Upsell Engine', () => {
  it('handles DFY & IT Support escalation when merchant or guest requests assistance with setup', async () => {
    const res = await processBoonPilotPlatformChat({
      senderPhone: '08999999999',
      message: 'Saya minta terima beres aja dong, ada jasa setup toko dan bot wa?',
    });

    expect(res.reply).toContain('https://shop.boontrack.com/boon');
    expect(res.reply).toContain('https://wa.me/6281977655099');
    expect(res.reply).toContain('DFY');
  });

  it('handles objection to high costs by recommending Checkout Lite (Rp 59.000/bln)', async () => {
    const res = await processBoonPilotPlatformChat({
      senderPhone: '08999999999',
      message: 'Biaya langganan kemahalan buat saya, ada yang paling murah dan hemat?',
    });

    expect(res.reply).toContain('Checkout Lite');
    expect(res.reply).toContain('59.000');
    expect(res.reply).toContain('QRIS');
  });

  it('handles high volume & team needs by recommending Pro Scale and Team Scale', async () => {
    const res = await processBoonPilotPlatformChat({
      senderPhone: '08999999999',
      message: 'Saya butuh kuota tinggi dan tim CS banyak untuk iklan Meta',
    });

    expect(res.reply).toContain('Pro Scale');
    expect(res.reply).toContain('Team Scale');
    expect(res.reply).toContain('Multi-Seat');
    expect(res.reply).toContain('Smart Chatbox');
    expect(res.reply).toContain('https://wa.me/6281977655099');
  });

  it('guides non-merchants to trial registration at https://shop.boontrack.com with feature education', async () => {
    const res = await processBoonPilotPlatformChat({
      senderPhone: '08999999999',
      message: 'Bagaimana cara mulai uji coba dan apa saja fiturnya?',
    });

    expect(res.reply).toContain('https://shop.boontrack.com');
    expect(res.reply).toContain('QRIS');
    expect(res.reply).toContain('WhatsApp');
  });
});
