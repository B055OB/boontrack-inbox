import urllib.request, re, os
from urllib.parse import urljoin

targets = {
    'happyeating': 'https://littlebitefeeding.com/happyeating',
    'mpasi-danresep': 'https://tumbuhkembanganak.com/mpasi-danresep',
    'panduan-stimulasianakcerdas': 'https://tumbuhkembanganak.com/panduan-stimulasianakcerdas',
    'mpasi-anti-gtm': 'https://tumbuhkembanganak.com/mpasi-anti-gtm'
}

base_dest = os.path.join('public', 'tenants', 'tumbuh-kembang-anak')
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
bank_keywords = ['bca', 'bri', 'bni', 'mandiri', 'btn', 'permata', 'cimb', 'dana', 'gopay', 'ovo', 'shopeepay', 'linkaja', 'qris', 'va_']

for folder_name, page_url in targets.items():
    folder_path = os.path.join(base_dest, folder_name)
    os.makedirs(folder_path, exist_ok=True)
    print(f'=== Memindai {folder_name} ===')
    
    try:
        req = urllib.request.Request(page_url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            
        raw_links = []
        # Tangkap atribut lazy load dan tag gambar
        for p in [r'src=[\"\']([^\"\']+)[\"\']', r'data-src=[\"\']([^\"\']+)[\"\']', r'data-lazy-src=[\"\']([^\"\']+)[\"\']', r'data-original=[\"\']([^\"\']+)[\"\']']:
            raw_links.extend(re.findall(p, html))
            
        for srcset in re.findall(r'srcset=[\"\']([^\"\']+)[\"\']', html):
            for part in srcset.split(','):
                part = part.strip().split(' ')[0]
                if part:
                    raw_links.append(part)

        all_srcs = set(raw_links)
        idx = 1
        for src in all_srcs:
            clean_src = src.split('?')[0].split('#')[0]
            lower_src = clean_src.lower()
            
            if not any(lower_src.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp', '.svg']):
                continue
            if any(k in lower_src for k in bank_keywords):
                continue
                
            full_url = urljoin(page_url, src)
            filename = os.path.basename(clean_src)
            if not filename or len(filename) > 80:
                filename = f'asset_{idx}.webp'
                
            dest_file = os.path.join(folder_path, filename)
            try:
                img_req = urllib.request.Request(full_url, headers=headers)
                with urllib.request.urlopen(img_req, timeout=15) as i_resp, open(dest_file, 'wb') as f:
                    f.write(i_resp.read())
                print(f'  [OK] {filename}')
                idx += 1
            except Exception:
                pass
    except Exception as e:
        print(f'  [Error] {e}')

print('Selesai!')
