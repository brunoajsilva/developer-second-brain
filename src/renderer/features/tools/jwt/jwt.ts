// Decoding and verifying JSON Web Tokens with WebCrypto. Nothing leaves the computer.

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown> | null;
  /** Raw text of each part, for display. */
  parts: { header: string; payload: string; signature: string };
  /** The payload as text when it is not JSON (e.g. a detached or binary payload). */
  payloadText: string;
  /** JWE (5 parts): only the header can be read. */
  encrypted: boolean;
}

export class JwtError extends Error {}

/** base64url → bytes (tolerates standard base64 and missing padding). */
export function base64UrlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_\-+/=]*$/.test(s)) throw new JwtError('The token contains characters that are not base64url.');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (b64.length % 4 === 1) throw new JwtError('A part of the token has an invalid length; it may be cut short.');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const utf8 = (b: Uint8Array) => new TextDecoder().decode(b);

function parseJsonPart(name: string, b64: string): Record<string, unknown> {
  let text: string;
  try { text = utf8(base64UrlToBytes(b64)); } catch (e) { throw new JwtError(`The ${name} is not valid base64url. ${(e as Error).message}`); }
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new JwtError(`The ${name} is not a JSON object.`);
  }
}

export function decodeJwt(input: string): DecodedJwt {
  const token = input.trim().replace(/^(bearer|authorization:\s*bearer)\s+/i, '').replace(/^["']|["']$/g, '').replace(/\s+/g, '');
  if (!token) throw new JwtError('Paste a token to decode it.');
  const segments = token.split('.');
  if (segments.length === 5) {
    return { header: parseJsonPart('header', segments[0]), payload: null, payloadText: '', encrypted: true, parts: { header: segments[0], payload: segments.slice(1).join('.'), signature: '' } };
  }
  if (segments.length !== 3) throw new JwtError(`A JWT has three parts separated by dots; this has ${segments.length}.`);
  const header = parseJsonPart('header', segments[0]);
  let payload: Record<string, unknown> | null = null;
  let payloadText = '';
  try { payload = parseJsonPart('payload', segments[1]); } catch { payloadText = utf8(base64UrlToBytes(segments[1])); }
  return { header, payload, payloadText, encrypted: false, parts: { header: segments[0], payload: segments[1], signature: segments[2] } };
}

/** Registered claims (RFC 7519) with a short explanation. */
export const CLAIM_NAMES: Record<string, string> = {
  iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not before', iat: 'Issued at', jti: 'Token id',
  scope: 'Scopes', scp: 'Scopes', azp: 'Authorized party', nonce: 'Nonce', auth_time: 'Authenticated at', sid: 'Session id', email: 'Email', name: 'Name', roles: 'Roles'
};
export const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time', 'updated_at']);

export type TokenStatus = { state: 'valid' | 'expired' | 'not-yet-valid' | 'no-expiry'; message: string };

function relative(seconds: number): string {
  const s = Math.abs(seconds);
  const units: [number, string][] = [[86400 * 365, 'year'], [86400 * 30, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']];
  for (const [size, name] of units) {
    if (s >= size) { const n = Math.floor(s / size); return `${n} ${name}${n === 1 ? '' : 's'}`; }
  }
  return '0 seconds';
}

export function describeTime(epochSeconds: number, now = Date.now() / 1000): string {
  const diff = epochSeconds - now;
  return diff >= 0 ? `in ${relative(diff)}` : `${relative(diff)} ago`;
}

export function tokenStatus(payload: Record<string, unknown> | null, now = Date.now() / 1000): TokenStatus {
  const exp = typeof payload?.exp === 'number' ? payload.exp : null;
  const nbf = typeof payload?.nbf === 'number' ? payload.nbf : null;
  if (nbf !== null && now < nbf) return { state: 'not-yet-valid', message: `Not valid yet: it starts ${describeTime(nbf, now)}.` };
  if (exp === null) return { state: 'no-expiry', message: 'This token has no expiry (no exp claim).' };
  if (now >= exp) return { state: 'expired', message: `Expired ${describeTime(exp, now)}.` };
  return { state: 'valid', message: `Valid. It expires ${describeTime(exp, now)}.` };
}

// ---------- Signature verification

export type KeyInput = { kind: 'secret'; value: string; encoding: 'utf8' | 'base64' } | { kind: 'public-key'; value: string };
export type VerifyResult = { ok: true } | { ok: false; reason: string };

const HASH: Record<string, string> = { '256': 'SHA-256', '384': 'SHA-384', '512': 'SHA-512' };
const CURVE: Record<string, string> = { ES256: 'P-256', ES384: 'P-384', ES512: 'P-521' };

/** Whether this algorithm uses a shared secret (HS*) or a public key. */
export const usesSecret = (alg: string) => /^HS(256|384|512)$/.test(alg);

function pemToDer(pem: string): { der: Uint8Array; label: string } | null {
  const m = pem.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/);
  if (!m) return null;
  return { der: base64UrlToBytes(m[2].replace(/\s+/g, '')), label: m[1] };
}

function algorithmFor(alg: string): { importParams: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams; verifyParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams } {
  const bits = alg.slice(2);
  if (/^RS(256|384|512)$/.test(alg)) return { importParams: { name: 'RSASSA-PKCS1-v1_5', hash: HASH[bits] }, verifyParams: { name: 'RSASSA-PKCS1-v1_5' } };
  if (/^PS(256|384|512)$/.test(alg)) return { importParams: { name: 'RSA-PSS', hash: HASH[bits] }, verifyParams: { name: 'RSA-PSS', saltLength: Number(bits) / 8 } };
  if (/^ES(256|384|512)$/.test(alg)) return { importParams: { name: 'ECDSA', namedCurve: CURVE[alg] }, verifyParams: { name: 'ECDSA', hash: HASH[bits] } };
  if (alg === 'EdDSA' || alg === 'Ed25519') return { importParams: { name: 'Ed25519' }, verifyParams: { name: 'Ed25519' } };
  throw new JwtError(`The algorithm “${alg}” is not supported for verification.`);
}

/** Picks the JWK to use from a JWK or a JWKS (matching the token's kid when there are several). */
function pickJwk(text: string, kid: unknown): JsonWebKey | null {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  const keys = (v as { keys?: JsonWebKey[] }).keys;
  if (Array.isArray(keys)) {
    const found = keys.find((k) => (k as { kid?: string }).kid === kid) ?? (keys.length === 1 ? keys[0] : undefined);
    if (!found) throw new JwtError(kid ? `The key set has no key with kid “${String(kid)}”.` : 'The key set has several keys and the token has no kid.');
    return found;
  }
  return v as JsonWebKey;
}

export async function verifyJwt(token: DecodedJwt, key: KeyInput): Promise<VerifyResult> {
  const alg = String(token.header.alg ?? '');
  if (token.encrypted) return { ok: false, reason: 'Encrypted tokens (JWE) cannot be verified here.' };
  if (alg === 'none') return { ok: false, reason: 'The token is not signed (alg “none”). Never accept it as authentic.' };
  const data = new TextEncoder().encode(`${token.parts.header}.${token.parts.payload}`);
  let signature: Uint8Array;
  try { signature = base64UrlToBytes(token.parts.signature); } catch { return { ok: false, reason: 'The signature is not valid base64url.' }; }
  try {
    if (usesSecret(alg)) {
      if (key.kind !== 'secret' || !key.value) return { ok: false, reason: 'Enter the shared secret to verify an HMAC signature.' };
      const raw = key.encoding === 'base64' ? base64UrlToBytes(key.value.trim()) : new TextEncoder().encode(key.value);
      const k = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'HMAC', hash: HASH[alg.slice(2)] }, false, ['verify']);
      return (await crypto.subtle.verify('HMAC', k, signature as BufferSource, data)) ? { ok: true } : { ok: false, reason: 'The signature does not match this secret.' };
    }
    if (key.kind !== 'public-key' || !key.value.trim()) return { ok: false, reason: 'Paste the public key (PEM or JWK) to verify this signature.' };
    const { importParams, verifyParams } = algorithmFor(alg);
    let cryptoKey: CryptoKey;
    const pem = pemToDer(key.value);
    if (pem) {
      if (pem.label === 'CERTIFICATE') return { ok: false, reason: 'Paste the public key (BEGIN PUBLIC KEY) rather than the certificate.' };
      if (pem.label.includes('PRIVATE')) return { ok: false, reason: 'That is a private key. Use the public key; never paste private keys into tools.' };
      cryptoKey = await crypto.subtle.importKey('spki', pem.der as BufferSource, importParams, false, ['verify']);
    } else {
      const jwk = pickJwk(key.value, token.header.kid);
      if (!jwk) return { ok: false, reason: 'The key is neither a PEM public key nor a JWK.' };
      const { d: _private, ...publicJwk } = jwk as JsonWebKey & { d?: string };
      cryptoKey = await crypto.subtle.importKey('jwk', { ...publicJwk, key_ops: ['verify'] }, importParams, false, ['verify']);
    }
    return (await crypto.subtle.verify(verifyParams, cryptoKey, signature as BufferSource, data)) ? { ok: true } : { ok: false, reason: 'The signature does not match this key.' };
  } catch (e) {
    return { ok: false, reason: e instanceof JwtError ? e.message : `The key could not be used for ${alg}: ${(e as Error).message || 'wrong key type'}.` };
  }
}
