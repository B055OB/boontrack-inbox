import {
  signBwmSessionToken,
  verifyBwmSessionToken,
  enforceTenantScope,
  BwmSessionPayload,
} from '../../workforce-web/lib/auth/session';

describe('BWM Phase 0 — Session Token Security & Gate Isolation', () => {
  const sampleParams = {
    userId: '88888888-8888-8888-8888-888888888888',
    tenantId: '11111111-1111-1111-1111-111111111111',
    tenantSlug: 'alpha-security-systems',
    role: 'field_personnel' as const,
    nik: 'OFF-1092',
    name: 'Officer John Doe',
    site: 'Alpha Facility Hub',
    siteId: 'site-alpha-01',
    branch: 'Regional HQ',
    agencyName: 'Alpha Security Systems',
    agencySlug: 'alpha-security-systems',
  };

  test('signs and successfully verifies a legitimate session token', () => {
    const token = signBwmSessionToken(sampleParams, 3600);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const result = verifyBwmSessionToken(token);
    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload?.userId).toBe(sampleParams.userId);
    expect(result.payload?.tenantId).toBe(sampleParams.tenantId);
    expect(result.payload?.tenantSlug).toBe(sampleParams.tenantSlug);
    expect(result.payload?.role).toBe('field_personnel');
  });

  test('GATE TEST 1: Rejects forged session token (tampered payload with valid-looking signature)', () => {
    const token = signBwmSessionToken(sampleParams, 3600);
    const [header, payload, sig] = token.split('.');

    // Tamper with payload (escalate role to master_reseller)
    const rawPayload: BwmSessionPayload = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );
    rawPayload.role = 'master_reseller';
    const tamperedPayload = Buffer.from(JSON.stringify(rawPayload)).toString('base64url');

    const forgedToken = `${header}.${tamperedPayload}.${sig}`;

    const result = verifyBwmSessionToken(forgedToken);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('INVALID_SIGNATURE_TAMPERED');
    expect(result.statusCode).toBe(401);
  });

  test('GATE TEST 2: Rejects completely forged token created with arbitrary secret', () => {
    const arbitraryToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsInRlbmFudElkIjoidGVzdCIsInJvbGUiOiJvd25lciIsImV4cCI6OTk5OTk5OTk5OX0.invalidsignature123';
    const result = verifyBwmSessionToken(arbitraryToken);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('INVALID_SIGNATURE_TAMPERED');
    expect(result.statusCode).toBe(401);
  });

  test('GATE TEST 3: Rejects expired session token', () => {
    // Generate token with negative duration (already expired)
    const expiredToken = signBwmSessionToken(sampleParams, -100);
    const result = verifyBwmSessionToken(expiredToken);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('SESSION_EXPIRED');
    expect(result.statusCode).toBe(401);
  });

  test('GATE TEST 4: Rejects malformed tokens and empty input', () => {
    expect(verifyBwmSessionToken('').valid).toBe(false);
    expect(verifyBwmSessionToken(null as any).valid).toBe(false);
    expect(verifyBwmSessionToken('single-string-without-dots').valid).toBe(false);
    expect(verifyBwmSessionToken('header.payload').valid).toBe(false);
  });

  test('GATE TEST 5: Cross-tenant access isolation enforcement', () => {
    const token = signBwmSessionToken(sampleParams, 3600);
    const { payload } = verifyBwmSessionToken(token);
    expect(payload).toBeDefined();

    // Legitimate tenant access
    const selfTenantCheck = enforceTenantScope(payload!, '11111111-1111-1111-1111-111111111111');
    expect(selfTenantCheck.authorized).toBe(true);

    const selfSlugCheck = enforceTenantScope(payload!, 'alpha-security-systems');
    expect(selfSlugCheck.authorized).toBe(true);

    // Cross-tenant access attempt to beta tenant
    const crossTenantCheck = enforceTenantScope(payload!, '22222222-2222-2222-2222-222222222222');
    expect(crossTenantCheck.authorized).toBe(false);
    expect(crossTenantCheck.error).toContain('CROSS_TENANT_ACCESS_FORBIDDEN');

    const crossSlugCheck = enforceTenantScope(payload!, 'beta-security-systems');
    expect(crossSlugCheck.authorized).toBe(false);
    expect(crossSlugCheck.error).toContain('CROSS_TENANT_ACCESS_FORBIDDEN');
  });
});
