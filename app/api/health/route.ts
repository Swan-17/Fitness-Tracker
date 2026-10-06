import { NextRequest, NextResponse } from "next/server";
import { healthList } from "@/lib/google-health";

export async function GET(req: NextRequest) {
  const raw = req.cookies.get("google_tokens")?.value;
  if (!raw) return NextResponse.json({ error: "Not connected" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "heart-rate";
  const days = Number(req.nextUrl.searchParams.get("days") || "0");
  const hours = type === "sleep" ? 36 : days > 0 ? days * 24 : 24;
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);

  try {
    const tokens = JSON.parse(raw);
    const result = await healthList(type, tokens, start.toISOString(), end.toISOString());
    const response = NextResponse.json({ dataPoints: result.dataPoints });

    response.cookies.set("google_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
