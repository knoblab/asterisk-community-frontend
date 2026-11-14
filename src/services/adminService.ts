import { authFetch } from '../stores/useBoardStore';
import { isAdminUser, DEFAULT_ADMIN_UIDS } from '../constants/admin';
import { getMemberGenerationLabel } from '../utils/member';
import type { Post, Comment, PostCategory } from '../types';

const baseUrl = import.meta.env.VITE_API_URL || '';
const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;

/**
 * Verify whether current user session possesses valid backend admin privileges
 */
export const verifyAdminSession = async (): Promise<boolean> => {
  try {
    const res = await authFetch(`${API_BASE_URL}/admin/verify`);
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data && data.isAdmin === true);
  } catch (error) {
    console.error('verifyAdminSession error:', error);
    return false;
  }
};

export interface AdminUserInfo {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  generation: string | null;
  isAdmin: boolean;
  postCount: number;
  activePostCount: number;
  deletedPostCount: number;
  commentCount: number;
  activeCommentCount: number;
  deletedCommentCount: number;
  totalLikesReceived: number;
  firstActivityAt: number;
  lastActivityAt: number;
}

/**
 * Fetch all posts for admin, strictly preserving deleted posts (isDeleted: true / status: 'deleted')
 */
export const fetchAdminPosts = async (): Promise<Post[]> => {
  try {
    const res = await authFetch(`${API_BASE_URL}/posts?includeDeleted=true`);
    if (!res.ok) {
      throw new Error(`Failed to fetch admin posts: ${res.status}`);
    }
    const data = await res.json();
    const rawPosts: Post[] = Array.isArray(data) ? data : data.posts || [];
    return rawPosts.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('fetchAdminPosts error:', error);
    return [];
  }
};

/**
 * Fetch all comments for admin, including deleted comments
 */
export const fetchAdminComments = async (posts: Post[] = []): Promise<Comment[]> => {
  try {
    // 1. Try global comments endpoint
    const res = await authFetch(`${API_BASE_URL}/comments?includeDeleted=true`);
    if (res.ok) {
      const data: Comment[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.sort((a, b) => b.createdAt - a.createdAt);
      }
    }
  } catch {
    // Fall back to per-post comment fetching
  }

  // 2. Fallback: Query comments for posts in parallel (top 50 posts)
  try {
    const targetPosts = posts.slice(0, 50);
    const commentPromises = targetPosts.map(async (p) => {
      try {
        const res = await authFetch(`${API_BASE_URL}/comments?postId=${p.id}&includeDeleted=true`);
        if (res.ok) {
          const list: Comment[] = await res.json();
          return Array.isArray(list) ? list : [];
        }
      } catch {
        return [];
      }
      return [];
    });

    const results = await Promise.all(commentPromises);
    const flattened = results.flat();
    const uniqueMap = new Map<string, Comment>();
    for (const c of flattened) {
      if (!uniqueMap.has(c.id)) {
        uniqueMap.set(c.id, c);
      }
    }
    return Array.from(uniqueMap.values()).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('fetchAdminComments per-post error:', error);
    return [];
  }
};

/**
 * Aggregate comprehensive user list and statistics across posts and comments
 */
export const aggregateAdminUsers = (posts: Post[], comments: Comment[]): AdminUserInfo[] => {
  const userMap = new Map<string, AdminUserInfo>();

  const getOrCreateUser = (
    uid: string,
    displayName: string,
    email: string | null,
    photoURL: string | null,
    generation: string | null,
    activityTime: number
  ): AdminUserInfo => {
    let user = userMap.get(uid);
    if (!user) {
      const admin = isAdminUser(uid, email);
      const gen = generation || getMemberGenerationLabel(email, uid);
      user = {
        uid,
        displayName: displayName || (email ? email.split('@')[0] : '사용자'),
        email: email || null,
        photoURL: photoURL || null,
        generation: gen,
        isAdmin: admin,
        postCount: 0,
        activePostCount: 0,
        deletedPostCount: 0,
        commentCount: 0,
        activeCommentCount: 0,
        deletedCommentCount: 0,
        totalLikesReceived: 0,
        firstActivityAt: activityTime,
        lastActivityAt: activityTime,
      };
      userMap.set(uid, user);
    } else {
      if (!user.displayName && displayName) user.displayName = displayName;
      if (!user.email && email) user.email = email;
      if (!user.photoURL && photoURL) user.photoURL = photoURL;
      if (!user.generation && generation) user.generation = generation;
      if (activityTime < user.firstActivityAt) user.firstActivityAt = activityTime;
      if (activityTime > user.lastActivityAt) user.lastActivityAt = activityTime;
    }
    return user;
  };

  // Process posts
  for (const post of posts) {
    if (!post.authorId) continue;
    const user = getOrCreateUser(
      post.authorId,
      post.author,
      post.authorEmail || null,
      post.authorPhotoURL || null,
      post.authorGeneration || null,
      post.createdAt
    );
    const isDeleted = Boolean(post.isDeleted || post.status === 'deleted' || post.status === 'DELETED');
    user.postCount += 1;
    if (isDeleted) {
      user.deletedPostCount += 1;
    } else {
      user.activePostCount += 1;
    }
    user.totalLikesReceived += post.likes || 0;
  }

  // Process comments
  for (const comment of comments) {
    if (!comment.authorId) continue;
    const user = getOrCreateUser(
      comment.authorId,
      comment.author,
      comment.authorEmail || null,
      comment.authorPhotoURL || null,
      comment.authorGeneration || null,
      comment.createdAt
    );
    const isDeleted = Boolean(comment.isDeleted || comment.status === 'deleted' || comment.status === 'DELETED');
    user.commentCount += 1;
    if (isDeleted) {
      user.deletedCommentCount += 1;
    } else {
      user.activeCommentCount += 1;
    }
    user.totalLikesReceived += comment.likes || 0;
  }

  // Pre-seed known admins if not already present
  for (const adminUid of DEFAULT_ADMIN_UIDS) {
    if (!userMap.has(adminUid)) {
      userMap.set(adminUid, {
        uid: adminUid,
        displayName: 'asterisk 관리자',
        email: null,
        photoURL: null,
        generation: null,
        isAdmin: true,
        postCount: 0,
        activePostCount: 0,
        deletedPostCount: 0,
        commentCount: 0,
        activeCommentCount: 0,
        deletedCommentCount: 0,
        totalLikesReceived: 0,
        firstActivityAt: Date.now(),
        lastActivityAt: Date.now(),
      });
    }
  }

  return Array.from(userMap.values()).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
};

