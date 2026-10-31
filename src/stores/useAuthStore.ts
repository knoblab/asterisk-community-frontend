import { create } from 'zustand';
import { isAllowedMemberEmail } from '../utils/member';
import { isAdminUser } from '../constants/admin';
import { useUIStore } from './useUIStore';
import { validateUploadFile } from '../utils/fileSecurity';
import type { KnoblabUser } from '../types';

const AUTH_CENTER = import.meta.env.VITE_AUTH_CENTER || 'https://login.knoblab.xyz';
const baseUrl = import.meta.env.VITE_API_URL || '';
const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;

interface AuthState {
  user: KnoblabUser | null;
  loading: boolean;
  _authInitialized: boolean;
  login: () => void;
  loginWithGoogle: () => void; // Alias for backward compatibility
  logout: () => Promise<void>;
  initAuth: () => void;
  checkAuth: () => Promise<KnoblabUser | null>;
  handleSessionExpired: () => void;
  updateUserProfile: (displayName: string, photoURL: string, schoolGrade?: string | null, schoolClass?: string | null) => Promise<void>;
  updateClassSettings: (schoolGrade: string | null, schoolClass: string | null) => Promise<void>;
  uploadProfileImage: (file: File) => Promise<string>;
  uploadAttachment: (file: File) => Promise<{
    url: string;
    filename: string;
    originalName: string;
    fileType: 'image' | 'video' | 'audio' | 'file';
    mimeType: string;
    size: number;
  }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  _authInitialized: false,

  login: () => {
    let origin = window.location.origin;
    let currentPath = `${window.location.pathname || ''}${window.location.search || ''}`;
    if (!origin && window.location.href) {
      try {
        const parsed = new URL(window.location.href);
        origin = parsed.origin;
        currentPath = `${parsed.pathname}${parsed.search}`;
      } catch {
        origin = 'https://cnsh.space';
      }
    }
    const safeReturnPath =
      currentPath && currentPath !== '/' && currentPath.startsWith('/') && !currentPath.startsWith('//') && !currentPath.startsWith('/api')
        ? currentPath
        : '';
    const callbackUrl = safeReturnPath
      ? `${origin}/api/auth-callback?returnTo=${encodeURIComponent(safeReturnPath)}`
      : `${origin}/api/auth-callback`;
    window.location.href = `${AUTH_CENTER}/?redirect=${encodeURIComponent(callbackUrl)}&service=asterisk`;
  },

  loginWithGoogle: () => {
    get().login();
  },

  logout: async () => {
    try {
      await fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Local Sign-Out failed:', error);
    }
    try {
      await fetch(`${AUTH_CENTER}/api/clear-session`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('SSO Sign-Out failed:', error);
    } finally {
      // Clear sensitive cached user data and AI chats from localStorage
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith('asterisk_ai_chat_') ||
              key.startsWith('Knoblab-user-profile-') ||
              key.startsWith('knoblab-user-profile-') ||
              key === 'class' ||
              key === 'grade' ||
              key === 'schoolGrade' ||
              key === 'schoolClass')
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {
        // ignore localStorage access error
      }
      set({ user: null });
      useUIStore.getState().addToast('로그아웃되었습니다.', 'info');
    }
  },

