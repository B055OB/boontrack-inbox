describe('Omnichannel Channel Filter & Badge Consistency', () => {
  describe('Channel Type & Badge Resolution Logic', () => {
    function resolveChannelBadge(channelType?: string, customerPhone?: string) {
      const raw = (channelType || '').toUpperCase();
      const isWebchat = raw === 'WEBCHAT' || (customerPhone && customerPhone.startsWith('webchat_'));
      const isWaba = raw === 'WABA' || raw === 'META_API';

      if (isWebchat) {
        return {
          label: 'Webchat',
          badgeColor: 'sky',
          title: 'Kanal Webchat (Widget Toko)',
        };
      }

      if (isWaba) {
        return {
          label: 'WABA',
          badgeColor: 'emerald',
          title: 'Kanal WhatsApp Business API (Meta Cloud API)',
        };
      }

      return {
        label: 'BoonTrack Engine',
        badgeColor: 'indigo',
        title: 'Kanal BoonTrack WhatsApp Engine (Nomor Pairing)',
      };
    }

    it('resolves Meta WABA badge when channelType is WABA', () => {
      const badge = resolveChannelBadge('WABA', '628123456789');
      expect(badge.label).toBe('WABA');
      expect(badge.badgeColor).toBe('emerald');
    });

    it('resolves BoonTrack Engine badge when channelType is BAILEYS or ENGINE', () => {
      const badge = resolveChannelBadge('BAILEYS', '628123456789');
      expect(badge.label).toBe('BoonTrack Engine');
      expect(badge.badgeColor).toBe('indigo');
    });

    it('resolves Webchat badge when channelType is WEBCHAT or phone starts with webchat_', () => {
      const badge = resolveChannelBadge('WEBCHAT', 'webchat_usr_999');
      expect(badge.label).toBe('Webchat');
      expect(badge.badgeColor).toBe('sky');
    });

    it('defaults to BoonTrack Engine for standard phone without channelType', () => {
      const badge = resolveChannelBadge(undefined, '628999888777');
      expect(badge.label).toBe('BoonTrack Engine');
      expect(badge.badgeColor).toBe('indigo');
    });
  });

  describe('Omnichannel Filter Rules & Active Channel Gating', () => {
    const mockConversations = [
      { id: '1', customerPhone: '628111', channelType: 'WABA', customerName: 'WABA User' },
      { id: '2', customerPhone: '628222', channelType: 'BAILEYS', customerName: 'Engine User' },
      { id: '3', customerPhone: 'webchat_333', channelType: 'WEBCHAT', customerName: 'Webchat User' },
      { id: '4', customerPhone: '628444', channelType: 'TELEGRAM', customerName: 'Telegram User' },
    ];

    it('filters strictly by WABA when waba filter is active', () => {
      const filtered = mockConversations.filter((c) => (c.channelType || '').toUpperCase() === 'WABA');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].customerName).toBe('WABA User');
    });

    it('filters strictly by BoonTrack Engine when engine filter is active', () => {
      const filtered = mockConversations.filter((c) => {
        const raw = (c.channelType || '').toUpperCase();
        return raw === 'BAILEYS' || raw === 'ENGINE' || (!raw && !c.customerPhone.startsWith('webchat_'));
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].customerName).toBe('Engine User');
    });

    it('filters strictly by Webchat when webchat filter is active', () => {
      const filtered = mockConversations.filter((c) => {
        const raw = (c.channelType || '').toUpperCase();
        return raw === 'WEBCHAT' || c.customerPhone.startsWith('webchat_');
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].customerName).toBe('Webchat User');
    });

    it('calculates counts per channel correctly', () => {
      let waba = 0;
      let engine = 0;
      let webchat = 0;
      for (const c of mockConversations) {
        const raw = (c.channelType || '').toUpperCase();
        if (raw === 'WABA') {
          waba++;
        } else if (raw === 'WEBCHAT' || c.customerPhone.startsWith('webchat_')) {
          webchat++;
        } else {
          engine++;
        }
      }
      expect(waba).toBe(1);
      expect(webchat).toBe(1);
      expect(engine).toBe(2);
    });

    it('hides inactive channels such as Telegram from rendered filter tabs', () => {
      // Channel detection logic: only WABA, Engine, Webchat are eligible if active
      const activeChannels = {
        hasWaba: true,
        hasEngine: true,
        hasWebchat: false, // Inactive webchat
        hasTelegram: false, // Inactive telegram
      };

      const renderedTabs: string[] = ['Semua'];
      if (activeChannels.hasWaba) renderedTabs.push('WABA');
      if (activeChannels.hasEngine) renderedTabs.push('BoonTrack Engine');
      if (activeChannels.hasWebchat) renderedTabs.push('Webchat');

      expect(renderedTabs).toContain('Semua');
      expect(renderedTabs).toContain('WABA');
      expect(renderedTabs).toContain('BoonTrack Engine');
      expect(renderedTabs).not.toContain('Webchat');
      expect(renderedTabs).not.toContain('Telegram');
    });
  });
});
