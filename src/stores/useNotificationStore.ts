import { create } from 'zustand';
import type { AppNotification } from '../types';
import { authFetch } from './useBoardStore';
import { useAuthStore } from './useAuthStore';
import { useUIStore } from './useUIStore';
import { getPostPath } from '../utils/postLink';

const baseUrl = import.meta.env.VITE_API_URL || '';
const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  isFastPolling: boolean;

  fetchNotifications: (silent?: boolean) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  startPolling: () => () => void;
  stopPolling: () => void;
  enableFastPolling: (durationSeconds?: number) => void;
}

let cleanupPollingFn: (() => void) | null = null;
let fastPollingTimeoutId: ReturnType<typeof setTimeout> | null = null;
let fastPollingIntervalId: ReturnType<typeof setInterval> | null = null;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isFastPolling: false,

  fetchNotifications: async (silent = false) => {
    if (!useAuthStore.getState().user) {
      set({ notifications: [], unreadCount: 0 });
      return;
    }

    if (!silent) {
      set({ isLoading: true });
    }

    try {
      const res = await authFetch(`${API_BASE_URL}/notifications`);
      if (res.status === 401) {
        get().stopPolling();
        set({ notifications: [], unreadCount: 0 });
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const incomingNotifications: AppNotification[] = Array.isArray(data.notifications) ? data.notifications : [];
        const incomingUnreadCount: number = typeof data.unreadCount === 'number' ? data.unreadCount : 0;

        const prevUnreadCount = get().unreadCount;
        const prevNotifications = get().notifications;

        // If new unread notification arrived while user is active, notify with toast & system notification
        if (silent && incomingUnreadCount > prevUnreadCount && incomingNotifications.length > 0) {
          const newest = incomingNotifications[0];
          const isReallyNew = !prevNotifications.some((n) => n.id === newest.id);
          if (isReallyNew && !newest.isRead) {
            const isAi = newest.senderName === 'asterisk' || newest.senderName === 'asterisk-ai-bot';

            const navigateToPost = () => {
              if (newest.postId) {
                get().markAsRead(newest.id);
                const targetUrl = getPostPath(newest.postId);
                if (typeof window !== 'undefined') {
                  try {
                    window.history.pushState({}, '', targetUrl);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  } catch (_) {
                    window.location.href = targetUrl;
                  }
                }
              }
            };

            if (isAi) {
              // Stop fast polling since AI reply has arrived
              if (fastPollingIntervalId) {
                clearInterval(fastPollingIntervalId);
                fastPollingIntervalId = null;
              }
              if (fastPollingTimeoutId) {
                clearTimeout(fastPollingTimeoutId);
                fastPollingTimeoutId = null;
              }
              set({ isFastPolling: false });

              const toastMsg = 'asterisk AI의 답변이 등록되었습니다! (클릭하여 확인)';
              useUIStore.getState().addToast(toastMsg, 'info', navigateToPost, 'bot');

              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                try {
                  const sysNotif = new Notification('asterisk AI 답변 완료', {
                    body: newest.contentSnippet || '질문하신 내용에 대한 답변이 등록되었습니다.',
                    icon: '/icon-192.png',
                  });
                  sysNotif.onclick = () => {
                    window.focus();
                    navigateToPost();
                  };
                } catch (_) {}
              }
            } else {
              const toastMsg =
                newest.type === 'reply'
                  ? `${newest.senderName}님이 회원님의 댓글에 답글을 남겼습니다.`
                  : `${newest.senderName}님이 회원님의 글에 댓글을 남겼습니다.`;
              useUIStore.getState().addToast(toastMsg, 'info', navigateToPost, 'message');
            }
          }
        }

        set({
          notifications: incomingNotifications,
          unreadCount: incomingUnreadCount,
        });
      }
    } catch (err) {
      console.error('[NotificationStore] Failed to fetch notifications:', err);
    } finally {
      if (!silent) {
        set({ isLoading: false });
      }
    }
  },

  markAsRead: async (id: string) => {
    const { notifications, unreadCount } = get();
    const target = notifications.find((n) => n.id === id);
    if (!target || target.isRead) return;

    // Optimistic update
    set({
      notifications: notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      unreadCount: Math.max(0, unreadCount - 1),
    });

    try {
      await authFetch(`${API_BASE_URL}/notifications/${id}/read`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('[NotificationStore] Failed to mark as read:', err);
    }
  },

  markAllAsRead: async () => {
    const { notifications } = get();
    if (notifications.every((n) => n.isRead)) return;

    // Optimistic update
    set({
      notifications: notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    });

    try {
      await authFetch(`${API_BASE_URL}/notifications/read-all`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('[NotificationStore] Failed to mark all as read:', err);
    }
  },

  deleteNotification: async (id: string) => {
    const { notifications, unreadCount } = get();
    const target = notifications.find((n) => n.id === id);
    if (!target) return;

    // Optimistic update
    set({
      notifications: notifications.filter((n) => n.id !== id),
      unreadCount: target.isRead ? unreadCount : Math.max(0, unreadCount - 1),
    });

    try {
      await authFetch(`${API_BASE_URL}/notifications/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('[NotificationStore] Failed to delete notification:', err);
    }
  },

  stopPolling: () => {
    if (cleanupPollingFn) {
      cleanupPollingFn();
      cleanupPollingFn = null;
    }
  },

  startPolling: () => {
    get().stopPolling();

    // Initial fetch
    get().fetchNotifications(true);

    // Poll every 25 seconds when tab is visible
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        get().fetchNotifications(true);
      }
    }, 25000);

    // Window focus / visibility change handler
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        get().fetchNotifications(true);
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    const cleanup = () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      if (cleanupPollingFn === cleanup) {
        cleanupPollingFn = null;
      }
    };

    cleanupPollingFn = cleanup;
    return cleanup;
  },

  enableFastPolling: (durationSeconds = 120) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().catch(() => {});
      } catch (_) {}
    }

    if (fastPollingIntervalId) clearInterval(fastPollingIntervalId);
    if (fastPollingTimeoutId) clearTimeout(fastPollingTimeoutId);

    set({ isFastPolling: true });

    // Fast poll every 4.5 seconds
    fastPollingIntervalId = setInterval(() => {
      get().fetchNotifications(true);
    }, 4500);

    fastPollingTimeoutId = setTimeout(() => {
      if (fastPollingIntervalId) {
        clearInterval(fastPollingIntervalId);
        fastPollingIntervalId = null;
      }
      fastPollingTimeoutId = null;
      set({ isFastPolling: false });
    }, durationSeconds * 1000);
  },
}));
