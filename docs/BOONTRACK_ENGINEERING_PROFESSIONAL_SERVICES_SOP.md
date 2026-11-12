# BOONTRACK ENGINEERING PROFESSIONAL SERVICES SOP

- **Document ID:** `BT-ENG-SOP-001`
- **Version:** `1.0.0` (Phase 2 Governance Baseline)
- **Owner:** BoonTrack Engineering & Delivery Operations
- **Approval Authority:** Chief Technology Officer (CTO)
- **Applicability:** All Done-For-You (DFY) Storefront Setup, Product Onboarding, AI Bot Activation, ADF/CTWA Launch, and Enterprise Custom Engagements

---

## 1. Purpose & Architectural Mandate

This Standard Operating Procedure (**`BT-ENG-SOP-001`**) establishes mandatory engineering, security, data-isolation, and delivery gates for BoonTrack Professional Services engagements.

Every delivery engineer executing client work MUST uphold the platform's multi-tenant invariants (see [AGENTS.md](file:///c:/boontrack-inbox/AGENTS.md) and [DFY_ONBOARDING_PROMPT_TEMPLATE.md](file:///c:/boontrack-inbox/docs/DFY_ONBOARDING_PROMPT_TEMPLATE.md)):

1. **Zero Hardcoding Policy:** Never insert slug-based conditionals (`if (slug === '...')`), client brand names, client WhatsApp numbers, client prices, or testimonial fixtures inside shared codebase files (`app/[tenant]/*`, `components/*`, `lib/*`).
2. **Supabase as Single Source of Truth:** All tenant storefronts (`shop.boontrack.com/<slug>`), catalogs, landing copy, domain bindings, feature flags (`tenants.metadata.features`), and tier entitlements (`tenants.tier`) MUST be provisioned via PostgreSQL/Supabase scoped strictly to the target `tenant_id` / `slug`.
3. **No Shared Template Mutation:** Shared layouts, dashboard tabs, and storefront presets MUST NEVER be edited to satisfy a single tenant's aesthetic preference. Deliver layout customization using the canonical Phase 2 declarative contract (`types/storefront-presets.ts` & `lib/adapters/storefrontThemeAdapter.ts`):
   - **Catalog Presets (3):** `retail_classic`, `bento_commerce`, `editorial_shop`
   - **Microsite Presets (4):** `minimalist`, `bento`, `retail`, `bold`
   - **Profile Presets (3):** `corporate`, `studio`, `consultant`
   - **Bounded Global Theme Tokens:** `brandColor`, `mode` (`light` | `dark`), `fontFamily`, `borderRadius` (`sharp` | `rounded` | `pill`), `buttonStyle` (`solid` | `outline` | `soft` | `glass`)
4. **Fail-Closed Execution & Non-Destructive Writes:** When provisioning data into Supabase, execute non-destructive UPSERTs scoped `WHERE tenant_id = <target_tenant_id>` or `WHERE slug = <target_slug>`. Validate backups before mutating live `metadata` JSONB blobs.
5. **Mandatory Scope Declaration:** Before running scripts or modifying any tenant record, state explicitly in task/ticket logs:
   `[TARGET TENANT: <slug>] | [TARGET CHANNEL: <WABA/BAILEYS/NONE>] | [BLAST RADIUS: <ISOLATED/GLOBAL>]`

---

## 2. Commercial Service Catalog & Delivery Matrix

