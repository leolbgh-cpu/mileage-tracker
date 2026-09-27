// Minimal RS256 JWT verification using Web Crypto, so a Google ID token can be
// checked for real (signature, issuer, audience, expiry) without a backend to
// do it server-side. This is generic JWT/JWKS code, not Google-specific.

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlToJson(b64url) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(b64url)));
}

export function decodeJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token.");
  const [headerPart, payloadPart, signaturePart] = parts;
  return {
    header: base64UrlToJson(headerPart),
    payload: base64UrlToJson(payloadPart),
    signedData: new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    signature: base64UrlToBytes(signaturePart),
  };
}

let jwksCache = null;
let jwksCacheAt = 0;
const JWKS_CACHE_MS = 10 * 60 * 1000;

async function fetchJwks(jwksUrl) {
  const now = Date.now();
  if (jwksCache && now - jwksCacheAt < JWKS_CACHE_MS) return jwksCache;
  const res = await fetch(jwksUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch signing keys (${res.status}).`);
  const { keys } = await res.json();
  jwksCache = keys;
  jwksCacheAt = now;
  return keys;
}

async function importRsaPublicKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Verifies an RS256 JWT's signature against a JWKS endpoint and checks the
 * standard claims. Throws with a specific reason on any failure; returns the
 * decoded payload only when every check passes.
 */
export async function verifyJwt(token, { jwksUrl, issuer, audience, clockSkewSeconds = 60 }) {
  const { header, payload, signedData, signature } = decodeJwt(token);

  if (header.alg !== "RS256") throw new Error("Unexpected signing algorithm.");

  const keys = await fetchJwks(jwksUrl);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Signing key not found (it may have rotated).");

  const publicKey = await importRsaPublicKey(jwk);
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    signature,
    signedData,
  );
  if (!valid) throw new Error("Signature verification failed.");

  const now = Math.floor(Date.now() / 1000);
  const issuers = Array.isArray(issuer) ? issuer : [issuer];
  if (!issuers.includes(payload.iss)) throw new Error("Unexpected issuer.");
  if (payload.aud !== audience) throw new Error("Token was not issued for this app.");
  if (typeof payload.exp !== "number" || now > payload.exp + clockSkewSeconds) {
    throw new Error("Token has expired.");
  }
  if (typeof payload.iat === "number" && payload.iat > now + clockSkewSeconds) {
    throw new Error("Token is not yet valid.");
  }

  return payload;
}
