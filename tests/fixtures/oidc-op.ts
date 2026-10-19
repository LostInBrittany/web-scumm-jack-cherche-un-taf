// A small OpenID provider for the Studio Server's tests (4.2.1 PR 5): discovery, JWKS (ES256), an authorization
// endpoint that approves the user the test names, a token endpoint (authorization_code with PKCE S256 and client
// authentication; refresh_token), end_session, and helpers to mint access tokens and logout tokens. It answers like a
// provider, refusals included (invalid_grant for a disabled user, 503 when "down").
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';

export interface TestUser {
  sub: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
}

export class TestOp {
  issuer = '';
  user: TestUser = { sub: 'u-lea', email: 'lea@example.org', emailVerified: true, name: 'Léa' };
  disabled = new Set<string>();
  down = false;
  sid = 'sid-1';
  /** Like Keycloak with "Revoke Refresh Token": a refresh token works once. */
  strictRotation = false;
  refreshCalls = 0;
  refreshDelayMs = 0;
  /** Switches for the tests of the edges: no JWKS announced, no end-session endpoint, no id_token at the callback. */
  noJwks = false;
  noEndSession = false;
  omitIdToken = false;
  /** The token endpoint's answer to a refresh of the confidential client, when set (status, JSON body). */
  refreshAnswer: { status: number; body: Record<string, unknown> } | undefined;
  private server!: Server;
  private key!: CryptoKey;
  private jwk!: JWK;
  private codes = new Map<string, { sub: string; nonce: string; challenge: string; redirect: string }>();
  private refresh = new Map<string, string>();
  private devices = new Map<string, { polls: number }>();
  constructor(
    readonly clientId = 'studio',
    readonly clientSecret = 'studio-secret-123',
    readonly audience = 'studio-api',
  ) {}

  async start(): Promise<this> {
    const kp = await generateKeyPair('ES256');
    this.key = kp.privateKey as CryptoKey;
    this.jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((ok) => this.server.listen(0, '127.0.0.1', ok));
    this.issuer = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }
  stop() {
    this.server.close();
  }

