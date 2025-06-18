import { neon } from "@neondatabase/serverless";



export async function POST(request: Request) {
    try {
        const sql = neon(`${process.env.NEXT_PUBLIC_DATABASE_URL}`);
        const { name, email, clerkId } = await request.json();
        console.log("Database URL:", process.env.NEXT_PUBLIC_DATABASE_URL);
        console.log("Request Body:", { name, email, clerkId });

        if (!name || !email || !clerkId) {
            return Response.json(
                { error: "Missing required fields: name, email, or clerkId" },
                { status: 400 },
            );
        }

        const response = await sql`
            INSERT INTO users (name, email, clerk_id)
            VALUES (${name}, ${email}, ${clerkId})
            RETURNING *;
        `;

        return new Response(JSON.stringify({ data: response }), {
            status: 201,
        });
    } catch (error) {
        console.error("Error creating user:", {
            message: (error as Error).message,
            stack: (error as Error).stack,
        });
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}