import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import worker, {
  isTrustedForwardedUrl,
  parseBearerToken,
  stripCookieName,
  validateApiPath,
  verifySsoAssertionToken,
} from '../../worker';
import { onRequest as onApiRequest } from '../../functions/api/[[path]]';
import { onRequest as onWeatherRequest, isValidStationId } from '../../functions/api/weather';
import { onRequest as onMediaRequest } from '../../functions/media/[[path]]';
import { onRequest as onUploadsRequest } from '../../functions/uploads/[[path]]';

function makeSsoAssertion(
  payloadOverrides: Record<string, unknown> = {},
  secret = 'test-sso-secret-at-least-32-chars-long!'
): string {
  const now = Date.now();
  const payload = {
    v: 1,
    iss: 'cnsh.life',
    aud: 'cnsh.space',
    uid: 'user-123',
    email: 'student@g.cnees.kr',
    ev: true,
    iat: now,
    exp: now + 60000,
    ...payloadOverrides,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${sig}`;
}

function assertSecurityHeaders(res: Response) {
  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
}

describe('Edge, Proxy, Infra, and CI Security Fixes', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('[H-3] Fail-closed EDGE_SECRET enforcement', () => {
    const baseEnv = {
      BACKEND_URL: 'https://api-community.qpi.digital',
    };

    it('returns 503 across worker and Pages Functions when EDGE_SECRET is missing', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const workerApiRes = await worker.fetch(new Request('https://cnsh.space/api/posts'), {
        ...baseEnv,
        ASSETS: { fetch: vi.fn() },
      });
      expect(workerApiRes.status).toBe(503);
      assertSecurityHeaders(workerApiRes);

      const workerUploadRes = await worker.fetch(new Request('https://cnsh.space/uploads/images/a.png'), {
        ...baseEnv,
        ASSETS: { fetch: vi.fn() },
      });
      expect(workerUploadRes.status).toBe(503);
      assertSecurityHeaders(workerUploadRes);

      const pagesApiRes = await onApiRequest({
        request: new Request('https://cnsh.space/api/posts'),
        env: baseEnv,
      });
      expect(pagesApiRes.status).toBe(503);
      assertSecurityHeaders(pagesApiRes);

      const pagesMediaRes = await onMediaRequest({
        request: new Request('https://cnsh.space/media/videos/v.mp4'),
        env: baseEnv,
      });
      expect(pagesMediaRes.status).toBe(503);
      assertSecurityHeaders(pagesMediaRes);

      const pagesUploadsRes = await onUploadsRequest({
        request: new Request('https://cnsh.space/uploads/images/a.png'),
        env: baseEnv,
      });
      expect(pagesUploadsRes.status).toBe(503);
      assertSecurityHeaders(pagesUploadsRes);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows missing EDGE_SECRET only with explicit DEV_ALLOW_NO_EDGE_SECRET=true and loopback BACKEND_URL', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

      const resAllowed = await onApiRequest({
        request: new Request('http://localhost:8787/api/time'),
        env: {
          BACKEND_URL: 'http://127.0.0.1:3000',
          DEV_ALLOW_NO_EDGE_SECRET: 'true',
        },
      });
      expect(resAllowed.status).toBe(200);

      const resBlockedRemote = await onApiRequest({
        request: new Request('https://cnsh.space/api/time'),
        env: {
          BACKEND_URL: 'https://api-community.qpi.digital',
          DEV_ALLOW_NO_EDGE_SECRET: 'true',
        },
      });
      expect(resBlockedRemote.status).toBe(503);
    });
  });

  describe('[M-13] Edge JWT, Bearer case-insensitivity, session cookie & assertion handling', () => {
    it('parses Bearer scheme case-insensitively and rejects malformed Authorization values', () => {
      expect(parseBearerToken('Bearer abc.def.ghi')).toEqual({
        hasAuthHeader: true,
        schemeValid: true,
        token: 'abc.def.ghi',
      });
      expect(parseBearerToken('bearer   abc.def.ghi')).toEqual({
        hasAuthHeader: true,
        schemeValid: true,
        token: 'abc.def.ghi',
      });
      expect(parseBearerToken('BEARER tok')).toEqual({
        hasAuthHeader: true,
        schemeValid: true,
        token: 'tok',
      });
      expect(parseBearerToken('bearer   ')).toEqual({
        hasAuthHeader: true,
        schemeValid: false,
        token: null,
      });
      expect(parseBearerToken('Basic dXNlcjpwYXNz')).toEqual({
        hasAuthHeader: true,
        schemeValid: false,
        token: null,
      });
      expect(parseBearerToken(null)).toEqual({
        hasAuthHeader: false,
        schemeValid: false,
        token: null,
      });
    });

    it('blocks POST with invalid lowercase bearer token even when unverified cnsh_session cookie is present', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const req = new Request('https://cnsh.space/api/posts', {
        method: 'POST',
        headers: {
          Authorization: 'bearer not-a-valid-jwt',
          Cookie: 'cnsh_session=forged-cookie; other=1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'test' }),
      });

      const res = await worker.fetch(req, {
        EDGE_SECRET: 'edge-secret-123',
        ASSETS: { fetch: vi.fn() },
      });

      expect(res.status).toBe(401);
      assertSecurityHeaders(res);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('blocks POST with non-Bearer Authorization scheme even when __Secure-knoblab_session cookie is present', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const req = new Request('https://cnsh.space/api/posts', {
        method: 'POST',
        headers: {
          Authorization: 'Basic YWRtaW46YWRtaW4=',
          Cookie: '__Secure-knoblab_session=1',
        },
      });

      const res = await onApiRequest({
        request: req,
        env: { EDGE_SECRET: 'edge-secret-123' },
      });

      expect(res.status).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('strips both Authorization and knoblab_token cookie on GET when token verification fails', async () => {
      let forwardedHeaders: Headers | null = null;
      globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        if (input instanceof Request) {
          forwardedHeaders = input.headers;
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      });

      const req = new Request('https://cnsh.space/api/posts', {
        method: 'GET',
        headers: {
          Authorization: 'bearer invalid.jwt',
          Cookie: 'knoblab_token=bad.jwt.value; theme=light',
        },
      });

      const res = await onApiRequest({
        request: req,
        env: { EDGE_SECRET: 'edge-secret-123' },
      });

      expect(res.status).toBe(200);
      expect(forwardedHeaders).not.toBeNull();
      expect(forwardedHeaders!.get('Authorization')).toBeNull();
      expect(forwardedHeaders!.get('Cookie')).toBe('theme=light');
    });

    it('validates Bearer assertion:... tokens cleanly and blocks invalid assertions on POST', async () => {
      const secret = 'test-sso-secret-at-least-32-chars-long!';
      const validAssertion = makeSsoAssertion({}, secret);
      const validCheck = await verifySsoAssertionToken(validAssertion, secret);
      expect(validCheck.valid).toBe(true);
      expect(validCheck.hmacVerified).toBe(true);
      expect(validCheck.uid).toBe('user-123');

      const wrongSigAssertion = makeSsoAssertion({}, 'wrong-secret-at-least-32-chars-long!!');
      const invalidCheck = await verifySsoAssertionToken(wrongSigAssertion, secret);
      expect(invalidCheck.valid).toBe(false);

      // Fail closed when SSO_TICKET_SECRET is empty or < 32 chars
      expect(await verifySsoAssertionToken(validAssertion, '')).toEqual({
        valid: false,
        hmacVerified: false,
      });
      expect(await verifySsoAssertionToken(validAssertion, 'short-secret-16chars')).toEqual({
        valid: false,
        hmacVerified: false,
      });

      let forwardedHeaders: Headers | null = null;
      globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        if (input instanceof Request) {
          forwardedHeaders = input.headers;
        }
        return Promise.resolve(new Response('ok', { status: 200 }));
      });

      const okRes = await worker.fetch(
        new Request('https://cnsh.space/api/posts', {
          method: 'POST',
          headers: {
            Authorization: `bearer assertion:${validAssertion}`,
          },
          body: '{}',
        }),
        {
          EDGE_SECRET: 'edge-secret-123',
          SSO_TICKET_SECRET: secret,
          ASSETS: { fetch: vi.fn() },
        }
      );
      expect(okRes.status).toBe(200);
      expect(forwardedHeaders!.get('Authorization')).toBe(`Bearer assertion:${validAssertion}`);
      expect(forwardedHeaders!.get('X-User-Uid')).toBe('user-123');
      expect(forwardedHeaders!.get('X-User-Email')).toBe('student@g.cnees.kr');

      const badRes = await worker.fetch(
        new Request('https://cnsh.space/api/posts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer assertion:${wrongSigAssertion}`,
            Cookie: 'knoblab_session=unverified',
          },
          body: '{}',
        }),
        {
          EDGE_SECRET: 'edge-secret-123',
          SSO_TICKET_SECRET: secret,
          ASSETS: { fetch: vi.fn() },
        }
      );
      expect(badRes.status).toBe(401);
    });

    it('stripCookieName removes target cookie cleanly', () => {
      expect(stripCookieName('a=1; knoblab_token=secret; b=2', 'knoblab_token')).toBe('a=1; b=2');
      expect(stripCookieName('knoblab_token=secret', 'knoblab_token')).toBe('');
    });
  });

  describe('[M-14] X-Forwarded-Host / X-Forwarded-Origin allowlist validation', () => {
    it('accepts canonical domains, localhost, 127.0.0.1, and env.PUBLIC_ORIGIN', () => {
      expect(isTrustedForwardedUrl(new URL('https://cnsh.space/api/me'))).toBe(true);
      expect(isTrustedForwardedUrl(new URL('https://www.cnsh.space/api/me'))).toBe(true);
      expect(isTrustedForwardedUrl(new URL('https://asteris.kro.kr/api/me'))).toBe(true);
      expect(isTrustedForwardedUrl(new URL('https://asterisk-community.knoblab.xyz/api/me'))).toBe(true);
      expect(isTrustedForwardedUrl(new URL('https://community.knoblab.digital/api/me'))).toBe(true);
      expect(isTrustedForwardedUrl(new URL('https://api-community.qpi.digital/api/me'))).toBe(true);
      expect(isTrustedForwardedUrl(new URL('http://localhost:5173/api/me'))).toBe(true);
      expect(isTrustedForwardedUrl(new URL('http://127.0.0.1:8787/api/me'))).toBe(true);
      expect(
        isTrustedForwardedUrl(new URL('https://custom.example.org/api/me'), 'https://custom.example.org')
      ).toBe(true);
    });

    it('rejects untrusted preview domains, spoofed subdomains, and non-HTTPS prod origins', () => {
      expect(isTrustedForwardedUrl(new URL('https://evil.com/api/me'))).toBe(false);
      expect(isTrustedForwardedUrl(new URL('https://preview.pages.dev/api/me'))).toBe(false);
      expect(isTrustedForwardedUrl(new URL('https://community.workers.dev/api/me'))).toBe(false);
      expect(isTrustedForwardedUrl(new URL('https://cnsh.space.evil.com/api/me'))).toBe(false);
      expect(isTrustedForwardedUrl(new URL('http://cnsh.space/api/me'))).toBe(false);
    });

    it('does not forward untrusted X-Forwarded-Host / X-Forwarded-Origin to backend', async () => {
      let forwardedHeaders: Headers | null = null;
      globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        if (input instanceof Request) {
          forwardedHeaders = input.headers;
        }
        return Promise.resolve(new Response('ok', { status: 200 }));
      });

      await onApiRequest({
        request: new Request('https://evil-preview.pages.dev/api/time', {
          headers: {
            'X-Forwarded-Host': 'spoofed.evil.com',
            'X-Forwarded-Origin': 'https://spoofed.evil.com',
          },
        }),
        env: { EDGE_SECRET: 'edge-secret-123' },
      });

      expect(forwardedHeaders!.get('X-Forwarded-Host')).toBeNull();
      expect(forwardedHeaders!.get('X-Forwarded-Origin')).toBeNull();
      expect(forwardedHeaders!.get('X-Forwarded-Proto')).toBeNull();
    });
  });

  describe('[M-15 & M-19] Weather endpoint fail-closed key & station validation', () => {
    it('fails closed with 503 when WEATHER_API_KEY is unset', async () => {
      const res = await onWeatherRequest({
        request: new Request('https://cnsh.space/api/weather?stn=133'),
        env: {},
      });
      expect(res.status).toBe(503);
      assertSecurityHeaders(res);

      const workerRes = await worker.fetch(new Request('https://cnsh.space/api/weather?stn=133'), {
        EDGE_SECRET: 'edge-secret-123',
        ASSETS: { fetch: vi.fn() },
      });
      expect(workerRes.status).toBe(503);
      assertSecurityHeaders(workerRes);
    });

    it('rejects invalid station IDs with 400 and accepts 1-5 digit IDs', async () => {
      expect(isValidStationId('133')).toBe(true);
      expect(isValidStationId('1')).toBe(true);
      expect(isValidStationId('12345')).toBe(true);
      expect(isValidStationId('')).toBe(false);
      expect(isValidStationId('123456')).toBe(false);
      expect(isValidStationId('133abc')).toBe(false);
      expect(isValidStationId('133&authKey=x')).toBe(false);

      const res = await onWeatherRequest({
        request: new Request('https://cnsh.space/api/weather?stn=133abc'),
        env: { WEATHER_API_KEY: 'dummy-key' },
      });
      expect(res.status).toBe(400);
      assertSecurityHeaders(res);
    });

    it('returns generic 500 JSON without leaking err.message on upstream error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('secret internal upstream stack detail'));
      const res = await onWeatherRequest({
        request: new Request('https://cnsh.space/api/weather?stn=133'),
        env: { WEATHER_API_KEY: 'dummy-key' },
      });
      expect(res.status).toBe(500);
      assertSecurityHeaders(res);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Failed to fetch weather');
      expect(body.error).not.toContain('secret internal');
    });
  });

  describe('[M-16 & M-18] Worker parity, header stripping, path traversal, and security headers', () => {
    it('strips Cookie, Authorization, X-User-*, X-Sso-Ticket-Secret, X-Meal-Api-Key, and X-Forwarded-* on /uploads/ and /media/', async () => {
      let capturedHeaders: Headers | null = null;
      globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        if (input instanceof Request) {
          capturedHeaders = input.headers;
        }
        return Promise.resolve(new Response('imgbytes', { status: 200 }));
      });

      const dirtyHeaders = {
        Cookie: 'cnsh_session=secret',
        Authorization: 'Bearer secret',
        'X-User-Uid': 'admin',
        'X-User-Email': 'admin@cnsh.hs.kr',
        'X-User-Name': 'admin',
        'X-Sso-Ticket-Secret': 'sso-secret',
        'X-Meal-Api-Key': 'meal-secret',
        'X-Forwarded-Host': 'evil.com',
        'X-Forwarded-Origin': 'https://evil.com',
        'X-Forwarded-For': '1.2.3.4',
        'CF-Connecting-IP': '203.0.113.10',
      };

      const res = await worker.fetch(
        new Request('https://cnsh.space/uploads/images/pic.png', { headers: dirtyHeaders }),
        { EDGE_SECRET: 'edge-secret-123', ASSETS: { fetch: vi.fn() } }
      );
      expect(res.status).toBe(200);
      assertSecurityHeaders(res);
      expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");

      expect(capturedHeaders!.get('Cookie')).toBeNull();
      expect(capturedHeaders!.get('Authorization')).toBeNull();
      expect(capturedHeaders!.get('X-User-Uid')).toBeNull();
      expect(capturedHeaders!.get('X-User-Email')).toBeNull();
      expect(capturedHeaders!.get('X-User-Name')).toBeNull();
      expect(capturedHeaders!.get('X-Sso-Ticket-Secret')).toBeNull();
      expect(capturedHeaders!.get('X-Meal-Api-Key')).toBeNull();
      expect(capturedHeaders!.get('X-Forwarded-Host')).toBeNull();
      expect(capturedHeaders!.get('X-Forwarded-Origin')).toBeNull();
      expect(capturedHeaders!.get('X-Forwarded-For')).toBeNull();
      expect(capturedHeaders!.get('X-Real-Client-Ip')).toBe('203.0.113.10');
      expect(capturedHeaders!.get('X-Edge-Verified')).toBe('edge-secret-123');
    });

    it('never leaks X-Meal-Api-Key or X-Sso-Ticket-Secret on outbound /api proxy requests', async () => {
      let capturedHeaders: Headers | null = null;
      globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        if (input instanceof Request) {
          capturedHeaders = input.headers;
        }
        return Promise.resolve(new Response('ok', { status: 200 }));
      });

      const res = await worker.fetch(new Request('https://cnsh.space/api/timetable'), {
        EDGE_SECRET: 'edge-secret-123',
        MEAL_API_KEY: 'meal-key-xyz',
        SSO_TICKET_SECRET: 'sso-secret-should-not-leak-0123456789abcdef',
        ASSETS: { fetch: vi.fn() },
      });
      expect(res.status).toBe(200);
      assertSecurityHeaders(res);
      expect(capturedHeaders!.get('X-Meal-Api-Key')).toBeNull();
      expect(capturedHeaders!.get('X-Sso-Ticket-Secret')).toBeNull();
      expect(capturedHeaders!.get('X-Edge-Verified')).toBe('edge-secret-123');
    });

    it('rejects double-encoded traversal (%25) and // prefix bypasses', async () => {
      expect(validateApiPath('/api/posts/%252e%252e/admin').ok).toBe(false);
      expect(validateApiPath('//api/me').ok).toBe(false);
      expect(validateApiPath('/api//posts').ok).toBe(false);
      expect(validateApiPath('/api/./posts').ok).toBe(false);
      expect(validateApiPath('/api/posts').ok).toBe(true);

      const assetsFetch = vi.fn();
      const doubleSlashRes = await worker.fetch(new Request('https://cnsh.space//api/me'), {
        EDGE_SECRET: 'edge-secret-123',
        ASSETS: { fetch: assetsFetch },
      });
      expect(doubleSlashRes.status).toBe(400);
      expect(assetsFetch).not.toHaveBeenCalled();

      const doubleEncodedRes = await onUploadsRequest({
        request: new Request('https://cnsh.space/uploads/images/%252e%252e%252fsecret.png'),
        env: { EDGE_SECRET: 'edge-secret-123' },
      });
      expect(doubleEncodedRes.status).toBe(400);
    });

    it('adds form-action and Strict-Transport-Security on static assets and sanitizes 502 errors', async () => {
      const assetRes = await worker.fetch(new Request('https://cnsh.space/'), {
        EDGE_SECRET: 'edge-secret-123',
        ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('<html></html>', { status: 200 })) },
      });
      assertSecurityHeaders(assetRes);
      expect(assetRes.headers.get('Content-Security-Policy')).toContain("form-action 'self';");

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('internal-host-10.0.0.5-down'));
      const badGw = await worker.fetch(new Request('https://cnsh.space/api/time'), {
        EDGE_SECRET: 'edge-secret-123',
        ASSETS: { fetch: vi.fn() },
      });
      expect(badGw.status).toBe(502);
      assertSecurityHeaders(badGw);
      const body = (await badGw.json()) as { error: string };
      expect(body.error).toBe('Backend unreachable');
    });
  });

  describe('[Config & CI Hardening] Static checks on vite.config.ts, public/_headers, nginx.conf, sync-frontend.yml', () => {
    const rootDir = path.resolve(__dirname, '../..');

    it('vite.config.ts has no VITE_EDGE_SECRET fallback and no hardcoded KMA key', () => {
      const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
      expect(viteConfig).not.toContain('VITE_EDGE_SECRET');
      expect(viteConfig).not.toContain('SSCp_h23QfGgqf4dt1Hxog');
    });

    it('public/_headers includes form-action self and Strict-Transport-Security', () => {
      const headersFile = fs.readFileSync(path.join(rootDir, 'public/_headers'), 'utf8');
      expect(headersFile).toContain("form-action 'self';");
      expect(headersFile).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    });

    it('server/nginx.conf includes hardening directives and preserves headers in every location', () => {
      const nginxConf = fs.readFileSync(path.join(rootDir, 'server/nginx.conf'), 'utf8');
      expect(nginxConf).toContain('server_tokens off;');
      expect(nginxConf).toContain('disable_symlinks on;');
      expect(nginxConf).toContain('location ~ /\\.');
      expect(nginxConf).toContain('Strict-Transport-Security');
      expect(nginxConf).not.toContain('client_max_body_size 45M');
      expect(nginxConf).toContain('client_max_body_size 25M');

      const cspMatches = nginxConf.match(/add_header Content-Security-Policy "default-src 'none'; sandbox" always;/g) || [];
      expect(cspMatches.length).toBeGreaterThanOrEqual(6);

      const xfoMatches = nginxConf.match(/add_header X-Frame-Options "DENY" always;/g) || [];
      expect(xfoMatches.length).toBeGreaterThanOrEqual(7);
    });

    it('.github/workflows/sync-frontend.yml includes permissions, concurrency, persist-credentials: false, and secret exclusions', () => {
      const workflow = fs.readFileSync(path.join(rootDir, '.github/workflows/sync-frontend.yml'), 'utf8');
      expect(workflow).toContain('permissions:');
      expect(workflow).toContain('contents: read');
      expect(workflow).toContain('concurrency:');
      expect(workflow).toContain('persist-credentials: false');
      expect(workflow).toContain("--exclude='vite.config.ts'");
      expect(workflow).toContain("--exclude='*serviceAccount*.json'");
      expect(workflow).toContain("--exclude='.env*'");
      expect(workflow).toContain("--exclude='server'");
    });
  });
});
