import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useBoardStore } from '../stores/useBoardStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import { CommentSection } from '../components/community/CommentSection';
import type { Comment } from '../types';

describe('asterisk AI Per-User 20-Second Rate Limiting & Regeneration Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    useAuthStore.setState({
      user: {
        uid: 'user-caller',
        email: 'cnsh32_1001@g.cnees.kr',
        displayName: '호출자',
        photoURL: null,
      },
      loading: false,
    });

    useBoardStore.setState({
      posts: [
        {
          id: 'post-1',
          category: '질문',
          title: '질문 글',
          body: '내용입니다.',
          author: '작성자',
          authorId: 'user-author',
          createdAt: 1000,
          views: 1,
          likes: 0,
          commentCount: 2,
        },
      ],
      comments: [],
      aiGeneratingParentId: null,
      aiEnabled: true,
    });

    useUIStore.setState({
      toasts: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('regenerateAiCommentReply: calls /api/comments/ai-reply with regenerate: true and updates comment in-place', async () => {
    const rateLimitedComment: Comment = {
      id: 'comment-ai-rl-1',
      postId: 'post-1',
      parentId: 'comment-trigger-1',
      triggerCommentId: 'comment-trigger-1',
      body: 'asterisk AI는 20초에 1회만 호출할 수 있습니다. 약 45초 후에 다시 시도해 주세요.',
      author: 'asterisk',
      authorId: 'asterisk-ai-bot',
      authorGeneration: 'AI',
      createdAt: 2000,
      likes: 0,
      isRateLimited: true,
      retryAvailableAt: 2045000,
      retryExpireAt: 2105000,
    };

    useBoardStore.setState({
      comments: [
        {
          id: 'comment-trigger-1',
          postId: 'post-1',
          author: '호출자',
          authorId: 'user-caller',
          body: '@asterisk 다시 답변해줘',
          createdAt: 1500,
          likes: 0,
        },
        rateLimitedComment,
      ],
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (String(url).endsWith('/comments/ai-reply')) {
        const payload = JSON.parse(String(options?.body || '{}'));
        expect(payload.regenerate).toBe(true);
        expect(payload.commentId).toBe('comment-trigger-1');
        expect(payload.aiCommentId).toBe('comment-ai-rl-1');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'comment-ai-rl-1',
            postId: 'post-1',
            parentId: 'comment-trigger-1',
            triggerCommentId: 'comment-trigger-1',
            body: '[REPLY_TO:comment-trigger-1]\n새롭게 생성된 정성스러운 답변입니다.',
            author: 'asterisk',
            authorId: 'asterisk-ai-bot',
            authorGeneration: 'AI',
            createdAt: 3000,
            likes: 0,
            isRateLimited: false,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    vi.stubGlobal('fetch', fetchMock);

    const updated = await useBoardStore.getState().regenerateAiCommentReply('comment-ai-rl-1', 'comment-trigger-1');

    expect(updated).not.toBeNull();
    expect(updated?.id).toBe('comment-ai-rl-1');
    expect(updated?.body).toBe('새롭게 생성된 정성스러운 답변입니다.');
    expect(updated?.isRateLimited).toBe(false);

    // Comments in store updated in place without duplicate
    const currentComments = useBoardStore.getState().comments;
    expect(currentComments.length).toBe(2);
    expect(currentComments[1].id).toBe('comment-ai-rl-1');
    expect(currentComments[1].body).toBe('새롭게 생성된 정성스러운 답변입니다.');
    expect(currentComments[1].isRateLimited).toBe(false);
  });

  it('CommentSection: shows countdown and disabled button during cooldown, enables [다시 생성하기] when cooldown ends', async () => {
    const now = 2000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const rateLimitedComment: Comment = {
      id: 'comment-ai-rl-1',
      postId: 'post-1',
      parentId: 'comment-trigger-1',
      triggerCommentId: 'comment-trigger-1',
      body: 'asterisk AI는 20초에 1회만 호출할 수 있습니다. 약 20초 후에 다시 시도해 주세요.',
      author: 'asterisk',
      authorId: 'asterisk-ai-bot',
      authorGeneration: 'AI',
      createdAt: now - 10000,
      likes: 0,
      isRateLimited: true,
      retryAvailableAt: now + 20000, // 20 seconds remaining
      retryExpireAt: now + 80000,    // 1 minute after retry available
    };

    useBoardStore.setState({
      comments: [
        {
          id: 'comment-trigger-1',
          postId: 'post-1',
          author: '호출자',
          authorId: 'user-caller',
          body: '@asterisk 시험 일정 알려줘',
          createdAt: now - 10000,
          likes: 0,
        },
        rateLimitedComment,
      ],
    });

    const { rerender } = render(<CommentSection postId="post-1" />);

    // During cooldown: notice and disabled button
    expect(screen.getByText(/asterisk AI는 20초에 1회만 호출할 수 있습니다/i)).toBeInTheDocument();
    expect(screen.getAllByText(/20초/i).length).toBeGreaterThanOrEqual(1);
    const disabledBtn = screen.getByRole('button', { name: /다시 생성 가능/i });
    expect(disabledBtn).toBeDisabled();

    // Fast-forward time past cooldown (e.g. + 25 seconds)
    act(() => {
      vi.spyOn(Date, 'now').mockReturnValue(now + 25000);
    });

    rerender(<CommentSection postId="post-1" />);

    // Now cooldown completed: shows retry available and active button
    await waitFor(() => {
      expect(screen.getByText(/쿨다운이 완료되었습니다/i)).toBeInTheDocument();
      const regenerateBtn = screen.getByRole('button', { name: /다시 생성하기/i });
      expect(regenerateBtn).not.toBeDisabled();
    });
  }, 15000);

  it('CommentSection: automatically deletes rate-limited notice if user does not press regenerate within 1 minute of availability', async () => {
    const now = 3000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const deleteCommentMock = vi.fn().mockResolvedValue(true);
    useBoardStore.setState({
      deleteComment: deleteCommentMock,
      comments: [
        {
          id: 'comment-trigger-1',
          postId: 'post-1',
          author: '호출자',
          authorId: 'user-caller',
          body: '@asterisk 급식 뭐야?',
          createdAt: now - 100000,
          likes: 0,
        },
        {
          id: 'comment-ai-rl-expired',
          postId: 'post-1',
          parentId: 'comment-trigger-1',
          triggerCommentId: 'comment-trigger-1',
          body: 'asterisk AI는 20초에 1회만 호출할 수 있습니다. 약 10초 후에 다시 시도해 주세요.',
          author: 'asterisk',
          authorId: 'asterisk-ai-bot',
          authorGeneration: 'AI',
          createdAt: now - 100000,
          likes: 0,
          isRateLimited: true,
          retryAvailableAt: now - 65000, // Cooldown ended 65s ago
          retryExpireAt: now - 5000,    // 1-minute expiration passed 5s ago!
        },
      ],
    });

    render(<CommentSection postId="post-1" />);

    // The expired comment should be automatically filtered out and deleted
    expect(screen.queryByText(/asterisk AI는 20초에 1회만 호출할 수 있습니다/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다시 생성하기/i })).not.toBeInTheDocument();

    // Auto-cleanup effect called deleteComment
    expect(deleteCommentMock).toHaveBeenCalledWith('comment-ai-rl-expired');
  });

  it('CommentSection: non-caller users see status but cannot click [다시 생성하기]', async () => {
    const now = 4000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // Current logged-in user is someone else (not the trigger caller and not admin)
    useAuthStore.setState({
      user: {
        uid: 'user-other',
        email: 'cnsh32_9999@g.cnees.kr',
        displayName: '다른사람',
        photoURL: null,
      },
    });

    useBoardStore.setState({
      comments: [
        {
          id: 'comment-trigger-1',
          postId: 'post-1',
          author: '호출자',
          authorId: 'user-caller',
          body: '@asterisk 질문',
          createdAt: now - 70000,
          likes: 0,
        },
        {
          id: 'comment-ai-rl-other',
          postId: 'post-1',
          parentId: 'comment-trigger-1',
          triggerCommentId: 'comment-trigger-1',
          body: 'asterisk AI는 20초에 1회만 호출할 수 있습니다.',
          author: 'asterisk',
          authorId: 'asterisk-ai-bot',
          authorGeneration: 'AI',
          createdAt: now - 70000,
          likes: 0,
          isRateLimited: true,
          retryAvailableAt: now - 10000, // ready to regenerate
          retryExpireAt: now + 50000,
        },
      ],
    });

    render(<CommentSection postId="post-1" />);

    expect(screen.getByText(/쿨다운이 완료되었습니다/i)).toBeInTheDocument();
    // Action button is replaced with permission text
    expect(screen.queryByRole('button', { name: /다시 생성하기/i })).not.toBeInTheDocument();
    expect(screen.getByText(/\(요청자만 다시 생성할 수 있습니다\)/i)).toBeInTheDocument();
  });
});
