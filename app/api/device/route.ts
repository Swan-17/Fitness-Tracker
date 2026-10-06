import { NextResponse } from "next/server";
import { oauthClient } from "@/lib/google-health";

export async function GET() {
  const raw = (await import("next/headers")).cookies();
  const cookieStore = await raw;
  const tokenCookie = cookieStore.get("google_tokens")?.value;
  if (!tokenCookie) return NextResponse.json({ error: "Not connected" }, { status: 401 });

  try {
    const tokens = JSON.parse(tokenCookie) as Record<string, unknown>;
    const client = oauthClient();
    client.setCredentials(tokens);
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("Unable to refresh Google access token");

    const response = await fetch("https://health.googleapis.com/v4/users/me/pairedDevices?pageSize=10", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Google Health device API ${response.status}: ${await response.text()}`);
    }

    const json = await response.json();
    const devices = (json.pairedDevices ?? []).map((device: Record<string, unknown>) => ({
      name: device.name,
      deviceType: device.deviceType,
      deviceVersion: device.deviceVersion,
      batteryStatus: device.batteryStatus,
      batteryLevel: device.batteryLevel,
      lastSyncTime: device.lastSyncTime,
    }));

    const tracker = devices.find((d: { deviceType?: string }) => d.deviceType === "TRACKER") ?? devices[0] ?? null;
    Object.assign(tokens, client.credentials);
    const result = NextResponse.json({ device: tracker, devices });
    result.cookies.set("google_tokens", JSON.stringify(tokens), { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    return result;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load device status." }, { status: 502 });
  }
}
