import { create } from 'zustand';
import type { Post, Comment, PostCategory } from '../types';
import { useUIStore } from './useUIStore';
import { useAuthStore } from './useAuthStore';
import { HARDCODED_PINNED_NOTICE } from '../constants/notice';

/**
 * 복합 참여도 점수 (Engagement Score) 계산
 * - 좋아요: 적극적 추천 지표 (가중치 4.0)
 * - 댓글: 소통 및 참여 지표 (가중치 2.5)
 * - 조회수: 열람 지표 (어뷰징 방지 로그 스케일 가중치 1.5)
 */
export const calculatePostEngagementScore = (post: { likes?: number; commentCount?: number; views?: number }): number => {
  const likes = Math.max(0, post.likes || 0);
  const comments = Math.max(0, post.commentCount || 0);
  const views = Math.max(0, post.views || 0);
  return (likes * 4.0) + (comments * 2.5) + (Math.log(1 + views) * 1.5);
};

export const getPopularPostIds = (posts: Post[]): Set<string> => {
  const popularIds = new Set<string>();
  const validPosts = posts.filter(
    (p) => !p.isDeleted && p.status !== 'deleted' && p.status !== 'DELETED'
  );

  if (validPosts.length === 0) return popularIds;

  // 1. 모든 유효 게시글의 참여도 점수 사전 계산
  const scoreMap = new Map<string, number>();
  for (const p of validPosts) {
    scoreMap.set(p.id, calculatePostEngagementScore(p));
  }

  const WINDOW_MS = 48 * 60 * 60 * 1000; // 비슷한 시기 기준 (롤링 48시간)

  for (const p of validPosts) {
    const likes = p.likes || 0;
    const comments = p.commentCount || 0;
    const score = scoreMap.get(p.id) || 0;

    // 최소 노이즈 가드: 실제 상호작용(좋아요 1개 이상 또는 댓글 1개 이상)이 최소 1회 발생해야 함
    if (likes < 1 && comments < 1) {
      continue;
    }

    // 2. 비슷한 시기(±48시간)의 코호트(비교군) 집합 구성
    const pTime = p.createdAt || 0;
    let cohort = validPosts.filter((other) => {
      const oTime = other.createdAt || 0;
      return Math.abs(oTime - pTime) <= WINDOW_MS;
    });

    // 코호트 표본 수가 적을 경우(5개 미만) 시간순으로 가장 가까운 인접 게시글 최소 10개(또는 전체)로 자동 확장
    if (cohort.length < 5 && validPosts.length >= 5) {
      cohort = [...validPosts]
        .sort((a, b) => Math.abs((a.createdAt || 0) - pTime) - Math.abs((b.createdAt || 0) - pTime))
        .slice(0, Math.min(10, validPosts.length));
    } else if (cohort.length < 5) {
      cohort = validPosts;
    }

    const cohortScores = cohort.map((item) => scoreMap.get(item.id) || 0).sort((a, b) => b - a);
    const avgScore = cohortScores.reduce((acc, cur) => acc + cur, 0) / cohortScores.length;

    // 상위 20% 백분위수 임계값 (최소 1위 포함)
    const topIndex = Math.max(0, Math.floor(cohortScores.length * 0.2) - 1);
    const thresholdScore = cohortScores[topIndex];

    // 3. 상대적 판정: 코호트 상위 20% 이내이거나 코호트 평균의 1.5배 이상
    if (score >= thresholdScore || (avgScore > 0 && score >= avgScore * 1.5)) {
      popularIds.add(p.id);
    }
  }

  return popularIds;
};

export const isPopularPost = (post: Post, allPosts?: Post[]): boolean => {
  if (post.isPopular !== undefined && (!allPosts || allPosts.length === 0)) {
    return Boolean(post.isPopular);
  }
  const postsToEvaluate = allPosts && allPosts.length > 0 ? allPosts : [post];
  const popularIds = getPopularPostIds(postsToEvaluate);
  return popularIds.has(post.id);
};

const baseUrl = import.meta.env.VITE_API_URL || '';
const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('Knoblab-local-posts');
  }
} catch {
  // Ignore in environments where localStorage is unavailable
}

let isHandling401 = false;
export const handleUnauthorizedSession = () => {
  if (isHandling401) return;
  isHandling401 = true;

  const authState = useAuthStore.getState();
  if (authState.user) {
    authState.handleSessionExpired();
  }

  useUIStore.getState().openLoginModal('로그인 인증이 만료되었습니다 (7일). 원활한 이용을 위해 다시 로그인해주세요.');
  useUIStore.getState().addToast('로그인 인증이 만료되었습니다. 다시 로그인해주세요.', 'error');

  setTimeout(() => {
    isHandling401 = false;
  }, 3000);
};

/**
 * Fetch wrapper that automatically includes cookies for SSO authentication
 */
export const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const signal = options.signal || controller.signal;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
      signal,
    });

    if (response.status === 401) {
      handleUnauthorizedSession();
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

const deleteRemoteResource = async (resource: 'posts' | 'comments', id: string) => {
  const url = `${API_BASE_URL}/${resource}/${id}`;
  // 관리자 콘솔 외에서는 어떤 일이 있어도 영구삭제되지 않고 항상 소프트 삭제(isDeleted: true, status: 'deleted') 처리
  const softDeleteResponse = await authFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ isDeleted: true, status: 'deleted' }),
  });

  if (softDeleteResponse.ok || softDeleteResponse.status === 404) return true;

  // PATCH가 지원되지 않는 경우 PUT으로 소프트 삭제 시도
  const putResponse = await authFetch(url, {
    method: 'PUT',
    body: JSON.stringify({ isDeleted: true, status: 'deleted' }),
  });
  return putResponse.ok || putResponse.status === 404;
};



