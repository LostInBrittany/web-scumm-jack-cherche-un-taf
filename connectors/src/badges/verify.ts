// Open Badges verification (4.1.9, wiki/en/bridge.connector-open-badges.md, docs/dev/threat-models/open-badge.md). Two
// formats, verified separately. Open Badges 2.0: a hosted assertion (fetched again from its own `id`) or a signed one
// (a compact JWS, the key named by `verification.creator`, owned by the issuer). Open Badges 3.0: a Verifiable
// Credential secured as a VC-JWT or with a Data Integrity proof `eddsa-jcs-2022`. Then, for both: the issuer among the
// game's, the recipient the player says, the dates, the revocation. A verdict is one of five words; what cannot be
// checked is `indeterminate`, never `valid`. Every document comes through `fetch` (the SSRF-safe fetcher).
import { createHash, type KeyObject } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { didKey, jwkKey, multikey, parseJws, pemKey, verifyEddsaJcs, verifyJws } from './crypto';
import { type Fetched, jsonDepth } from './fetch';

type BadgeStatus = 'valid' | 'invalid' | 'expired' | 'revoked' | 'indeterminate';
type BadgeFormat = 'ob2-hosted' | 'ob2-signed' | 'ob3-jwt' | 'ob3-di' | 'unknown';

export interface Verdict {
  status: BadgeStatus;
  format: BadgeFormat;
  /** The assertion's or credential's id (empty when unknown). */
  badgeId: string;
  issuer: string;
  /** Why, in a few words (logged only as a code by the connector). */
  reason: string;
}

export interface Submission {
  /** A URL, a compact JWS, a JSON string or an object. */
  badge: unknown;
  /** The player's email, to match a hashed recipient; hashed at once, never kept. */
  email?: string;
  /** Or the recipient's identifier (a DID, a URL). */
  recipient?: string;
}

export interface VerifierOptions {
  /** The issuer ids whose badges count (`reality.connectors['open-badge'].issuers`). */
  issuers: string[];
  fetch: (url: string) => Promise<Fetched>;
  now?: () => number;
  /** How long a revocation or status list is reused, at most 24 h. */
  cacheMs?: number;
  /** Documents one verification may fetch. */
  maxFetches?: number;
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const idOf = (x: unknown): string => (typeof x === 'string' ? x : isObj(x) && typeof x.id === 'string' ? x.id : '');
const typesOf = (x: Obj): string[] => {
  const t = x.type ?? x['@type'];
  return (Array.isArray(t) ? t : [t]).filter((y): y is string => typeof y === 'string');
};
const origin = (u: string) => {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
};
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const SKEW = 5 * 60_000;

class Stop extends Error {
  constructor(
    readonly status: BadgeStatus,
    reason: string,
  ) {
    super(reason);
  }
}

export class BadgeVerifier {
  private cache = new Map<string, { at: number; value: Fetched }>();
  private issuers: Set<string>;

  constructor(private o: VerifierOptions) {
    this.issuers = new Set(o.issuers);
  }

  private now() {
    return (this.o.now ?? Date.now)();
  }

  /** A verdict for a submission. Never throws. */
  async verify(s: Submission): Promise<Verdict> {
    const v: Verdict = { status: 'indeterminate', format: 'unknown', badgeId: '', issuer: '', reason: '' };
    let fetches = 0;
    const get = async (url: string): Promise<Fetched> => {
      if (++fetches > (this.o.maxFetches ?? 16)) return { ok: false, reason: 'too many documents' };
      return this.o.fetch(url);
    };
    try {
      await this.dispatch(s, v, get);
      v.status = 'valid';
      v.reason = 'verified';
    } catch (e) {
      v.status = e instanceof Stop ? e.status : 'indeterminate';
      v.reason = e instanceof Stop ? e.message : 'verification failed';
    }
    v.badgeId = v.badgeId.slice(0, 256);
    v.issuer = v.issuer.slice(0, 256);
    return v;
  }

