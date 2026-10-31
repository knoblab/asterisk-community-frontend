import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TabType, ThemeType, ToastMessage } from '../types';

interface UIStoreState {
  mobileTab: TabType;
  theme: ThemeType;
  toasts: ToastMessage[];
  isLoginModalOpen: boolean;
  loginModalMessage?: string;
  isSettingsModalOpen: boolean;
  mainChatSessionId: string | null;
  setMainChatSessionId: (id: string | null) => void;
  setMobileTab: (tab: TabType) => void;
  toggleTheme: () => void;
  openLoginModal: (message?: string) => void;
  closeLoginModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  addToast: (
    message: string,
    type?: 'success' | 'error' | 'info',
    onClick?: () => void,
    icon?: 'sparkles' | 'bot' | 'message'
  ) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIStoreState>()(
  persist(
    (set, get) => ({
      mobileTab: 'main',
      theme: 'light',
      toasts: [],
      isLoginModalOpen: false,
      loginModalMessage: '',
      isSettingsModalOpen: false,
      mainChatSessionId: null,
      setMainChatSessionId: (id) => set({ mainChatSessionId: id }),
      setMobileTab: (tab) => set({ mobileTab: tab }),
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        set({ theme: next });
      },
      openLoginModal: (message = '로그인이 필요합니다.') => {
        set({ isLoginModalOpen: true, loginModalMessage: message });
      },
      closeLoginModal: () => {
        set({ isLoginModalOpen: false, loginModalMessage: '' });
      },
      openSettingsModal: () => {
        set({ isSettingsModalOpen: true });
      },
      closeSettingsModal: () => {
        set({ isSettingsModalOpen: false });
      },
      addToast: (message, type = 'info', onClick, icon) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newToast: ToastMessage = { id, message, type, onClick, icon };
        set((state) => ({ toasts: [...state.toasts, newToast] }));

        // Auto remove after 6 seconds if clickable, else 3.5 seconds
        const timeout = onClick ? 6000 : 3500;
        setTimeout(() => {
          get().removeToast(id);
        }, timeout);
      },
      removeToast: (id) => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      },
    }),
    {
      name: 'asterisk-ui-settings',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
