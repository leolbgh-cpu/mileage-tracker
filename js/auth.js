import { verifyJwt } from "./jwt.js";
import {
  GOOGLE_CLIENT_ID,
  ALLOWED_EMAIL_SHA256,
  GOOGLE_JWKS_URL,
  GOOGLE_ISSUERS,
  SESSION_TTL_MS,
} from "./auth-config.js";

const SESSION_KEY = "mt_auth_session_v1";
const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session.exp || Date.now() >= session.exp) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function setSession(payload) {
  const tokenExpiryMs = payload.exp * 1000;
  const exp = Math.min(tokenExpiryMs, Date.now() + SESSION_TTL_MS);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ exp, email: payload.email }));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

let gsiLoadPromise = null;
function loadGoogleScript() {
  if (gsiLoadPromise) return gsiLoadPromise;
  gsiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Google Sign-In. Check your connection."));
    document.head.appendChild(script);
  });
  return gsiLoadPromise;
}

/**
 * Verifies a Google ID token end-to-end: real RS256 signature check against
 * Google's live JWKS, issuer/audience/expiry checks, an email_verified check,
 * and finally that the signed-in account matches the one allow-listed for
 * this app (compared by hash, not by storing the plaintext address).
 */
export async function verifyGoogleCredential(idToken) {
  const payload = await verifyJwt(idToken, {
    jwksUrl: GOOGLE_JWKS_URL,
    issuer: GOOGLE_ISSUERS,
    audience: GOOGLE_CLIENT_ID,
  });

  if (!payload.email || payload.email_verified !== true) {
    throw new Error("This Google account's email is not verified.");
  }
  const emailHash = await sha256Hex(String(payload.email).toLowerCase());
  if (emailHash !== ALLOWED_EMAIL_SHA256) {
    throw new Error("This Google account is not authorized to use this app.");
  }
  return payload;
}

/**
 * Renders the Google Sign-In button into `buttonEl` and resolves once a
 * verified, authorized sign-in completes. Rejects (via onError) for any
 * account that fails verification or isn't the allow-listed one — the caller
 * decides whether to let the user try again.
 */
export async function startGoogleSignIn(buttonEl, { onError } = {}) {
  if (GOOGLE_CLIENT_ID.startsWith("REPLACE_WITH")) {
    throw new Error(
      "Google Sign-In isn't configured yet: set GOOGLE_CLIENT_ID in js/auth-config.js.",
    );
  }
  await loadGoogleScript();

  return new Promise((resolve) => {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const payload = await verifyGoogleCredential(response.credential);
          setSession(payload);
          resolve(payload);
        } catch (err) {
          onError?.(err);
        }
      },
      use_fedcm_for_prompt: true,
    });

    window.google.accounts.id.renderButton(buttonEl, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      width: 280,
    });
  });
}

export function signOut() {
  clearSession();
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // Google script may not be loaded yet; nothing to disable.
  }
}
