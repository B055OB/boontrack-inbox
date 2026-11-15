# ARCHITECTURAL NOTE: JTI REVOCATION & EDGE ISOLATE BOUNDARIES
**Document ID:** NOTE-SEC-2026-002  
**Classification:** Internal Architectural Documentation & Blocker Register  
**Author:** Antigravity / BoonTrack Security Team  
**Scope:** Edge Runtime Host-Session JTI Revocation  
**Status:** UNRESOLVED ARCHITECTURAL BLOCKER (RETAINED FOR FUTURE SCOPED REMEDIATION)

---

## 1. Executive Summary

During PR #95 P1 security remediations, session revocation parity between Node.js serverless functions and Vercel Edge Runtime middleware was evaluated. 

This note explicitly documents that **immediate cross-runtime JTI revocation across globally distributed Edge isolates cannot be achieved via process-local in-memory caches**. While process-local synchronization functions correctly in single-process test harnesses and individual serverless containers, true distributed revocation across independent Edge Points-of-Presence (PoPs) constitutes an **unresolved architectural blocker** requiring dedicated shared infrastructure.

In accordance with strict Founder/CTO guardrails, no external infrastructure (Redis, Upstash, Cloudflare KV, or database mutations) was introduced in this PR.

---

## 2. Current Working Capabilities (Process-Local Boundary)

The following security mechanisms are active, tested, and verifiably operating:

1. **Short-Lived Cryptographic Tokens:**
   - Tokens default to 7-day expiration (or shorter session TTL), capped strictly at a maximum lifetime of 30 days.
   - Any token with `exp <= now` fails closed automatically across all Node and Edge instances without requiring any external lookup.

2. **Strict Cryptographic Signature & Claim Validation:**
   - Signatures are verified using constant-time Web Cryptography API (`crypto.subtle`) on Edge and `crypto.timingSafeEqual` in Node.js.
   - Forged, tampered, or mismatched tokens fail closed immediately.

3. **Process-Local Revocation Blacklist:**
   - `lib/auth/host-session.ts` maintains an in-memory `revokedJtiCache` with automatic TTL pruning.
   - In test harnesses and single-instance environments, Node-level `revokeHostSession()` synchronizes with Edge-level `edgeRevokedJtiCache`.
   - Subsequent checks on that specific process instance fail closed with `TOKEN_REVOKED`.

4. **Host-Only Cookie Termination:**
   - Calling `POST /api/auth/session` immediately overwrites the browser's `__Host-bt_creator_session` and `__Host-bt_studio_session` cookies with `Max-Age=0`, terminating the client-side session.

---

## 3. Distributed Architecture Limitations (The Blocker)

In Vercel's multi-region production deployment model:
- **Serverless Node Functions** (`POST /api/auth/session`) run in transient AWS Lambda containers.
- **Edge Middleware** (`middleware.ts`) runs in Vercel Edge Network V8 isolates distributed across hundreds of global PoPs.
- **Memory Isolation:** V8 isolates maintain strictly private memory heaps. A mutation to an in-memory `Map` inside a Lambda container or Edge PoP in Washington D.C. (`iad1`) is **completely invisible** to an Edge PoP in Singapore (`sin1`) or Frankfurt (`fra1`).

Therefore:
- If a user logs out at PoP A, their cookie is deleted in their browser.
- However, if an attacker has previously exfiltrated the raw signed token, presenting that unexpired token directly to PoP B would not hit PoP A's in-memory revocation cache.
- The token would remain cryptographically valid until its `exp` timestamp passes, unless checked against a shared distributed datastore.

---

## 4. Required Future Architecture (Out of Scope for PR #95)

To achieve true distributed instant revocation across global Edge PoPs without compromising Edge latency (< 10ms execution budgets), the following architectural upgrade is required in a future separately authorized initiative:

1. **Low-Latency Edge-Compatible Datastore:**
   - Integration with a globally replicated, REST-based key-value store such as **Upstash Redis** (via HTTP pipeline) or **Cloudflare KV**.
2. **Read-Through Revocation Verification Hook:**
   - Update `isJtiRevokedEdge(jti, product)` in `lib/auth/host-session-edge.ts` to perform an asynchronous lookup against the Edge KV store with a short in-memory negative-cache (e.g., 5-second SWR).
3. **Write-Through Revocation on Logout:**
   - Update `revokeHostSession(jti, exp, product)` to write the revoked JTI to the shared store with TTL matching the token's remaining lifetime (`exp - now`).

---

## 5. Compliance & Guardrails Confirmation

In strict compliance with CTO Directive Section 6:
- Zero external infrastructure or Redis/KV clients were added.
- Zero database writes, migrations, or schema mutations were performed.
- No tests make false claims of cross-runtime multi-isolate distributed revocation parity.
- The residual distributed revocation limitation is formally acknowledged and cataloged here as an architectural blocker for future work.
