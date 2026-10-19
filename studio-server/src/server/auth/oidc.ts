// The Studio Server as an OpenID Connect Relying Party (4.2.1, plan §3.1, §3.5, §3.6; ADR 0027), on `openid-client`
// (a certified RP) and `jose`, both pinned to exact versions. The identity comes from the provider; the rights do not.
//   - login: Authorization Code + PKCE S256 + state + nonce, the id_token fully checked by openid-client;
//   - refresh: the session's refresh token, to learn within R whether the provider still knows the user;
//   - Bearer: an access token for the CLI and MCP, a JWT checked by JWKS (issuer, audience, algorithms, lifetime);
//   - back-channel logout: a logout token checked per OpenID Connect Back-Channel Logout 1.0, §2.4–2.6.
import { createRemoteJWKSet, decodeProtectedHeader, type JWTPayload, jwtVerify } from 'jose';
import * as client from 'openid-client';

/** Signatures accepted, never `none` nor a shared-secret HMAC (plan §3.1). */
const ALGORITHMS = ['RS256', 'PS256', 'ES256', 'EdDSA'];
const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** The audience the CLI's and MCP's access tokens must carry (an audience mapper on Keycloak). */
  audience: string;
  /** The public client of the CLI (device flow), told to the CLI by `/auth/cli`. */
  cliClientId?: string;
  scopes?: string;
  /** The longest an access token may live (`exp − iat`), 5 min by default, 15 min at most (plan §3.5). */
  maxTokenSeconds?: number;
  /** Tests and a local provider over http only. */
  allowInsecure?: boolean;
}

export interface Identity {
  iss: string;
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  sid?: string;
}

/** A refusal of the provider that means the session is over (as opposed to the provider being unreachable). */
export class DefinitiveRefusal extends Error {}

export class Oidc {
  private constructor(
    readonly settings: OidcSettings,
    private config: client.Configuration,
    private jwks: ReturnType<typeof createRemoteJWKSet>,
  ) {}

  static async discover(s: OidcSettings): Promise<Oidc> {
    if (s.maxTokenSeconds !== undefined && (s.maxTokenSeconds < 30 || s.maxTokenSeconds > 900))
      throw new Error('oidc.maxTokenSeconds is between 30 and 900');
    const config = await client.discovery(
      new URL(s.issuer),
      s.clientId,
      undefined,
      client.ClientSecretBasic(s.clientSecret),
      s.allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined,
    );
    const meta = config.serverMetadata();
    if (!meta.jwks_uri) throw new Error('the provider publishes no jwks_uri');
    // Keys refetched once when a `kid` is unknown, never more than every 30 s (jose's cooldown).
    const jwks = createRemoteJWKSet(new URL(meta.jwks_uri), { cooldownDuration: 30_000 });
    return new Oidc(s, config, jwks);
  }

  get issuer(): string {
    return this.config.serverMetadata().issuer;
  }

