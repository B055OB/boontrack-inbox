import re

filepath = r'c:\boontrack-core\app\services\hybrid_reader_service.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

target = """                cur.execute(
                    \"\"\"
                    SELECT id, tenant_slug, gross_amount, customer_name, customer_phone, status
                    FROM orders
                    WHERE tenant_slug = %s AND gross_amount = %s AND status = 'PENDING'
                    ORDER BY created_at DESC
                    LIMIT 1;
                    \"\"\",
                    (str(tenant_id), int(amount)),
                )"""

replacement = """                # Resolve UUID to slug if tenant_id is UUID format
                resolved_slug = str(tenant_id).strip()
                import re
                if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', resolved_slug, re.I):
                    cur.execute("SELECT slug FROM tenants WHERE id::text = %s LIMIT 1;", (resolved_slug,))
                    t_row = cur.fetchone()
                    if t_row and t_row.get("slug"):
                        resolved_slug = t_row["slug"]

                cur.execute(
                    \"\"\"
                    SELECT id, tenant_slug, gross_amount, customer_name, customer_phone, status
                    FROM orders
                    WHERE (tenant_slug = %s OR tenant_slug = %s OR tenant_id::text = %s)
                      AND gross_amount = %s AND status = 'PENDING'
                    ORDER BY created_at DESC
                    LIMIT 1;
                    \"\"\",
                    (resolved_slug, str(tenant_id), str(tenant_id), int(amount)),
                )"""

if target in content:
    content = content.replace(target, replacement)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS: hybrid_reader_service.py updated successfully!")
else:
    print("Target block not found or already patched.")