export const extractAsteriskPrompt = (text: string): string | null => {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.replace(/^\[REPLY_TO:[^\]]+\]\n?/, '');
  const match = cleaned.match(/@asterisk\b[\s:,-]*([\s\S]*)/i);
  if (!match) return null;
  const prompt = match[1].trim();
  return prompt.length > 0 ? prompt : null;
};

export type AiGenerationStage = 'idle' | 'selecting_model' | 'thinking' | 'writing';

interface BoardState {
  posts: Post[];
  comments: Comment[];
  aiGeneratingParentId: string | null;
  aiGeneratingStage: AiGenerationStage;
  aiGeneratingSelectedProvider: string | null;
  aiGeneratingTools: string[] | null;
  aiEnabled: boolean | null;
  selectedCategory: PostCategory | '전체';
  sortBy: 'recent' | 'popular';
  searchQuery: string;
  authorFilterEmail: string | null;
  authorFilterName: string | null;
  authorFilterId: string | null;
  currentPage: number;
  postsPerPage: number;
  totalPosts: number;
  isLoading: boolean;
  isPageLoading: boolean;
  hasFetchError: boolean;

  fetchPosts: (page?: number) => Promise<void>;
  fetchAllPostsForAdmin: () => Promise<void>;
  fetchPostById: (id: string) => Promise<Post | null>;
  fetchStatsForPosts: (postsToEnrich: Post[]) => Promise<void>;
  syncPendingPosts: () => Promise<void>;
  addPost: (postData: { 
    category: PostCategory; 
    title: string; 
    body: string; 
    author: string; 
    authorId: string; 
    authorEmail?: string; 
    isNotice?: boolean; 
    isSpoiler?: boolean;
    recruitMeta?: import('../types').PostRecruitMeta;
    poll?: import('../types').PostPoll;
    autoAiReply?: boolean;
  }) => Promise<boolean>;
  deletePost: (id: string) => Promise<boolean>;
  updatePost: (id: string, data: { 
    category?: PostCategory; 
    title?: string; 
    body?: string; 
    isNotice?: boolean; 
    isSpoiler?: boolean; 
    author?: string;
    recruitMeta?: import('../types').PostRecruitMeta;
    poll?: import('../types').PostPoll;
  }) => Promise<boolean>;
  updateRecruitMeta: (postId: string, recruitMeta: import('../types').PostRecruitMeta) => Promise<boolean>;
  votePoll: (postId: string, optionIds: string[]) => Promise<boolean>;
  closePoll: (postId: string) => Promise<boolean>;
  likePost: (id: string) => Promise<void>;
  incrementViews: (id: string) => Promise<void>;

  fetchComments: (postId: string) => Promise<void>;
  checkAiStatus: () => Promise<boolean>;
  addComment: (commentData: { postId: string; author: string; authorId: string; authorEmail?: string; authorGeneration?: string; body: string; parentId?: string }) => Promise<boolean>;
  triggerAiCommentReply: (comment: Comment, prompt: string) => Promise<Comment | null>;
  regenerateAiCommentReply: (aiCommentId: string, triggerCommentId: string) => Promise<Comment | null>;
  cleanupExpiredRateLimitedComment: (id: string) => void;
  updateComment: (id: string, data: { author?: string; body?: string }) => Promise<boolean>;
  deleteComment: (id: string) => Promise<boolean>;
  likeComment: (id: string) => Promise<void>;

  setCategory: (category: PostCategory | '전체') => void;
  setSortBy: (sort: 'recent' | 'popular') => void;
  setSearchQuery: (query: string) => void;
  setAuthorFilterEmail: (emailOrId: string | null, name?: string | null, authorId?: string | null) => void;
  setPage: (page: number) => void;
  getFilteredPosts: () => Post[];
}

