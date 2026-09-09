import { createClient } from "@supabase/supabase-js";

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
}

export interface ChatCoreResponse {
  reply_text: string;
  action: string;
  type: string;
  product?: any;
}

export async function processTenantChatCore(req: ChatCoreRequest): Promise<ChatCoreResponse> {
  const cleanSlug = String(req.tenant_slug || "").toLowerCase().trim();
  const rawMessage = String(req.message || "").trim();
  const lower = rawMessage.toLowerCase();

  const supabase = getSupabaseAdmin();

  // 1. Ambil data tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, category, metadata")
    .eq("slug", cleanSlug)
    .maybeSingle();

  const storeName = tenant?.name || cleanSlug.replace(/[-_]/g, " ").toUpperCase();
  const isService = tenant?.category === "service" || tenant?.category === "LOCAL_SERVICE" || cleanSlug.includes("kuras");

  // 2. Ambil skema booking dari DB (Shared Schema)
  const { data: bookingSchema } = await supabase
    .from("tenant_booking_schemas")
    .select("*")
    .eq("tenant_slug", cleanSlug)
    .maybeSingle();

  const pricingMatrix: Array<{ label?: string; capacity?: string; price: number }> =
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

      return {
        reply_text: `Siap Kak! Untuk kapasitas *${capName}*, biayanya *Rp ${capPrice.toLocaleString("id-ID")}* (sudah termasuk kuras tuntas & sterilisasi bebas lumut).\n\nBoleh kami bantu atur jadwal pengerjaannya hari ini atau besok? 📅`,
        action: "SHOW_CHECKOUT",
        type: "SHOW_CHECKOUT",
        product: {
          id: `srv-${cleanSlug}-${Date.now()}`,
          name: `${storeName} - ${capName}`,
          price: capPrice,
          badge: "Layanan Rekomendasi",
          image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60",
          description: `Pembersihan & kuras toren tuntas bergaransi bersih untuk kapasitas ${capName}.`
        }
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
        reply_text: `Tim teknisi kami melayani seluruh area Karawang dan sekitarnya. Teknisi datang langsung membawa peralatan lengkap.\n\nBoleh diinfokan patokan kecamatan lokasi Kakak? Sekalian mau dibersihkan untuk toren ukuran berapa liter? 📍`,
        action: "ASK_CAPACITY",
        type: "TEXT"
      };
    }

    // Default Greeting Sapaan Awal Natural
    return {
      reply_text: `Halo! Selamat datang di layanan *${storeName}* 👋 Ada yang bisa kami bantu seputar estimasi biaya pembersihan toren hari ini?`,
      action: "NONE",
      type: "TEXT"
    };
  }

  return {
    reply_text: `Halo! Selamat datang di ${storeName}. Ada yang bisa kami bantu?`,
    action: "NONE",
    type: "TEXT"
  };
}