  handleSessionExpired: () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('asterisk_ai_chat_') ||
            key.startsWith('Knoblab-user-profile-') ||
            key.startsWith('knoblab-user-profile-'))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
    set({ user: null, loading: false });
  },

  checkAuth: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/me`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) {
        set({ user: null, loading: false });
        return null;
      }

      const data = await res.json();
      if (!data || !data.authenticated || !data.uid) {
        set({ user: null, loading: false });
        return null;
      }

      // Check allowed member email (Option B)
      if (!isAdminUser(data.uid, data.email) && !isAllowedMemberEmail(data.email, data.uid)) {
        try {
          await fetch(`${API_BASE_URL}/logout`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch {
          // ignore
        }
        try {
          await fetch(`${AUTH_CENTER}/api/clear-session`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch {
          // ignore
        }
        set({ user: null, loading: false });
        useUIStore.getState().addToast('g.cnees.kr 학교 계정으로만 이용할 수 있습니다.', 'error');
        return null;
      }

      let currentDisplayName: string | null = null;
      let currentPhotoURL: string | null = null;
      let currentSchoolGrade: string | null = data.schoolGrade || null;
      let currentSchoolClass: string | null = data.schoolClass || null;

      // 1. Try restore cached profile from localStorage
      try {
        const savedProfile = JSON.parse(localStorage.getItem(`Knoblab-user-profile-${data.uid}`) || 'null');
        if (savedProfile?.displayName) currentDisplayName = savedProfile.displayName;
        if (savedProfile?.photoURL) currentPhotoURL = savedProfile.photoURL;
        if (savedProfile?.schoolGrade) currentSchoolGrade = savedProfile.schoolGrade;
        if (savedProfile?.schoolClass) currentSchoolClass = savedProfile.schoolClass;
      } catch {
        // ignore json parse error
      }

      // 2. Try fetch profile from backend API with credentials
      try {
        const profileRes = await fetch(`${API_BASE_URL}/users/profile?uid=${data.uid}`, {
          credentials: 'include',
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.displayName) currentDisplayName = profileData.displayName;
          if (profileData.photoURL) currentPhotoURL = profileData.photoURL;
          if (profileData.schoolGrade) currentSchoolGrade = profileData.schoolGrade;
          if (profileData.schoolClass) currentSchoolClass = profileData.schoolClass;
        }
      } catch {
        // fallback
      }

      // Also fallback to localStorage 'class' if not found
      if (!currentSchoolGrade || !currentSchoolClass) {
        try {
          const rawClass = localStorage.getItem('class');
          if (rawClass) {
            const parsed = JSON.parse(rawClass);
            if (!currentSchoolGrade && parsed?.g) currentSchoolGrade = String(parsed.g);
            if (!currentSchoolClass && parsed?.c) currentSchoolClass = String(parsed.c);
          }
        } catch (_) {}
      }

      // Sync back to local storage
      if (currentSchoolGrade && currentSchoolClass) {
        try {
          localStorage.setItem('class', JSON.stringify({ g: currentSchoolGrade, c: currentSchoolClass }));
        } catch (_) {}
      }

      // 3. Fallback to auth center profile only if custom profile is not set
      if (!currentDisplayName) {
        currentDisplayName = data.displayName || null;
      }
      if (!currentPhotoURL) {
        currentPhotoURL = data.photoURL || null;
      }

      const activeUser: KnoblabUser = {
        uid: data.uid,
        email: data.email || null,
        displayName: currentDisplayName,
        photoURL: currentPhotoURL,
        schoolGrade: currentSchoolGrade,
        schoolClass: currentSchoolClass,
      };

      set({ user: activeUser, loading: false });
      return activeUser;
    } catch (err) {
      console.error('인증 확인 실패:', err);
      set({ user: null, loading: false });
      return null;
    }
  },

  initAuth: () => {
    if (get()._authInitialized) return;
    set({ _authInitialized: true });

    // Initial check
    get().checkAuth();

    // Re-check auth state when browser tab gains focus or visibility
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        get().checkAuth();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
  },

  updateUserProfile: async (displayName, photoURL, schoolGrade, schoolClass) => {
    const stateUser = get().user;
    if (!stateUser) {
      throw new Error('로그인이 필요합니다.');
    }

    const uid = stateUser.uid;
    const finalGrade = schoolGrade !== undefined ? schoolGrade : (stateUser.schoolGrade || null);
    const finalClass = schoolClass !== undefined ? schoolClass : (stateUser.schoolClass || null);

    // 1. Save to localStorage immediately so user experience is instant
    localStorage.setItem(
      `Knoblab-user-profile-${uid}`,
      JSON.stringify({
        displayName,
        photoURL,
        schoolGrade: finalGrade,
        schoolClass: finalClass,
        updatedAt: Date.now(),
      })
    );

    if (finalGrade && finalClass) {
      try {
        localStorage.setItem('class', JSON.stringify({ g: finalGrade, c: finalClass }));
      } catch (_) {}
    }

    // 2. Update Zustand state immediately
    set({
      user: {
        ...stateUser,
        displayName,
        photoURL,
        schoolGrade: finalGrade,
        schoolClass: finalClass,
      },
    });

    // 3. Save profile data to Backend Server using credentials
    try {
      const res = await fetch(`${API_BASE_URL}/users/profile`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid,
          displayName,
          photoURL,
          schoolGrade: finalGrade,
          schoolClass: finalClass,
          email: stateUser.email,
          updatedAt: Date.now(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn('Backend user profile save returned non-ok:', res.status, errData);
      }
    } catch (err) {
      console.error('Backend user profile save error:', err);
    }
  },

  updateClassSettings: async (schoolGrade, schoolClass) => {
    const stateUser = get().user;
    const finalGrade = schoolGrade ? String(schoolGrade) : null;
    const finalClass = schoolClass ? String(schoolClass) : null;

    // Always update 'class' in localStorage for offline / unauthenticated fallback
    try {
      if (finalGrade && finalClass) {
        localStorage.setItem('class', JSON.stringify({ g: finalGrade, c: finalClass }));
      } else {
        localStorage.removeItem('class');
      }
    } catch (_) {}

    if (!stateUser) {
      return;
    }

    const displayName = stateUser.displayName || '';
    const photoURL = stateUser.photoURL || '';
    await get().updateUserProfile(displayName, photoURL, finalGrade, finalClass);
  },

  uploadProfileImage: async (file) => {
    const stateUser = get().user;
    const uid = stateUser?.uid || 'guest';

    const validation = validateUploadFile(file);
    if (!validation.valid) {
      throw new Error(validation.error || '유효하지 않은 파일입니다.');
    }
    if (validation.category !== 'image') {
      throw new Error('프로필 사진은 이미지 파일(JPEG, PNG, GIF, WebP)만 업로드할 수 있습니다.');
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uid', uid);

      const res = await fetch(`${API_BASE_URL}/upload/image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${res.status}`);
      }

      const data: any = await res.json();
      const imageUrl = data.url || data.imageUrl || data.data?.url;

      if (imageUrl && typeof imageUrl === 'string') {
        // Normalize path: Ensure Cloudflare Pages & Worker proxy route (/api/uploads/...) is used
        let finalUrl = imageUrl;
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
          finalUrl = imageUrl;
        } else if (imageUrl.startsWith('/uploads/')) {
          finalUrl = `/api${imageUrl}`;
        } else if (imageUrl.startsWith('/api/uploads/')) {
          finalUrl = imageUrl;
        }
        return finalUrl;
      } else {
        console.error('Image upload failed. Server response:', data);
        throw new Error(`서버 응답에 이미지 경로가 없습니다. (${JSON.stringify(data)})`);
      }
    } catch (err) {
      console.error('Backend image upload error:', err);
      throw err;
    }
  },

  uploadAttachment: async (file) => {
    const stateUser = get().user;
    const uid = stateUser?.uid || 'guest';

    // 1. Validate file size, extension, RTL/Bidi, and double extension
    const validation = validateUploadFile(file);
    if (!validation.valid) {
      throw new Error(validation.error || '유효하지 않은 파일입니다.');
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uid', uid);

      const res = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${res.status}`);
      }

      const data: any = await res.json();
      const uploadedUrl = data.url || data.imageUrl || data.data?.url || (data.files && data.files[0]?.url);

      if (uploadedUrl && typeof uploadedUrl === 'string') {
        let finalUrl = uploadedUrl;
        if (uploadedUrl.startsWith('http://') || uploadedUrl.startsWith('https://')) {
          finalUrl = uploadedUrl;
        } else if (uploadedUrl.startsWith('/uploads/')) {
          finalUrl = `/api${uploadedUrl}`;
        } else if (uploadedUrl.startsWith('/media/')) {
          finalUrl = `/api${uploadedUrl}`;
        } else if (uploadedUrl.startsWith('/api/')) {
          finalUrl = uploadedUrl;
        }

        const fileType: 'image' | 'video' | 'audio' | 'file' =
          data.fileType || validation.category || 'file';

        return {
          url: finalUrl,
          filename: data.filename || file.name,
          originalName: data.originalName || validation.sanitizedName || file.name,
          fileType,
          mimeType: data.mimeType || file.type || 'application/octet-stream',
          size: typeof data.size === 'number' ? data.size : file.size,
        };
      } else {
        console.error('File upload failed. Server response:', data);
        throw new Error(`서버 응답에 파일 경로가 없습니다. (${JSON.stringify(data)})`);
      }
    } catch (err) {
      console.error('Backend file upload error:', err);
      throw err;
    }
  },
}));
