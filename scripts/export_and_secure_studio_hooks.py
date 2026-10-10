import os
import re
import csv
import json
import shutil
import psycopg2
from decimal import Decimal
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

def sql_escape(val):
    if val is None:
        return ""
    return str(val).replace("'", "''")

def run_export():
    backup_dir = r"c:\boontrack-inbox\backups\studio_normalized_insights"
    os.makedirs(backup_dir, exist_ok=True)
    
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL is not set!")
    
    print("[1/5] Connecting to Supabase database...")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    # Check RLS status
    cur.execute("""
        SELECT relrowsecurity, relforcerowsecurity 
        FROM pg_class 
        WHERE relname = 'studio_normalized_insights';
    """)
    rls_status = cur.fetchone()
    
    cur.execute("""
        SELECT polname, polcmd, polroles::regrole[], polqual 
        FROM pg_policy 
        WHERE polrelid = 'public.studio_normalized_insights'::regclass;
    """)
    policies = cur.fetchall()
    print(f"RLS Enabled: {rls_status[0]}, Total Policies: {len(policies)}")
    for pol in policies:
        print(f" - {pol[0]} ({pol[1]}) for {pol[2]}")
        
    # 1. Fetch live records
    print("\n[2/5] Fetching live data from public.studio_normalized_insights...")
    cur.execute("""
        SELECT 
            id, category, sub_category, hook_pattern, raw_hook_example,
            target_audience, freshness_status, commercial_eligibility,
            confidence_score, metadata, created_at, updated_at
        FROM public.studio_normalized_insights
        ORDER BY created_at ASC, id ASC;
    """)
    columns = [desc[0] for desc in cur.description]
    live_rows = cur.fetchall()
    print(f"Fetched {len(live_rows)} live records.")
    
    live_records = []
    for r in live_rows:
        row_dict = dict(zip(columns, r))
        live_records.append(row_dict)
        
    # Write live JSON
    live_json_path = os.path.join(backup_dir, "studio_normalized_insights_live.json")
    with open(live_json_path, "w", encoding="utf-8") as f:
        json.dump({
            "table": "public.studio_normalized_insights",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "total_records": len(live_records),
            "rls_secured": rls_status[0],
            "schema_columns": columns,
            "data": live_records
        }, f, indent=2, cls=CustomJSONEncoder, ensure_ascii=False)
    print(f"Saved: {live_json_path} ({os.path.getsize(live_json_path)} bytes)")
    
    # Write live CSV
    live_csv_path = os.path.join(backup_dir, "studio_normalized_insights_live.csv")
    with open(live_csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for rec in live_records:
            row_copy = dict(rec)
            if isinstance(row_copy.get('metadata'), dict):
                row_copy['metadata'] = json.dumps(row_copy['metadata'], ensure_ascii=False)
            if isinstance(row_copy.get('confidence_score'), Decimal):
                row_copy['confidence_score'] = float(row_copy['confidence_score'])
            if isinstance(row_copy.get('created_at'), datetime):
                row_copy['created_at'] = row_copy['created_at'].isoformat()
            if isinstance(row_copy.get('updated_at'), datetime):
                row_copy['updated_at'] = row_copy['updated_at'].isoformat()
            writer.writerow(row_copy)
    print(f"Saved: {live_csv_path} ({os.path.getsize(live_csv_path)} bytes)")
    
    # Write live SQL dump
    live_sql_path = os.path.join(backup_dir, "studio_normalized_insights_live.sql")
    with open(live_sql_path, "w", encoding="utf-8") as f:
        f.write("-- ==============================================================================\n")
        f.write(f"-- Backup Dump: public.studio_normalized_insights (Live Data)\n")
        f.write(f"-- Exported At: {datetime.now(timezone.utc).isoformat()}\n")
        f.write(f"-- Total Records: {len(live_records)}\n")
        f.write(f"-- Security: Row Level Security (RLS) Active ({rls_status[0]})\n")
        f.write("-- ==============================================================================\n\n")
        f.write("BEGIN;\n\n")
        f.write("""CREATE TABLE IF NOT EXISTS public.studio_normalized_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category CHARACTER VARYING NOT NULL,
    sub_category CHARACTER VARYING,
    hook_pattern CHARACTER VARYING NOT NULL,
    raw_hook_example TEXT NOT NULL,
    target_audience CHARACTER VARYING,
    freshness_status CHARACTER VARYING DEFAULT 'FRESH',
    commercial_eligibility BOOLEAN DEFAULT true,
    confidence_score NUMERIC DEFAULT 0.90,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);\n\n""")
        f.write("ALTER TABLE public.studio_normalized_insights ENABLE ROW LEVEL SECURITY;\n\n")
        f.write("""DROP POLICY IF EXISTS "Service role full access on studio_normalized_insights" ON public.studio_normalized_insights;
CREATE POLICY "Service role full access on studio_normalized_insights" 
    ON public.studio_normalized_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read on studio_normalized_insights" ON public.studio_normalized_insights;
CREATE POLICY "Public read on studio_normalized_insights" 
    ON public.studio_normalized_insights FOR SELECT TO authenticated, anon USING (true);\n\n""")
        
        for rec in live_records:
            id_val = f"'{rec['id']}'"
            cat_val = f"'{sql_escape(rec['category'])}'"
            subcat_val = f"'{sql_escape(rec['sub_category'])}'" if rec['sub_category'] else "NULL"
            pattern_val = f"'{sql_escape(rec['hook_pattern'])}'"
            raw_val = f"'{sql_escape(rec['raw_hook_example'])}'"
            audience_val = f"'{sql_escape(rec['target_audience'])}'" if rec['target_audience'] else "NULL"
            fresh_val = f"'{rec['freshness_status']}'"
            comm_val = "true" if rec['commercial_eligibility'] else "false"
            score_val = str(float(rec['confidence_score'])) if rec['confidence_score'] is not None else "0.90"
            meta_json = json.dumps(rec['metadata'], ensure_ascii=False) if rec['metadata'] else "{}"
            meta_val = f"'{sql_escape(meta_json)}'::jsonb"
            created_val = f"'{rec['created_at'].isoformat()}'" if isinstance(rec['created_at'], datetime) else f"'{rec['created_at']}'"
            updated_val = f"'{rec['updated_at'].isoformat()}'" if isinstance(rec['updated_at'], datetime) else f"'{rec['updated_at']}'"
            
            f.write(f"""INSERT INTO public.studio_normalized_insights (id, category, sub_category, hook_pattern, raw_hook_example, target_audience, freshness_status, commercial_eligibility, confidence_score, metadata, created_at, updated_at)
VALUES ({id_val}, {cat_val}, {subcat_val}, {pattern_val}, {raw_val}, {audience_val}, {fresh_val}, {comm_val}, {score_val}, {meta_val}, {created_val}, {updated_val})
ON CONFLICT (id) DO UPDATE SET
    raw_hook_example = EXCLUDED.raw_hook_example,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();\n""")
        f.write("\nCOMMIT;\n")
    print(f"Saved: {live_sql_path} ({os.path.getsize(live_sql_path)} bytes)")

    # 2. Extract curated 60 seed patterns from migration
    print("\n[3/5] Extracting 60 Indonesian curated hook patterns from ADR § 54 migration...")
    migration_file = r"c:\boontrack-inbox\supabase\migrations\20261009_seed_indonesian_hook_patterns.sql"
    with open(migration_file, "r", encoding="utf-8") as f:
        mig_content = f.read()

    # Pattern to match INSERT lines: ('skincare', 'Problem-Agitate', 'HOOK_PATTERN', '...', 0.97, true, 'FRESH')
    pattern = re.compile(r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*([0-9.]+)\s*,\s*(true|false)\s*,\s*'([^']+)'\s*\)", re.MULTILINE)
    seed_matches = pattern.findall(mig_content)
    print(f"Parsed {len(seed_matches)} hook patterns from migration file.")

    seed_records = []
    for idx, m in enumerate(seed_matches, 1):
        cat, cluster, insight_type, template, score, comm, freshness = m
        template_clean = template.replace("''", "'")
        seed_records.append({
            "id": f"seed-adr54-{cat[:4]}-{idx:02d}",
            "source": "ADR_54_SEED",
            "category": cat,
            "cluster": cluster,
            "insight_type": insight_type,
            "pattern_template": template_clean,
            "confidence_score": float(score),
            "commercial_eligibility": comm.lower() == 'true',
            "freshness_status": freshness,
            "metadata": {"locale": "id-ID", "platform": ["tiktok", "reels", "shopee"]},
            "created_at": "2026-10-09T03:00:00Z"
        })

    seed_json_path = os.path.join(backup_dir, "studio_hook_patterns_curated_seed.json")
    with open(seed_json_path, "w", encoding="utf-8") as f:
        json.dump({
            "source_contract": "ADR § 54 (Sprint 2 Phase II)",
            "migration_file": "supabase/migrations/20261009_seed_indonesian_hook_patterns.sql",
            "total_records": len(seed_records),
            "categories": sorted(list(set(r['category'] for r in seed_records))),
            "clusters": sorted(list(set(r['cluster'] for r in seed_records))),
            "data": seed_records
        }, f, indent=2, ensure_ascii=False)
    print(f"Saved: {seed_json_path} ({os.path.getsize(seed_json_path)} bytes)")

    seed_csv_path = os.path.join(backup_dir, "studio_hook_patterns_curated_seed.csv")
    seed_cols = ["id", "category", "cluster", "insight_type", "pattern_template", "confidence_score", "commercial_eligibility", "freshness_status"]
    with open(seed_csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=seed_cols)
        writer.writeheader()
        for r in seed_records:
            writer.writerow({k: r[k] for k in seed_cols})
    print(f"Saved: {seed_csv_path} ({os.path.getsize(seed_csv_path)} bytes)")

    # 3. Create Consolidated Master Hook Catalog
    print("\n[4/5] Creating consolidated Master Hook Catalog (Live DB + Seed Formulas)...")
    consolidated = []
    
    # Add live DB records normalized
    for r in live_records:
        score_val = float(r['confidence_score']) if r['confidence_score'] is not None else 0.90
        created_val = r['created_at'].isoformat() if isinstance(r['created_at'], datetime) else str(r['created_at'])
        consolidated.append({
            "id": r['id'],
            "source": "SUPABASE_LIVE_DB",
            "category": r['category'],
            "cluster_or_subcategory": r['sub_category'] or 'Standard',
            "hook_title": r['hook_pattern'],
            "hook_formula_text": r['raw_hook_example'],
            "target_audience": r['target_audience'] or 'General Shopper',
            "confidence_score": score_val,
            "commercial_eligibility": r['commercial_eligibility'],
            "freshness_status": r['freshness_status'],
            "metadata": r['metadata'],
            "created_at": created_val
        })

    # Add seed records normalized
    for s in seed_records:
        consolidated.append({
            "id": s['id'],
            "source": "ADR_54_CURATED_SEED",
            "category": s['category'],
            "cluster_or_subcategory": s['cluster'],
            "hook_title": f"[{s['cluster']}] {s['category'].capitalize()} Formula",
            "hook_formula_text": s['pattern_template'],
            "target_audience": "Indonesian Social Commerce",
            "confidence_score": s['confidence_score'],
            "commercial_eligibility": s['commercial_eligibility'],
            "freshness_status": s['freshness_status'],
            "metadata": s['metadata'],
            "created_at": s['created_at']
        })

    master_json_path = os.path.join(backup_dir, "studio_hooks_master_consolidated.json")
    with open(master_json_path, "w", encoding="utf-8") as f:
        json.dump({
            "catalog_title": "BoonTrack Studio Master Hook Intelligence Catalog",
            "compiled_at": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_consolidated_hooks": len(consolidated),
                "live_supabase_records": len(live_records),
                "curated_seed_records": len(seed_records),
                "categories": sorted(list(set(c['category'] for c in consolidated))),
            },
            "hooks": consolidated
        }, f, indent=2, ensure_ascii=False)
    print(f"Saved: {master_json_path} ({os.path.getsize(master_json_path)} bytes)")

    master_csv_path = os.path.join(backup_dir, "studio_hooks_master_consolidated.csv")
    master_cols = ["id", "source", "category", "cluster_or_subcategory", "hook_title", "hook_formula_text", "target_audience", "confidence_score", "commercial_eligibility", "freshness_status", "created_at"]
    with open(master_csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=master_cols)
        writer.writeheader()
        for c in consolidated:
            row_dict = {k: c[k] for k in master_cols}
            writer.writerow(row_dict)
    print(f"Saved: {master_csv_path} ({os.path.getsize(master_csv_path)} bytes)")

    # 4. Copy to Brain Artifacts directory
    brain_dir = r"C:\Users\Alldy\.gemini\antigravity-ide\brain\9aed4544-938f-4201-8bbd-6a0afdadcd23"
    if os.path.exists(brain_dir):
        print(f"\n[5/5] Mirroring export files to Brain Artifacts directory ({brain_dir})...")
        for fname in os.listdir(backup_dir):
            src = os.path.join(backup_dir, fname)
            dst = os.path.join(brain_dir, fname)
            shutil.copy2(src, dst)
            print(f" - Mirrored: {fname}")

    print("\n[SUCCESS] Seluruh pengamanan dan ekspor data hook studio_normalized_insights tuntas!")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    run_export()