  private async dispatch(s: Submission, v: Verdict, get: (u: string) => Promise<Fetched>): Promise<void> {
    let badge = s.badge;
    if (typeof badge === 'string') {
      const t = badge.trim();
      if (/^https?:\/\//.test(t)) {
        const r = await get(t);
        if (!r.ok) throw new Stop(r.status === 410 ? 'revoked' : 'indeterminate', `badge not fetched (${r.reason})`);
        badge = r.json ?? r.text.trim();
      } else if (t.startsWith('{')) {
        try {
          badge = JSON.parse(t);
        } catch {
          throw new Stop('invalid', 'not JSON');
        }
      } else badge = t;
    }
    if (typeof badge === 'string') {
      const jws = parseJws(badge);
      if (!jws) throw new Stop('invalid', 'not a badge');
      const p = jws.payload;
      if (!isObj(p)) throw new Stop('invalid', 'not a badge');
      if (isObj(p.vc) || typesOf(p).includes('VerifiableCredential')) {
        v.format = 'ob3-jwt';
        const cred = isObj(p.vc) ? p.vc : p;
        this.depth(cred);
        const issuer = idOf(cred.issuer) || (typeof p.iss === 'string' ? p.iss : '');
        if (typeof p.iss === 'string' && p.iss !== issuer) throw new Stop('invalid', 'iss is not the issuer');
        v.issuer = issuer;
        v.badgeId = idOf(cred) || (typeof p.jti === 'string' ? p.jti : '');
        const key = await this.keyOf(typeof jws.header.kid === 'string' ? jws.header.kid : '', issuer, get);
        if (!verifyJws(jws, key)) throw new Stop('invalid', 'signature');
        return this.ob3(cred, s, v, get, typeof p.exp === 'number' ? p.exp * 1000 : undefined);
      }
      v.format = 'ob2-signed';
      this.depth(p);
      v.badgeId = idOf(p);
      const ver = isObj(p.verification) ? p.verification : {};
      if (!/^(signed|SignedBadge)$/.test(String(ver.type ?? ''))) throw new Stop('invalid', 'not a signed assertion');
      const creator = typeof ver.creator === 'string' ? ver.creator : '';
      const k = await get(creator);
      if (!k.ok || !isObj(k.json)) throw new Stop('indeterminate', 'key not fetched');
      const key = pemKey(k.json.publicKeyPem);
      if (!key) throw new Stop('indeterminate', 'key unreadable');
      if (!verifyJws(jws, key)) throw new Stop('invalid', 'signature');
      return this.ob2(p, s, v, get, { owner: idOf(k.json.owner) });
    }
    if (!isObj(badge)) throw new Stop('invalid', 'not a badge');
    this.depth(badge);
    if (typesOf(badge).includes('VerifiableCredential')) {
      v.format = 'ob3-di';
      v.issuer = idOf(badge.issuer);
      v.badgeId = idOf(badge);
      await this.proofOf(badge, v.issuer, get);
      return this.ob3(badge, s, v, get);
    }
    v.format = 'ob2-hosted';
    v.badgeId = idOf(badge);
    const ver = isObj(badge.verification) ? badge.verification : isObj(badge.verify) ? badge.verify : {};
    if (ver.type !== 'hosted' && ver.type !== 'HostedBadge') throw new Stop('invalid', 'not a hosted assertion');
    // The hosted assertion is fetched again from its own id: what the player pasted is never the authority.
    const r = await get(v.badgeId);
    if (!r.ok) throw new Stop(r.status === 410 ? 'revoked' : 'indeterminate', `assertion not fetched (${r.reason})`);
    if (!isObj(r.json) || r.json.id !== v.badgeId)
      throw new Stop('invalid', 'the hosted assertion is another document');
    this.depth(r.json);
    return this.ob2(r.json, s, v, get, { hosted: v.badgeId });
  }

  private depth(x: unknown): void {
    if (jsonDepth(x, 8) > 8) throw new Stop('invalid', 'nested too deep');
  }

  private allowed(issuer: string): void {
    if (!this.issuers.has(issuer)) throw new Stop('invalid', 'unknown issuer');
  }

  /** Open Badges 2.0, after the transport (hosted or signed) is checked. */
  private async ob2(
    a: Obj,
    s: Submission,
    v: Verdict,
    get: (u: string) => Promise<Fetched>,
    o: { hosted?: string; owner?: string },
  ): Promise<void> {
    let badgeClass = a.badge;
    if (typeof badgeClass === 'string') {
      const r = await get(badgeClass);
      if (!r.ok || !isObj(r.json)) throw new Stop('indeterminate', 'badge class not fetched');
      badgeClass = r.json;
    }
    if (!isObj(badgeClass)) throw new Stop('invalid', 'no badge class');
    const issuerUrl = idOf(badgeClass.issuer);
    v.issuer = issuerUrl;
    this.allowed(issuerUrl);
    const pr = await get(issuerUrl);
    if (!pr.ok || !isObj(pr.json) || pr.json.id !== issuerUrl) throw new Stop('indeterminate', 'issuer not fetched');
    const profile = pr.json;
    if (o.owner !== undefined && o.owner !== issuerUrl) throw new Stop('invalid', 'the key is not the issuer’s');
    if (o.hosted) {
      const pv = isObj(profile.verification) ? profile.verification : {};
      const origins = Array.isArray(pv.allowedOrigins) ? pv.allowedOrigins.map(String) : [new URL(issuerUrl).host];
      if (!origins.includes(new URL(o.hosted).host)) throw new Stop('invalid', 'assertion hosted outside the issuer');
    }
    this.recipientOb2(a.recipient, s);
    if (a.revoked === true) throw new Stop('revoked', 'revoked');
    if (typeof a.expires === 'string' && Date.parse(a.expires) < this.now()) throw new Stop('expired', 'expired');
    if (typeof profile.revocationList === 'string') {
      const list = await this.cached(profile.revocationList, get);
      if (!list.ok || !isObj(list.json)) throw new Stop('indeterminate', 'revocation list not fetched');
      const revoked = Array.isArray(list.json.revokedAssertions) ? list.json.revokedAssertions.map(idOf) : [];
      if (revoked.includes(idOf(a))) throw new Stop('revoked', 'in the revocation list');
    }
  }

