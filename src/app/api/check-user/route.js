import { NextResponse } from "next/server";

// POST /api/check-user — placeholder route (auth handled by the main backend)
export async function POST(request) {
    try {
        const body = await request.json();
        const { username, name } = body;

        if (!username) {
            return NextResponse.json(
                { error: "Username is required" },
                { status: 400 }
            );
        }

        // This route is a stub — actual user management is handled by the
        // Reflow backend at reflow-backend.fly.dev. Return a success stub
        // so the frontend doesn't break.
        return NextResponse.json({
            user: { username, name: name || username },
        });
    } catch (error) {
        console.error("Error in check-user:", error);
        return NextResponse.json(
            { error: "Failed to check user" },
            { status: 500 }
        );
    }
}
