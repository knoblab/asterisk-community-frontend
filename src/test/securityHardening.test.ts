import { describe, it, expect } from 'vitest';
import { getSafeImageViewerSrc, isValidReturnUrl } from '../pages/ImageViewerPage';
import { getSafeAvatarUrl } from '../components/common/UserAvatar';
import { getImageViewerUrl, getSafeImageUrl } from '../components/MarkdownRenderer';

describe('Security Hardening Utilities', () => {
  describe('getSafeImageViewerSrc (DOM XSS / Open Redirect Defense)', () => {
    it('blocks dangerous protocols such as javascript:, data:, and vbscript:', () => {
      expect(getSafeImageViewerSrc('javascript:alert(1)')).toBe('');
      expect(getSafeImageViewerSrc('JAVASCRIPT:alert(document.cookie)')).toBe('');
      expect(getSafeImageViewerSrc('data:text/html,<script>alert(1)</script>')).toBe('');
      expect(getSafeImageViewerSrc('vbscript:msgbox(1)')).toBe('');
    });

    it('blocks protocol-relative URLs and path traversal', () => {
      expect(getSafeImageViewerSrc('//evil.com/phishing.png')).toBe('');
      expect(getSafeImageViewerSrc('/api/uploads/images/../../etc/passwd')).toBe('');
      expect(getSafeImageViewerSrc('/uploads\\..\\secret')).toBe('');
    });

    it('allows valid internal image paths and trusted https URLs', () => {
      expect(getSafeImageViewerSrc('/api/uploads/images/photo_123.webp')).toBe(
        '/api/uploads/images/photo_123.webp',
      );
      expect(getSafeImageViewerSrc('/uploads/images/sample.png')).toBe('/uploads/images/sample.png');
      expect(getSafeImageViewerSrc('https://cdn.qpi.digital/img.jpg')).toBe(
        'https://cdn.qpi.digital/img.jpg',
      );
    });

    it('Constructs safe fallback path from filename and rejects traversal in fallback', () => {
      expect(getSafeImageViewerSrc(null, 'test-image.png')).toBe(
        '/api/uploads/images/test-image.png',
      );
      expect(getSafeImageViewerSrc(null, '../secret.png')).toBe('');
      expect(getSafeImageViewerSrc(null, 'nested/secret.png')).toBe('');
    });

    it('getImageViewerUrl appends returnUrl query parameter cleanly to keep track of originating post', () => {
      expect(getImageViewerUrl('/api/uploads/images/photo.png', '/post/0123456')).toBe(
        '/image/photo.png?returnUrl=%2Fpost%2F0123456',
      );
      expect(getImageViewerUrl('https://example.com/art.png', '/post/0123456')).toContain(
        '&returnUrl=%2Fpost%2F0123456',
      );
      expect(getImageViewerUrl('/api/uploads/images/photo.png')).toBe('/image/photo.png');
    });
  });

  describe('getSafeAvatarUrl (SSRF / IP Tracking Pixel Defense)', () => {
    it('blocks arbitrary external tracking pixel domains and protocol-relative URLs', () => {
      expect(getSafeAvatarUrl('https://evil-tracker.example.com/pixel.gif')).toBeNull();
      expect(getSafeAvatarUrl('http://lh3.googleusercontent.com/a/avatar')).toBeNull();
      expect(getSafeAvatarUrl('//evil-tracker.example.com/pixel.gif')).toBeNull();
      expect(getSafeAvatarUrl('/api/posts')).toBeNull();
      expect(getSafeAvatarUrl('/api/uploads/images/../secret.png')).toBeNull();
    });

    it('allows internal upload image paths and whitelisted avatar hosts', () => {
      expect(getSafeAvatarUrl('/api/uploads/images/avatar_1.webp')).toBe(
        '/api/uploads/images/avatar_1.webp',
      );
      expect(getSafeAvatarUrl('/uploads/images/avatar_2.png')).toBe('/uploads/images/avatar_2.png');
      expect(getSafeAvatarUrl('https://lh3.googleusercontent.com/a/ACg8ocJ_test')).toBe(
        'https://lh3.googleusercontent.com/a/ACg8ocJ_test',
      );
      expect(getSafeAvatarUrl('https://firebasestorage.googleapis.com/v0/b/test')).toBe(
        'https://firebasestorage.googleapis.com/v0/b/test',
      );
      expect(getSafeAvatarUrl('blob:https://sand.qpi.digital/1234-5678')).toBe(
        'blob:https://sand.qpi.digital/1234-5678',
      );
    });
  });

  describe('formatAuthorName (Student ID / PII Masking)', () => {
    it('masks 4-digit student ID when email fallback or student ID nickname is used', async () => {
      const { formatAuthorName } = await import('../utils/member');
      expect(formatAuthorName('cnsh32_1234')).toBe('32기 ****');
      expect(formatAuthorName('cnsh32_****')).toBe('32기 ****');
      expect(formatAuthorName('익명', 'cnsh32_1234@g.cnees.kr')).toBe('32기 ****');
      expect(formatAuthorName('익명', 'cnsh32_****@g.cnees.kr')).toBe('32기 ****');
      expect(formatAuthorName(null, 'cnsh31_5678@g.cnees.kr')).toBe('31기 ****');
      expect(formatAuthorName('홍길동', 'cnsh32_1234@g.cnees.kr')).toBe('홍길동');
      expect(formatAuthorName(undefined, 'teacher@cnsh.hs.kr')).toBe('teacher');
    });
  });

  describe('Admin Security Hardening & Session Verification', () => {
    it('sends X-Admin-Confirm header on permanentDeletePost and permanentDeleteComment', async () => {
      const { permanentDeletePost, permanentDeleteComment } = await import('../services/adminService');
      const fetchSpy = vi.fn().mockImplementation((_url, opts) => {
        const headers = opts.headers;
        const confirmVal = headers instanceof Headers ? headers.get('X-Admin-Confirm') : headers?.['X-Admin-Confirm'];
        return Promise.resolve({
          ok: confirmVal === 'permanent-delete',
          status: 200,
          json: async () => ({ success: true }),
        });
      });
      vi.stubGlobal('fetch', fetchSpy);

      const postRes = await permanentDeletePost('p-123');
      expect(postRes).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/posts/p-123?permanent=true'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );

      const commentRes = await permanentDeleteComment('c-456');
      expect(commentRes).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/comments/c-456?permanent=true'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      vi.restoreAllMocks();
    });

    it('verifyAdminSession returns true for authorized session and false for 403 or empty payload', async () => {
      const { verifyAdminSession } = await import('../services/adminService');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, isAdmin: true, uid: 'admin-1' }),
      }));
      expect(await verifyAdminSession()).toBe(true);

      // Fail-closed: 200 OK with empty json object must NOT grant admin access
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      }));
      expect(await verifyAdminSession()).toBe(false);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      }));
      expect(await verifyAdminSession()).toBe(false);
      vi.restoreAllMocks();
    });

    it('aggregateAdminUsers does not expose plaintext email for default admins', async () => {
      const { aggregateAdminUsers } = await import('../services/adminService');
      const users = aggregateAdminUsers([], []);
      const defaultAdmin = users.find((u) => u.uid === '3BKU2q6GIVg0cgFkM2t238ZE8Zf1');
      expect(defaultAdmin).toBeDefined();
      expect(defaultAdmin?.email).toBeNull();
    });
  });

  describe('isValidReturnUrl (ImageViewer Open Redirect Defense)', () => {
    it('accepts safe relative paths', () => {
      expect(isValidReturnUrl('/post/0123456')).toBe(true);
      expect(isValidReturnUrl('/profile')).toBe(true);
      expect(isValidReturnUrl('/admin/console')).toBe(true);
    });

    it('rejects protocol-relative URLs and absolute URLs', () => {
      expect(isValidReturnUrl('//evil.com')).toBe(false);
      expect(isValidReturnUrl('//evil.com/phishing')).toBe(false);
      expect(isValidReturnUrl('https://evil.com')).toBe(false);
      expect(isValidReturnUrl('http://evil.com')).toBe(false);
      expect(isValidReturnUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects backslash bypasses and invalid inputs', () => {
      expect(isValidReturnUrl('/\\evil.com')).toBe(false);
      expect(isValidReturnUrl('\\evil.com')).toBe(false);
      expect(isValidReturnUrl('/post\\123')).toBe(false);
      expect(isValidReturnUrl(null)).toBe(false);
      expect(isValidReturnUrl(undefined)).toBe(false);
      expect(isValidReturnUrl('')).toBe(false);
    });
  });

  describe('getSafeImageUrl (Markdown CSRF & SSRF Injection Defense)', () => {
    it('allows valid local upload images and remote https images', () => {
      expect(getSafeImageUrl('/api/uploads/images/photo.png')).toBe('/api/uploads/images/photo.png');
      expect(getSafeImageUrl('/uploads/images/sample.webp')).toBe('/uploads/images/sample.webp');
      expect(getSafeImageUrl('https://example.com/pic.jpg')).toBe('https://example.com/pic.jpg');
      expect(getSafeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
      expect(getSafeImageUrl('blob:https://sand.qpi.digital/123')).toBe('blob:https://sand.qpi.digital/123');
    });

    it('strictly blocks state-changing or data-harvesting API endpoints disguised as images', () => {
      expect(getSafeImageUrl('/api/logout')).toBeNull();
      expect(getSafeImageUrl('/api/posts')).toBeNull();
      expect(getSafeImageUrl('/api/users/profile')).toBeNull();
      expect(getSafeImageUrl('/api/timetable')).toBeNull();
      expect(getSafeImageUrl('/api/ai/chat')).toBeNull();
    });

    it('blocks protocol-relative URLs, javascript, and control characters', () => {
      expect(getSafeImageUrl('//evil.com/fake.png')).toBeNull();
      expect(getSafeImageUrl('javascript:alert(1)')).toBeNull();
      expect(getSafeImageUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(getSafeImageUrl('/api/uploads/images/photo.png\0.html')).toBeNull();
    });
  });
});
