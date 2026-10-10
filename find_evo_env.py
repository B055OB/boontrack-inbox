with open('C:/boontrack-core/.env', 'r', encoding='utf-8') as f:
    for line in f:
        if 'EVOLUTION' in line or 'WA_' in line or 'WHATSAPP' in line or 'BAILEYS' in line:
            k = line.split('=')[0]
            print(k)
