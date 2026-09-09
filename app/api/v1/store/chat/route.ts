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
    const body = await req.json().catch(() => ({}));
    const tenantSlug = String(body?.tenant_slug || "").trim().toLowerCase();
    const rawMessage = String(body?.message || "").trim();
    const lower = rawMessage.toLowerCase();

    if (!tenantSlug) {
      return NextResponse.json({ error: "tenant_slug is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, slug, name, category, metadata")
      .eq("slug", tenantSlug)
      .maybeSingle();

    const storeName = tenant?.name || tenantSlug.replace(/[-_]/g, " ").toUpperCase();
    const isService = tenant?.category === "service" || tenant?.category === "LOCAL_SERVICE" || tenantSlug.includes("kuras");

    const { data: bookingSchema } = await supabase
      .from("tenant_booking_schemas")
      .select("*")
      .eq("tenant_slug", tenantSlug)
      .maybeSingle();

    const pricingMatrix = 
      bookingSchema?.pricing_matrix || 
      tenant?.metadata?.products || [
        { label: "520 Liter", price: 160000 },
        { label: "650 Liter", price: 170000 },
        { label: "800 Liter", price: 180000 },
        { label: "1000 Liter", price: 200000 }
      ];

    // SKENARIO: LOCAL SERVICE (Kuras Toren)
    if (isService || bookingSchema) {
      // 1. Tanya Harga / Tarif
      if (lower.includes("harga") || lower.includes("biaya") || lower.includes("tarif") || lower.includes("layanan")) {
        const listText = pricingMatrix
          .map((p) => `• ${p.label || p.capacity || "Kuras Toren"}: Rp ${Number(p.price || 0).toLocaleString("id-ID")}`)
          .join("\n");

        return NextResponse.json({
          reply_text: `Berikut adalah rincian tarif layanan ${storeName} bergaransi bersih tuntas:\n\n${listText}\n\nUntuk toren di lokasi Kakak, kapasitas berapa liter ya?`,
          action: "ASK_CAPACITY",
          type: "TEXT"
        });
      }

      // 2. User Sebut Ukuran Toren -> Muncul Kartu Interaktif
      const matched = pricingMatrix.find((item) => {
        const str = `${item.label || ""} ${item.capacity || ""}`.toLowerCase();
        const numMatch = str.match(/\d+/);
        return numMatch ? lower.includes(numMatch[0]) : false;
      });

      if (matched) {
        const capName = matched.label || matched.capacity || "Kuras Toren";
        const capPrice = Number(matched.price || 0);

        return NextResponse.json({
          reply_text: `Siap Kak! Untuk kapasitas *${capName}*, biayanya *Rp ${capPrice.toLocaleString("id-ID")}* (sudah termasuk kuras tuntas & sterilisasi). Silakan klik tombol di bawah untuk pesan langsung ya.`,
          action: "SHOW_CHECKOUT",
          type: "SHOW_CHECKOUT",
          product: {
            id: `srv-${tenantSlug}-${Date.now()}`,
            name: `${storeName} - ${capName}`,
            price: capPrice,
            badge: "Layanan Rekomendasi",
            image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60",
            description: `Pembersihan & kuras toren tuntas bergaransi bersih untuk kapasitas ${capName}.`
          }
        });
      }

      // 3. Tanya Garansi / Keamanan
      if (lower.includes("aman") || lower.includes("garansi") || lower.includes("sabun") || lower.includes("kimia")) {
        return NextResponse.json({
          reply_text: `Dijamin 100% aman Kak! Pembersihan dilakukan tanpa bahan kimia keras berbahaya sehingga air langsung aman digunakan kembali, lengkap dengan garansi bersih tuntas. Ada jadwal yang ingin dipilih?`,
          action: "NONE",
          type: "TEXT"
        });
      }

      // 4. Tanya Area Jangkauan
      if (lower.includes("area") || lower.includes("jangkauan") || lower.includes("lokasi") || lower.includes("karawang")) {
        return NextResponse.json({
          reply_text: `Tim teknisi kami melayani seluruh area Karawang dan sekitarnya. Boleh diinfokan lokasi kecamatan atau patokan tempat tinggal Kakak?`,
          action: "NONE",
          type: "TEXT"
        });
      }

      // SAPAAN AWAL NATURAL (Tanpa Menu Kaku)
      return NextResponse.json({
        reply_text: `Halo! Selamat datang di layanan ${storeName} 👋 Ada yang bisa kami bantu seputar estimasi biaya atau penjadwalan pembersihan toren hari ini?`,
        action: "NONE",
        type: "TEXT"
      });
    }

    // SKENARIO: RETAIL REGULER
    return NextResponse.json({
      reply_text: `Halo! Selamat datang di ${storeName}. Ada yang bisa kami bantu terkait produk kami?`,
      action: "NONE",
      type: "TEXT"
    });

  } catch (err: any) {
    console.error("[Store Chat Error]:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}