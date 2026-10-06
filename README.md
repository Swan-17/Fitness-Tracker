# Fitness-Tracker

A Next.js dashboard for Fitbit Air data through the Google Health API.

## Local setup

1. Install Node.js 20+.
2. Install dependencies:
   `npm install`
3. Copy `.env.example` to `.env.local`.
4. Fill in:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback`
5. Run `npm run dev`.
6. Open `http://localhost:3000` and choose **Connect Google Health**.

Never commit `.env.local` or the Google OAuth client secret.

## Google Cloud configuration

The OAuth app should be configured as:

- User type: **External**
- Publishing status: **Testing**
- Your Google account added as a **test user**
- OAuth client type: **Web application**
- Authorized redirect URI: `http://localhost:3000/api/auth/callback`
- Google Health API enabled
- Read-only scopes:
  - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
  - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
  - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`

Google's current Health API setup requires the user to have a linked Google Health/Fitbit account. After OAuth, the app verifies that link with `users.getIdentity` before marking the connection successful.

## Important

Google currently says it is not onboarding new Health API projects. This app therefore assumes the Cloud project already has Health API access.

The legacy Fitbit Web API is being turned off on October 30, 2026; this project intentionally uses Google Health API instead.