| Package Name | Commercial Scope Summary | Primary Engineering Artifacts / DB Mutations | Tier / Channel Prerequisite | Default Blast Radius & Isolation Rule |
| :--- | :--- | :--- | :--- | :--- |
| **1. Frontpage Launch** | Branded storefront activation (`shop.boontrack.com/<slug>`), visual preset selection, brand tokens, bio links, SEO/OG metadata, & optional custom domain mapping. | Supabase `tenants` (`name`, `logo_url`, `custom_domain`) & `tenants.metadata` (`storefront_v2.preset`, `storefront_v2.tokens`, `microsite.buttons`, `og_image_url`). | Active tenant account (`SOLO` for `clean_minimal`; `PRO_SCALE+` for locked themes). Channel: `NONE`. | `ISOLATED` — Strictly DB JSONB/row updates for `<target_slug>`. Zero code edits. |
| **2. Product Launch** | Complete catalog structuring across supported categories (`FASHION`, `F&B`, `DIGITAL_PRODUCT`, `CREATOR_AGENCY`), SKU pricing, variants, checkout/shipping config, & structured product landing page (`/p/[slug]`). | `products` / `tenants.metadata.products[]`, `featured_product_ids`, category modules, courier & payment method activation. | Validated merchant payment/shipping settings; Channel: `NONE` or `BAILEYS`/`WABA` for order notifications. | `ISOLATED` — Scoped strictly to `tenant_id`. Verify zero leakage into sibling stores. |
| **3. Bot Activation** | AI Sales Rep (`BoonPilot`) setup, WhatsApp connectivity (`Baileys` QR or official Meta `WABA`), knowledge-base ingestion, FAQ/objection handling, auto-reply triggers, & CS rotator routing. | `whatsapp_connections`, AI persona & knowledge base entries, webhook verification, CS fallback number binding in `tenants.metadata`. | Paid Bot/AI tier + active WA device/WABA credentials supplied via ephemeral secret channel. Channel: `BAILEYS` or `WABA`. | `ISOLATED` — Dry-run in staging/test number before enabling live webhook auto-reply. |
| **4. Business Launch ADF** | End-to-end commercial launch engine (**Frontpage + Product + Bot + Ads Data Flow / CTWA**): full storefront, flagship catalog, AI Sales Rep funnel, Meta Pixel / CAPI / CTWA attribution tracking, & conversion QA. | Combined storefront/catalog/bot DB provisioning + Ads/CTWA tracking pixel IDs & attribution funnel tags in tenant config + live test order flow. | `ADS_PERFORMANCE` / `PRO_SCALE`+ tier; Meta BM/Pixel IDs & WABA/Baileys verified. Channel: `WABA` or `BAILEYS`. | `ISOLATED` (High Operational Impact) — Requires end-to-end test transaction + pixel event verification + formal Tenant Acceptance sign-off. |
| **5. Enterprise Custom** | Tailored multi-store, B2G (`PUBLIC_SERVICE`), ERP/CRM webhook integration, custom F&B fleet/slot logic, SLA-backed onboarding, & security/RLS compliance audit. | Dedicated tenant module (ONLY under `/tenants/[tenant_slug]/...` if UI custom code approved by CTO), custom webhook/API adapters, bespoke Supabase migration if required. | `ENTERPRISE` / `TEAM_SCALE` contract + **CTO Written Architecture Sign-Off** + signed SOW (`Appendix 2`). | `ISOLATED` (or `GLOBAL` **only** via CTO-approved shared schema extension). Requires full regression test suite & incident SLA. |

---

## 3. End-to-End Delivery Lifecycle (Gate Model)

Every engagement MUST progress sequentially through the 6 mandatory gates. No step may be skipped.

```
[Gate 1: Intake] ─▶ [Gate 2: SOW & Tier Check] ─▶ [Gate 3: Isolated Provisioning]
       │                                                       │
       ▼                                                       ▼
[Gate 6: Closure] ◀─ [Gate 5: Client UAT & Handover] ◀─ [Gate 4: Internal QA & Isolation Audit]
```

