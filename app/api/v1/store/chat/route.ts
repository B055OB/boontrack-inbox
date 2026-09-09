import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenantSlug = String(body?.tenant_slug || "").trim().toLowerCase();
    const rawMessage = String(body?.message || "").trim();
    const lower = rawMessage.toLowerCase();

    if (!tenantSlug) {
      return NextResponse.json(
        { error: "tenant_slug is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // 1. Ambil data tenant
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, slug, name, category, metadata")
      .eq("slug", tenantSlug)
      .maybeSingle();

    const storeName = tenant?.name || tenantSlug.replace(/[-_]/g, " ").toUpperCase();
    const isService =
      tenant?.category === "service" ||
      tenant?.category === "LOCAL_SERVICE" ||
      tenantSlug.includes("kuras");

    // 2. Ambil skema booking jika ada
    const { data: bookingSchema } = await supabase
      .from("tenant_booking_schemas")
      .select("*")
      .eq("tenant_slug", tenantSlug)
      .maybeSingle();

    const pricingMatrix: Array<{ label?: string; capacity?: string; price: number }> =
      bookingSchema?.pricing_matrix ||
      tenant?.metadata?.products || [
        { label: "520 Liter", price: 160000 },
        { label: "650 Liter", price: 170000 },
        { label: "800 Liter", price: 180000 },
        { label: "1000 Liter", price: 200000 }
      ];

    const defaultQuickActions = [
      "💧 Daftar Harga Layanan",
      "📍 Area Jangkauan Layanan",
      "📅 Jadwal & Cara Pesan",
      "🛡️ Garansi Kebersihan"
    ];

    // SKENARIO: TENANT JASA (LOCAL SERVICE)
    if (isService || bookingSchema) {
      // Pertanyaan Keamanan Air & Garansi
      if (
        lower.includes("aman") ||
        lower.includes("garansi") ||
        lower.includes("sabun") ||
        lower.includes("kimia") ||
        lower.includes("minum")
      ) {
        return NextResponse.json({
          reply_text: `Dijamin 100% aman Kak! Proses kuras toren di ${storeName} menggunakan teknik khusus tanpa bahan kimia keras berbahaya, sehingga air aman untuk langsung digunakan kembali. Kami juga memberikan garansi bersih tuntas.\n\nBoleh kami bantu atur jadwal kunjungan teknisi ke rumah?`,
          action: "NONE",
          type: "TEXT",
          quick_actions: ["💧 Daftar Harga Layanan", "📅 Jadwal & Cara Pesan"]
        });
      }

      // Pertanyaan Harga / Tarif
      if (
        lower.includes("harga") ||
        lower.includes("biaya") ||
        lower.includes("tarif") ||
        lower.includes("layanan") ||
        lower.includes("daftar")
      ) {
        const listText = pricingMatrix
          .map(
            (p) =>
              `• ${p.label || p.capacity || "Kuras Toren"}: Rp ${Number(
                p.price || 0
              ).toLocaleString("id-ID")}`
          )
          .join("\n");

        return NextResponse.json({
          reply_text: `Berikut daftar tarif resmi kuras toren di ${storeName}:\n\n${listText}\n\nSemua pengerjaan sudah termasuk pembersihan lumut tuntas dan garansi bersih. Untuk toren di rumah Kakak, ukuran berapa liter ya?`,
          action: "ASK_CAPACITY",
          type: "TEXT",
          quick_actions: pricingMatrix
            .slice(0, 4)
            .map((p) => p.label || p.capacity || "Kuras Toren")
        });
      }

      // User Menyebut Ukuran Literan (520, 650, 800, 1000, dst)
      const matched = pricingMatrix.find((item) => {
        const str = `${item.label || ""} ${item.capacity || ""}`.toLowerCase();
        const numMatch = str.match(/\d+/);
        return numMatch ? lower.includes(numMatch[0]) : false;
      });

      if (matched) {
        const capName = matched.label || matched.capacity || "Kuras Toren";
        const capPrice = Number(matched.price || 0);

        return NextResponse.json({
          reply_text: `Siap Kak! Untuk kapasitas *${capName}*, biayanya *Rp ${capPrice.toLocaleString(
            "id-ID"
          )}* bersih tuntas.\n\nSilakan klik tombol di bawah untuk pesan langsung atau pilih jadwal kunjungan teknisi kami.`,
          action: "SHOW_CHECKOUT",
          type: "SHOW_CHECKOUT",
          product: {
            id: `srv-${tenantSlug}-${Date.now()}`,
            name: `${storeName} - ${capName}`,
            price: capPrice,
            badge: "Layanan Rekomendasi",
            image:
              "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60",
            description: `Pengerjaan kuras toren tuntas bergaransi bersih untuk kapasitas ${capName}.`
          },
          quick_actions: [
            "📅 Jadwal Hari Ini",
            "📅 Jadwal Besok",
            "📍 Tanya Area Layanan"
          ]
        });
      }

      // Pertanyaan Area Jangkauan
      if (
        lower.includes("area") ||
        lower.includes("jangkauan") ||
        lower.includes("lokasi") ||
        lower.includes("karawang") ||
        lower.includes("alamat")
      ) {
        return NextResponse.json({
          reply_text: `Tim teknisi ${storeName} melayani seluruh area Karawang dan sekitarnya (perumahan, ruko, maupun instansi). Teknisi datang langsung membawa perlengkapan lengkap.\n\nBoleh diinfokan patokan perumahan atau kecamatan lokasi Kakak?`,
          action: "ASK_LOCATION",
          type: "TEXT",
          quick_actions: ["💧 Daftar Harga Layanan", "📅 Jadwal & Cara Pesan"]
        });
      }

      // Pertanyaan Jadwal & Cara Pesan
      if (
        lower.includes("jadwal") ||
        lower.includes("pesan") ||
        lower.includes("booking") ||
        lower.includes("order")
      ) {
        return NextResponse.json({
          reply_text: `Cara pesan di ${storeName} sangat mudah:\n1. Tentukan ukuran toren Kakak.\n2. Tentukan hari dan jam kunjungan.\n3. Teknisi datang dan pembayaran bisa via QRIS atau bayar tunai di tempat setelah pengerjaan beres.\n\nRencana mau dibersihkan hari apa Kak?`,
          action: "ASK_SCHEDULE",
          type: "TEXT",
          quick_actions: [
            "📅 Jadwal Hari Ini",
            "📅 Jadwal Besok",
            "💧 Daftar Harga Layanan"
          ]
        });
      }

      // Default Balasan Jasa
      return NextResponse.json({
        reply_text: `Halo! Selamat datang di layanan ${storeName} 👋 Ada yang bisa kami bantu seputar tarif estimasi, jadwal kunjungan, atau jangkauan area kami?`,
        action: "NONE",
        type: "TEXT",
        quick_actions: defaultQuickActions
      });
    }

    // SKENARIO: TENANT RETAIL BIASA
    const { data: prods } = await supabase
      .from("products")
      .select("id, name, price, promo_price")
      .eq("tenant_id", tenant?.id)
      .limit(4);

    return NextResponse.json({
      reply_text: `Selamat datang di ${storeName}! Ada yang bisa kami bantu terkait produk atau pesanan Anda?`,
      action: "NONE",
      type: "TEXT",
      quick_actions: (prods || []).map((p) => p.name)
    });
  } catch (err: any) {
    console.error("[Store Chat Fatal Error]:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}