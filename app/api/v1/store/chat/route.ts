import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_slug, message, conversation_history } = body;

    if (!tenant_slug) {
      return NextResponse.json({ error: "Tenant slug is required" }, { status: 400 });
    }

    const cleanSlug = String(tenant_slug).toLowerCase().trim();
    const cleanMsg = String(message || "").trim();
    const lowerMsg = cleanMsg.toLowerCase();
    const supabase = getSupabaseAdmin();

    // 1. Ambil data tenant spesifik (Isolasi Tenant)
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, slug, name, category, metadata")
      .eq("slug", cleanSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const storeName = tenant.name || cleanSlug.toUpperCase();
    const isService = tenant.category === "service" || tenant.category === "LOCAL_SERVICE";

    // 2. Ambil skema booking jika ada (khusus jasa kuras toren/service)
    const { data: bookingSchema } = await supabase
      .from("tenant_booking_schemas")
      .select("*")
      .eq("tenant_slug", cleanSlug)
      .maybeSingle();

    // =========================================================================
    // SKENARIO A: TENANT LOCAL SERVICE / JASA (Contoh: Kuras Toren)
    // =========================================================================
    if (isService || bookingSchema) {
      const pricingMatrix: Array<{ label?: string; capacity?: string; price: number; promo_price?: number }> = 
        bookingSchema?.pricing_matrix || 
        tenant.metadata?.products || [
          { label: "520 Liter", price: 160000 },
          { label: "650 Liter", price: 170000 },
          { label: "800 Liter", price: 180000 },
          { label: "1000 Liter", price: 200000 }
        ];

      // A.1: Pertanyaan Harga / Daftar Layanan
      if (lowerMsg.includes("harga") || lowerMsg.includes("biaya") || lowerMsg.includes("tarif") || lowerMsg.includes("layanan")) {
        const listText = pricingMatrix
          .map((item) => {
            const name = item.label || item.capacity || "Layanan";
            const price = Number(item.price || 0).toLocaleString("id-ID");
            return `• ${name}: Rp ${price}`;
          })
          .join("\n");

        return NextResponse.json({
          reply_text: `Halo! Berikut adalah daftar tarif resmi layanan ${storeName}:\n\n${listText}\n\nSemua pengerjaan bergaransi bersih tuntas. Untuk toren di lokasi Kakak, kapasitas berapa liter ya?`,
          action: "ASK_CAPACITY",
          type: "TEXT",
          quick_actions: pricingMatrix.slice(0, 4).map((p) => p.label || p.capacity || "Kuras Toren")
        });
      }

      // A.2: User menyebutkan angka / kapasitas toren (misal: "520", "650", "1000")
      const matchedCapacity = pricingMatrix.find((item) => {
        const str = `${item.label || ""} ${item.capacity || ""}`.toLowerCase();
        const numMatch = str.match(/\d+/);
        return numMatch ? lowerMsg.includes(numMatch[0]) : false;
      });

      if (matchedCapacity) {
        const capName = matchedCapacity.label || matchedCapacity.capacity || "Kuras Toren";
        const finalPrice = Number(matchedCapacity.price || 0);

        return NextResponse.json({
          reply_text: `Siap Kak! Untuk kapasitas *${capName}*, biayanya *Rp ${finalPrice.toLocaleString("id-ID")}* (sudah termasuk pembersihan lumut, kuras tuntas, dan sterilisasi).\n\nBoleh kami bantu atur jadwal pengerjaannya hari ini atau besok?`,
          action: "SHOW_CHECKOUT",
          type: "SHOW_CHECKOUT",
          product: {
            id: `service-${cleanSlug}-${Date.now()}`,
            name: `${storeName} - ${capName}`,
            price: finalPrice,
            badge: "Layanan Rekomendasi",
            image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60",
            description: `Pengerjaan kuras toren tuntas bergaransi bersih untuk kapasitas ${capName}.`
          },
          quick_actions: ["📅 Jadwal Hari Ini", "📅 Jadwal Besok", "📍 Tanya Area Layanan"]
        });
      }

      // A.3: Pertanyaan Area Jangkauan
      if (lowerMsg.includes("area") || lowerMsg.includes("jangkauan") || lowerMsg.includes("lokasi") || lowerMsg.includes("karawang")) {
        return NextResponse.json({
          reply_text: `Tim teknisi ${storeName} melayani seluruh area Karawang dan sekitarnya (termasuk perumahan, ruko, dan perkantoran). Teknisi kami datang langsung membawa peralatan lengkap.\n\nBisa diinfokan lokasi patokan rumah atau kecamatan Kakak?`,
          action: "ASK_LOCATION",
          type: "TEXT",
          quick_actions: ["💧 Daftar Harga Layanan", "📅 Jadwal & Cara Pesan"]
        });
      }

      // A.4: Pertanyaan Garansi / Keamanan
      if (lowerMsg.includes("garansi") || lowerMsg.includes("aman") || lowerMsg.includes("sabun") || lowerMsg.includes("kimia")) {
        return NextResponse.json({
          reply_text: `Pembersihan di ${storeName} 100% aman tanpa bahan kimia keras berbahaya, sehingga air aman untuk langsung digunakan kembali. Kami juga memberikan garansi bersih tuntas setelah pengerjaan selesai.\n\nAda yang ingin ditanyakan lagi sebelum booking jadwal Kak?`,
          action: "ASSURANCE",
          type: "TEXT",
          quick_actions: ["💧 Daftar Harga Layanan", "📅 Jadwal & Cara Pesan"]
        });
      }

      // A.5: Default fallback Service
      return NextResponse.json({
        reply_text: `Halo! Terima kasih telah menghubungi ${storeName} 👋 Ada yang bisa kami bantu seputar tarif estimasi, jadwal kunjungan teknisi, atau jangkauan area kami?`,
        action: "NONE",
        type: "TEXT",
        quick_actions: ["💧 Daftar Harga Layanan", "📍 Area Jangkauan Layanan", "📅 Jadwal & Cara Pesan", "🛡️ Garansi Kebersihan"]
      });
    }

    // =========================================================================
    // SKENARIO B: TENANT RETAIL / PRODUK FISIK (E-Commerce Reguler)
    // =========================================================================
    const { data: tenantProducts } = await supabase
      .from("products")
      .select("id, name, price, promo_price, description, image_url")
      .eq("tenant_id", tenant.id)
      .limit(6);

    const prods = tenantProducts || [];

    if (lowerMsg.includes("harga") || lowerMsg.includes("produk") || lowerMsg.includes("promo")) {
      const prodText = prods.length > 0 
        ? prods.map((p) => `• ${p.name}: Rp ${Number(p.promo_price || p.price).toLocaleString("id-ID")}`).join("\n")
        : "Katalog produk sedang dalam pembaruan.";

      return NextResponse.json({
        reply_text: `Berikut beberapa produk pilihan di ${storeName}:\n\n${prodText}\n\nSilakan pilih produk yang Kakak minati untuk pemesanan langsung.`,
        action: "SHOW_CATALOG",
        type: "TEXT",
        quick_actions: prods.slice(0, 3).map((p) => p.name)
      });
    }

    return NextResponse.json({
      reply_text: `Selamat datang di ${storeName}! Silakan tanyakan ketersediaan produk, cek ongkir, atau panduan belanja online di toko kami.`,
      action: "NONE",
      type: "TEXT",
      quick_actions: ["🛍️ Lihat Produk", "🚚 Cek Pengiriman", "💳 Cara Pembayaran"]
    });
  } catch (err: any) {
    console.error("[Store Chat API Error]:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}