1. **Gate 1 — Intake & Feasibility (`Appendix 1`):** Collect tenant slug, package tier, domain/channel goals, raw catalog assets, and point-of-contact. Verify slug uniqueness and tier payment status (`PAID` / `ACTIVE` — block work if `PENDING_PAYMENT` or `EXPIRED`).
2. **Gate 2 — SOW & Access Scoping (`Appendix 2` & `Appendix 3`):** Lock deliverables, exclusions, and access tier (`staging` vs ephemeral test account vs controlled production DB upsert). Assign least-privilege roles.
3. **Gate 3 — Secret-Safe Execution (`Appendix 4`):** Configure Supabase tenant data cleanly. Never ask clients for plaintext passwords in permanent chat tickets; ingest API/WABA/Meta tokens strictly via one-time secret exchange.
4. **Gate 4 — Internal Engineering QA (`Appendix 5`):** Validate responsive rendering (Mobile `375px` & Desktop `1440px`), Light/Dark legibility, end-to-end checkout/bot responses, AND **Cross-Tenant Isolation Proof** against an unrelated slug (`shop.boontrack.com/<control-slug>`).
5. **Gate 5 — Tenant Acceptance & Handover (`Appendix 6` & `Appendix 7`):** Conduct walkthrough on live/preview URL, obtain explicit written client sign-off, and transfer operational handbook without plaintext secrets.
6. **Gate 6 — Closure & Access Revocation (`Appendix 8`):** Revoke temporary admin/impersonation/staging grants within **24 hours**, rotate temporary provisioning secrets, and archive ticket logs.

---

## 4. Operational Appendices (Production Templates & Checklists)

---

### Appendix 1 — Project Intake Template

```markdown
## BOONTRACK PROFESSIONAL SERVICES — INTAKE TICKET

- **Ticket ID:** PS-YYYY-XXXX
- **Submission Date:** YYYY-MM-DD
- **Account Manager / Sales PIC:** <Name>
- **Assigned Delivery Engineer:** <Name>

### 1. Client & Tenant Identity
- **Business / Legal Name:** <Company / Brand Name>
- **Target Tenant Slug:** `<slug>` (URL: `shop.boontrack.com/<slug>`)
- **Database `tenant_id` (UUID):** `<uuid or PENDING_PROVISION>`
- **Current Billing Tier (`tenants.tier`):** `SOLO` | `PRO_SCALE` | `ADS_PERFORMANCE` | `TEAM_SCALE` | `ENTERPRISE`
- **Subscription Status:** `ACTIVE` | `TRIAL` | `PENDING_PAYMENT` (DO NOT START IF UNPAID)
- **Target Channel:** `NONE` | `BAILEYS` | `WABA`
- **Client Primary Contact:** <Name> | WA: `+62...` | Email: `<email>`

### 2. Requested Commercial Package (Select One)
- [ ] Frontpage Launch
- [ ] Product Launch
- [ ] Bot Activation
- [ ] Business Launch ADF
- [ ] Enterprise Custom (Requires CTO Sign-Off)

### 3. Client-Supplied Raw Assets Status
- [ ] Brand Logo (PNG/SVG min 512px) & Brand Color (`#RRGGBB`)
- [ ] Selected Preset Family: Catalog (`retail_classic` / `bento_commerce` / `editorial_shop`) | Microsite (`minimalist` / `bento` / `retail` / `bold`) | Profile (`corporate` / `studio` / `consultant`)
- [ ] Product Catalog Spreadsheet / CSV (SKU, Name, Category, Price IDR, Weight g, Stock, Images)
- [ ] Shipping Origin District / Postal Code & Supported Couriers
- [ ] WhatsApp Number / Meta WABA / Pixel CAPI IDs (Submitted ONLY via Appendix 4 Secret Flow — NEVER pasted below)
- [ ] Custom Domain Ownership Verification (if requested)

### 4. Target Go-Live Window & SLA
- **Requested Kickoff:** YYYY-MM-DD
- **Target UAT / Handover Date:** YYYY-MM-DD
```

---

### Appendix 2 — Scope of Work (SOW) Template

```markdown
## SCOPE OF WORK (SOW) — BOONTRACK PROFESSIONAL SERVICES

