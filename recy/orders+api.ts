import { neon } from "@neondatabase/serverless";

export async function POST(request: Request) {
  try {
    const sql = neon(`${process.env.NEXT_PUBLIC_DATABASE_URL}`);

    // Gelen JSON verisini parse et
    const {
      deliveryTime,
      origin,
      destination,
      distance,
      price,
      recipient,
      otherDetails,
    } = await request.json();

    console.log("Database URL:", process.env.NEXT_PUBLIC_DATABASE_URL);
    console.log("Request Body:", {
      deliveryTime,
      origin,
      destination,
      distance,
      price,
      recipient,
      otherDetails,
    });

    // Gerekli alanların eksik olup olmadığını kontrol et
    if (
      !deliveryTime ||
      !origin ||
      !destination ||
      !distance ||
      !price ||
      !recipient ||
      !recipient.name ||
      !recipient.phone
    ) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Veritabanına kaydet
    const response = await sql`
      INSERT INTO orders (
        delivery_time,
        origin_address,
        origin_latitude,
        origin_longitude,
        destination_address,
        destination_latitude,
        destination_longitude,
        distance,
        price,
        recipient_name,
        recipient_phone,
        other_details
      ) VALUES (
        ${deliveryTime},
        ${origin.address},
        ${origin.latitude},
        ${origin.longitude},
        ${destination.address},
        ${destination.latitude},
        ${destination.longitude},
        ${distance},
        ${price},
        ${recipient.name},
        ${recipient.phone},
        ${otherDetails}
      )
      RETURNING *;
    `;

    // Başarılı yanıt döndür
    return new Response(JSON.stringify({ data: response }), {
      status: 201,
    });
  } catch (error) {
    console.error("Error creating order:", {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}