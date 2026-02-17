Spotify integration runbook

Overview
--------

This runbook explains how to create a Spotify app, configure OAuth redirect URIs, request the required scopes, obtain an initial refresh token, and configure tokens as secrets in Render.

1) Create a Spotify Developer App

--------------------------------

- Go to <https://developer.spotify.com/dashboard> and create an app.
- Note the `Client ID` and `Client Secret`.
- Under Edit Settings, add an OAuth Redirect URI such as `https://<your-domain>/oauth/callback`.

1) Required Scopes

------------------
For read-only Now Playing and playback control intents (control intents will be used by MCP tools only):

- `user-read-playback-state` (read current playback state)
- `user-read-currently-playing` (read currently playing)
- `user-modify-playback-state` (required for playback control; only used by MCP tools)

For a read-only website façade, the refresh token and client secret remain server-side.

1) Obtain an Authorization Code (manual flow)

--------------------------------------------
Visit this URL (replace client_id and redirect URI accordingly):

```
https://accounts.spotify.com/authorize?client_id=<CLIENT_ID>&response_type=code&redirect_uri=<REDIRECT_URI>&scope=user-read-playback-state%20user-read-currently-playing%20user-modify-playback-state
```

- Log in to Spotify, authorize the app, and the browser will redirect to `REDIRECT_URI` with a `code` query parameter.

1) Exchange Code for Tokens

---------------------------
Use curl or an OAuth helper to exchange the `code` for an access token + refresh token:

```
curl -X POST "https://accounts.spotify.com/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "<CLIENT_ID>:<CLIENT_SECRET>" \
  -d "grant_type=authorization_code&code=<CODE>&redirect_uri=<REDIRECT_URI>"
```

The response contains `access_token`, `expires_in`, and `refresh_token`. Store the `refresh_token` securely.

1) Configure Secrets in Render

------------------------------

- In Render Dashboard → Service → Environment → Environment Variables
  - Add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (secure)
  - Add `SPOTIFY_REFRESH_TOKEN` (secure) — optional if the server handles initial authorization via a temporary flow. Alternatively, use a one-time admin route to set the refresh token.

  Example (one-time admin helper):

  ```bash
  # seed refresh token directly
  curl -X POST --data '{"refreshToken":"<REFRESH_TOKEN>"}' \
    -H "Content-Type: application/json" \
    https://<your-domain>/api/admin/spotify/oauth-callback?key=<MCP_API_KEY>

  # or exchange an authorization code server-side (server must have CLIENT_ID/SECRET/REDIRECT_URI configured)
  curl -X POST --data '{"code":"<AUTH_CODE_FROM_SPOTIFY>"}' \
    -H "Content-Type: application/json" \
    https://<your-domain>/api/admin/spotify/oauth-callback?key=<MCP_API_KEY>
  ```

  Note: In development the endpoint will persist the token to `.env.local`. In production prefer storing the token in your host's secret manager (Render, etc.) and restart the service if required.
  - Ensure `SPOTIFY_REDIRECT_URI` matches the value configured in the Spotify app.

1) Token Refresh Flow (server behavior)

--------------------------------------

- Implement automatic refresh using the OAuth `refresh_token` grant when `access_token` expires.
- On repeated refresh failures (e.g., 401 responses), log and increment a failure metric; after N failures, create an alert and require manual reauthorization.

1) Reauthorization (if refresh token is invalid)

------------------------------------------------

- Repeat step 3 to obtain a new `code` and exchange it for tokens.
- Update `SPOTIFY_REFRESH_TOKEN` in Render (or the server's credential store).

1) Troubleshooting

------------------

- 401 on API calls: check that `SPOTIFY_REFRESH_TOKEN` and `SPOTIFY_CLIENT_SECRET` are correct; inspect token refresh logs.
- No active device errors: verify that the user has a Spotify device available (Spotify mobile/desktop/web playback device).

Security Notes
--------------

- Never commit `SPOTIFY_CLIENT_SECRET` or `SPOTIFY_REFRESH_TOKEN` to source control.
- Rotate secrets periodically and document the rotation in this runbook.
