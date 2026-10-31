import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useBoardStore } from '../stores/useBoardStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

describe('Board Store Failure & Non-Optimistic Behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    useAuthStore.setState({
      user: {
        uid: 'test-user-id',
        email: 'tester@example.com',
        displayName: '테스터',
        photoURL: null,
      },
      loading: false,
    });

    useBoardStore.setState({
      posts: [],
      comments: [],
      totalPosts: 0,
      currentPage: 1,
      selectedCategory: '전체',
      searchQuery: '',
      sortBy: 'recent',
      authorFilterEmail: null,
      authorFilterId: null,
      authorFilterName: null,
    });

    useUIStore.setState({
      toasts: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('addPost: returns false on server error (500) and does NOT add post to state or localStorage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    }));

    const result = await useBoardStore.getState().addPost({
      category: '잡담',
      title: '테스트 글',
      body: '테스트 본문 내용',
      author: '테스터',
      authorId: 'test-user-id',
    });

    expect(result).toBe(false);
    expect(useBoardStore.getState().posts.length).toBe(0);
    expect(localStorage.getItem('Knoblab-local-posts')).toBeNull();

    const toasts = useUIStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toContain('status.knoblab.xyz');
  });

  it('addPost: returns false on network exception (fetch reject) and does NOT add post to state or localStorage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await useBoardStore.getState().addPost({
      category: '잡담',
      title: '네트워크 에러 글',
      body: '본문',
      author: '테스터',
      authorId: 'test-user-id',
    });

    expect(result).toBe(false);
    expect(useBoardStore.getState().posts.length).toBe(0);
    expect(localStorage.getItem('Knoblab-local-posts')).toBeNull();

    const toasts = useUIStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toContain('status.knoblab.xyz');
  });

  it('addPost: returns false when user is not logged in', async () => {
    useAuthStore.setState({ user: null });

    const result = await useBoardStore.getState().addPost({
      category: '잡담',
      title: '비로그인 글',
      body: '본문',
      author: '비로그인',
      authorId: '',
    });

    expect(result).toBe(false);
    expect(useBoardStore.getState().posts.length).toBe(0);
  });

  it('addPost: returns true and adds to state only when server response is ok', async () => {
    const mockCreated = {
      id: 'server-post-1',
      title: '정상 등록 글',
      body: '본문 내용',
      category: '잡담',
      author: '테스터',
      authorId: 'test-user-id',
      createdAt: 1000,
      likes: 0,
      views: 0,
      commentCount: 0,
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockCreated,
    }));

    const result = await useBoardStore.getState().addPost({
      category: '잡담',
      title: '정상 등록 글',
      body: '본문 내용',
      author: '테스터',
      authorId: 'test-user-id',
    });

    expect(result).toBe(true);
    expect(useBoardStore.getState().posts.length).toBe(1);
    expect(useBoardStore.getState().posts[0].id).toBe('server-post-1');
  });

  it('addComment: returns false on server error (500) and does NOT create fallback comment or update commentCount', async () => {
    useBoardStore.setState({
      posts: [
        {
          id: 'post-1',
          title: '글 1',
          body: '내용',
          category: '잡담',
          author: '작성자',
          authorId: 'author-1',
          createdAt: 1000,
          likes: 0,
          views: 0,
          commentCount: 0,
        },
      ],
      comments: [],
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Comment failure' }),
    }));

    const result = await useBoardStore.getState().addComment({
      postId: 'post-1',
      author: '테스터',
      authorId: 'test-user-id',
      body: '실패해야 하는 댓글',
    });

    expect(result).toBe(false);
    expect(useBoardStore.getState().comments.length).toBe(0);
    expect(useBoardStore.getState().posts[0].commentCount).toBe(0);

    const toasts = useUIStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[0].message).toContain('status.knoblab.xyz');
  });

  it('addComment: returns false on network error and does NOT touch state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    const result = await useBoardStore.getState().addComment({
      postId: 'post-1',
      author: '테스터',
      authorId: 'test-user-id',
      body: '네트워크 실패 댓글',
    });

    expect(result).toBe(false);
    expect(useBoardStore.getState().comments.length).toBe(0);
  });

  it('updatePost: returns false on server error and does NOT modify state', async () => {
    const initialPost = {
      id: 'post-1',
      title: '원래 제목',
      body: '원래 본문',
      category: '잡담' as const,
      author: '작성자',
      authorId: 'test-user-id',
      createdAt: 1000,
      likes: 0,
      views: 0,
      commentCount: 0,
    };
    useBoardStore.setState({ posts: [initialPost] });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Update failed' }),
    }));

    const result = await useBoardStore.getState().updatePost('post-1', {
      title: '수정 시도 제목',
    });

    expect(result).toBe(false);
    expect(useBoardStore.getState().posts[0].title).toBe('원래 제목');
  });

  it('updateComment: returns false on server error and does NOT modify state', async () => {
    const initialComment = {
      id: 'comment-1',
      postId: 'post-1',
      author: '테스터',
      authorId: 'test-user-id',
      body: '원래 댓글',
      createdAt: 1000,
      likes: 0,
    };
    useBoardStore.setState({ comments: [initialComment] });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Update comment failed' }),
    }));

    const result = await useBoardStore.getState().updateComment('comment-1', {
      body: '수정 시도 댓글',
    });

    expect(result).toBe(false);
    expect(useBoardStore.getState().comments[0].body).toBe('원래 댓글');
  });
});