- **SOW Reference:** SOW-PS-YYYY-XXXX
- **Client / Tenant:** `<Brand Name>` (`slug: <tenant-slug>`)
- **Commercial Package:** <Frontpage Launch | Product Launch | Bot Activation | Business Launch ADF | Enterprise Custom>
- **Baseline Governance:** `BT-ENG-SOP-001`

### 1. Included Deliverables (In-Scope)
1. **Storefront Configuration:** Provisioning of `<preset_id>` using `<light|dark>` tokens inside `tenants.metadata` (no custom shared component code forks).
2. **Catalog Ingestion:** Up to `<N>` SKUs imported under categories `<list>`, including pricing, variants, and thumbnail assets.
3. **Channel / Integration Setup:** `<Describe WhatsApp/BoonPilot KB/Pixel/Payment setup>`.
4. **Testing & Launch Readiness:** Verification on staging/live URL across mobile (`375px`) and desktop viewports plus 1x UAT revision round.

### 2. Explicit Non-Scope Exclusions (Out-of-Scope)
- Custom UI layout modifications to shared core platform components outside the Phase 2 preset system (unless contracted as Enterprise Custom with CTO approval).
- Ongoing social media ad campaign media buying / creative production management beyond Meta Pixel / CAPI / CTWA attribution wiring.
- Manual entry beyond `<N>` products without structured client spreadsheet submission.
- Legal copywriting, trademark registration, or third-party payment gateway underwriting approval (Midtrans/Xendit/QRIS KYC rests with merchant).
- Storage or ongoing management of client personal Meta Business Manager passwords.

### 3. Technical Assumptions & Client Dependencies
- Client owns an active, paid BoonTrack tenant matching package tier requirements.
- Domain DNS changes (`CNAME` / `A` records) are executed by Client DNS administrator within 24h of instructions.
- Client supplies accurate pricing, tax/service rules, and compliance disclosures (BPOM/Halal/Refund policy).
- Revisions requested after **Gate 6 (Tenant Acceptance Sign-Off)** require a Change Request (CR) or separate support ticket.

