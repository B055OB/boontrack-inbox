import { createClient } from "@supabase/supabase-js";
import { getTenantBaseUrl, getTenantCheckoutUrl } from "@/lib/checkout-link";
import {
  InteractiveMenu,
  findMenuResponseAcrossMenus,
  findMatchingMenuTrigger,
  formatInteractiveMenu,
  formatInteractiveMenusSummary,
} from "@/lib/whatsappFormatter";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
}

export interface ChatCoreRequest {
  tenant_slug: string;
  message: string;
  phone_number?: string;
  interactive_reply?: {
    id?: string;
    title?: string;
    type?: 'button_reply' | 'list_reply' | string;
  };
  channel?: 'WABA' | 'WAHA' | 'WEBCHAT';
}

export interface ChatCoreResponse {
  reply_text: string;
  action: string;
  type: string;
  product?: any;
  checkout_url?: string;
  interactive_payload?: any;
}

export async function processTenantChatCore(req: ChatCoreRequest): Promise<ChatCoreResponse> {
  const cleanSlug = String(req.tenant_slug || "").toLowerCase().trim();
  const rawMessage = String(req.message || "").trim();
  const lower = rawMessage.toLowerCase();

  const supabase = getSupabaseAdmin();

  // 1. Ambil data tenant termasuk custom_domain dan metadata
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, category, metadata, custom_domain")
    .eq("slug", cleanSlug)
    .maybeSingle();

  const storeName = tenant?.name || cleanSlug.replace(/[-_]/g, " ").toUpperCase();
  const isService = tenant?.category === "service" || tenant?.category === "LOCAL_SERVICE" || cleanSlug.includes("kuras");

  const tenantDomainInfo = {
    slug: tenant?.slug || cleanSlug,
    custom_domain: tenant?.custom_domain || null,
  };

  const metadata = tenant?.metadata || {};
  const interactiveMenus: InteractiveMenu[] = Array.isArray(metadata.interactive_menus)
    ? metadata.interactive_menus
    : [];
  const botMode: 'STATIC' | 'HYBRID' | 'AI' = String(metadata.bot_mode || 'HYBRID').toUpperCase() as any;
  const channel = req.channel || 'WAHA';

  // --- FAST-PATH INTERCEPTOR 1: WABA Interactive Reply & Numbered/Option Match (BYPASS LLM) ---
  const inputKey = req.interactive_reply?.id || req.interactive_reply?.title || rawMessage;
  const menuMatch = findMenuResponseAcrossMenus(interactiveMenus, inputKey);
  if (menuMatch) {
    return {
      reply_text: menuMatch.option.responseText || menuMatch.option.response_text || '',
      action: "MENU_OPTION_REPLY",
      type: "TEXT"
    };
  }

  // --- FAST-PATH INTERCEPTOR 2: Menu Trigger Match ("menu", "pilihan", atau keyword judul) ---
  const triggerMatch = findMatchingMenuTrigger(interactiveMenus, rawMessage);
  if (triggerMatch) {
    const wabaPayload = formatInteractiveMenu(triggerMatch, 'WABA');
    const wahaText = formatInteractiveMenu(triggerMatch, 'WAHA');
    return {
      reply_text: wahaText,
      action: "SHOW_INTERACTIVE_MENU",
      type: channel === 'WABA' ? "INTERACTIVE" : "TEXT",
      interactive_payload: channel === 'WABA' ? wabaPayload : undefined
    };
  }

  // --- HYBRID MODE CONTEXT GUIDANCE: Cek apakah user menanyakan topik pada menu ---
  if (botMode === 'HYBRID' && interactiveMenus.length > 0) {
    const allOptions = interactiveMenus.flatMap((m) => m.options || []);
    const matchedOpt = allOptions.find((opt) => {
      const t = (opt.title || "").toLowerCase();
      return t.length > 3 && lower.includes(t);
    });
    if (matchedOpt) {
      return {
        reply_text: `${matchedOpt.responseText}\n\n👉 *Silakan balas dengan angka atau pilih menu untuk opsi lainnya.*`,
        action: "HYBRID_MENU_GUIDANCE",
        type: "TEXT"
      };
    }
  }

  // 2. Ambil skema booking dari DB (Shared Schema untuk Service/Jasa)
  const { data: bookingSchema } = await supabase
    .from("tenant_booking_schemas")
    .select("*")
    .eq("tenant_slug", cleanSlug)
    .maybeSingle();

  const pricingMatrix: Array<{ label?: string; capacity?: string; price: number; slug?: string }> =
    bookingSchema?.pricing_matrix ||
    tenant?.metadata?.products || [
      { label: "520 Liter", price: 160000 },
      { label: "650 Liter", price: 170000 },
      { label: "800 Liter", price: 180000 },
      { label: "1000 Liter", price: 200000 }
    ];

  if (isService || bookingSchema) {
    // Alur 1: Harga / Tarif (Deterministik)
    if (lower.includes("harga") || lower.includes("biaya") || lower.includes("tarif") || lower.includes("layanan")) {
      const listText = pricingMatrix
        .map((p) => `• *${p.label || p.capacity || "Kuras Toren"}*: Rp ${Number(p.price || 0).toLocaleString("id-ID")}`)
        .join("\n");

      return {
        reply_text: `Berikut adalah rincian tarif resmi layanan *${storeName}* bergaransi bersih tuntas:\n\n${listText}\n\nUntuk toren di lokasi Kakak, kapasitas berapa liter ya? 💧`,
        action: "ASK_CAPACITY",
        type: "TEXT"
      };
    }

    // Alur 2: Deteksi Kapasitas / Angka Toren
    const matched = pricingMatrix.find((item) => {
      const str = `${item.label || ""} ${item.capacity || ""}`.toLowerCase();
      const numMatch = str.match(/\d+/);
      return numMatch ? lower.includes(numMatch[0]) : false;
    });

    if (matched) {
      const capName = matched.label || matched.capacity || "Kuras Toren";
      const capPrice = Number(matched.price || 0);
      const serviceId = `srv-${cleanSlug}-${Date.now()}`;
      const checkoutUrl = getTenantCheckoutUrl(tenantDomainInfo, { id: serviceId, slug: matched.slug });

      return {
        reply_text: `Siap Kak! Untuk kapasitas *${capName}*, biayanya *Rp ${capPrice.toLocaleString("id-ID")}* (sudah termasuk kuras tuntas & sterilisasi bebas lumut).\n\nBoleh kami bantu atur jadwal pengerjaannya hari ini atau besok? 📅\n\n👉 *Link Pemesanan Langsung:*\n${checkoutUrl}`,
        action: "SHOW_CHECKOUT",
        type: "SHOW_CHECKOUT",
        product: {
          id: serviceId,
          name: `${storeName} - ${capName}`,
          price: capPrice,
          badge: "Layanan Rekomendasi",
          image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60",
          description: `Pembersihan & kuras toren tuntas bergaransi bersih untuk kapasitas ${capName}.`,
          checkout_url: checkoutUrl,
        },
        checkout_url: checkoutUrl,
      };
    }

    // Alur 3: Smart Interceptor (Off-track: Garansi, Obat, Keamanan Air) + Pullback Natural
    if (lower.includes("aman") || lower.includes("garansi") || lower.includes("sabun") || lower.includes("kimia") || lower.includes("minum")) {
      return {
        reply_text: `Dijamin *100% aman* Kak! Pembersihan dilakukan tanpa bahan kimia keras berbahaya sehingga air langsung aman digunakan kembali, lengkap dengan garansi bersih tuntas.\n\nNgomong-ngomong, untuk toren di tempat Kakak kapasitasnya berapa liter supaya kami hitungkan estimasi biayanya? 🔍`,
        action: "ASK_CAPACITY",
        type: "TEXT"
      };
    }

    // Alur 4: Area Jangkauan + Pullback
    if (lower.includes("area") || lower.includes("jangkauan") || lower.includes("lokasi") || lower.includes("karawang")) {
      return {
        reply_text: `Tim teknisi kami melayani seluruh area jangkauan operasional toko. Teknisi datang langsung membawa peralatan lengkap.\n\nBoleh diinfokan patokan kecamatan lokasi Kakak? Sekalian mau dibersihkan untuk toren ukuran berapa liter? 📍`,
        action: "ASK_CAPACITY",
        type: "TEXT"
      };
    }

    // Default Greeting Sapaan Awal Natural
    const storeBaseUrl = getTenantBaseUrl(tenantDomainInfo);
    return {
      reply_text: `Halo! Selamat datang di layanan *${storeName}* 👋 Ada yang bisa kami bantu seputar estimasi biaya pembersihan toren hari ini?\n\nInfo layanan: ${storeBaseUrl}`,
      action: "NONE",
      type: "TEXT",
      checkout_url: storeBaseUrl,
    };
  }

  // 3. Alur Toko Ritel / Digital / Produk Fisik Umum
  const products: any[] = Array.isArray(tenant?.metadata?.products) ? tenant.metadata.products : [];
  const isBuyIntent = /beli|order|pesan|checkout|bayar|qris|ambil|mau/i.test(lower);

  if (products.length > 0) {
    const matchedProd = products.find((p) => {
      const pName = String(p.name || "").toLowerCase();
      if (!pName) return false;
      if (lower.includes(pName)) return true;
      const words = pName.split(/\s+/).filter((w) => w.length > 3);
      return words.some((w) => lower.includes(w));
    });

    if (matchedProd && isBuyIntent) {
      const checkoutUrl = getTenantCheckoutUrl(tenantDomainInfo, {
        id: matchedProd.id,
        slug: matchedProd.slug,
      });

      return {
        reply_text: `Siap Kak! Untuk pemesanan *${matchedProd.name}* (Rp ${Number(matchedProd.price || matchedProd.promo_price || 0).toLocaleString("id-ID")}), Kakak dapat langsung menyelesaikan transaksi melalui link checkout resmi kami berikut:\n\n👉 ${checkoutUrl}\n\nPembayaran otomatis via QRIS / Transfer Bank dan pesanan langsung diproses.`,
        action: "SHOW_CHECKOUT",
        type: "SHOW_CHECKOUT",
        product: {
          ...matchedProd,
          checkout_url: checkoutUrl,
        },
        checkout_url: checkoutUrl,
      };
    }

    if (matchedProd) {
      const checkoutUrl = getTenantCheckoutUrl(tenantDomainInfo, {
        id: matchedProd.id,
        slug: matchedProd.slug,
      });

      return {
        reply_text: `Berikut rincian untuk *${matchedProd.name}*:\n• Harga: *Rp ${Number(matchedProd.price || matchedProd.promo_price || 0).toLocaleString("id-ID")}*\n${matchedProd.description ? `• Info: ${matchedProd.description}\n` : ""}\n🔗 Link Pembelian Resmi:\n${checkoutUrl}`,
        action: "SHOW_PRODUCT",
        type: "SHOW_PRODUCT",
        product: {
          ...matchedProd,
          checkout_url: checkoutUrl,
        },
        checkout_url: checkoutUrl,
      };
    }

    if (lower.includes("katalog") || lower.includes("produk") || lower.includes("daftar") || lower.includes("harga")) {
      const baseUrl = getTenantBaseUrl(tenantDomainInfo);
      const topList = products
        .slice(0, 4)
        .map((p) => {
          const itemUrl = getTenantCheckoutUrl(tenantDomainInfo, { id: p.id, slug: p.slug });
          return `• *${p.name}* (Rp ${Number(p.price || p.promo_price || 0).toLocaleString("id-ID")})\n  👉 ${itemUrl}`;
        })
        .join("\n\n");

      return {
        reply_text: `Berikut adalah pilihan produk unggulan di *${storeName}*:\n\n${topList}\n\nKunjungi etalase lengkap di: ${baseUrl}`,
        action: "SHOW_CATALOG",
        type: "TEXT",
        checkout_url: baseUrl,
      };
    }
  }

  if (botMode === 'STATIC') {
    const primaryMenu = interactiveMenus[0];
    const fallbackText = "Silakan pilih menu di atas atau hubungi Admin kami.";
    if (primaryMenu) {
      const wabaPayload = formatInteractiveMenu(primaryMenu, 'WABA');
      const wahaText = formatInteractiveMenu(primaryMenu, 'WAHA');
      return {
        reply_text: `${wahaText}\n\n${fallbackText}`,
        action: "STATIC_MENU_FALLBACK",
        type: channel === 'WABA' ? "INTERACTIVE" : "TEXT",
        interactive_payload: channel === 'WABA' ? wabaPayload : undefined,
      };
    }
    return {
      reply_text: fallbackText,
      action: "STATIC_FALLBACK",
      type: "TEXT",
    };
  }

  const defaultBaseUrl = getTenantBaseUrl(tenantDomainInfo);
  return {
    reply_text: `Halo! Selamat datang di ${storeName}. Ada yang bisa kami bantu seputar produk atau layanan kami?\n\nKunjungi etalase toko kami di: ${defaultBaseUrl}`,
    action: "NONE",
    type: "TEXT",
    checkout_url: defaultBaseUrl,
  };
}