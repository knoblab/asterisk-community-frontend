import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../stores/useBoardStore';
import type { Post } from '../types';

describe('Author Filter Feature', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        posts: [],
        total: 0,
        page: 1,
        limit: 15,
        totalPages: 1,
      }),
    }));
    useBoardStore.setState({
      posts: [],
      currentPage: 1,
      totalPosts: 0,
      authorFilterEmail: null,
      authorFilterName: null,
      authorFilterId: null,
      selectedCategory: '전체',
      searchQuery: '',
      sortBy: 'recent',
    });
  });

  it('correctly sets authorFilterId, authorFilterEmail, and authorFilterName while ignoring masked emails', () => {
    const { setAuthorFilterEmail } = useBoardStore.getState();

    // 1. Passing unmasked email, name, and authorId
    setAuthorFilterEmail('user1@example.com', '사용자1', 'uid-123');
    let state = useBoardStore.getState();
    expect(state.authorFilterEmail).toBe('user1@example.com');
    expect(state.authorFilterName).toBe('사용자1');
    expect(state.authorFilterId).toBe('uid-123');

    // 2. Passing masked email (contains *) -> should NOT be set as authorFilterEmail
    setAuthorFilterEmail('cnsh32_****@g.cnees.kr', '32기 학생', 'uid-student-32');
    state = useBoardStore.getState();
    expect(state.authorFilterEmail).toBeNull();
    expect(state.authorFilterId).toBe('uid-student-32');
    expect(state.authorFilterName).toBe('32기 학생');

    // 3. Passing UID directly as first argument (no @)
    setAuthorFilterEmail('uid-999', '사용자999');
    state = useBoardStore.getState();
    expect(state.authorFilterId).toBe('uid-999');
    expect(state.authorFilterEmail).toBeNull();
    expect(state.authorFilterName).toBe('사용자999');

    // 4. Clearing author filter with null
    setAuthorFilterEmail(null);
    state = useBoardStore.getState();
    expect(state.authorFilterEmail).toBeNull();
    expect(state.authorFilterName).toBeNull();
    expect(state.authorFilterId).toBeNull();
  });

  it('sends authorId in query parameters and defensively filters posts strictly by authorId even if authorEmail is masked or names match', async () => {
    let requestedUrl = '';
    const mockPosts: Post[] = [
      {
        id: 'post-1',
        title: 'User 1 Post 1',
        body: 'Content 1',
        category: '정보',
        author: '학생A',
        authorId: 'uid-user1',
        authorEmail: 'cnsh32_****@g.cnees.kr',
        createdAt: 1000,
        likes: 0,
        commentCount: 0,
        views: 0,
      },
      {
        id: 'post-2',
        title: 'User 2 Post (Same cohort 32기 & same name)',
        body: 'Content 2',
        category: '정보',
        author: '학생A',
        authorId: 'uid-user2',
        authorEmail: 'cnsh32_****@g.cnees.kr',
        createdAt: 2000,
        likes: 0,
        commentCount: 0,
        views: 0,
      },
      {
        id: 'post-3',
        title: 'User 3 Post (Different cohort 31기)',
        body: 'Content 3',
        category: '잡담',
        author: '학생B',
        authorId: 'uid-user3',
        authorEmail: 'cnsh31_****@g.cnees.kr',
        createdAt: 3000,
        likes: 0,
        commentCount: 0,
        views: 0,
      },
    ];

    // Mock global fetch to return all posts even when author filter was queried (simulating legacy/unfiltered backend)
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      requestedUrl = url;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          posts: mockPosts,
          total: 3,
          page: 1,
          limit: 15,
          totalPages: 1,
        }),
      });
    }));

    const store = useBoardStore.getState();
    store.setAuthorFilterEmail('cnsh32_****@g.cnees.kr', '학생A', 'uid-user1');
    await store.fetchPosts(1);

    // Verify requested query params contains authorId
    expect(requestedUrl).toContain('authorId=uid-user1');
    // Verify masked authorEmail is NOT sent to prevent backend OR cohort grouping
    expect(requestedUrl).not.toContain('authorEmail');

    // Verify defensive client filtering filtered out User 2 (same cohort and name) and User 3
    const currentPosts = useBoardStore.getState().posts;
    expect(currentPosts.length).toBe(1);
    expect(currentPosts[0].authorId).toBe('uid-user1');
    expect(currentPosts[0].title).toBe('User 1 Post 1');
  });

  it('sends authorEmail when only unmasked authorEmail is provided without authorId', async () => {
    let requestedUrl = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      requestedUrl = url;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          posts: [],
          total: 0,
          page: 1,
          limit: 15,
          totalPages: 1,
        }),
      });
    }));

    const store = useBoardStore.getState();
    store.setAuthorFilterEmail('legacy_user@example.com', '레거시사용자');
    await store.fetchPosts(1);

    expect(requestedUrl).toContain('authorEmail=legacy_user%40example.com');
  });

  it('does NOT include pinned notice when filtering by a specific author', async () => {
    const mockPosts: Post[] = [
      {
        id: 'post-1',
        title: 'User 1 Post',
        body: 'Hello',
        category: '정보',
        author: '사용자1',
        authorId: 'uid-user1',
        authorEmail: 'user1@example.com',
        createdAt: 1000,
        likes: 0,
        commentCount: 0,
        views: 0,
      },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        posts: mockPosts,
        total: 1,
        page: 1,
        limit: 15,
        totalPages: 1,
      }),
    }));

    const store = useBoardStore.getState();
    store.setAuthorFilterEmail('user1@example.com', '사용자1', 'uid-user1');
    await store.fetchPosts(1);

    const posts = useBoardStore.getState().posts;
    expect(posts.some((p) => p.id === 'notice-fixed-pinned')).toBe(false);
  });
});
