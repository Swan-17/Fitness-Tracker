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
      const error = parsed?.error;
      const reason = error?.details?.find(
        (detail: { reason?: string }) => detail?.reason,
      )?.reason;

      if (reason === "ACCOUNT_NOT_LINKED") {
        message =
          "Your Google Account is not linked to Google Health. Open Google Health, sign in with this Google Account, create/link your Health profile or migrate your Fitbit account, then reconnect.";
      } else if (reason === "MISSING_OAUTH_SCOPE") {
        message =
          "Google Health did not grant the required permission. Reconnect and approve all requested Health permissions.";
      } else if (
        response.status === 403 &&
        (reason === "DATA_ACCESS_DENIED" ||
          reason === "RESOURCE_PERMISSION_DENIED" ||
          error?.message?.toLowerCase()?.includes("caller does not have permission"))
      ) {
        message =
          "Google Health denied this account. If this is a Fitbit account, sign out of the Google Health app, then sign back in with the same Google Account using Continue with Google. If prompted, migrate/link the Fitbit account, then reconnect.";
      } else if (reason) {
        message = `Google Health denied access (${response.status}, ${reason}).`;
      }
    } catch {
      // Keep the safe generic message when Google does not return JSON.
    }

    throw new Error(message);
  }

  return {
    identity: await response.json(),
    credentials: client.credentials,
  };
}

type DataShape = "sample" | "interval" | "daily" | "session";

function dataShape(type: string): DataShape {
  if (["heart-rate", "heart-rate-variability", "oxygen-saturation", "respiratory-rate"].includes(type)) {
    return "sample";
  }
  if (["daily-heart-rate-variability", "daily-resting-heart-rate", "daily-oxygen-saturation", "daily-respiratory-rate", "daily-heart-rate-zones"].includes(type)) {
    return "daily";
  }
  if (type === "sleep" || type === "exercise") return "session";
  return "interval";
}

function filterFor(type: string, start: string, end: string) {
  const field = type.replaceAll("-", "_");
  const shape = dataShape(type);

  if (shape === "daily") {
    const startDate = start.slice(0, 10);
    const endDate = end.slice(0, 10);
    return `${field}.date >= "${startDate}" AND ${field}.date <= "${endDate}"`;
  }

  const path =
    shape === "sample"
      ? "sample_time.physical_time"
      : shape === "session"
        ? "interval.start_time"
        : "interval.start_time";

  return `${field}.${path} >= "${start}" AND ${field}.${path} < "${end}"`;
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

  const u = new URL(
    `https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints`,
  );
  u.searchParams.set("pageSize", type === "sleep" || type === "exercise" ? "25" : "10000");
  u.searchParams.set(
    "dataSourceFamily",
    "users/me/dataSourceFamilies/google-wearables",
  );
  u.searchParams.set("filter", filterFor(type, start, end));

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