### 4. Approval
- **Client Representative:** ____________________ Date: __________
- **BoonTrack Delivery Lead:** __________________ Date: __________
- **CTO Approval (Required ONLY for Enterprise Custom / Global Changes):** __________________ Date: __________
```

---

### Appendix 3 — Permission & Access Matrix

Strict least-privilege segregation across BoonTrack delivery environments (`studio.boontrack.com`, `dashboard.boontrack.com`, `shop.boontrack.com`, Supabase, and third-party APIs):

| Action / Resource | Staging / Sandbox Test Account | Production Merchant Dashboard (Impersonation / Admin Tool) | Production Supabase (`service_role` DB) | Production Meta WABA / Payment Gateway Live Keys | Source Code (`main` Repo) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Preset Prototyping & UI Preview** | **REQUIRED** (Use internal test slug) | Read-Only after provisioning | **PROHIBITED** | **PROHIBITED** | Strictly prohibited for single-tenant tweaks |
| **Tenant Metadata & Catalog UPSERT (`Frontpage / Product Launch`)** | Verify JSONB shape in staging first | Preferred for standard merchant edits via authenticated UI/API | **ALLOWED ONLY WITH:** Intake Ticket + `[TARGET TENANT]` declaration + JSONB snapshot backup | **PROHIBITED** (Merchant enters own payment credentials or encrypted vault only) | **PROHIBITED** (`AGENTS.md` §7 Rule 2) |
| **Bot & WhatsApp Onboarding (`Bot Activation / ADF`)** | Test BoonPilot prompt replies against internal test WA number | Use tenant Baileys QR pairing session during supervised live call OR verified WABA dashboard | Read/Verify `whatsapp_connections` status only for target `tenant_id` | Token ingested **ONLY** via Appendix 4 masked/one-time secret channel — stored encrypted/server-side | **PROHIBITED** |
| **Enterprise Custom Module** | Full integration & RLS isolation test in staging | Demo/UAT verification with tenant test account | Schema/RLS migrations ONLY after PR review + CTO approval | Client provides dedicated restricted sandbox/prod API role | **ALLOWED ONLY** in `/tenants/[slug]/...` or config-driven feature adapter with CTO sign-off |

**When to Use Staging vs. Production Test Account:**
- **Always use Staging + Synthetic Test Slug** when testing new JSONB metadata shapes, bulk CSV product importers, custom HTML snippets, delivery rate formulas, or webhook triggers.
- **Always verify with a Non-Live Test Order / Staging WA Number** before connecting live merchant payment webhooks or broadcasting customer messages.
- **Never test experimental changes directly against another active customer's live slug.**

---

### Appendix 4 — Secret-Handling Checklist

**Applies to ALL Engineers, Onboarding Specialists, and Contractors:**

- [ ] **Zero Repository Secrets:** Confirm NO API keys, `SUPABASE_SERVICE_ROLE_KEY`, WABA permanent tokens, Midtrans/Xendit server keys, or client passwords are ever written into `.ts`, `.tsx`, `.json`, docs, SQL seed files, or commit messages.
- [ ] **No Cleartext Secrets in Chat / Tickets:** Clients MUST NEVER paste live passwords, WABA tokens, Meta permanent tokens, or banking credentials into permanent WhatsApp groups, Slack channels, or Jira/Linear issue descriptions. Use ephemeral expiring secret-sharing links or direct merchant input during screenshare.
- [ ] **Strict Server-Only Secret Consumption:** Verify client webhook secrets and provider API tokens are written only to encrypted server configuration or protected environment/vault stores — NEVER inside publicly readable `tenants.metadata` fields exposed to `NEXT_PUBLIC_*` SSR payloads!
- [ ] **Masking in Logs & Screenshots:** Inspect all QA screenshots, loom walkthroughs, and terminal logs before uploading to tickets; redact phone numbers where sensitive, bearer tokens, HMAC signatures, and query keys (`?token=...`).
- [ ] **Credential Rotation Reminder:** Any temporary collaborator invite, OTP session, or provisioning token generated for DFY setup MUST be flagged for revocation/rotation in **Appendix 8 (Closure)** immediately after client handover.

---

### Appendix 5 — Quality Assurance (QA) Checklist

Must be 100% checked and evidenced before scheduling Client UAT:

#### A. Multi-Tenant Data & Isolation Verification (MANDATORY — `AGENTS.md` §5 & §7)
- [ ] Target slug `shop.boontrack.com/<target-slug>` loads cleanly (`HTTP 200`) and displays ONLY the target tenant's logo, brand name, CS WhatsApp, products, and testimonials.
- [ ] **Cross-Tenant Leakage Check:** Open at least two control/sibling tenant URLs (e.g., `/onlineboost`, another test store) and verify ZERO assets, titles, WhatsApp numbers, or product rows from `<target-slug>` appear there — and vice-versa.
- [ ] **Fail-Closed Check:** Verify requesting a non-existent slug (`/nonexistent-audit-test-xyz`) returns `404` / clean not-found state without falling back to another tenant's catalog.

#### B. Storefront Functional & Responsive UI Verification
- [ ] Active preset renders coherently with declared `GlobalThemeTokens` (`brandColor`, `light`/`dark` surface contrast >= WCAG AA, readable typography, valid button contrast).
- [ ] **Mobile Viewport (`375px`):** Zero horizontal overflow (`scrollWidth <= clientWidth`), sticky CTA/cart bar unobstructed, crisp product thumbnails, clickable link buttons.
- [ ] **Desktop Viewport (`1440px`):** Grid alignment clean, navigation & search responsive, empty states clean if optional sections disabled (`showProducts = false`).
- [ ] Link sanitization verified: all outbound links open valid destinations (`https://wa.me/...`, internal `/p/...` product routes) with zero broken `404` anchors.

