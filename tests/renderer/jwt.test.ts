import { describe, expect, it } from 'vitest';
import { JwtError, decodeJwt, describeTime, tokenStatus, verifyJwt } from '../../src/renderer/features/tools/jwt/jwt';

const b64url = (bytes: Uint8Array | ArrayBuffer) => Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString('base64url');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const pem = (der: ArrayBuffer) => `-----BEGIN PUBLIC KEY-----\n${Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END PUBLIC KEY-----`;

async function sign(alg: string, payload: object, key: CryptoKey, params: AlgorithmIdentifier | RsaPssParams | EcdsaParams) {
  const head = `${enc({ alg, typ: 'JWT', kid: 'k1' })}.${enc(payload)}`;
  const sig = await crypto.subtle.sign(params, key, new TextEncoder().encode(head));
  return `${head}.${b64url(sig)}`;
}

const now = 1_800_000_000;
const claims = { sub: '42', name: 'Ana', iat: now - 60, exp: now + 3600 };

describe('decodeJwt', () => {
  it('decodes header and payload, ignoring "Bearer" and quotes', async () => {
    const t = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.c2ln`;
    const d = decodeJwt(`Bearer "${t}"`);
    expect(d.header.alg).toBe('HS256');
    expect(d.payload).toEqual(claims);
    expect(d.encrypted).toBe(false);
  });

  it('explains malformed tokens and recognises JWE', () => {
    expect(() => decodeJwt('abc.def')).toThrow(/three parts/);
    expect(() => decodeJwt('!!.e30.x')).toThrow(JwtError);
    expect(() => decodeJwt(`${b64url(new TextEncoder().encode('nope'))}.e30.x`)).toThrow(/header is not a JSON object/);
    const jwe = decodeJwt(`${enc({ alg: 'RSA-OAEP', enc: 'A256GCM' })}.a.b.c.d`);
    expect(jwe.encrypted).toBe(true);
    expect(jwe.payload).toBeNull();
  });
});

describe('token status', () => {
  it('reports valid, expired, not yet valid and no expiry', () => {
    expect(tokenStatus({ exp: now + 7200 }, now)).toMatchObject({ state: 'valid', message: 'Valid. It expires in 2 hours.' });
    expect(tokenStatus({ exp: now - 3 * 86400 }, now)).toMatchObject({ state: 'expired', message: 'Expired 3 days ago.' });
    expect(tokenStatus({ nbf: now + 60, exp: now + 120 }, now).state).toBe('not-yet-valid');
    expect(tokenStatus({}, now).state).toBe('no-expiry');
    expect(describeTime(now + 1, now)).toBe('in 1 second');
  });
});

describe('verifyJwt', () => {
  it('HS256 with a text or base64 secret', async () => {
    const secret = 'my-256-bit-secret';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const t = decodeJwt(await sign('HS256', claims, key, 'HMAC'));
    expect(await verifyJwt(t, { kind: 'secret', value: secret, encoding: 'utf8' })).toEqual({ ok: true });
    expect(await verifyJwt(t, { kind: 'secret', value: Buffer.from(secret).toString('base64'), encoding: 'base64' })).toEqual({ ok: true });
    expect(await verifyJwt(t, { kind: 'secret', value: 'wrong', encoding: 'utf8' })).toMatchObject({ ok: false, reason: /does not match/ });
  });

  it('RS256 and PS256 with a PEM public key', async () => {
    for (const [alg, name, params] of [['RS256', 'RSASSA-PKCS1-v1_5', { name: 'RSASSA-PKCS1-v1_5' }], ['PS256', 'RSA-PSS', { name: 'RSA-PSS', saltLength: 32 }]] as const) {
      const pair = await crypto.subtle.generateKey({ name, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
      const t = decodeJwt(await sign(alg, claims, pair.privateKey, params));
      const publicPem = pem(await crypto.subtle.exportKey('spki', pair.publicKey));
      expect(await verifyJwt(t, { kind: 'public-key', value: publicPem })).toEqual({ ok: true });
      const tampered = { ...t, parts: { ...t.parts, payload: enc({ ...claims, sub: 'admin' }) } };
      expect((await verifyJwt(tampered, { kind: 'public-key', value: publicPem })).ok).toBe(false);
    }
  });

  it('ES256 with a JWKS (picks the key by kid) and EdDSA with a JWK', async () => {
    const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const t = decodeJwt(await sign('ES256', claims, ec.privateKey, { name: 'ECDSA', hash: 'SHA-256' }));
    const jwk = await crypto.subtle.exportKey('jwk', ec.publicKey);
    const jwks = JSON.stringify({ keys: [{ ...jwk, kid: 'other' }, { ...jwk, kid: 'k1' }] });
    expect(await verifyJwt(t, { kind: 'public-key', value: jwks })).toEqual({ ok: true });

    const ed = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const te = decodeJwt(await sign('EdDSA', claims, ed.privateKey, { name: 'Ed25519' }));
    expect(await verifyJwt(te, { kind: 'public-key', value: JSON.stringify(await crypto.subtle.exportKey('jwk', ed.publicKey)) })).toEqual({ ok: true });
  });

  it('refuses unsigned tokens, private keys and certificates', async () => {
    const none = decodeJwt(`${enc({ alg: 'none' })}.${enc(claims)}.`);
    expect(await verifyJwt(none, { kind: 'secret', value: 'x', encoding: 'utf8' })).toMatchObject({ ok: false, reason: /not signed/ });
    const rs = decodeJwt(`${enc({ alg: 'RS256' })}.${enc(claims)}.c2ln`);
    expect(await verifyJwt(rs, { kind: 'public-key', value: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----' })).toMatchObject({ reason: /private key/ });
    expect(await verifyJwt(rs, { kind: 'public-key', value: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----' })).toMatchObject({ reason: /certificate/ });
  });
});
