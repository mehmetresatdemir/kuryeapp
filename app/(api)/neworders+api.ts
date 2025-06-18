import { neon } from "@neondatabase/serverless";

export async function POST(request: Request) {
  try {
    // Neon veritabanı bağlantısı; URL .env dosyanızda tanımlı olmalıdır.
    const sql = neon(process.env.NEXT_PUBLIC_DATABASE_URL!);

    // API'ye gönderilen JSON verisini parse ediyoruz.
    const { mahalle, odemeYontemi, fiyat, resim } = await request.json();

    console.log("Request Data:", { mahalle, odemeYontemi, fiyat, resim });

    // Zorunlu alanların kontrolü
    if (!mahalle || !odemeYontemi || fiyat === undefined || fiyat === null) {
      return new Response(
        JSON.stringify({ error: "Eksik alan var: mahalle, ödeme yöntemi veya fiyat." }),
        { status: 400 }
      );
    }

    // Veritabanına verileri INSERT ediyoruz.
    const result = await sql`
      INSERT INTO orders (
        mahalle,
        odeme_yontemi,
        fiyat,
        resim
      ) VALUES (
        ${mahalle},
        ${odemeYontemi},
        ${fiyat},
        ${resim}
      )
      RETURNING *;
    `;

    // Başarılı yanıt döndürüyoruz.
    return new Response(JSON.stringify({ data: result }), { status: 201 });
  } catch (error) {
    console.error("Sipariş oluşturulurken hata oluştu:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}