#### C. Commerce, Bot & Attribution Dry-Run (Package-Dependent)
- [ ] **Product Launch / ADF:** Test add-to-cart, variant/slot selection, shipping fee calculation, and checkout invoice creation (using test/cancel order marked cleanly).
- [ ] **Bot Activation / ADF:** Send greeting & top-3 product inquiries via test chat; confirm AI Sales Rep pulls correct pricing/SKUs strictly from `<target-slug>` knowledge base (zero hallucinated cross-tenant products).
- [ ] **ADF / Tracking:** Confirm Meta Pixel (`PageView`, `ViewContent`, `InitiateCheckout`) or CAPI/CTWA attribution fires without console errors.

---

### Appendix 6 — Tenant Acceptance Checklist (Client UAT Sign-Off)

Presented to client on staging/live preview prior to final launch announcement:

```markdown
### TENANT ACCEPTANCE SIGN-OFF — `<tenant-slug>`

Please confirm each delivered item meets agreed SOW (`SOW-PS-YYYY-XXXX`):

- [ ] **1. Brand & Storefront Identity:** Brand name, logo, palette, typography, and bio links match approved brand guidelines on `shop.boontrack.com/<slug>`.
- [ ] **2. Product Catalog Accuracy:** Product titles, descriptions, variants, IDR prices, and stock visibility are accurate (0 placeholder prices remaining).
- [ ] **3. Checkout & Customer Support Routing:** WhatsApp checkout / inquiry buttons route to the correct merchant CS number (`+62...`); payment & courier options reflect store policy.
- [ ] **4. AI Bot / Automation Behavior (if applicable):** Test prompt replies, tone of voice, and escalation triggers verified acceptable by business owner.
- [ ] **5. Custom Domain / SSL (if applicable):** Domain resolves cleanly over HTTPS with valid certificate.

**Client Sign-Off:**
"I verify that the configuration above has been reviewed and approved for live commercial operation."
- **Authorized Client Name & Title:** ________________________
- **Confirmation Method:** WhatsApp Approval Screenshot / Signed Email / Portal Click
- **Timestamp:** YYYY-MM-DD HH:MM WIB
```

---

### Appendix 7 — Handover Checklist

Delivered to client upon Gate 5 sign-off (**ZERO plaintext secrets allowed in handover bundle**):

