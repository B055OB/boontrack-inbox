/**
 * lib/auth/platform-user-repository.ts
 * Unified Persistent Repository for Platform User Identity & Profile Layer
 * Backed by Supabase PostgreSQL (public.platform_users)
 * CTO Directive — Global Auth Persistence Readiness (October 2026)
 *
 * Core Invariants:
 * 1. Authoritative Identity: auth.users.id is the single root of trust.
 * 2. Uniqueness: PostgreSQL enforces unique constraints on email and google_sub.
 * 3. Atomic Binding: fn_link_google_identity RPC guarantees FOR UPDATE row-level lock concurrency.
 * 4. Anti-Takeover: Unverified accounts can never bind an external OAuth provider.
 * 5. Multi-Process Resilience: Zero dependency on ephemeral process-local heap memory in live environments.
 */

import { getSupabaseAdmin } from '@/lib/supabaseClient';

export interface PlatformUserRecord {
  id: string;               // UUID referencing auth.users(id)
  email: string;
  email_verified: boolean;
  google_sub?: string;
  whatsapp_e164?: string;
  session_version: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface LinkGoogleIdentityParams {
  authUserId: string;       // Real GoTrue auth.users UUID
  email: string;
  googleSub: string;
}

export type LinkGoogleIdentityResult =
  | { success: true; user: PlatformUserRecord; status: string }
  | { success: false; error: string; message?: string };

export interface IPlatformUserRepository {
  findByEmail(email: string): Promise<PlatformUserRecord | null>;
  findById(userId: string): Promise<PlatformUserRecord | null>;
  findByGoogleSub(googleSub: string): Promise<PlatformUserRecord | null>;
  linkGoogleIdentity(params: LinkGoogleIdentityParams): Promise<LinkGoogleIdentityResult>;
  reconcileProfile(authUserId: string): Promise<PlatformUserRecord | null>;
  incrementSessionVersion(userId: string): Promise<number>;
  save(user: PlatformUserRecord): Promise<PlatformUserRecord>;
}

// ── 1. Live Supabase PostgreSQL Implementation ──────────────────────────────

export class SupabasePlatformUserRepository implements IPlatformUserRepository {
  async findByEmail(email: string): Promise<PlatformUserRecord | null> {
    const cleanEmail = email.trim().toLowerCase();
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('platform_users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  async findById(userId: string): Promise<PlatformUserRecord | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('platform_users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  async findByGoogleSub(googleSub: string): Promise<PlatformUserRecord | null> {
    const cleanSub = googleSub.trim();
    if (!cleanSub) return null;
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('platform_users')
      .select('*')
      .eq('google_sub', cleanSub)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  async linkGoogleIdentity(params: LinkGoogleIdentityParams): Promise<LinkGoogleIdentityResult> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('fn_link_google_identity', {
      p_auth_user_id: params.authUserId,
      p_email: params.email.trim().toLowerCase(),
      p_google_sub: params.googleSub.trim(),
    });

    if (error) {
      console.error('[SupabasePlatformUserRepository] linkGoogleIdentity error:', error);
      return { success: false, error: 'DATABASE_ERROR', message: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.success) {
      return {
        success: false,
        error: row?.status_code || 'LINKING_FAILED',
      };
    }

    return {
      success: true,
      status: row.status_code,
      user: {
        id: row.user_id,
        email: row.res_email,
        email_verified: true,
        google_sub: row.res_google_sub || undefined,
        session_version: row.session_version || 1,
      },
    };
  }

  async reconcileProfile(authUserId: string): Promise<PlatformUserRecord | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('fn_reconcile_platform_profile', {
      p_user_id: authUserId,
    });

    if (error || !data) {
      console.warn('[SupabasePlatformUserRepository] reconcileProfile error:', error);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row ? this.mapRow(row) : null;
  }

  async incrementSessionVersion(userId: string): Promise<number> {
    const admin = getSupabaseAdmin();
    const existing = await this.findById(userId);
    const newVersion = (existing?.session_version || 1) + 1;

    const { error } = await admin
      .from('platform_users')
      .update({ session_version: newVersion, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      console.error('[SupabasePlatformUserRepository] incrementSessionVersion error:', error);
      throw new Error(`Failed to increment session version for user ${userId}`);
    }

    return newVersion;
  }

  async save(user: PlatformUserRecord): Promise<PlatformUserRecord> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('platform_users')
      .upsert({
        id: user.id,
        email: user.email.trim().toLowerCase(),
        email_verified: user.email_verified,
        google_sub: user.google_sub || null,
        whatsapp_e164: user.whatsapp_e164 || null,
        session_version: user.session_version || 1,
        metadata: user.metadata || {},
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to upsert platform user: ${error?.message || 'unknown error'}`);
    }

    return this.mapRow(data);
  }

  private mapRow(row: any): PlatformUserRecord {
    const record: PlatformUserRecord = {
      id: row.id,
      email: row.email,
      email_verified: !!row.email_verified,
      session_version: row.session_version || 1,
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    if (row.google_sub) {
      record.google_sub = row.google_sub;
    }
    if (row.whatsapp_e164) {
      record.whatsapp_e164 = row.whatsapp_e164;
    }
    return record;
  }
}

// ── 2. In-Memory Mock Implementation (Tests & Offline Isolation) ─────────────

export class MockPlatformUserRepository implements IPlatformUserRepository {
  private usersByEmail = new Map<string, PlatformUserRecord>();
  private usersById = new Map<string, PlatformUserRecord>();

  clear(): void {
    this.usersByEmail.clear();
    this.usersById.clear();
  }

  async findByEmail(email: string): Promise<PlatformUserRecord | null> {
    const user = this.usersByEmail.get(email.trim().toLowerCase());
    return user ? { ...user } : null;
  }

  async findById(userId: string): Promise<PlatformUserRecord | null> {
    const user = this.usersById.get(userId);
    return user ? { ...user } : null;
  }

  async findByGoogleSub(googleSub: string): Promise<PlatformUserRecord | null> {
    const cleanSub = googleSub.trim();
    if (!cleanSub) return null;
    for (const u of this.usersByEmail.values()) {
      if (u.google_sub === cleanSub) {
        return { ...u };
      }
    }
    return null;
  }

  async linkGoogleIdentity(params: LinkGoogleIdentityParams): Promise<LinkGoogleIdentityResult> {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanSub = params.googleSub.trim();

    if (!cleanSub) {
      return { success: false, error: 'TOKEN_REQUIRED' };
    }

    let user = this.usersByEmail.get(cleanEmail);

    // If missing from mock memory, reconcile
    if (!user) {
      user = {
        id: params.authUserId,
        email: cleanEmail,
        email_verified: true,
        session_version: 1,
      };
      this.saveSync(user);
    }

    // ID collision assert
    if (user.id !== params.authUserId) {
      return { success: false, error: 'ID_COLLISION' };
    }

    // Anti-Takeover guard
    if (!user.email_verified) {
      return { success: false, error: 'ACCOUNT_TAKEOVER_PREVENTED' };
    }

    // Existing identity immutability
    if (user.google_sub) {
      if (user.google_sub !== cleanSub) {
        return { success: false, error: 'GOOGLE_IDENTITY_MISMATCH' };
      }
      return { success: true, user: { ...user }, status: 'ALREADY_BOUND' };
    }

    // Cross-account uniqueness
    for (const u of this.usersByEmail.values()) {
      if (u.google_sub === cleanSub && u.id !== params.authUserId) {
        return { success: false, error: 'GOOGLE_IDENTITY_ALREADY_LINKED' };
      }
    }

    // Update
    const updatedUser: PlatformUserRecord = {
      ...user,
      google_sub: cleanSub,
      email_verified: true,
      updated_at: new Date().toISOString(),
    };
    this.saveSync(updatedUser);

    return {
      success: true,
      status: 'LINKED_SUCCESS',
      user: { ...updatedUser },
    };
  }

  async reconcileProfile(authUserId: string): Promise<PlatformUserRecord | null> {
    const user = this.usersById.get(authUserId);
    if (user) return { ...user };
    return null;
  }

  async incrementSessionVersion(userId: string): Promise<number> {
    const user = this.usersById.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);
    user.session_version = (user.session_version || 1) + 1;
    this.saveSync(user);
    return user.session_version;
  }

  async save(user: PlatformUserRecord): Promise<PlatformUserRecord> {
    return this.saveSync(user);
  }

  saveSync(user: PlatformUserRecord): PlatformUserRecord {
    const record: PlatformUserRecord = {
      ...user,
      email: user.email.trim().toLowerCase(),
      session_version: user.session_version || 1,
    };
    if (!record.google_sub) {
      delete record.google_sub;
    }
    this.usersByEmail.set(record.email, record);
    this.usersById.set(record.id, record);
    return { ...record };
  }

  getByEmailSync(email: string): PlatformUserRecord | undefined {
    const user = this.usersByEmail.get(email.trim().toLowerCase());
    return user ? { ...user } : undefined;
  }
}

// ── 3. Universal Factory & Global Repository Instance ─────────────────────────

let _repositoryInstance: IPlatformUserRepository | null = null;
const _mockInstance = new MockPlatformUserRepository();

function isLiveDatabaseAvailable(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return false; // Force deterministic isolated testing in Jest test suites
  }
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('mock')
  );
}

export function getPlatformUserRepository(): IPlatformUserRepository {
  if (!isLiveDatabaseAvailable()) {
    return _mockInstance;
  }
  if (!_repositoryInstance) {
    _repositoryInstance = new SupabasePlatformUserRepository();
  }
  return _repositoryInstance;
}

/**
 * Resets repository store (for unit test teardown)
 */
export function resetPlatformUserRepositoryStore(): void {
  _mockInstance.clear();
}

/**
 * Seeds a user into repository (for unit test fixtures)
 */
export function seedRepositoryUser(user: PlatformUserRecord): PlatformUserRecord {
  return _mockInstance.saveSync(user);
}

/**
 * Synchronous mock lookup for test assertions
 */
export function getMockPlatformUserByEmail(email: string): PlatformUserRecord | undefined {
  return _mockInstance.getByEmailSync(email);
}
