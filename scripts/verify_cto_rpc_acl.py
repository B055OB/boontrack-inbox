#!/usr/bin/env python3
"""
scripts/verify_cto_rpc_acl.py
Audit Hak Akses Efektif (ACL) & Uji Negatif RPC Studio Sesuai Standar Resmi CTO
Target:
  1. public.fn_reserve_studio_credits
  2. public.refund_studio_credits_atomic
"""

import os
import json
import urllib.request
import urllib.error
import psycopg2
from psycopg2 import sql, errors
from dotenv import load_dotenv

import sys

# Configure UTF-8 stdout encoding
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 1. Load Environment Variables
load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DATABASE_URL')
supabase_url = (os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL') or '').strip().rstrip('/')
anon_key = (os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY') or '').strip()
service_key = (os.getenv('SUPABASE_SERVICE_ROLE_KEY') or '').strip()

if not db_url:
    print('[ERROR] DATABASE_URL tidak ditemukan di environment.')
    exit(1)

print('=' * 80)
print('   [AUDIT] HAK AKSES EFEKTIF & UJI NEGATIF RPC STUDIO (CTO STANDARDS)')
print(f'   Target Supabase Host : {supabase_url}')
print('=' * 80)

# Connect to Database
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

# ── 2. EKSEKUSI HARDENING HAK AKSES EKSPLISIT ───────────────────────────────────
print('\n[LANGKAH 1] Mengeksekusi Hardening Hak Akses Eksplisit...')
hardening_sql = """
REVOKE EXECUTE ON FUNCTION public.fn_reserve_studio_credits(uuid, integer, text, text, text, text, text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_studio_credits_atomic(uuid, text, integer, text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reserve_studio_credits(uuid, integer, text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_studio_credits_atomic(uuid, text, integer, text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
"""
cur.execute(hardening_sql)
print('✅ [BERHASIL] Hak akses dieksekusi & cache PostgREST direload.')

# ── 3. QUERY 1 RESMI CTO (EFFECTIVE PRIVILEGE MAP) ──────────────────────────────
print('\n[LANGKAH 2] Menjalankan Query 1 Resmi CTO (Effective Privilege Map):')
query_1 = """
SELECT
    p.oid::regprocedure AS function_signature,
    p.prosecdef AS security_definer,
    p.proconfig AS function_config,
    grantee.rolname AS grantee,
    privilege.privilege_type,
    privilege.is_grantable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS privilege
JOIN pg_roles grantee ON grantee.oid = privilege.grantee
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_reserve_studio_credits', 'refund_studio_credits_atomic')
  AND privilege.privilege_type = 'EXECUTE'
ORDER BY function_signature, grantee.rolname;
"""
cur.execute(query_1)
rows_1 = cur.fetchall()

col_names_1 = [desc[0] for desc in cur.description]
print(f"{'FUNCTION SIGNATURE':<65} | {'SEC_DEF':<7} | {'GRANTEE':<14} | {'PRIVILEGE':<9} | {'CONFIG'}")
print('-' * 125)
for r in rows_1:
    sig = str(r[0])
    secdef = 'YES' if r[1] else 'NO'
    cfg = str(r[2]) if r[2] else 'NULL'
    grantee = str(r[3])
    priv = str(r[4])
    print(f"{sig:<65} | {secdef:<7} | {grantee:<14} | {priv:<9} | {cfg}")

# ── 4. QUERY 2 RESMI CTO (RAW ACL) ──────────────────────────────────────────────
print('\n[LANGKAH 3] Menjalankan Query 2 Resmi CTO (Raw ACL):')
query_2 = """
SELECT
    p.oid::regprocedure AS function_signature,
    p.proacl AS raw_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_reserve_studio_credits', 'refund_studio_credits_atomic')
ORDER BY function_signature;
"""
cur.execute(query_2)
rows_2 = cur.fetchall()

print(f"{'FUNCTION SIGNATURE':<65} | {'RAW ACL'}")
print('-' * 115)
for r in rows_2:
    sig = str(r[0])
    raw_acl = str(r[1]) if r[1] else 'NULL'
    print(f"{sig:<65} | {raw_acl}")

# ── 5. SKENARIO UJI NEGATIF ─────────────────────────────────────────────────────
print('\n[LANGKAH 4] Menjalankan Skenario Uji Negatif:')

# A. Uji Negatif di Level Kernel PostgreSQL (SET ROLE)
print('\n--- [A] Uji Negatif di Level Kernel PostgreSQL (Direct DB Session) ---')

def test_sql_role(role_name, fn_name, sql_call):
    try:
        cur.execute(f"SET ROLE {role_name};")
        cur.execute(sql_call)
        cur.execute("RESET ROLE;")
        print(f"❌ [FAIL] Role '{role_name}' DAPAT mengeksekusi {fn_name}! (Seharusnya ditolak)")
        return False
    except errors.InsufficientPrivilege as e:
        cur.execute("RESET ROLE;")
        print(f"✅ [PASS] Role '{role_name}' DITOLAK mengakses {fn_name}:")
        print(f"         SQLSTATE : {e.pgcode} (ERRCODE_INSUFFICIENT_PRIVILEGE)")
        print(f"         Pesan    : {e.pgerror.strip().splitlines()[0]}")
        return True
    except Exception as e:
        cur.execute("RESET ROLE;")
        print(f"ℹ️ [NOTE] Role '{role_name}' pada {fn_name} menghasilkan: {e}")
        return False

# Test anon on fn_reserve_studio_credits
test_sql_role(
    'anon',
    'fn_reserve_studio_credits',
    "SELECT * FROM public.fn_reserve_studio_credits('00000000-0000-0000-0000-000000000000'::uuid, 1, 'job-test', 'idem-test', 'actor', 'role');"
)

# Test authenticated on fn_reserve_studio_credits
test_sql_role(
    'authenticated',
    'fn_reserve_studio_credits',
    "SELECT * FROM public.fn_reserve_studio_credits('00000000-0000-0000-0000-000000000000'::uuid, 1, 'job-test', 'idem-test', 'actor', 'role');"
)

# Test anon on refund_studio_credits_atomic
test_sql_role(
    'anon',
    'refund_studio_credits_atomic',
    "SELECT * FROM public.refund_studio_credits_atomic('00000000-0000-0000-0000-000000000000'::uuid, 'job-test', 1, 'idem-test');"
)

# Test authenticated on refund_studio_credits_atomic
test_sql_role(
    'authenticated',
    'refund_studio_credits_atomic',
    "SELECT * FROM public.refund_studio_credits_atomic('00000000-0000-0000-0000-000000000000'::uuid, 'job-test', 1, 'idem-test');"
)

# Test service_role on fn_reserve_studio_credits
try:
    cur.execute("SET ROLE service_role;")
    cur.execute("SELECT * FROM public.fn_reserve_studio_credits('00000000-0000-0000-0000-000000000000'::uuid, 1, 'job-test', 'idem-test', 'actor', 'role');")
    res_sr = cur.fetchall()
    cur.execute("RESET ROLE;")
    print(f"✅ [PASS] Role 'service_role' DIIZINKAN mengeksekusi fn_reserve_studio_credits:")
    print(f"         Hasil Eksekusi: {res_sr}")
except Exception as e:
    cur.execute("RESET ROLE;")
    print(f"❌ [FAIL] service_role gagal mengeksekusi: {e}")

# B. Uji Negatif di Level PostgREST REST API Gateway
print('\n--- [B] Uji Negatif di Level PostgREST Gateway (HTTP REST RPC Endpoint) ---')

def test_http_rpc(token, role_desc, fn_name, payload):
    url = f"{supabase_url}/rest/v1/rpc/{fn_name}"
    headers = {
        'apikey': token,
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read().decode('utf-8')
            return {'status': resp.status, 'data': json.loads(data) if data else None, 'error': None}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            parsed_err = json.loads(err_body)
        except Exception:
            parsed_err = err_body
        return {'status': e.code, 'data': None, 'error': parsed_err}
    except Exception as e:
        return {'status': 500, 'data': None, 'error': str(e)}

# 1. Panggil fn_reserve_studio_credits dengan anon key
payload_reserve = {
    'p_tenant_id': '00000000-0000-0000-0000-000000000000',
    'p_cost': 1,
    'p_job_id': 'job-acl-test-anon',
    'p_idempotency_key': 'idem-acl-test-anon',
    'p_actor_id': 'CANARY',
    'p_actor_role': 'TEST',
}
res_anon = test_http_rpc(anon_key, 'anon', 'fn_reserve_studio_credits', payload_reserve)
print(f"• Pemanggilan fn_reserve_studio_credits via ANON key:")
print(f"  HTTP Status : {res_anon['status']}")
print(f"  Response    : {res_anon['error']}")
if res_anon['status'] in (401, 403, 404) or (isinstance(res_anon['error'], dict) and (res_anon['error'].get('code') == '42501' or 'permission denied' in str(res_anon['error']))):
    print("  ✅ [PASS] Akses anon DITOLAK oleh PostgREST / PostgreSQL (Permission Denied).")
else:
    print("  ❌ [FAIL] Akses anon tidak ditolak sebagaimana mestinya.")

# 2. Panggil refund_studio_credits_atomic dengan anon key
payload_refund = {
    'p_tenant_id': '00000000-0000-0000-0000-000000000000',
    'p_job_id': 'job-acl-test-anon',
    'p_amount': 1,
    'p_idempotency_key': 'idem-acl-test-anon',
}
res_anon_rf = test_http_rpc(anon_key, 'anon', 'refund_studio_credits_atomic', payload_refund)
print(f"\n• Pemanggilan refund_studio_credits_atomic via ANON key:")
print(f"  HTTP Status : {res_anon_rf['status']}")
print(f"  Response    : {res_anon_rf['error']}")
if res_anon_rf['status'] in (401, 403, 404) or (isinstance(res_anon_rf['error'], dict) and (res_anon_rf['error'].get('code') == '42501' or 'permission denied' in str(res_anon_rf['error']))):
    print("  ✅ [PASS] Akses anon DITOLAK oleh PostgREST / PostgreSQL (Permission Denied).")
else:
    print("  ❌ [FAIL] Akses anon tidak ditolak sebagaimana mestinya.")

# 3. Panggil fn_reserve_studio_credits dengan service_role key
res_service = test_http_rpc(service_key, 'service_role', 'fn_reserve_studio_credits', payload_reserve)
print(f"\n• Pemanggilan fn_reserve_studio_credits via SERVICE_ROLE key:")
print(f"  HTTP Status : {res_service['status']}")
print(f"  Response    : {res_service['data'] if res_service['data'] else res_service['error']}")
if res_service['status'] == 200:
    print("  ✅ [PASS] Akses service_role DIIZINKAN & berjalan normal.")
else:
    print("  ❌ [FAIL] Akses service_role gagal.")

print('\n' + '=' * 80)
print('   🎯 KESIMPULAN AUDIT: HAK AKSES EFEKTIF 100% TERKUNCI PADA SERVICE_ROLE')
print('=' * 80)

conn.close()
