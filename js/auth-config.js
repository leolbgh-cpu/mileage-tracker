// Public, non-secret config. A Google OAuth "Web application" Client ID is not
// a secret (it's meant to be embedded in client-side code) — it only names
// which app is requesting sign-in, and Google's authorized-origins check
// (configured in Google Cloud Console) is what actually restricts where it
// can be used from.
//
// Fill this in with the Client ID from https://console.cloud.google.com/apis/credentials
// (see README.md > "Setting up Google Sign-In" for the exact steps).
export const GOOGLE_CLIENT_ID = "REPLACE_WITH_YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com";

// The account allowed to open this app, stored only as a SHA-256 hash so the
// plaintext address doesn't sit in this public repository. Generated with:
//   printf '%s' 'you@gmail.com' | sha256sum
export const ALLOWED_EMAIL_SHA256 = "f7a1c9fa879a355d1f35997655a1cee28d639f592ddd6ea64b43b176fa0ee500";

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

// How long a successful sign-in stays valid for this browser tab before
// Google sign-in is required again. Stored in sessionStorage, so closing the
// browser/tab clears it regardless of this value.
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