- [ ] **Live Access Links Shared:**
  - Public Storefront: `https://shop.boontrack.com/<slug>` (and verified custom domain if applicable)
  - Merchant Dashboard: `https://dashboard.boontrack.com` (using merchant's own login — never shared admin credentials)
- [ ] **Asset & Catalog Summary:** Confirmation of final SKU count, preset mode active (`catalog` / `microsite` / `profile`), and billing tier summary.
- [ ] **Self-Service Operations Guide:** Short Loom video or Markdown quick-guide showing merchant how to:
  1. Edit product price/stock & add new products.
  2. Switch `showProducts` or update microsite buttons via Dashboard Settings.
  3. View & verify incoming orders / payouts.
  4. Pause/monitor BoonPilot AI Bot or top up session quota.
- [ ] **Secret Hygiene Verified:** Double-check the handover document contains **ZERO** API keys, webhook secrets, WABA bearer tokens, or temporary passwords.
- [ ] **Support Escalation Channel Shared:** Clear SLA support contact details (`BoonTrack Merchant Support`) for post-launch inquiries.

---

### Appendix 8 — Project Closure Checklist

Executed internally by BoonTrack Engineering within **24 hours** of Handover (`Appendix 7`):

- [ ] **Revoke Temporary Access:** Remove engineer's temporary Business Manager / DNS / gateway / staging collaborator access from client external accounts.
- [ ] **Rotate Provisioning Secrets:** Invalidate or instruct client rotation of any one-time API tokens, QR pairing links, or temporary test credentials generated during onboarding.
- [ ] **Clean Test Data:** Verify test orders created during QA are archived/cancelled/marked cleanly so merchant revenue metrics (`OverviewTab`) start clean (`Rp 0` or real baseline).
- [ ] **Verify Telemetry & Health:** Confirm storefront returns HTTP `200`, webhook queue shows zero error loops, and WhatsApp connection state is `CONNECTED` (if in scope).
- [ ] **Audit Trail Archived:** Attach intake ticket, signed SOW, QA evidence screenshots (375px + 1440px), cross-tenant isolation confirmation, and Client UAT confirmation into ticket repository.
- [ ] **Owner Closure Sign-Off:** Engineering Delivery Lead marks ticket `CLOSED — VERIFIED`.

---

### Appendix 9 — Incident Escalation Flow (Token Leak / Cross-Tenant Exposure / Misrouting)

If ANY team member, automated monitor, or client detects:
- Exposed API token, `service_role` key, WABA bearer token, or client credential in logs/code/chat (**`SEV-1 SECRET EXPOSURE`**), OR
- Data, product, logo, WhatsApp routing, testimonial, or session of Tenant A appearing inside Tenant B (**`SEV-0 CROSS-TENANT ISOLATION BREACH`**),

execute this mandatory response workflow immediately:

```
[Detection (< 5 min)]
   │  ANY suspicious cross-tenant visibility OR token exposure -> STOP deployment/onboarding edits immediately.
   ▼
[Containment (< 15 min)]
   │  1. Secret Leak: Revoke/rotate compromised token at provider (Supabase / Meta WABA / Payment / Git history scrub).
   │  2. Cross-Tenant Data/Route: Unpublish / set maintenance or rollback offending metadata JSONB to prior snapshot;
   │     suspend offending webhook/AI rotator immediately.
   │  3. Auth Session Risk: Invalidate merchant session cookies / rotate signing secret if session integrity is suspect.
   ▼
[Escalation & Blast-Radius Triage (< 30 min)]
   │  Notify #incident-eng + CTO + Head of Product IMMEDIATELY with:
   │    [TARGET TENANT] | [AFFECTED SURFACE] | [CONTAINMENT STATUS] | [START TIME]
   │  Audit Supabase access logs, PostgREST mutations, & WhatsApp message outbox for unauthorized reads/writes.
   ▼
[Eradication & Verification (< 4 hours)]
   │  Identify root cause (e.g., hardcoded slug, client-side anon Supabase bypass, missing tenant_id WHERE clause).
   │  Apply verified server-side fix + regression unit/integration isolation test.
   ▼
[Post-Incident Review (Within 48 hours)]
      Publish Blameless Postmortem (Timeline, Root Cause, Affected Tenants Notified if PII impacted, Guardrail Patch).
```

#### Mandatory Severity Contacts & Escalation SLAs

| Severity | Trigger Example | Acknowledge SLA | Escalate To | Containment Target |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-0 (Critical Isolation Breach)** | Cross-tenant PII, order data, payment routing, or storefront data leaked between tenants | **Immediate (< 5 min)** | CTO + Security Lead + Engineering Lead | **< 15 minutes** |
| **SEV-1 (Secret / Auth Bypass)** | Leaked `service_role` key, client WABA/gateway token exposed, or unauthorized metadata mutation confirmed | **< 10 minutes** | CTO + Infra/Backend Lead | **< 30 minutes (Revoke & Rotate)** |
| **SEV-2 (Tenant Functional Outage)** | Single provisioned storefront broken/500 error, checkout down, or bot non-responsive post-launch | **< 30 minutes** | Delivery Lead + On-Call Engineer | **< 2 hours** |

---

*End of Policy `BT-ENG-SOP-001` — Enforced across all BoonTrack Professional Services operations effective Phase 2.*