  private recipientOb2(r: unknown, s: Submission): void {
    if (!isObj(r)) throw new Stop('invalid', 'no recipient');
    const identity = String(r.identity ?? '');
    if (r.type === 'email') {
      if (!s.email) throw new Stop('indeterminate', 'no email to match the recipient');
      const email = s.email.trim().toLowerCase();
      const want = r.hashed ? `sha256$${sha256(email + String(r.salt ?? ''))}` : email;
      if (identity.toLowerCase() !== want) throw new Stop('invalid', 'another recipient');
      return;
    }
    if (!s.recipient || identity !== s.recipient) throw new Stop('invalid', 'another recipient');
  }

  /** Open Badges 3.0, after the proof is checked. */
  private async ob3(
    c: Obj,
    s: Submission,
    v: Verdict,
    get: (u: string) => Promise<Fetched>,
    jwtExp?: number,
  ): Promise<void> {
    this.allowed(v.issuer);
    const subject = isObj(c.credentialSubject) ? c.credentialSubject : {};
    const ids = Array.isArray(subject.identifier) ? subject.identifier.filter(isObj) : [];
    if (ids.length) {
      if (!s.email) throw new Stop('indeterminate', 'no email to match the recipient');
      const email = s.email.trim().toLowerCase();
      const ok = ids.some(
        (i) =>
          i.identityType === 'emailAddress' &&
          String(i.identityHash ?? '').toLowerCase() ===
            (i.hashed ? `sha256$${sha256(email + String(i.salt ?? ''))}` : email),
      );
      if (!ok) throw new Stop('invalid', 'another recipient');
    } else if (!s.recipient || subject.id !== s.recipient) throw new Stop('invalid', 'another recipient');
    const from = Date.parse(String(c.validFrom ?? c.issuanceDate ?? ''));
    if (Number.isFinite(from) && from > this.now() + SKEW) throw new Stop('invalid', 'not valid yet');
    const until = Date.parse(String(c.validUntil ?? c.expirationDate ?? ''));
    if ((Number.isFinite(until) && until < this.now()) || (jwtExp !== undefined && jwtExp < this.now()))
      throw new Stop('expired', 'expired');
    const statuses = Array.isArray(c.credentialStatus)
      ? c.credentialStatus
      : c.credentialStatus
        ? [c.credentialStatus]
        : [];
    for (const st of statuses.slice(0, 4)) await this.status(st, idOf(c), v.issuer, get);
  }

  private async status(
    st: unknown,
    credId: string,
    issuer: string,
    get: (u: string) => Promise<Fetched>,
  ): Promise<void> {
    if (!isObj(st)) throw new Stop('indeterminate', 'unreadable status');
    const t = typesOf(st);
    if (t.includes('1EdTechRevocationList')) {
      const r = await this.cached(idOf(st), get);
      if (!r.ok || !isObj(r.json)) throw new Stop('indeterminate', 'revocation list not fetched');
      const list = [r.json.revokedCredentials, r.json.revokedAssertions].flatMap((x) =>
        Array.isArray(x) ? x.map(idOf) : [],
      );
      if (list.includes(credId)) throw new Stop('revoked', 'in the revocation list');
      return;
    }
    if (t.includes('BitstringStatusListEntry') || t.includes('StatusList2021Entry')) {
      // A suspension (or any purpose but revocation) is not something this connector can judge: never `valid`.
      if (st.statusPurpose !== undefined && st.statusPurpose !== 'revocation')
        throw new Stop('indeterminate', `status purpose not checked (${String(st.statusPurpose).slice(0, 32)})`);
      const index = Number(st.statusListIndex);
      if (!Number.isInteger(index) || index < 0) throw new Stop('indeterminate', 'bad status index');
      const r = await this.cached(String(st.statusListCredential ?? ''), get);
      if (!r.ok) throw new Stop('indeterminate', 'status list not fetched');
      let list: Obj;
      if (isObj(r.json)) {
        list = r.json;
        this.depth(list);
        if (idOf(list.issuer) !== issuer) throw new Stop('indeterminate', 'status list from another issuer');
        await this.proofOf(list, issuer, get);
      } else {
        const jws = parseJws(r.text);
        const p = jws?.payload;
        const cred = isObj(p) ? (isObj(p.vc) ? p.vc : p) : null;
        if (!jws || !cred || idOf(cred.issuer) !== issuer) throw new Stop('indeterminate', 'status list unreadable');
        const key = await this.keyOf(typeof jws.header.kid === 'string' ? jws.header.kid : '', issuer, get);
        if (!verifyJws(jws, key)) throw new Stop('indeterminate', 'status list signature');
        list = cred;
      }
      const subject = isObj(list.credentialSubject) ? list.credentialSubject : {};
      const encoded = String(subject.encodedList ?? '');
      let bits: Buffer;
      try {
        bits = gunzipSync(Buffer.from(encoded.replace(/^u/, ''), 'base64url'), { maxOutputLength: 4 * 1024 * 1024 });
      } catch {
        throw new Stop('indeterminate', 'status list unreadable');
      }
      if (index >= bits.length * 8) throw new Stop('indeterminate', 'status index out of the list');
      if ((bits[index >> 3]! >> (7 - (index & 7))) & 1) throw new Stop('revoked', 'revoked in the status list');
      return;
    }
    throw new Stop('indeterminate', 'status type not supported');
  }

