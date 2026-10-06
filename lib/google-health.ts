import { google } from "googleapis";

export const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];

export function oauthClient() {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_REDIRECT_URI
  ) {
    throw new Error("Missing Google OAuth environment variables");
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function authUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    include_granted_scopes: true,
    state,
    prompt: "consent",
  });
}

export async function verifyHealthIdentity(tokens: Record<string, unknown>) {
  const client = oauthClient();
  client.setCredentials(tokens);

  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Unable to obtain a Google access token");

  const response = await fetch(
    "https://health.googleapis.com/v4/users/me/identity",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    let message = `Google Health identity check failed (${response.status})`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.details?.some(
        (detail: { reason?: string }) => detail.reason === "ACCOUNT_NOT_LINKED",
      )) {
        message =
          "Your Google Account is not linked to Google Health. Open the Google Health app, sign in with this Google Account, link/migrate your Fitbit account, then try again.";
      }
    } catch {
      // Keep the generic message when Google does not return JSON.
    }
    throw new Error(message);
  }

  return {
    identity: await response.json(),
    credentials: client.credentials,
  };
}

export async function healthList(
  type: string,
  tokens: Record<string, unknown>,
  start: string,
  end: string,
) {
  const client = oauthClient();
  client.setCredentials(tokens);

  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Unable to refresh Google access token");

  const field = type.replaceAll("-", "_");
  const isSample = [
    "heart-rate",
    "heart-rate-variability",
    "oxygen-saturation",
    "respiratory-rate",
  ].includes(type);

  const u = new URL(
    `https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints`,
  );
  u.searchParams.set("pageSize", "10000");
  u.searchParams.set(
    "dataSourceFamily",
    "users/me/dataSourceFamilies/google-wearables",
  );
  u.searchParams.set(
    "filter",
    `${field}.${isSample ? "sample_time.physical_time" : "interval.start_time"} >= "${start}" AND ${field}.${isSample ? "sample_time.physical_time" : "interval.start_time"} < "${end}"`,
  );

  const points: unknown[] = [];
  let pageToken: string | undefined;

  do {
    if (pageToken) u.searchParams.set("pageToken", pageToken);

    const response = await fetch(u, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Google Health API ${response.status}: ${await response.text()}`,
      );
    }

    const json = await response.json();
    points.push(...(json.dataPoints ?? []));
    pageToken = json.nextPageToken || undefined;
  } while (pageToken);

  Object.assign(tokens, client.credentials);

  return { dataPoints: points, credentials: client.credentials };
}
