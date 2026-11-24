import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '../../../components/motion';
import { CloseIcon, KeyIcon, PasteIcon, ShieldCheckIcon, ShieldOffIcon, WarningIcon, ClockIcon } from '../../../components/Icons';
import { CodeBlock } from '../CodeBlock';
import { CLAIM_NAMES, TIME_CLAIMS, decodeJwt, describeTime, tokenStatus, usesSecret, verifyJwt, type DecodedJwt, type VerifyResult } from './jwt';

/** Decode a JWT, read its claims in plain words and check the signature. */
export function JwtDecoder() {
  const [input, setInput] = useState('');
  const [decoded, setDecoded] = useState<DecodedJwt | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [editing, setEditing] = useState(true);

  useEffect(() => {
    if (!input.trim()) { setDecoded(null); setError(''); return; }
    try { setDecoded(decodeJwt(input)); setError(''); } catch (e) { setDecoded(null); setError((e as Error).message); }
  }, [input]);
  // keep "expires in …" honest while the page is open
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 15_000); return () => clearInterval(t); }, []);

  return (
    <div className="page-scroll">
      <div className="tool-page">
        <header className="tool-head">
          <div className="stack-xs grow">
            <h1>JWT decoder</h1>
            <p className="muted">Paste a token to read its header and claims and see whether it is still valid. Add the secret or public key to check the signature. Tokens never leave your computer.</p>
          </div>
        </header>
        <div className="tool-grid">
          <section className="tool-input">
            <div className="tool-bar">
              <h2>Token</h2>
              <span className="grow" />
              <button className="btn ghost small" onClick={() => void navigator.clipboard.readText().then((t) => { setInput(t); setEditing(false); })}><PasteIcon size={14} />Paste</button>
              {input && <button className="btn ghost small" onClick={() => { setInput(''); setEditing(true); }}><CloseIcon size={14} />Clear</button>}
            </div>
            {decoded && !decoded.encrypted && !editing
              ? <ColoredToken decoded={decoded} onEdit={() => setEditing(true)} />
              : <textarea className="code-area short" spellCheck={false} autoFocus value={input} onChange={(e) => setInput(e.target.value)}
                  onPaste={() => setTimeout(() => setEditing(false), 0)} onBlur={() => input.trim() && setEditing(false)} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi…  (a “Bearer” prefix is fine)" />}
            <p className={'tool-status' + (error ? ' bad' : '')}>{error || (decoded ? `${input.trim().length.toLocaleString()} characters${editing ? '' : ' · click the token to edit it'}` : 'Nothing decoded yet.')}</p>
            {decoded && !decoded.encrypted && <SignatureCheck decoded={decoded} />}
          </section>

          {decoded
            ? <Details decoded={decoded} now={now} />
            : <section className="tool-result empty"><KeyIcon size={28} /><p>The header and claims show up here.</p></section>}
        </div>
      </div>
    </div>
  );
}

/** The token with its three parts coloured; clicking switches back to editing. */
function ColoredToken({ decoded, onEdit }: { decoded: DecodedJwt; onEdit: () => void }) {
  const { header, payload, signature } = decoded.parts;
  return (
    <button className="jwt-colored" onClick={onEdit} title="Click to edit">
      <span className="jwt-h">{header}</span>.<span className="jwt-p">{payload}</span>.<span className="jwt-s">{signature}</span>
    </button>
  );
}

function Details({ decoded, now }: { decoded: DecodedJwt; now: number }) {
  const status = decoded.encrypted ? null : tokenStatus(decoded.payload, now);
  const claims = decoded.payload ? Object.entries(decoded.payload) : [];
  return (
    <section className="tool-result jwt-details">
      {decoded.encrypted
        ? <p className="banner warn inset"><WarningIcon size={15} />This is an encrypted token (JWE). Only the header can be read without the private key.</p>
        : status && (
          <div className={'jwt-status ' + status.state}>
            <ClockIcon size={16} />
            <span className="grow">{status.message}</span>
            {typeof decoded.payload?.exp === 'number' && <span className="mono small">{new Date(decoded.payload.exp * 1000).toLocaleString()}</span>}
          </div>
        )}
      <div className="jwt-section">
        <h3><span className="dot jwt-h-dot" />Header</h3>
        <div className="row wrap">
          {['alg', 'typ', 'kid'].filter((k) => decoded.header[k] !== undefined).map((k) => <span key={k} className="pill"><b>{k}</b>&nbsp;{String(decoded.header[k])}</span>)}
          {decoded.header.alg === 'none' && <span className="pill danger">unsigned</span>}
        </div>
        <CodeBlock code={JSON.stringify(decoded.header, null, 2)} title="Header JSON" />
      </div>
      {!decoded.encrypted && (
        <div className="jwt-section">
          <h3><span className="dot jwt-p-dot" />Payload</h3>
          {decoded.payload
            ? <>
                <table className="claims">
                  <tbody>
                    {claims.map(([k, v]) => (
                      <tr key={k}>
                        <th><span className="mono">{k}</span>{CLAIM_NAMES[k] && <span className="claim-name">{CLAIM_NAMES[k]}</span>}</th>
                        <td>
                          {TIME_CLAIMS.has(k) && typeof v === 'number'
                            ? <><span>{new Date(v * 1000).toLocaleString()}</span> <span className="muted">· {describeTime(v, now)}</span> <span className="mono faint">{v}</span></>
                            : <span className="mono claim-value">{typeof v === 'string' ? v : JSON.stringify(v)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <CodeBlock code={JSON.stringify(decoded.payload, null, 2)} title="Payload JSON" />
              </>
            : <CodeBlock code={decoded.payloadText} title="Payload (not JSON)" language="text" />}
        </div>
      )}
    </section>
  );
}

function SignatureCheck({ decoded }: { decoded: DecodedJwt }) {
  const alg = String(decoded.header.alg ?? '');
  const secret = usesSecret(alg);
  const [value, setValue] = useState('');
  const [encoding, setEncoding] = useState<'utf8' | 'base64'>('utf8');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const token = useMemo(() => decoded, [decoded]);

  useEffect(() => {
    if (!value.trim() && alg !== 'none') { setResult(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      void verifyJwt(token, secret ? { kind: 'secret', value, encoding } : { kind: 'public-key', value }).then((r) => !cancelled && setResult(r));
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [token, value, encoding, secret, alg]);

  return (
    <div className="jwt-verify">
      <div className="tool-bar">
        <h2><span className="dot jwt-s-dot" />Signature <span className="muted mono small">{alg || 'no alg'}</span></h2>
        <span className="grow" />
        {secret && (
          <div className="segmented small">
            <button className={encoding === 'utf8' ? 'on' : ''} onClick={() => setEncoding('utf8')}>Text</button>
            <button className={encoding === 'base64' ? 'on' : ''} onClick={() => setEncoding('base64')}>Base64</button>
          </div>
        )}
      </div>
      {alg !== 'none' && (
        secret
          ? <input className="key-input mono" type="password" autoComplete="off" spellCheck={false} placeholder="Shared secret" value={value} onChange={(e) => setValue(e.target.value)} />
          : <textarea className="key-input mono" spellCheck={false} rows={5} placeholder={'-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\n\nor a JWK / JWKS (picked by kid)'} value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <AnimatePresence mode="wait">
        {result && (
          <motion.p key={String(result.ok) + (result.ok ? '' : result.reason)} className={'verify-result ' + (result.ok ? 'good' : 'bad')}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
            {result.ok ? <ShieldCheckIcon size={16} /> : <ShieldOffIcon size={16} />}
            {result.ok ? 'Signature verified' : result.reason}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
