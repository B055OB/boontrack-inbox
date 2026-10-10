import os, psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'whatsapp_connections';")
for col in cur.fetchall():
    print(col)

cur.execute("SELECT * FROM whatsapp_connections WHERE instance_name = 'onlineboost';")
row = cur.fetchone()
print("\nRow:", row)
conn.close()
