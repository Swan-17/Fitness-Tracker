import { NextRequest, NextResponse } from "next/server";
import { oauthClient, verifyHealthIdentity } from "@/lib/google-health";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("oauth_state")?.value;

  if (!code || !state || state !== expected) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  try {
    const { tokens } = await oauthClient().getToken(code);
    const { credentials } = await verifyHealthIdentity(
      tokens as unknown as Record<string, unknown>,
    );
    const storedTokens = { ...tokens, ...credentials };

    const response = NextResponse.redirect(new URL("/", req.url));
    response.cookies.set("google_tokens", JSON.stringify(storedTokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    response.cookies.delete("oauth_state");
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Health connection failed";
    return NextResponse.redirect(
      new URL(`/?oauth_error=${encodeURIComponent(message)}`, req.url),
    );
  }
}
