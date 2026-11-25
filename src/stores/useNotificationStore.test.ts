import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotificationStore } from './useNotificationStore';
import type { AppNotification } from '../types';

// Mock auth store
vi.mock('./useAuthStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      user: {
        uid: 'user-123',
        email: 'user@example.com',
        displayName: '사용자',
        photoURL: null,
      },
    })),
  },
}));

// Mock authFetch
vi.mock('./useBoardStore', () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from './useBoardStore';

describe('useNotificationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
    });
  });

  it('fetches notifications and updates state correctly', async () => {
    const mockNotifications: AppNotification[] = [
      {
        id: 'notif-1',
        recipientId: 'user-123',
        senderId: 'user-456',
        senderName: '홍길동',
        type: 'comment',
        postId: 'post-1',
        postTitle: '테스트 게시글',
        commentId: 'comment-1',
        contentSnippet: '좋은 글입니다!',
        isRead: false,
        createdAt: Date.now(),
      },
      {
        id: 'notif-2',
        recipientId: 'user-123',
        senderId: 'user-789',
        senderName: '이순신',
        type: 'reply',
        postId: 'post-1',
        postTitle: '테스트 게시글',
        commentId: 'comment-2',
        contentSnippet: '동의합니다.',
        isRead: true,
        createdAt: Date.now() - 1000,
      },
    ];

    vi.mocked(authFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: mockNotifications,
        unreadCount: 1,
      }),
    } as Response);

    await useNotificationStore.getState().fetchNotifications();

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(2);
    expect(state.unreadCount).toBe(1);
    expect(state.notifications[0].senderName).toBe('홍길동');
    expect(state.notifications[0].type).toBe('comment');
    expect(state.notifications[1].type).toBe('reply');
  });

  it('marks a single notification as read optimistically', async () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'notif-1',
          recipientId: 'user-123',
          senderId: 'user-456',
          senderName: '홍길동',
          type: 'comment',
          postId: 'post-1',
          postTitle: '테스트 게시글',
          commentId: 'comment-1',
          contentSnippet: '좋은 글입니다!',
          isRead: false,
          createdAt: Date.now(),
        },
      ],
      unreadCount: 1,
      isLoading: false,
    });

    vi.mocked(authFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await useNotificationStore.getState().markAsRead('notif-1');

    const state = useNotificationStore.getState();
    expect(state.notifications[0].isRead).toBe(true);
    expect(state.unreadCount).toBe(0);
    expect(authFetch).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/notif-1/read'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('marks all notifications as read', async () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'notif-1',
          recipientId: 'user-123',
          senderId: 'user-456',
          senderName: '홍길동',
          type: 'comment',
          postId: 'post-1',
          postTitle: '테스트 게시글',
          commentId: 'comment-1',
          contentSnippet: '댓글 1',
          isRead: false,
          createdAt: Date.now(),
        },
        {
          id: 'notif-2',
          recipientId: 'user-123',
          senderId: 'user-789',
          senderName: '김유신',
          type: 'reply',
          postId: 'post-1',
          postTitle: '테스트 게시글',
          commentId: 'comment-2',
          contentSnippet: '답글 1',
          isRead: false,
          createdAt: Date.now(),
        },
      ],
      unreadCount: 2,
      isLoading: false,
    });

    vi.mocked(authFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await useNotificationStore.getState().markAllAsRead();

    const state = useNotificationStore.getState();
    expect(state.unreadCount).toBe(0);
    expect(state.notifications.every((n) => n.isRead)).toBe(true);
    expect(authFetch).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/read-all'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('deletes a notification and updates count', async () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'notif-1',
          recipientId: 'user-123',
          senderId: 'user-456',
          senderName: '홍길동',
          type: 'comment',
          postId: 'post-1',
          postTitle: '테스트 게시글',
          commentId: 'comment-1',
          contentSnippet: '댓글 1',
          isRead: false,
          createdAt: Date.now(),
        },
      ],
      unreadCount: 1,
      isLoading: false,
    });

    vi.mocked(authFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await useNotificationStore.getState().deleteNotification('notif-1');

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
  });
});