export const useBoardStore = create<BoardState>((set, get) => ({
  posts: [],
  comments: [],
  aiGeneratingParentId: null,
  aiGeneratingStage: 'idle',
  aiGeneratingSelectedProvider: null,
  aiGeneratingTools: null,
  aiEnabled: null,
  selectedCategory: '전체',
  sortBy: 'recent',
  searchQuery: '',
  authorFilterEmail: null,
  authorFilterName: null,
  authorFilterId: null,
  currentPage: 1,
  postsPerPage: 15,
  totalPosts: 0,
  isLoading: false,
  isPageLoading: false,
  hasFetchError: false,

  fetchPosts: async (targetPage?: number) => {
    const { currentPage, postsPerPage, selectedCategory, sortBy, searchQuery, authorFilterEmail, authorFilterName, authorFilterId, posts } = get();
    const page = targetPage !== undefined ? targetPage : currentPage;
    const isPopularTab = useUIStore.getState().mobileTab === 'popular';
    const effectiveSortBy = isPopularTab ? 'popular' : sortBy;
    const isFilteringAuthor = Boolean(authorFilterId || authorFilterEmail || authorFilterName);

    const matchesAuthorFilter = (p: Post) => {
      if (!isFilteringAuthor) return true;
      const lowerId = authorFilterId ? authorFilterId.toLowerCase() : null;
      const lowerEmail =
        authorFilterEmail && !authorFilterEmail.includes('*')
          ? authorFilterEmail.toLowerCase()
          : null;
      const lowerName = authorFilterName ? authorFilterName.toLowerCase() : null;

      if (lowerId) {
        if (p.authorId && p.authorId.toLowerCase() === lowerId) return true;
        if (!p.authorId && p.authorEmail && !p.authorEmail.includes('*') && p.authorEmail.toLowerCase() === lowerId) return true;
        return false;
      }

      if (lowerEmail) {
        if (p.authorEmail && !p.authorEmail.includes('*') && p.authorEmail.toLowerCase() === lowerEmail) return true;
        if (p.authorId && p.authorId.toLowerCase() === lowerEmail) return true;
        return false;
      }

      if (lowerName && p.author && p.author.toLowerCase() === lowerName) return true;
      return false;
    };

    if (posts.length === 0) {
      set({ isLoading: true, isPageLoading: true, hasFetchError: false });
    } else {
      set({ isPageLoading: true, hasFetchError: false });
    }

    // Auto-sync any local unsaved posts in the background
    get().syncPendingPosts().catch(() => {});

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(postsPerPage));
      if (selectedCategory !== '전체') params.set('category', selectedCategory);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (effectiveSortBy) params.set('sortBy', effectiveSortBy);
      if (authorFilterId) {
        params.set('authorId', authorFilterId);
      } else if (authorFilterEmail && !authorFilterEmail.includes('*')) {
        params.set('authorEmail', authorFilterEmail);
        params.set('authorId', authorFilterEmail);
      }

      const res = await fetch(`${API_BASE_URL}/posts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        let pagePosts: Post[] = [];
        let totalCount = 0;

        if (data && !Array.isArray(data) && Array.isArray(data.posts)) {
          // Backend supports server-side pagination: { posts, total, ... }
          totalCount = typeof data.total === 'number' ? data.total : data.posts.length;
          let validServerPosts = data.posts.filter((p: Post) => !p.isDeleted && p.status !== 'deleted' && p.status !== 'DELETED');

          // Defensive client-side author filter in case server didn't filter or returned other posts
          if (isFilteringAuthor) {
            validServerPosts = validServerPosts.filter(matchesAuthorFilter);
            if (data.posts.length > validServerPosts.length) {
              totalCount = validServerPosts.length;
            }
          }

          let merged = validServerPosts;

          // Only show pinned hardcoded notice on normal page 1 (not when filtering by author)
          if (page === 1 && !isFilteringAuthor) {
            const hasNotice = merged.some((p: Post) => p.id === HARDCODED_PINNED_NOTICE.id);
            if (!hasNotice && (selectedCategory === '전체' || selectedCategory === '공지')) {
              merged = [HARDCODED_PINNED_NOTICE, ...merged];
              totalCount = Math.max(totalCount + 1, merged.length);
            }
          }

          pagePosts = merged;
        } else if (Array.isArray(data)) {
          // Backend returned full array of all posts
          const validServerPosts = data.filter((p: Post) => !p.isDeleted && p.status !== 'deleted' && p.status !== 'DELETED');

          let allPosts = [...validServerPosts];
          if (!isFilteringAuthor) {
            const hasNotice = allPosts.some((p) => p.id === HARDCODED_PINNED_NOTICE.id);
            if (!hasNotice) {
              allPosts = [HARDCODED_PINNED_NOTICE, ...allPosts];
            }
          }

          // Apply client-side filters
          let filtered = [...allPosts];

          if (isFilteringAuthor) {
            filtered = filtered.filter(matchesAuthorFilter);
          }

          if (isPopularTab) {
            const popularIds = getPopularPostIds(filtered);
            filtered = filtered.filter((p) => popularIds.has(p.id) || p.isPinned);
          }

          if (selectedCategory !== '전체') {
            filtered = filtered.filter((p) => p.category === selectedCategory || p.isPinned);
          }

          if (searchQuery.trim()) {
            const lowerQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(
              (p) =>
                p.title.toLowerCase().includes(lowerQuery) ||
                p.body.toLowerCase().includes(lowerQuery) ||
                p.author.toLowerCase().includes(lowerQuery) ||
                (p.authorEmail && p.authorEmail.toLowerCase().includes(lowerQuery))
            );
          }

          // Sort
          filtered.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;

            if (isPopularTab || effectiveSortBy === 'popular') {
              // 인기 게시글도 최신 순(createdAt 내림차순)으로 정렬
              if ((b.createdAt || 0) !== (a.createdAt || 0)) {
                return (b.createdAt || 0) - (a.createdAt || 0);
              }
              const scoreA = calculatePostEngagementScore(a);
              const scoreB = calculatePostEngagementScore(b);
              return scoreB - scoreA;
            } else {
              return b.createdAt - a.createdAt;
            }
          });

          totalCount = filtered.length;
          const start = (page - 1) * postsPerPage;
          pagePosts = filtered.slice(start, start + postsPerPage);
        }

        set({
          posts: pagePosts,
          totalPosts: Math.max(totalCount, pagePosts.length),
          currentPage: page,
          hasFetchError: false,
        });
      } else {
        const fallback = page === 1 && !isFilteringAuthor ? [HARDCODED_PINNED_NOTICE] : [];
        set({ posts: fallback, totalPosts: fallback.length, currentPage: page, hasFetchError: true });
        useUIStore.getState().addToast('게시글을 불러오지 못했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch paginated posts:', err);
      const fallback = page === 1 && !isFilteringAuthor ? [HARDCODED_PINNED_NOTICE] : [];
      set({ posts: fallback, totalPosts: fallback.length, currentPage: page, hasFetchError: true });
      useUIStore.getState().addToast('서버 통신에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
    } finally {
      set({ isLoading: false, isPageLoading: false });
    }
  },

  fetchAllPostsForAdmin: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch(`${API_BASE_URL}/posts`);
      if (res.ok) {
        const data = await res.json();
        const rawPosts = Array.isArray(data) ? data : data.posts || [];
        const validServerPosts = rawPosts.filter((p: Post) => !p.isDeleted && p.status !== 'deleted' && p.status !== 'DELETED');
        set({ posts: validServerPosts, totalPosts: validServerPosts.length });
      }
    } catch (err) {
      console.error('Failed to fetch all posts for admin:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchPostById: async (id: string) => {
    const existing = get().posts.find((p) => p.id === id);
    if (existing) return existing;

    try {
      const res = await fetch(`${API_BASE_URL}/posts/${id}`);
      if (res.ok) {
        const postData: Post = await res.json();
        if (postData && !postData.isDeleted && postData.status !== 'deleted') {
          set((state) => ({
            posts: state.posts.some((p) => p.id === id) ? state.posts : [postData, ...state.posts],
          }));
          return postData;
        }
      }
    } catch (err) {
      console.error('Failed to fetch post by ID:', err);
    }
    return null;
  },

  fetchStatsForPosts: async () => {},

  syncPendingPosts: async () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('Knoblab-local-posts');
      }
    } catch {}
  },

  addPost: async (postData) => {
    // 강제 보안 적용 (프론트엔드 단)
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) {
      useUIStore.getState().addToast('게시글을 작성하려면 로그인이 필요합니다.', 'error');
      return false;
    }
    const authorEmail = currentUser.email || '';
    const authorId = currentUser.uid;
    const author = currentUser.displayName || (authorEmail ? authorEmail.split('@')[0] : '사용자');

    // 허용된 필드만 추출하여 전송 (Mass Assignment 방지)
    const safePayload = {
      category: postData.category,
      title: postData.title,
      body: postData.body,
      isNotice: Boolean(postData.isNotice),
      isSpoiler: Boolean(postData.isSpoiler),
      author: author,
      authorId: authorId,
      authorEmail: authorEmail,
      recruitMeta: postData.recruitMeta,
      poll: postData.poll,
      autoAiReply: Boolean(postData.autoAiReply),
    };

    try {
      const res = await authFetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        body: JSON.stringify(safePayload),
      });

      if (res.ok) {
        const createdPost: Post = await res.json();
        if (createdPost && createdPost.id) {
          set((state) => ({
            posts: [createdPost, ...state.posts.filter((p) => p.id !== createdPost.id)],
            totalPosts: state.totalPosts + 1,
            currentPage: 1,
          }));
          return true;
        }
      }

      if (res.status === 401) {
        useUIStore.getState().addToast('로그인 인증이 만료되었습니다. 다시 로그인해 주세요.', 'error');
      } else {
        const errorData = await res.json().catch(() => ({}));
        const baseMsg = errorData.error || '게시글 등록에 실패했습니다.';
        useUIStore.getState().addToast(
          `${baseMsg} status.knoblab.xyz에서 서버 상태를 확인해 보세요.`,
          'error'
        );
      }
      return false;
    } catch (err) {
      console.error('Failed to add post on server:', err);
      useUIStore.getState().addToast(
        '서버 통신에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.',
        'error'
      );
      return false;
    }
  },

  deletePost: async (id) => {
    try {
      const deleted = await deleteRemoteResource('posts', id);
      if (!deleted) {
        useUIStore.getState().addToast('게시글 삭제에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
        return false;
      }

      set((state) => ({
        posts: state.posts.filter((p) => p.id !== id),
        totalPosts: Math.max(0, state.totalPosts - 1),
        comments: state.comments.filter((c) => c.postId !== id),
      }));
      return true;
    } catch (err) {
      console.error('Failed to delete post on server:', err);
      useUIStore.getState().addToast('게시글 삭제에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
      return false;
    }
  },

  updatePost: async (id, data) => {
    // 허용된 필드만 추출하여 전송 (Mass Assignment 방지)
    const safePayload = {
      ...(data.category !== undefined && { category: data.category }),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.body !== undefined && { body: data.body }),
      ...(data.isNotice !== undefined && { isNotice: Boolean(data.isNotice) }),
      ...(data.isSpoiler !== undefined && { isSpoiler: Boolean(data.isSpoiler) }),
      ...(data.recruitMeta !== undefined && { recruitMeta: data.recruitMeta }),
      ...(data.poll !== undefined && { poll: data.poll }),
    };

    try {
      const res = await authFetch(`${API_BASE_URL}/posts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(safePayload),
      });
      if (res.ok) {
        const updatedPost = await res.json();
        set((state) => ({
          posts: state.posts.map((p) => (p.id === id ? { ...p, ...updatedPost } : p)),
        }));
        return true;
      } else {
        if (res.status === 401) {
          useUIStore.getState().addToast('로그인 인증이 만료되었습니다. 다시 로그인해 주세요.', 'error');
        } else {
          useUIStore.getState().addToast('게시글 수정에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
        }
        return false;
      }
    } catch (err) {
      console.error('Failed to update post:', err);
      useUIStore.getState().addToast('게시글 수정 중 서버 통신에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
      return false;
    }
  },

  updateRecruitMeta: async (postId, recruitMeta) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/posts/${postId}/recruit`, {
        method: 'PATCH',
        body: JSON.stringify({ recruitMeta }),
      });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          posts: state.posts.map((p) => (p.id === postId ? { ...p, recruitMeta: data.recruitMeta || recruitMeta } : p)),
        }));
        useUIStore.getState().addToast('상태가 변경되었습니다.', 'success');
        return true;
      }
      const err = await res.json().catch(() => ({}));
      useUIStore.getState().addToast(err.error || '상태 변경에 실패했습니다.', 'error');
      return false;
    } catch (err) {
      console.error('Failed to update recruit meta:', err);
      useUIStore.getState().addToast('서버 통신 실패', 'error');
      return false;
    }
  },

  votePoll: async (postId, optionIds) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/posts/${postId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ optionIds }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.poll) {
          set((state) => ({
            posts: state.posts.map((p) => (p.id === postId ? { ...p, poll: data.poll } : p)),
          }));
        }
        return true;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '투표에 실패했습니다.');
    } catch (err) {
      console.error('Failed to vote:', err);
      throw err;
    }
  },

  closePoll: async (postId) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/posts/${postId}/poll-close`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          posts: state.posts.map((p) => (p.id === postId ? { ...p, poll: data.poll || { ...p.poll!, isClosed: true } } : p)),
        }));
        useUIStore.getState().addToast('투표가 마감되었습니다.', 'info');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to close poll:', err);
      return false;
    }
  },

  likePost: async (id) => {
    const user = useAuthStore.getState().user;
    const post = get().posts.find((p) => p.id === id);
    if (!user || !post) {
      useUIStore.getState().addToast('좋아요를 누르려면 로그인이 필요합니다.', 'info');
      return;
    }

    try {
      const res = await authFetch(`${API_BASE_URL}/posts/${id}/like`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        const newLikes = typeof data.likes === 'number' ? data.likes : (post.likes || 0);
        const hasLiked = Boolean(data.hasLiked);

        set((state) => ({
          posts: state.posts.map((p) => (p.id === id ? { ...p, likes: newLikes, hasLiked } : p)),
        }));

        if (hasLiked) {
          useUIStore.getState().addToast('게시글을 추천했습니다.', 'success');
        } else {
          useUIStore.getState().addToast('게시글 추천을 취소했습니다.', 'info');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        useUIStore.getState().addToast(errData.error || '좋아요 통신에 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save post like:', error);
      useUIStore.getState().addToast('좋아요 통신에 실패했습니다.', 'error');
    }
  },

  incrementViews: async (id) => {
    if (!id) return;
    try {
      await fetch(`${API_BASE_URL}/posts/${id}/view`, { method: 'POST' });
    } catch {
      // silently fail
    }
  },

  fetchComments: async (postId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/comments?postId=${postId}`);
      if (res.ok) {
        const data = await res.json();
        if (!Array.isArray(data)) return;
        const localParentMap = JSON.parse(localStorage.getItem(`Knoblab-comment-parents-${postId}`) || '{}');
        const updatedData: Comment[] = data
          .filter((c: any) => !c.isDeleted && c.status !== 'deleted' && c.status !== 'DELETED')
          .map((c) => {
            let actualParentId = c.parentId || localParentMap[c.id];
            let actualBody = c.body;

            const replyMatch = actualBody.match(/^\[REPLY_TO:(.+?)\]\n([\s\S]*)$/);
            if (replyMatch) {
              actualParentId = replyMatch[1];
              actualBody = replyMatch[2];
            }

            return {
              ...c,
              parentId: actualParentId,
              body: actualBody,
            };
          });
        set({ comments: updatedData });
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  },

  checkAiStatus: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/comments/ai-status`);
      if (res.ok) {
        const data = await res.json();
        const enabled = Boolean(data.enabled);
        set({ aiEnabled: enabled });
        return enabled;
      }
    } catch {
      // fallback silently
    }
    set({ aiEnabled: false });
    return false;
  },

  addComment: async (commentData) => {
    try {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) {
        useUIStore.getState().addToast('댓글을 작성하려면 로그인이 필요합니다.', 'error');
        return false;
      }

      const payloadBody = commentData.parentId
        ? `[REPLY_TO:${commentData.parentId}]\n${commentData.body}`
        : commentData.body;

      const authorEmail = currentUser.email || '';
      const authorId = currentUser.uid;
      const author = currentUser.displayName || (authorEmail ? authorEmail.split('@')[0] : '사용자');

      const safePayload = {
        postId: commentData.postId,
        parentId: commentData.parentId,
        body: payloadBody,
        author: author,
        authorId: authorId,
        authorEmail: authorEmail,
        authorGeneration: commentData.authorGeneration,
      };

      const res = await authFetch(`${API_BASE_URL}/comments`, {
        method: 'POST',
        body: JSON.stringify(safePayload),
      });

      if (res.ok) {
        const newComment: Comment = await res.json();
        if (newComment && newComment.id) {
          let actualParentId = newComment.parentId || commentData.parentId;
          let actualBody = newComment.body || payloadBody;

          const replyMatch = actualBody.match(/^\[REPLY_TO:(.+?)\]\n([\s\S]*)$/);
          if (replyMatch) {
            actualParentId = replyMatch[1];
            actualBody = replyMatch[2];
          }

          const commentWithParent: Comment = {
            ...newComment,
            parentId: actualParentId,
            body: actualBody,
          };
          if (commentData.parentId) {
            const localParentMap = JSON.parse(localStorage.getItem(`Knoblab-comment-parents-${commentData.postId}`) || '{}');
            localParentMap[commentWithParent.id] = commentData.parentId;
            localStorage.setItem(`Knoblab-comment-parents-${commentData.postId}`, JSON.stringify(localParentMap));
          }
          set((state) => ({
            comments: [...state.comments, commentWithParent],
            posts: state.posts.map((p) =>
              p.id === commentData.postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
            ),
          }));

          const asteriskPrompt = extractAsteriskPrompt(actualBody);
          if (asteriskPrompt) {
            useUIStore.getState().addToast(
              'asterisk AI가 답변 작성을 시작했습니다. 다른 페이지로 이동하셔도 완료 시 알림으로 안내됩니다.',
              'info',
              undefined,
              'sparkles'
            );
            void import('./useNotificationStore').then((m) => {
              m.useNotificationStore.getState().enableFastPolling(120);
            }).catch(() => {});
            void get().triggerAiCommentReply(commentWithParent, asteriskPrompt);
          }

          return true;
        }
      }

      if (res.status === 401) {
        useUIStore.getState().addToast('로그인 인증이 만료되었습니다. 다시 로그인해 주세요.', 'error');
      } else {
        const errorData = await res.json().catch(() => ({}));
        const baseMsg = errorData.error || '댓글 등록에 실패했습니다.';
        useUIStore.getState().addToast(
          `${baseMsg} status.knoblab.xyz에서 서버 상태를 확인해 보세요.`,
          'error'
        );
      }
      return false;
    } catch (err) {
      console.error('Failed to add comment:', err);
      useUIStore.getState().addToast(
        '서버 통신에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.',
        'error'
      );
      return false;
    }
  },

  triggerAiCommentReply: async (comment, prompt) => {
    const targetParentId = comment.parentId || comment.id;
    set({
      aiGeneratingParentId: targetParentId,
      aiGeneratingStage: 'selecting_model',
      aiGeneratingSelectedProvider: null,
    });

    let isPolling = true;
    const pollProgress = async () => {
      while (isPolling) {
        try {
          const progressRes = await fetch(
            `${API_BASE_URL}/comments/ai-progress?commentId=${encodeURIComponent(comment.id)}&parentId=${encodeURIComponent(targetParentId)}`
          );
          if (progressRes.ok) {
            const data = await progressRes.json();
            if (data && isPolling) {
              const tools = Array.isArray(data.tools) && data.tools.length > 0 ? data.tools : null;
              if (data.provider) {
                set({
                  aiGeneratingSelectedProvider: data.provider,
                  aiGeneratingStage: data.stage || 'thinking',
                  aiGeneratingTools: tools,
                });
              } else if (data.stage) {
                set({
                  aiGeneratingStage: data.stage,
                  aiGeneratingTools: tools,
                });
              }
            }
          }
        } catch {
          // ignore polling errors
        }
        if (!isPolling) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    };
    void pollProgress();

    const timerThinking = setTimeout(() => {
      if (get().aiGeneratingParentId === targetParentId && get().aiGeneratingStage === 'selecting_model') {
        set({ aiGeneratingStage: 'thinking' });
      }
    }, 1200);
    const timerWriting = setTimeout(() => {
      if (get().aiGeneratingParentId === targetParentId) {
        set({ aiGeneratingStage: 'writing' });
      }
    }, 4200);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await authFetch(`${API_BASE_URL}/comments/ai-reply`, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          commentId: comment.id,
          postId: comment.postId,
          parentId: targetParentId,
          prompt,
        }),
      });

      if (res.ok) {
        const aiComment: Comment = await res.json();
        if (aiComment && aiComment.id) {
          let actualParentId = aiComment.parentId || targetParentId;
          let actualBody = aiComment.body || '';

          const replyMatch = actualBody.match(/^\[REPLY_TO:(.+?)\]\n([\s\S]*)$/);
          if (replyMatch) {
            actualParentId = replyMatch[1];
            actualBody = replyMatch[2];
          }

          const normalizedAiComment: Comment = {
            ...aiComment,
            parentId: actualParentId,
            body: actualBody,
          };

          const localParentMap = JSON.parse(localStorage.getItem(`Knoblab-comment-parents-${comment.postId}`) || '{}');
          localParentMap[normalizedAiComment.id] = actualParentId;
          localStorage.setItem(`Knoblab-comment-parents-${comment.postId}`, JSON.stringify(localParentMap));

          set((state) => {
            const alreadyExists = state.comments.some((c) => c.id === normalizedAiComment.id);
            if (alreadyExists) return {};
            return {
              comments: [...state.comments, normalizedAiComment],
              posts: state.posts.map((p) =>
                p.id === comment.postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
              ),
            };
          });
          return normalizedAiComment;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        useUIStore.getState().addToast(
          errData.error || 'asterisk AI 답변 생성에 실패했습니다.',
          'error'
        );
      }
      return null;
    } catch (err: any) {
      console.warn('AI comment reply background processing:', err);
      if (err?.name !== 'AbortError') {
        useUIStore.getState().addToast('asterisk AI 답변 생성 중 통신 오류가 발생했습니다. 잠시 후 알림을 확인해 주세요.', 'error');
      }
      // Re-sync comments in case backend completed the generation in the background
      setTimeout(() => {
        void get().fetchComments(comment.postId);
      }, 2000);
      return null;
    } finally {
      isPolling = false;
      clearTimeout(timeoutId);
      clearTimeout(timerThinking);
      clearTimeout(timerWriting);
      set((state) =>
        state.aiGeneratingParentId === targetParentId
          ? {
              aiGeneratingParentId: null,
              aiGeneratingStage: 'idle',
              aiGeneratingSelectedProvider: null,
              aiGeneratingTools: null,
            }
          : {}
      );
    }
  },

  regenerateAiCommentReply: async (aiCommentId, triggerCommentId) => {
    const existingAiComment = get().comments.find((c) => c.id === aiCommentId);
    if (!existingAiComment) return null;
    const targetParentId = existingAiComment.parentId || existingAiComment.id;
    set({
      aiGeneratingParentId: targetParentId,
      aiGeneratingStage: 'selecting_model',
      aiGeneratingSelectedProvider: null,
    });

    let isPolling = true;
    const pollProgress = async () => {
      while (isPolling) {
        try {
          const progressRes = await fetch(
            `${API_BASE_URL}/comments/ai-progress?commentId=${encodeURIComponent(triggerCommentId || aiCommentId)}&parentId=${encodeURIComponent(targetParentId)}`
          );
          if (progressRes.ok) {
            const data = await progressRes.json();
            if (data && isPolling) {
              const tools = Array.isArray(data.tools) && data.tools.length > 0 ? data.tools : null;
              if (data.provider) {
                set({
                  aiGeneratingSelectedProvider: data.provider,
                  aiGeneratingStage: data.stage || 'thinking',
                  aiGeneratingTools: tools,
                });
              } else if (data.stage) {
                set({
                  aiGeneratingStage: data.stage,
                  aiGeneratingTools: tools,
                });
              }
            }
          }
        } catch {
          // ignore polling errors
        }
        if (!isPolling) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    };
    void pollProgress();

    const timerThinking = setTimeout(() => {
      if (get().aiGeneratingParentId === targetParentId && get().aiGeneratingStage === 'selecting_model') {
        set({ aiGeneratingStage: 'thinking' });
      }
    }, 1200);
    const timerWriting = setTimeout(() => {
      if (get().aiGeneratingParentId === targetParentId) {
        set({ aiGeneratingStage: 'writing' });
      }
    }, 4200);

    void import('./useNotificationStore').then((m) => {
      m.useNotificationStore.getState().enableFastPolling(120);
    }).catch(() => {});

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await authFetch(`${API_BASE_URL}/comments/ai-reply`, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          commentId: triggerCommentId,
          aiCommentId,
          regenerate: true,
        }),
      });

      if (res.ok) {
        const aiComment: Comment = await res.json();
        if (aiComment && aiComment.id) {
          let actualParentId = aiComment.parentId || targetParentId;
          let actualBody = aiComment.body || '';

          const replyMatch = actualBody.match(/^\[REPLY_TO:(.+?)\]\n([\s\S]*)$/);
          if (replyMatch) {
            actualParentId = replyMatch[1];
            actualBody = replyMatch[2];
          }

          const normalizedAiComment: Comment = {
            ...aiComment,
            parentId: actualParentId,
            body: actualBody,
          };

          set((state) => ({
            comments: state.comments.map((c) => (c.id === aiCommentId ? normalizedAiComment : c)),
          }));
          useUIStore.getState().addToast('asterisk AI 답변이 생성되었습니다.', 'success');
          return normalizedAiComment;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 410) {
          set((state) => ({
            comments: state.comments.filter((c) => c.id !== aiCommentId),
            posts: state.posts.map((p) =>
              p.id === existingAiComment.postId
                ? { ...p, commentCount: Math.max(0, (p.commentCount || 1) - 1) }
                : p
            ),
          }));
        }
        useUIStore.getState().addToast(
          errData.error || 'asterisk AI 답변 재생성에 실패했습니다.',
          'error'
        );
      }
      return null;
    } catch (err) {
      console.error('Failed to regenerate AI comment reply:', err);
      useUIStore.getState().addToast('asterisk AI 응답 시간이 초과되었거나 통신에 실패했습니다.', 'error');
      return null;
    } finally {
      isPolling = false;
      clearTimeout(timeoutId);
      clearTimeout(timerThinking);
      clearTimeout(timerWriting);
      set((state) =>
        state.aiGeneratingParentId === targetParentId
          ? {
              aiGeneratingParentId: null,
              aiGeneratingStage: 'idle',
              aiGeneratingSelectedProvider: null,
              aiGeneratingTools: null,
            }
          : {}
      );
    }
  },

  cleanupExpiredRateLimitedComment: (id) => {
    const target = get().comments.find((c) => c.id === id);
    if (!target) return;
    set((state) => ({
      comments: state.comments.filter((c) => c.id !== id),
      posts: state.posts.map((p) =>
        p.id === target.postId
          ? { ...p, commentCount: Math.max(0, (p.commentCount || 1) - 1) }
          : p
      ),
    }));
  },

  deleteComment: async (id) => {
    const comment = get().comments.find((c) => c.id === id);
    if (!comment) return false;

    try {
      const deleted = await deleteRemoteResource('comments', id);
      if (!deleted) {
        useUIStore.getState().addToast('댓글 삭제에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
        return false;
      }

      const parentMapKey = 'Knoblab-comment-parents-' + comment.postId;
      const parentMap = JSON.parse(localStorage.getItem(parentMapKey) || '{}');
      delete parentMap[id];
      localStorage.setItem(parentMapKey, JSON.stringify(parentMap));

      set((state) => {
        const getDescendantIds = (pid: string) => {
          const ids = new Set<string>([pid]);
          let added = true;
          while (added) {
            added = false;
            for (const c of state.comments) {
              if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
                ids.add(c.id);
                added = true;
              }
            }
          }
          return ids;
        };
        const toDelete = getDescendantIds(id);
        const deletedCount = toDelete.size;
        return {
          comments: state.comments.filter((c) => !toDelete.has(c.id)),
          posts: state.posts.map((p) =>
            p.id === comment.postId
              ? { ...p, commentCount: Math.max(0, (p.commentCount || 1) - deletedCount) }
              : p
          ),
        };
      });
      return true;
    } catch (err) {
      console.error('Failed to delete comment on server:', err);
      useUIStore.getState().addToast('댓글 삭제에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
      return false;
    }
  },

  updateComment: async (id, data) => {
    // 허용된 필드만 추출하여 전송 (Mass Assignment 방지)
    const safePayload = {
      ...(data.body !== undefined && { body: data.body }),
    };

    try {
      const res = await authFetch(`${API_BASE_URL}/comments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(safePayload),
      });
      if (res.ok) {
        const updatedComment = await res.json();
        set((state) => ({
          comments: state.comments.map((c) => (c.id === id ? { ...c, ...updatedComment } : c)),
        }));
        return true;
      } else if (res.status === 401) {
        useUIStore.getState().addToast('로그인 인증이 만료되었습니다. 다시 로그인해 주세요.', 'error');
      } else {
        useUIStore.getState().addToast('댓글 수정에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
      }
      return false;
    } catch (err) {
      console.error('Failed to update comment:', err);
      useUIStore.getState().addToast('댓글 수정 중 서버 통신에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.', 'error');
      return false;
    }
  },


  likeComment: async (id) => {
    const user = useAuthStore.getState().user;
    if (!user) {
      useUIStore.getState().addToast('좋아요를 누르려면 로그인이 필요합니다.', 'info');
      return;
    }

    try {
      const res = await authFetch(`${API_BASE_URL}/comments/${id}/like`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        const newLikes = typeof data.likes === 'number' ? data.likes : 0;
        const hasLiked = Boolean(data.hasLiked);

        set((state) => ({
          comments: state.comments.map((c) => (c.id === id ? { ...c, likes: newLikes, hasLiked } : c)),
        }));

        if (hasLiked) {
          useUIStore.getState().addToast('댓글을 추천했습니다.', 'success');
        } else {
          useUIStore.getState().addToast('댓글 추천을 취소했습니다.', 'info');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        useUIStore.getState().addToast(errData.error || '좋아요 통신에 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save comment like:', error);
      useUIStore.getState().addToast('좋아요 통신에 실패했습니다.', 'error');
    }
  },

  setCategory: (category) => {
    set({ selectedCategory: category, currentPage: 1 });
    get().fetchPosts(1);
  },
  setSortBy: (sort) => {
    set({ sortBy: sort, currentPage: 1 });
    get().fetchPosts(1);
  },
  setSearchQuery: (query) => {
    set({ searchQuery: query, currentPage: 1 });
    get().fetchPosts(1);
  },
  setAuthorFilterEmail: (emailOrId, name, authorId) => {
    if (!emailOrId && !authorId) {
      set({ authorFilterEmail: null, authorFilterId: null, authorFilterName: null, currentPage: 1 });
    } else {
      const isEmail = emailOrId ? emailOrId.includes('@') : false;
      const isMasked = emailOrId ? emailOrId.includes('*') : false;
      const resolvedId = authorId || (!isEmail ? emailOrId : null);
      const resolvedEmail = isEmail && !isMasked ? emailOrId : null;
      set({
        authorFilterEmail: resolvedEmail,
        authorFilterId: resolvedId,
        authorFilterName: name || null,
        currentPage: 1,
      });
    }
    get().fetchPosts(1);
  },
  setPage: (page) => {
    set({ currentPage: page });
    get().fetchPosts(page);
  },

  getFilteredPosts: () => {
    const { posts } = get();
    // Server already filters and paginates posts; preserve pinned post ordering
    return [...posts].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });
  },
}));