  /** A Data Integrity proof: `eddsa-jcs-2022` checked; another suite is `indeterminate`, never trusted. */
  private async proofOf(doc: Obj, issuer: string, get: (u: string) => Promise<Fetched>): Promise<void> {
    const proofs = (Array.isArray(doc.proof) ? doc.proof : [doc.proof]).filter(isObj);
    const p = proofs.find((x) => x.type === 'DataIntegrityProof' && x.cryptosuite === 'eddsa-jcs-2022');
    if (!p)
      throw new Stop(
        'indeterminate',
        `proof suite not supported (${String(proofs[0]?.cryptosuite ?? proofs[0]?.type ?? 'none')})`,
      );
    if (p.proofPurpose !== 'assertionMethod') throw new Stop('invalid', 'proof purpose');
    // The proof's own dates: made in the future (beyond the clock tolerance), or past its `expires`, it proves nothing.
    const created = Date.parse(String(p.created ?? ''));
    if (Number.isFinite(created) && created > this.now() + SKEW)
      throw new Stop('invalid', 'proof created in the future');
    const expires = Date.parse(String(p.expires ?? ''));
    if (Number.isFinite(expires) && expires < this.now()) throw new Stop('invalid', 'proof expired');
    const key = await this.keyOf(String(p.verificationMethod ?? ''), issuer, get);
    if (!verifyEddsaJcs({ ...doc, proof: p }, p, key)) throw new Stop('invalid', 'signature');
  }

  /**
   * The issuer's key a proof or a JWS names: a `did:key` (Ed25519) of the issuer itself, or a document at a URL of the
   * issuer's own origin holding a JWK or a `publicKeyMultibase`. Anything else cannot be tied to the issuer.
   */
  private async keyOf(ref: string, issuer: string, get: (u: string) => Promise<Fetched>): Promise<KeyObject> {
    if (ref.startsWith('did:key:')) {
      if (ref.split('#')[0] !== issuer) throw new Stop('invalid', 'the key is not the issuer’s');
      const k = didKey(ref.split('#')[0]!);
      if (!k) throw new Stop('indeterminate', 'did:key not supported');
      return k;
    }
    if (/^https:\/\//.test(ref) && origin(ref) === origin(issuer) && origin(issuer)) {
      const r = await get(ref.split('#')[0]!);
      if (!r.ok || !isObj(r.json)) throw new Stop('indeterminate', 'key not fetched');
      const d = r.json;
      const k =
        (typeof d.kty === 'string' ? jwkKey(d) : null) ??
        (isObj(d.publicKeyJwk) ? jwkKey(d.publicKeyJwk) : null) ??
        (typeof d.publicKeyMultibase === 'string' ? multikey(d.publicKeyMultibase) : null);
      if (!k) throw new Stop('indeterminate', 'key unreadable');
      return k;
    }
    throw new Stop('indeterminate', 'key not resolvable');
  }

  /** Revocation and status lists: reused for at most 24 h, 256 of them, with when they were fetched. */
  private async cached(url: string, get: (u: string) => Promise<Fetched>): Promise<Fetched> {
    const ttl = Math.min(this.o.cacheMs ?? 86_400_000, 86_400_000);
    const hit = this.cache.get(url);
    if (hit && this.now() - hit.at < ttl) return hit.value;
    const value = await get(url);
    if (value.ok) {
      if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(url, { at: this.now(), value });
    }
    return value;
  }
}
