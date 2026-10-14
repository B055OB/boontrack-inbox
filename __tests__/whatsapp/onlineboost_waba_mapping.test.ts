import fs from 'fs';
import path from 'path';

describe('TASK: FIX WABA METADATA MAPPING & UNLOCK META CLOUD API TAB FOR TENANT onlineboost', () => {
  const rootDir = process.cwd();
  const whatsAppTabPath = path.join(
    rootDir,
    'app/[tenant]/dashboard/components/tabs/WhatsAppTab.tsx'
  );
  const wabaConfigPath = path.join(
    rootDir,
    'app/[tenant]/dashboard/components/WhatsAppWabaConfig.tsx'
  );
  const connectManualRoutePath = path.join(
    rootDir,
    'app/api/whatsapp/connect-manual/route.ts'
  );

  let whatsAppTabCode: string;
  let wabaConfigCode: string;
  let connectManualRouteCode: string;

  beforeAll(() => {
    whatsAppTabCode = fs.readFileSync(whatsAppTabPath, 'utf-8');
    wabaConfigCode = fs.readFileSync(wabaConfigPath, 'utf-8');
    connectManualRouteCode = fs.readFileSync(connectManualRoutePath, 'utf-8');
  });

  describe('1. WhatsAppTab Credentials Evaluation Hardening', () => {
    it('evaluates meta.waba_configured, meta.waba_active, and waba_phone_number_id', () => {
      expect(whatsAppTabCode).toContain('meta.waba_configured === true');
      expect(whatsAppTabCode).toContain('meta.waba_active === true');
      expect(whatsAppTabCode).toContain('Boolean(meta.waba_phone_number_id)');
      expect(whatsAppTabCode).toContain('Boolean(tenantData?.waba_phone_number_id)');
    });

    it('renders ACTIVE badge when WABA credentials exist and tier is unlocked', () => {
      expect(whatsAppTabCode).toContain('ACTIVE');
      expect(whatsAppTabCode).toContain('SETUP REQUIRED');
    });

    it('isolates Direct Connect QR auto-fetch so it does not fire in WABA mode', () => {
      expect(whatsAppTabCode).toContain("if (waMode === 'qr'");
      expect(whatsAppTabCode).toContain('handleConnectGrowthSession();');
    });

    it('switches to meta view when gateway type is waba and credentials are active', () => {
      expect(whatsAppTabCode).toContain("meta.whatsapp_gateway_type === 'waba'");
      expect(whatsAppTabCode).toContain("setWaMode('meta')");
    });
  });

  describe('2. WhatsAppWabaConfig Component Hardening', () => {
    it('falls back to tenants table metadata and direct columns when settings are empty', () => {
      expect(wabaConfigCode).toContain(".from('tenants')");
      expect(wabaConfigCode).toContain('meta.waba_configured === true');
      expect(wabaConfigCode).toContain('meta.waba_active === true');
      expect(wabaConfigCode).toContain('meta.waba_account_id');
      expect(wabaConfigCode).toContain('meta.waba_access_token');
    });

    it('displays verified status card when tenant has active credentials', () => {
      expect(wabaConfigCode).toContain('Akun WABA Resmi Terverifikasi!');
      expect(wabaConfigCode).toContain('Verified');
      expect(wabaConfigCode).toContain('Terhubung Aktif');
    });
  });

  describe('3. Connect-Manual Route Synchronization', () => {
    it('persists credentials to tenants table metadata for multi-tenant isolation', () => {
      expect(connectManualRouteCode).toContain(".from(\"tenants\")");
      expect(connectManualRouteCode).toContain('waba_phone_number_id: phoneNumberId');
      expect(connectManualRouteCode).toContain('waba_configured: true');
      expect(connectManualRouteCode).toContain('waba_active: true');
      expect(connectManualRouteCode).toContain('whatsapp_gateway_type: "waba"');
    });
  });
});
