import type { BusinessConfigurationProposal } from '@/types/boonpilot';

export interface MappedSellerPlaybook {
  persona: {
    greetingStyle: string;
    tone: 'casual' | 'semi-formal' | 'formal';
  };
  scenarios: {
    priceObjection: string;
    closingHook: string;
    outOfStockHandling: string;
  };
  customDoAndDonts: string;
}

export function mapProposalToAiForm(proposal: BusinessConfigurationProposal) {
  const toneMap: Record<string, string> = {
    casual: 'casual',
    friendly: 'casual',
    empathic: 'friendly',
    formal: 'professional',
    consultative: 'persuasive',
  };

  return {
    ai_name: proposal.persona?.ai_name || 'BoonPilot CS Assistant',
    tone: toneMap[proposal.persona?.tone] || proposal.persona?.tone || 'casual',
    system_prompt: proposal.persona?.system_prompt || '',
  };
}

export function mapProposalToPlaybook(proposal: BusinessConfigurationProposal): MappedSellerPlaybook {
  // 1. Greeting & Tone
  const greetingStyle =
    proposal.persona?.greeting_message ||
    `Sapaan ramah dan konsultatif untuk ${proposal.business_profile?.store_name || 'toko'}. Selalu sapa 'Kak' dengan sopan.`;

  let playbookTone: 'casual' | 'semi-formal' | 'formal' = 'casual';
  const rawTone = (proposal.persona?.tone || '').toLowerCase();
  if (rawTone.includes('formal') && !rawTone.includes('semi')) {
    playbookTone = 'formal';
  } else if (rawTone.includes('semi') || rawTone.includes('consultative')) {
    playbookTone = 'semi-formal';
  } else {
    playbookTone = 'casual';
  }

  // 2. Objection Handling (Harga Mahal)
  const objectionItem = proposal.knowledge?.find(
    (k) =>
      k.category === 'OBJECTION' ||
      k.title?.toLowerCase().includes('harga') ||
      k.title?.toLowerCase().includes('mahal') ||
      k.title?.toLowerCase().includes('objection')
  );
  const priceObjection =
    objectionItem?.content ||
    'Jelaskan nilai, sertifikasi teknisi, peralatan higienis, dan jaminan garansi resmi tanpa terkesan defensif.';

  // 3. Urgensi Closing
  const conversionItem = proposal.knowledge?.find(
    (k) =>
      k.category === 'CONVERSION' ||
      k.title?.toLowerCase().includes('urgensi') ||
      k.title?.toLowerCase().includes('closing') ||
      k.title?.toLowerCase().includes('booking')
  );
  const closingHook =
    conversionItem?.content ||
    proposal.conversion_rules?.impulse_buying_prompts?.[0] ||
    'Informasikan bahwa slot kunjungan teknisi terbatas harian untuk memastikan kualitas pengerjaan.';

  // 4. Out of stock / Alternatif
  const outOfStockItem = proposal.knowledge?.find(
    (k) =>
      k.title?.toLowerCase().includes('stok') ||
      k.title?.toLowerCase().includes('habis') ||
      k.title?.toLowerCase().includes('jadwal penuh')
  );
  const outOfStockHandling =
    outOfStockItem?.content ||
    'Sampaikan permohonan maaf dengan santun, lalu tawarkan jadwal alternatif terdekat atau opsi pre-booking hari berikutnya.';

  // 5. Aturan Pembayaran & Booking (SOP / Custom Do's & Don'ts)
  const ruleItems = (proposal.knowledge || [])
    .filter((k) => k.category === 'RULE' || k.category === 'POLICY')
    .map((k) => `${k.title}: ${k.content}`);

  const parts: string[] = [];

  if (ruleItems.length > 0) {
    parts.push(ruleItems.join(' '));
  }

  // Payment Rules
  if (proposal.payment_rules) {
    const methods: string[] = [];
    if (proposal.payment_rules.enable_qris) methods.push('QRIS Dinamis (0% MDR)');
    if (proposal.payment_rules.enable_manual_transfer) methods.push('Tunai/Transfer');
    if (methods.length > 0) {
      parts.push(`Metode Pembayaran Diterima: ${methods.join(', ')}.`);
    }
  }

  // Booking Schema
  if (proposal.booking_schema?.enabled) {
    parts.push(
      `SOP Booking: Wajib konfirmasi Nama Lengkap, Nomor WhatsApp, Alamat Lokasi, dan Pilihan Tanggal/Jam Kunjungan.`
    );
    if (proposal.booking_schema.service_areas && proposal.booking_schema.service_areas.length > 0) {
      parts.push(`Area Layanan: ${proposal.booking_schema.service_areas.join(', ')}.`);
    }
  }

  // Persona Do's and Don'ts
  if (proposal.persona?.do_rules && proposal.persona.do_rules.length > 0) {
    parts.push(`Do's: ${proposal.persona.do_rules.join('; ')}.`);
  }
  if (proposal.persona?.dont_rules && proposal.persona.dont_rules.length > 0) {
    parts.push(`Don'ts: ${proposal.persona.dont_rules.join('; ')}.`);
  }

  const customDoAndDonts =
    parts.join(' ') ||
    'Dilarang memberikan nomor kontak pribadi selain nomor resmi toko. Selalu pastikan konfirmasi data penerima sebelum checkout.';

  return {
    persona: {
      greetingStyle,
      tone: playbookTone,
    },
    scenarios: {
      priceObjection,
      closingHook,
      outOfStockHandling,
    },
    customDoAndDonts,
  };
}
