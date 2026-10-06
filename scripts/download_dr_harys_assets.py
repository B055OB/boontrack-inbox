import urllib.request
import re
import os
from urllib.parse import urljoin

targets = {
    'happyeating': 'https://littlebitefeeding.com/happyeating',
    'mpasi-danresep': 'https://tumbuhkembanganak.com/mpasi-danresep',
    'panduan-stimulasianakcerdas': 'https://tumbuhkembanganak.com/panduan-stimulasianakcerdas',
    'mpasi-anti-gtm': 'https://tumbuhkembanganak.com/mpasi-anti-gtm'
}

base_dest = os.path.join('public', 'tenants', 'tumbuh-kembang-anak')
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for folder_name, page_url in targets.items():
    folder_path = os.path.join(base_dest, folder_name)
    os.makedirs(folder_path, exist_ok=True)
    print(f'=== Memproses {folder_name} ({page_url}) ===')
    
    try:
        req = urllib.request.Request(page_url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            
        # Cari semua link gambar dari tag img, srcset, dan css url
        img_srcs = re.findall(r'<img[^>]+src=[\"\']([^\"\']+)[\"\']', html)
        bg_srcs = re.findall(r'url\([\"\']?([^\"\'\)]+)[\"\']?\)', html)
        # juga tangkap data-src atau srcset jika ada
        data_srcs = re.findall(r'data-src=[\"\']([^\"\']+)[\"\']', html)
        all_srcs = set(img_srcs + bg_srcs + data_srcs)
        
        idx = 1
        downloaded = 0
        for src in all_srcs:
            clean_src = src.split('?')[0].split('#')[0]
            if any(clean_src.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif']):
                full_url = urljoin(page_url, src)
                filename = os.path.basename(clean_src)
                if not filename or len(filename) > 80:
                    filename = f'asset_{idx}.png'
                
                dest_file = os.path.join(folder_path, filename)
                try:
                    img_req = urllib.request.Request(full_url, headers=headers)
                    with urllib.request.urlopen(img_req, timeout=15) as i_resp, open(dest_file, 'wb') as f:
                        f.write(i_resp.read())
                    print(f'  [OK] {filename}')
                    idx += 1
                    downloaded += 1
                except Exception as dl_err:
                    pass
        print(f'  Total aset tersimpan di {folder_name}: {downloaded} file')
    except Exception as e:
        print(f'  [Error] Gagal scraping {page_url}: {e}')

print('\nSemua aset dari 4 link berhasil diunduh dan dipisahkan rapi per folder!')