/**
 * Restore a soft-deleted post
 */
export const restorePost = async (id: string): Promise<boolean> => {
  const url = `${API_BASE_URL}/posts/${id}`;
  try {
    const patchRes = await authFetch(url, {
      method: 'PATCH',
      body: JSON.stringify({ isDeleted: false, status: 'published' }),
    });
    if (patchRes.ok) return true;

    const putRes = await authFetch(url, {
      method: 'PUT',
      body: JSON.stringify({ isDeleted: false, status: 'published' }),
    });
    return putRes.ok;
  } catch (error) {
    console.error('restorePost failed:', error);
    return false;
  }
};

/**
 * Restore a soft-deleted comment
 */
export const restoreComment = async (id: string): Promise<boolean> => {
  const url = `${API_BASE_URL}/comments/${id}`;
  try {
    const patchRes = await authFetch(url, {
      method: 'PATCH',
      body: JSON.stringify({ isDeleted: false, status: 'published' }),
    });
    if (patchRes.ok) return true;

    const putRes = await authFetch(url, {
      method: 'PUT',
      body: JSON.stringify({ isDeleted: false, status: 'published' }),
    });
    return putRes.ok;
  } catch (error) {
    console.error('restoreComment failed:', error);
    return false;
  }
};

/**
 * Soft delete a post (Mark as deleted)
 */
export const softDeletePost = async (id: string): Promise<boolean> => {
  const url = `${API_BASE_URL}/posts/${id}`;
  try {
    const patchRes = await authFetch(url, {
      method: 'PATCH',
      body: JSON.stringify({ isDeleted: true, status: 'deleted' }),
    });
    if (patchRes.ok) return true;

    const putRes = await authFetch(url, {
      method: 'PUT',
      body: JSON.stringify({ isDeleted: true, status: 'deleted' }),
    });
    return putRes.ok;
  } catch (error) {
    console.error('softDeletePost failed:', error);
    return false;
  }
};

/**
 * Soft delete a comment (Mark as deleted)
 */
export const softDeleteComment = async (id: string): Promise<boolean> => {
  const url = `${API_BASE_URL}/comments/${id}`;
  try {
    const patchRes = await authFetch(url, {
      method: 'PATCH',
      body: JSON.stringify({ isDeleted: true, status: 'deleted' }),
    });
    if (patchRes.ok) return true;

    const putRes = await authFetch(url, {
      method: 'PUT',
      body: JSON.stringify({ isDeleted: true, status: 'deleted' }),
    });
    return putRes.ok;
  } catch (error) {
    console.error('softDeleteComment failed:', error);
    return false;
  }
};

/**
 * Permanent Delete (ADMIN CONSOLE ONLY)
 */
export const permanentDeletePost = async (id: string): Promise<boolean> => {
  const url = `${API_BASE_URL}/posts/${id}?permanent=true`;
  try {
    const res = await authFetch(url, {
      method: 'DELETE',
      headers: {
        'X-Admin-Confirm': 'permanent-delete',
      },
    });
    return res.ok || res.status === 404;
  } catch (error) {
    console.error('permanentDeletePost failed:', error);
    return false;
  }
};

/**
 * Permanent Delete Comment (ADMIN CONSOLE ONLY)
 */
export const permanentDeleteComment = async (id: string): Promise<boolean> => {
  const url = `${API_BASE_URL}/comments/${id}?permanent=true`;
  try {
    const res = await authFetch(url, {
      method: 'DELETE',
      headers: {
        'X-Admin-Confirm': 'permanent-delete',
      },
    });
    return res.ok || res.status === 404;
  } catch (error) {
    console.error('permanentDeleteComment failed:', error);
    return false;
  }
};

/**
 * Update Post content by admin
 */
export const updateAdminPost = async (
  id: string,
  data: { category?: PostCategory; title?: string; body?: string }
): Promise<boolean> => {
  const url = `${API_BASE_URL}/posts/${id}`;
  try {
    const res = await authFetch(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch (error) {
    console.error('updateAdminPost failed:', error);
    return false;
  }
};

/**
 * Update Comment body by admin
 */
export const updateAdminComment = async (id: string, body: string): Promise<boolean> => {
  const url = `${API_BASE_URL}/comments/${id}`;
  try {
    const res = await authFetch(url, {
      method: 'PUT',
      body: JSON.stringify({ body }),
    });
    return res.ok;
  } catch (error) {
    console.error('updateAdminComment failed:', error);
    return false;
  }
};
