import {
  resolveTenantWabaCredential,
  ResolvedWabaCredential,
} from '@/lib/whatsapp/credential-resolver';

describe('Dedicated Dynamic Credential Resolver (resolveTenantWabaCredential)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const mockSupabaseWithConnections = (connections: Record<string, any>, tenants?: Record<string, any>) => {
    return {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn(() => ({
              or: jest.fn(() => ({
                maybeSingle: jest.fn(async () => {
                  if (!tenants) return { data: null, error: null };
                  const found = Object.values(tenants)[0] || null;
                  return { data: found, error: null };
                }),
              })),
            })),
          };
        }
        if (table === 'whatsapp_connections') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((field: string, val: string) => {
                let target = Object.values(connections).find((c: any) => c[field] === val);
                return {
                  in: jest.fn((_pField: string, _pVals: string[]) => ({
                    maybeSingle: jest.fn(async () => ({
                      data: target || null,
                      error: null,
                    })),
                  })),
                  maybeSingle: jest.fn(async () => ({
                    data: target || null,
                    error: null,
                  })),
                };
              }),
            })),
          };
        }
        return {};
      }),
    };
  };

  it('successfully resolves valid WABA credentials for a connected tenant', async () => {
    const mockDb = mockSupabaseWithConnections({
      phone_123: {
        tenant_id: 'tenant-alpha',
        phone_number_id: 'phone_123',
        waba_id: 'waba_999',
        credential_ref: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_waba_token',
        ownership_domain: 'TENANT',
        status: 'CONNECTED',
        provider: 'META',
        credential_version: 'v2',
      },
    });

    const result = await resolveTenantWabaCredential('tenant-alpha', 'phone_123', {
      supabase: mockDb,
    });

    expect(result).toEqual<ResolvedWabaCredential>({
      tenantId: 'tenant-alpha',
      phoneNumberId: 'phone_123',
      wabaId: 'waba_999',
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_waba_token',
      credentialVersion: 'v2',
    });
  });

  it('resolves token from environment variable if credential_ref is a reference name', async () => {
    process.env.META_TOKEN_TENANT_BETA = 'env_secret_token_beta';

    const mockDb = mockSupabaseWithConnections({
      phone_456: {
        tenant_id: 'tenant-beta',
        phone_number_id: 'phone_456',
        credential_ref: 'cred_ref_beta',
        ownership_domain: 'TENANT',
        status: 'CONNECTED',
        provider: 'WABA',
        updated_at: '2026-10-12T00:00:00Z',
      },
    });

    const result = await resolveTenantWabaCredential('tenant-beta', 'phone_456', {
      supabase: mockDb,
    });

    expect(result.tenantId).toBe('tenant-beta');
    expect(result.phoneNumberId).toBe('phone_456');
    expect(result.accessToken).toBe('env_secret_token_beta');
    expect(result.credentialVersion).toBe(`v_${new Date('2026-10-12T00:00:00Z').getTime()}`);
  });

  it('rejects with error when tenantId or inboundPhoneNumberId is empty', async () => {
    await expect(resolveTenantWabaCredential('', 'phone_123')).rejects.toThrow(
      /\[SECURITY_WABA_CREDENTIAL_ERROR\].*tenantId/
    );
    await expect(resolveTenantWabaCredential('tenant-a', '')).rejects.toThrow(
      /\[SECURITY_WABA_CREDENTIAL_ERROR\].*inboundPhoneNumberId/
    );
  });

  it('fails closed when phone_number_id is unmapped in whatsapp_connections', async () => {
    const mockDb = mockSupabaseWithConnections({});

    await expect(
      resolveTenantWabaCredential('tenant-a', 'unmapped_phone', { supabase: mockDb })
    ).rejects.toThrow(/\[SECURITY_WABA_UNMAPPED_RESOURCE\]/);
  });

  it('fails closed on cross-tenant boundary breach (Tenant A requested, but belongs to Tenant B)', async () => {
    const mockDb = mockSupabaseWithConnections({
      phone_belonging_to_b: {
        tenant_id: 'tenant-b',
        phone_number_id: 'phone_belonging_to_b',
        credential_ref: 'token_b',
        ownership_domain: 'TENANT',
        status: 'CONNECTED',
      },
    });

    await expect(
      resolveTenantWabaCredential('tenant-a', 'phone_belonging_to_b', { supabase: mockDb })
    ).rejects.toThrow(/\[SECURITY_WABA_CROSS_TENANT_BREACH\]/);
  });

  it('fails closed when ownership_domain is not TENANT', async () => {
    const mockDb = mockSupabaseWithConnections({
      phone_platform: {
        tenant_id: 'system',
        phone_number_id: 'phone_platform',
        credential_ref: 'token_platform',
        ownership_domain: 'PLATFORM',
        status: 'CONNECTED',
      },
    });

    await expect(
      resolveTenantWabaCredential('system', 'phone_platform', { supabase: mockDb })
    ).rejects.toThrow(/\[SECURITY_WABA_DOMAIN_BREACH\]/);
  });

  it('fails closed when connection is REVOKED', async () => {
    const mockDb = mockSupabaseWithConnections({
      phone_revoked: {
        tenant_id: 'tenant-alpha',
        phone_number_id: 'phone_revoked',
        credential_ref: 'token_revoked',
        ownership_domain: 'TENANT',
        status: 'REVOKED',
      },
    });

    await expect(
      resolveTenantWabaCredential('tenant-alpha', 'phone_revoked', { supabase: mockDb })
    ).rejects.toThrow(/\[SECURITY_WABA_REVOKED_RESOURCE\]/);
  });

  it('fails closed when connection is DISCONNECTED and requireConnectedState is true', async () => {
    const mockDb = mockSupabaseWithConnections({
      phone_disc: {
        tenant_id: 'tenant-alpha',
        phone_number_id: 'phone_disc',
        credential_ref: 'token_disc',
        ownership_domain: 'TENANT',
        status: 'DISCONNECTED',
      },
    });

    await expect(
      resolveTenantWabaCredential('tenant-alpha', 'phone_disc', {
        supabase: mockDb,
        requireConnectedState: true,
      })
    ).rejects.toThrow(/\[SECURITY_WABA_DISCONNECTED\]/);
  });

  it('allows DISCONNECTED connection when requireConnectedState is false', async () => {
    const mockDb = mockSupabaseWithConnections({
      phone_disc: {
        tenant_id: 'tenant-alpha',
        phone_number_id: 'phone_disc',
        credential_ref: 'token_disc',
        ownership_domain: 'TENANT',
        status: 'DISCONNECTED',
        metadata: { version: '1.0' },
      },
    });

    const res = await resolveTenantWabaCredential('tenant-alpha', 'phone_disc', {
      supabase: mockDb,
      requireConnectedState: false,
    });

    expect(res.tenantId).toBe('tenant-alpha');
    expect(res.phoneNumberId).toBe('phone_disc');
    expect(res.accessToken).toBe('token_disc');
  });

  it('fails closed when no access token can be resolved', async () => {
    const mockDb = mockSupabaseWithConnections({
      phone_empty_token: {
        tenant_id: 'tenant-alpha',
        phone_number_id: 'phone_empty_token',
        credential_ref: '', // empty
        ownership_domain: 'TENANT',
        status: 'CONNECTED',
      },
    });

    await expect(
      resolveTenantWabaCredential('tenant-alpha', 'phone_empty_token', { supabase: mockDb })
    ).rejects.toThrow(/\[SECURITY_WABA_MISSING_CREDENTIAL\]/);
  });
});