  private json(res: import('node:http').ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private async handle(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
    const url = new URL(req.url ?? '/', this.issuer);
    if (url.pathname === '/.well-known/openid-configuration')
      return this.json(res, 200, {
        issuer: this.issuer,
        authorization_endpoint: `${this.issuer}/authorize`,
        token_endpoint: `${this.issuer}/token`,
        ...(this.noJwks ? {} : { jwks_uri: `${this.issuer}/jwks` }),
        ...(this.noEndSession ? {} : { end_session_endpoint: `${this.issuer}/logout` }),
        device_authorization_endpoint: `${this.issuer}/device`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
        code_challenge_methods_supported: ['S256'],
        backchannel_logout_supported: true,
        backchannel_logout_session_supported: true,
      });
    if (url.pathname === '/jwks') return this.json(res, 200, { keys: [this.jwk] });
    if (url.pathname === '/authorize') {
      const code = randomUUID();
      this.codes.set(code, {
        sub: this.user.sub,
        nonce: url.searchParams.get('nonce') ?? '',
        challenge: url.searchParams.get('code_challenge') ?? '',
        redirect: url.searchParams.get('redirect_uri') ?? '',
      });
      const to = new URL(url.searchParams.get('redirect_uri')!);
      to.searchParams.set('code', code);
      to.searchParams.set('state', url.searchParams.get('state') ?? '');
      to.searchParams.set('iss', this.issuer);
      res.writeHead(302, { location: to.href });
      return res.end();
    }
    if (url.pathname === '/device' && req.method === 'POST') {
      const code = randomUUID();
      this.devices.set(code, { polls: 0 });
      return this.json(res, 200, {
        device_code: code,
        user_code: 'WXYZ-1234',
        verification_uri: `${this.issuer}/activate`,
        expires_in: 60,
        interval: 1,
      });
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      if (this.down) return this.json(res, 503, { error: 'temporarily_unavailable' });
      let raw = '';
      for await (const c of req) raw += c;
      const p = new URLSearchParams(raw);
      // The CLI is a public client: no secret, its id in the body.
      if (p.get('client_id') === 'web-scumm-cli') {
        if (p.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
          const d = this.devices.get(p.get('device_code') ?? '');
          if (!d) return this.json(res, 400, { error: 'expired_token' });
          if (d.polls++ === 0) return this.json(res, 400, { error: 'authorization_pending' });
          const rt = randomUUID();
          this.refresh.set(rt, this.user.sub);
          return this.json(res, 200, {
            token_type: 'Bearer',
            access_token: await this.accessToken(),
            refresh_token: rt,
            expires_in: 300,
          });
        }
        if (p.get('grant_type') === 'refresh_token') {
          const sub = this.refresh.get(p.get('refresh_token') ?? '');
          if (!sub || this.disabled.has(sub)) return this.json(res, 400, { error: 'invalid_grant' });
          return this.json(res, 200, {
            token_type: 'Bearer',
            access_token: await this.accessToken({ sub }),
            expires_in: 300,
          });
        }
        return this.json(res, 400, { error: 'unsupported_grant_type' });
      }
      const basic = Buffer.from(String(req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString();
      const [id, secret] = basic.split(':').map(decodeURIComponent);
      if (id !== this.clientId || secret !== this.clientSecret) return this.json(res, 401, { error: 'invalid_client' });
      if (p.get('grant_type') === 'authorization_code') {
        const c = this.codes.get(p.get('code') ?? '');
        this.codes.delete(p.get('code') ?? '');
        const verifier = p.get('code_verifier') ?? '';
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        if (!c || c.challenge !== challenge || c.redirect !== p.get('redirect_uri'))
          return this.json(res, 400, { error: 'invalid_grant' });
        const rt = randomUUID();
        this.refresh.set(rt, c.sub);
        return this.json(res, 200, {
          token_type: 'Bearer',
          access_token: await this.accessToken({ sub: c.sub }),
          ...(this.omitIdToken ? {} : { id_token: await this.idToken(c.sub, c.nonce) }),
          refresh_token: rt,
          expires_in: 300,
        });
      }
      if (p.get('grant_type') === 'refresh_token' && this.refreshAnswer)
        return this.json(res, this.refreshAnswer.status, this.refreshAnswer.body);
      if (p.get('grant_type') === 'refresh_token') {
        this.refreshCalls++;
        if (this.refreshDelayMs) await new Promise((ok) => setTimeout(ok, this.refreshDelayMs));
        const sub = this.refresh.get(p.get('refresh_token') ?? '');
        if (!sub || this.disabled.has(sub)) return this.json(res, 400, { error: 'invalid_grant' });
        if (this.strictRotation) this.refresh.delete(p.get('refresh_token') ?? '');
        const rt = randomUUID();
        this.refresh.set(rt, sub);
        return this.json(res, 200, {
          token_type: 'Bearer',
          access_token: await this.accessToken({ sub }),
          refresh_token: rt,
          expires_in: 300,
        });
      }
      return this.json(res, 400, { error: 'unsupported_grant_type' });
    }
    res.writeHead(404);
    res.end();
  }

  private sign(claims: Record<string, unknown>, o: { typ?: string; life?: number; iat?: number } = {}) {
    const iat = o.iat ?? Math.floor(Date.now() / 1000);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'k1', ...(o.typ ? { typ: o.typ } : {}) })
      .setIssuer(this.issuer)
      .setIssuedAt(iat)
      .setExpirationTime(iat + (o.life ?? 300))
      .sign(this.key);
  }

  /** A token signed by this provider with exactly these claims and header type (no lifetime added). */
  signRaw(claims: Record<string, unknown>, typ?: string) {
    return new SignJWT({ iss: this.issuer, ...claims })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1', ...(typ ? { typ } : {}) })
      .sign(this.key);
  }

  idToken(sub: string, nonce: string) {
    const u = this.user;
    return this.sign({
      sub,
      aud: this.clientId,
      azp: this.clientId,
      nonce,
      email: u.email,
      email_verified: u.emailVerified ?? true,
      name: u.name,
      sid: this.sid,
    });
  }

  accessToken(o: { sub?: string; aud?: string; life?: number; iat?: number; extra?: Record<string, unknown> } = {}) {
    return this.sign(
      { sub: o.sub ?? this.user.sub, aud: o.aud ?? this.audience, azp: 'web-scumm-cli', ...(o.extra ?? {}) },
      { life: o.life, iat: o.iat },
    );
  }

  logoutToken(o: { sid?: string; sub?: string; jti?: string; nonce?: string; events?: boolean } = {}) {
    return this.sign(
      {
        aud: this.clientId,
        jti: o.jti ?? randomUUID(),
        ...(o.sid ? { sid: o.sid } : {}),
        ...(o.sub ? { sub: o.sub } : {}),
        ...(o.nonce ? { nonce: o.nonce } : {}),
        ...(o.events === false ? {} : { events: { 'http://schemas.openid.net/event/backchannel-logout': {} } }),
      },
      { typ: 'logout+jwt' },
    );
  }
}