  /** The provider's URL to send a browser to, and what the callback must check. */
  async begin(redirectUri: string): Promise<{ url: string; state: string; nonce: string; verifier: string }> {
    const verifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const url = client.buildAuthorizationUrl(this.config, {
      redirect_uri: redirectUri,
      scope: this.settings.scopes ?? 'openid email profile',
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url: url.href, state, nonce, verifier };
  }

  /** The callback: the code exchanged with PKCE, the id_token checked (iss, aud, azp, exp, iat, nonce, signature). */
  async finish(
    currentUrl: URL,
    checks: { state: string; nonce: string; verifier: string },
  ): Promise<{ identity: Identity; refreshToken?: string; idToken?: string }> {
    const tokens = await client.authorizationCodeGrant(this.config, currentUrl, {
      pkceCodeVerifier: checks.verifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
    const c = tokens.claims();
    if (!c) throw new Error('no id_token');
    return {
      identity: {
        iss: String(c.iss),
        sub: String(c.sub),
        email: typeof c.email === 'string' ? c.email : undefined,
        emailVerified: c.email_verified === true,
        name: typeof c.name === 'string' ? c.name : undefined,
        sid: typeof c.sid === 'string' ? c.sid : undefined,
      },
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
    };
  }

  /**
   * Asks the provider whether the session still stands. A refusal of the grant (`invalid_grant`, 400/401) is
   * definitive; a network failure, a timeout or a 5xx is not (plan §3.6).
   */
  async refresh(refreshToken: string): Promise<{ refreshToken?: string }> {
    try {
      const t = await client.refreshTokenGrant(this.config, refreshToken);
      return { refreshToken: t.refresh_token };
    } catch (e) {
      const err = e as { error?: string; status?: number; code?: string };
      // `invalid_client` is our own configuration (a secret rotated badly), not the user's session: transient.
      if (err.error === 'invalid_client') throw e;
      if (err.error === 'invalid_grant' || err.status === 400 || err.status === 401)
        throw new DefinitiveRefusal(err.error ?? 'refused');
      throw e;
    }
  }

  endSessionUrl(o: { idTokenHint?: string; postLogoutRedirectUri: string }): string | undefined {
    if (!this.config.serverMetadata().end_session_endpoint) return undefined;
    return client.buildEndSessionUrl(this.config, {
      ...(o.idTokenHint ? { id_token_hint: o.idTokenHint } : {}),
      post_logout_redirect_uri: o.postLogoutRedirectUri,
    }).href;
  }

  /**
   * A Bearer access token (policy B): signature by JWKS, issuer, our audience, a lifetime of at most
   * `maxTokenSeconds`. An id_token presented as a Bearer is refused (`nonce`, or `typ` ID, or our client as audience
   * without our API audience).
   */
  async verifyAccessToken(token: string): Promise<{ iss: string; sub: string; iat: number; exp: number }> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.settings.audience,
      algorithms: ALGORITHMS,
      requiredClaims: ['exp', 'iat', 'sub'],
    });
    if (payload.nonce !== undefined || (payload as { typ?: string }).typ === 'ID')
      throw new Error('an id_token is not an access token');
    const life = Number(payload.exp) - Number(payload.iat);
    if (!(life > 0) || life > (this.settings.maxTokenSeconds ?? 300))
      throw new Error(`the token lives ${life} s, longer than allowed`);
    return {
      iss: String(payload.iss),
      sub: String(payload.sub),
      iat: Number(payload.iat) * 1000,
      exp: Number(payload.exp) * 1000,
    };
  }

  /** A back-channel logout token (policy D): returns what to end. */
  async verifyLogoutToken(token: string): Promise<{ sid?: string; sub?: string; jti: string; exp: number }> {
    // §2.4: `typ` is `logout+jwt` when the provider sets one (Keycloak does); any other `typ` is another token.
    const typ = decodeProtectedHeader(token).typ;
    if (typ !== undefined && typ.toLowerCase() !== 'logout+jwt' && typ.toLowerCase() !== 'jwt')
      throw new Error('not a logout token');
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.settings.clientId,
      algorithms: ALGORITHMS,
      requiredClaims: ['iat', 'jti'],
      maxTokenAge: '5m',
    });
    const events = (payload as JWTPayload & { events?: Record<string, unknown> }).events;
    const ev =
      events && typeof events === 'object' ? (events as Record<string, unknown>)[BACKCHANNEL_EVENT] : undefined;
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) throw new Error('not a back-channel logout token');
    if (payload.nonce !== undefined) throw new Error('a logout token carries no nonce');
    const sid = typeof payload.sid === 'string' ? payload.sid : undefined;
    const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!sid && !sub) throw new Error('a logout token names a sid or a sub');
    return { sid, sub, jti: String(payload.jti), exp: Number(payload.exp ?? Number(payload.iat) + 300) * 1000 };
  }
}
