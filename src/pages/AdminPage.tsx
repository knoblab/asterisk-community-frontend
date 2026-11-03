import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
  Flag,
  FileText,
  Trash2,
  Edit3,
  X,
  Save,
  MessageCircle,
  Users,
  RotateCcw,
  ExternalLink,
  Search,
  Filter,
  Copy,
  Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useBoardStore } from '../stores/useBoardStore';
import { useUIStore } from '../stores/useUIStore';
import { dismissReport, fetchReports, type ReportRecord } from '../services/reportService';
import {
  fetchAdminPosts,
  fetchAdminComments,
  aggregateAdminUsers,
  restorePost,
  restoreComment,
  softDeletePost,
  softDeleteComment,
  permanentDeletePost,
  permanentDeleteComment,
  updateAdminPost,
  updateAdminComment,
  verifyAdminSession,
  type AdminUserInfo,
} from '../services/adminService';
import { getPostPath } from '../utils/postLink';
import { AuthorBadge } from '../components/common/AuthorBadge';
import { UserAvatar } from '../components/common/UserAvatar';
import { Pagination } from '../components/common/Pagination';
import { AdminUserActivityModal } from '../components/admin/AdminUserActivityModal';
import { AdminCommentEditModal } from '../components/admin/AdminCommentEditModal';
import { isAdminUser } from '../constants/admin';
import type { Post, Comment, PostCategory } from '../types';

const formatDate = (timestamp: number) => {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}`;
};

type AdminTab = 'posts' | 'comments' | 'users' | 'reports';

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const addToast = useUIStore((state) => state.addToast);
  const setAuthorFilterEmail = useBoardStore((state) => state.setAuthorFilterEmail);

  // Active Tab
  const [currentTab, setCurrentTab] = useState<AdminTab>('posts');

  // Core Data State (preserving deleted items!)
  const [adminPosts, setAdminPosts] = useState<Post[]>([]);
  const [adminComments, setAdminComments] = useState<Comment[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Post Tab Controls
  const [postPage, setPostPage] = useState(1);
  const [postPageSize, setPostPageSize] = useState(15);
  const [postStatusFilter, setPostStatusFilter] = useState<'all' | 'active' | 'deleted'>('all');
  const [postCategoryFilter, setPostCategoryFilter] = useState<PostCategory | '전체'>('전체');
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [postSortBy, setPostSortBy] = useState<'recent' | 'likes' | 'views' | 'comments'>('recent');

  // Comment Tab Controls
  const [commentPage, setCommentPage] = useState(1);
  const [commentPageSize, setCommentPageSize] = useState(15);
  const [commentStatusFilter, setCommentStatusFilter] = useState<'all' | 'active' | 'deleted'>('all');
  const [commentSearchQuery, setCommentSearchQuery] = useState('');

  // User Tab Controls
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(15);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'deleted_content'>('all');
  const [userSortBy, setUserSortBy] = useState<'recent' | 'posts' | 'comments' | 'likes' | 'name'>('recent');

  // Modals State
  const [selectedUserForModal, setSelectedUserForModal] = useState<AdminUserInfo | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<PostCategory>('잡담');
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);

  // UID Copy helper
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const [isServerVerified, setIsServerVerified] = useState<boolean | null>(null);

  const isAdmin = isAdminUser(user?.uid, user?.email);
  const categories: PostCategory[] = ['질문', '리뷰', '자료', '정보', '공지', '이벤트', '잡담'];

  // Load all admin data
  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const serverVerified = await verifyAdminSession();
      if (!serverVerified) {
        setIsServerVerified(false);
        addToast('서버 관리자 인증에 실패했습니다.', 'error');
        return;
      }
      setIsServerVerified(true);
      const [postsData, reportsData] = await Promise.all([
        fetchAdminPosts(),
        fetchReports().catch(() => []),
      ]);
      setAdminPosts(postsData);
      setReports(reportsData);

      // Fetch comments for posts
      const commentsData = await fetchAdminComments(postsData);
      setAdminComments(commentsData);
    } catch (error) {
      console.error('Failed to load admin data:', error);
      setIsServerVerified(false);
      addToast('관리자 데이터를 불러오는 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin]);

  // Aggregated Users List
  const adminUsers = useMemo(() => {
    return aggregateAdminUsers(adminPosts, adminComments);
  }, [adminPosts, adminComments]);

  // Keep modal user updated if underlying posts/comments change
  useEffect(() => {
    if (selectedUserForModal) {
      const updated = adminUsers.find((u) => u.uid === selectedUserForModal.uid);
      if (updated) setSelectedUserForModal(updated);
    }
  }, [adminUsers]);

  // Top Statistics
  const stats = useMemo(() => {
    const deletedPosts = adminPosts.filter(
      (p) => p.isDeleted || p.status === 'deleted' || p.status === 'DELETED'
    ).length;
    const activePosts = adminPosts.length - deletedPosts;

    const deletedComments = adminComments.filter(
      (c) => c.isDeleted || c.status === 'deleted' || c.status === 'DELETED'
    ).length;
    const activeComments = adminComments.length - deletedComments;

    return {
      totalPosts: adminPosts.length,
      activePosts,
      deletedPosts,
      totalComments: adminComments.length,
      activeComments,
      deletedComments,
      totalUsers: adminUsers.length,
      pendingReports: reports.length,
    };
  }, [adminPosts, adminComments, adminUsers, reports]);

  // Copy UID helper
  const handleCopyUid = async (uid: string) => {
    try {
      await navigator.clipboard.writeText(uid);
      setCopiedUid(uid);
      setTimeout(() => setCopiedUid(null), 2000);
      addToast('UID가 클립보드에 복사되었습니다.', 'info');
    } catch {
      // fallback
    }
  };

  // ================= Post Actions =================
  const handleSoftDeletePost = async (postId: string) => {
    if (!window.confirm('이 게시글을 삭제 처리하시겠습니까? (삭제 후에도 복구가 가능합니다.)')) return;
    const success = await softDeletePost(postId);
    if (success) {
      setAdminPosts((current) =>
        current.map((p) => (p.id === postId ? { ...p, isDeleted: true, status: 'deleted' } : p))
      );
      addToast('게시글이 삭제 처리되었습니다.', 'success');
    } else {
      addToast('게시글 삭제 처리에 실패했습니다.', 'error');
    }
  };

  const handleRestorePost = async (postId: string) => {
    if (!window.confirm('삭제된 게시글을 다시 정상 복구하시겠습니까?')) return;
    const success = await restorePost(postId);
    if (success) {
      setAdminPosts((current) =>
        current.map((p) => (p.id === postId ? { ...p, isDeleted: false, status: 'published' } : p))
      );
      addToast('게시글이 성공적으로 복구되었습니다.', 'success');
    } else {
      addToast('게시글 복구에 실패했습니다.', 'error');
    }
  };

  const handlePermanentDeletePost = async (postId: string) => {
    if (
      !window.confirm(
        '[경고] 정말로 이 게시글을 영구 삭제하시겠습니까?\n이 작업은 데이터베이스에서 완전히 삭제되며 어떠한 방법으로도 절대 복구할 수 없습니다.'
      )
    ) {
      return;
    }
    const success = await permanentDeletePost(postId);
    if (success) {
      setAdminPosts((current) => current.filter((p) => p.id !== postId));
      addToast('게시글이 데이터베이스에서 영구 삭제되었습니다.', 'info');
    } else {
      addToast('영구 삭제 처리에 실패했습니다.', 'error');
    }
  };

  const handleEditPostOpen = (post: Post) => {
    setEditingPost(post);
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditCategory(post.category);
  };

  const handleSavePostEdit = async () => {
    if (!editingPost || !editTitle.trim() || !editBody.trim()) return;
    setIsSavingPost(true);
    try {
      const updated = await updateAdminPost(editingPost.id, {
        category: editCategory,
        title: editTitle.trim(),
        body: editBody.trim(),
      });
      if (updated) {
        setAdminPosts((current) =>
          current.map((p) =>
            p.id === editingPost.id
              ? { ...p, category: editCategory, title: editTitle.trim(), body: editBody.trim() }
              : p
          )
        );
        addToast('게시글이 수정되었습니다.', 'success');
        setEditingPost(null);
      } else {
        addToast('게시글 수정에 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('Update post error:', error);
      addToast('게시글 수정 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingPost(false);
    }
  };

  // ================= Comment Actions =================
  const handleSoftDeleteComment = async (commentId: string) => {
    if (!window.confirm('이 댓글을 삭제 처리하시겠습니까? (삭제 후에도 복구가 가능합니다.)')) return;
    const success = await softDeleteComment(commentId);
    if (success) {
      setAdminComments((current) =>
        current.map((c) => (c.id === commentId ? { ...c, isDeleted: true, status: 'deleted' } : c))
      );
      addToast('댓글이 삭제 처리되었습니다.', 'success');
    } else {
      addToast('댓글 삭제 처리에 실패했습니다.', 'error');
    }
  };

  const handleRestoreComment = async (commentId: string) => {
    if (!window.confirm('삭제된 댓글을 다시 정상 복구하시겠습니까?')) return;
    const success = await restoreComment(commentId);
    if (success) {
      setAdminComments((current) =>
        current.map((c) => (c.id === commentId ? { ...c, isDeleted: false, status: 'published' } : c))
      );
      addToast('댓글이 성공적으로 복구되었습니다.', 'success');
    } else {
      addToast('댓글 복구에 실패했습니다.', 'error');
    }
  };

  const handlePermanentDeleteComment = async (commentId: string) => {
    if (
      !window.confirm(
        '[경고] 정말로 이 댓글을 영구 삭제하시겠습니까?\n이 작업은 데이터베이스에서 완전히 삭제되며 어떠한 방법으로도 절대 복구할 수 없습니다.'
      )
    ) {
      return;
    }
    const success = await permanentDeleteComment(commentId);
    if (success) {
      setAdminComments((current) => current.filter((c) => c.id !== commentId));
      addToast('댓글이 영구 삭제되었습니다.', 'info');
    } else {
      addToast('댓글 영구 삭제에 실패했습니다.', 'error');
    }
  };

  const handleSaveCommentEdit = async (commentId: string, newBody: string) => {
    const success = await updateAdminComment(commentId, newBody);
    if (success) {
      setAdminComments((current) =>
        current.map((c) => (c.id === commentId ? { ...c, body: newBody } : c))
      );
      addToast('댓글이 수정되었습니다.', 'success');
    } else {
      addToast('댓글 수정에 실패했습니다.', 'error');
    }
  };

  // ================= Report Actions =================
  const handleDismissReport = async (reportId: string) => {
    if (!window.confirm('이 신고를 처리 완료하고 목록에서 삭제할까요?')) return;
    try {
      await dismissReport(reportId);
      setReports((current) => current.filter((report) => report.id !== reportId));
      addToast('신고가 처리 완료되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to dismiss report:', error);
      addToast('신고 처리에 실패했습니다.', 'error');
    }
  };

  // Quick action: Filter main feed by user
  const handleFilterBoardByAuthor = (authorId: string, authorName: string) => {
    setAuthorFilterEmail(authorId, authorName, authorId);
    navigate('/');
  };

  // ================= Filtered & Paginated Posts =================
  const filteredPosts = useMemo(() => {
    return adminPosts.filter((post) => {
      const isDeleted = Boolean(
        post.isDeleted || post.status === 'deleted' || post.status === 'DELETED'
      );
      if (postStatusFilter === 'active' && isDeleted) return false;
      if (postStatusFilter === 'deleted' && !isDeleted) return false;

      if (postCategoryFilter !== '전체' && post.category !== postCategoryFilter) return false;

      if (postSearchQuery.trim()) {
        const q = postSearchQuery.toLowerCase();
        return (
          post.title.toLowerCase().includes(q) ||
          post.body.toLowerCase().includes(q) ||
          post.author.toLowerCase().includes(q) ||
          (post.authorEmail && post.authorEmail.toLowerCase().includes(q)) ||
          post.authorId.toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => {
      if (postSortBy === 'likes') return (b.likes || 0) - (a.likes || 0);
      if (postSortBy === 'views') return (b.views || 0) - (a.views || 0);
      if (postSortBy === 'comments') return (b.commentCount || 0) - (a.commentCount || 0);
      return b.createdAt - a.createdAt;
    });
  }, [adminPosts, postStatusFilter, postCategoryFilter, postSearchQuery, postSortBy]);

  const totalPostPages = Math.max(1, Math.ceil(filteredPosts.length / postPageSize));
  const paginatedPosts = useMemo(() => {
    const start = (postPage - 1) * postPageSize;
    return filteredPosts.slice(start, start + postPageSize);
  }, [filteredPosts, postPage, postPageSize]);

  // ================= Filtered & Paginated Comments =================
  const filteredComments = useMemo(() => {
    return adminComments.filter((comment) => {
      const isDeleted = Boolean(
        comment.isDeleted || comment.status === 'deleted' || comment.status === 'DELETED'
      );
      if (commentStatusFilter === 'active' && isDeleted) return false;
      if (commentStatusFilter === 'deleted' && !isDeleted) return false;

      if (commentSearchQuery.trim()) {
        const q = commentSearchQuery.toLowerCase();
        const parentPost = adminPosts.find((p) => p.id === comment.postId);
        return (
          comment.body.toLowerCase().includes(q) ||
          comment.author.toLowerCase().includes(q) ||
          (comment.authorEmail && comment.authorEmail.toLowerCase().includes(q)) ||
          comment.authorId.toLowerCase().includes(q) ||
          (parentPost && parentPost.title.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [adminComments, commentStatusFilter, commentSearchQuery, adminPosts]);

  const totalCommentPages = Math.max(1, Math.ceil(filteredComments.length / commentPageSize));
  const paginatedComments = useMemo(() => {
    const start = (commentPage - 1) * commentPageSize;
    return filteredComments.slice(start, start + commentPageSize);
  }, [filteredComments, commentPage, commentPageSize]);

  // ================= Filtered & Paginated Users =================
  const filteredUsers = useMemo(() => {
    return adminUsers.filter((u) => {
      if (userRoleFilter === 'admin' && !u.isAdmin) return false;
      if (userRoleFilter === 'deleted_content' && u.deletedPostCount === 0 && u.deletedCommentCount === 0) {
        return false;
      }

      if (userSearchQuery.trim()) {
        const q = userSearchQuery.toLowerCase();
        return (
          u.displayName.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          u.uid.toLowerCase().includes(q) ||
          (u.generation && u.generation.toLowerCase().includes(q))
        );
      }
      return true;
    }).sort((a, b) => {
      if (userSortBy === 'posts') return b.postCount - a.postCount;
      if (userSortBy === 'comments') return b.commentCount - a.commentCount;
      if (userSortBy === 'likes') return b.totalLikesReceived - a.totalLikesReceived;
      if (userSortBy === 'name') return a.displayName.localeCompare(b.displayName);
      return b.lastActivityAt - a.lastActivityAt;
    });
  }, [adminUsers, userRoleFilter, userSearchQuery, userSortBy]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  if (!isAdmin || isServerVerified === false) {
    return (
      <div className="admin-denied panel">
        <ShieldCheck size={36} />
        <h1>관리자 권한이 필요합니다</h1>
        <p>관리자 계정으로 로그인한 뒤 다시 시도해주세요.</p>
        <button type="button" className="button primary" onClick={() => navigate('/')}>
          게시판으로 돌아가기
        </button>
      </div>
    );
  }

  if (isServerVerified !== true) {
    return (
      <div className="admin-denied panel">
        <RefreshCw size={36} className="spin" />
        <h1>관리자 인증 확인 중</h1>
        <p>보안 세션을 검증하고 있습니다...</p>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      {/* Edit Post Modal */}
      {editingPost && (
        <div className="admin-modal-overlay" onClick={() => setEditingPost(null)}>
          <div className="admin-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div className="admin-modal-title">
                <Edit3 size={18} />
                <h2>게시글 수정</h2>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setEditingPost(null)}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label>카테고리</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as PostCategory)}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-form-group">
                <label>제목</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="제목을 입력하세요"
                />
              </div>

              <div className="admin-form-group">
                <label>본문</label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="본문 내용을 입력하세요"
                  rows={10}
                />
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditingPost(null)}
                  disabled={isSavingPost}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={handleSavePostEdit}
                  disabled={isSavingPost || !editTitle.trim() || !editBody.trim()}
                >
                  <Save size={13} />
                  <span>{isSavingPost ? '저장 중...' : '변경사항 저장'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Comment Modal */}
      {editingComment && (
        <AdminCommentEditModal
          comment={editingComment}
          onClose={() => setEditingComment(null)}
          onSave={handleSaveCommentEdit}
        />
      )}

      {/* Specific User Activity Detail Modal */}
      {selectedUserForModal && (
        <AdminUserActivityModal
          user={selectedUserForModal}
          allPosts={adminPosts}
          allComments={adminComments}
          onClose={() => setSelectedUserForModal(null)}
          onViewPost={(postId) => navigate(getPostPath(postId))}
          onEditPost={handleEditPostOpen}
          onDeletePost={handleSoftDeletePost}
          onRestorePost={handleRestorePost}
          onPermanentDeletePost={handlePermanentDeletePost}
          onEditComment={(comment) => setEditingComment(comment)}
          onDeleteComment={handleSoftDeleteComment}
          onRestoreComment={handleRestoreComment}
          onPermanentDeleteComment={handlePermanentDeleteComment}
          onFilterBoardByAuthor={handleFilterBoardByAuthor}
        />
      )}

      {/* Admin Masthead */}
      <div className="admin-head">
        <div className="admin-head-left">
          <button type="button" className="button back" onClick={() => navigate('/')}>
            <ArrowLeft size={14} />
            <span>게시판으로 돌아가기</span>
          </button>
          <div className="admin-title-row">
            <div className="admin-badge-symbol">
              <ShieldCheck size={20} />
            </div>
            <div>
              <span className="admin-eyebrow">asterisk* CONTROL CENTER</span>
              <h1 className="admin-title">관리자 콘솔</h1>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="admin-refresh-btn"
          onClick={loadAdminData}
          disabled={isLoading}
          title="관리자 데이터 새로고침"
        >
          <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
          <span>새로고침</span>
        </button>
      </div>

      {/* 4 Stats Grid */}
      <section className="admin-stats-grid">
        <div
          className={`admin-stat-card clickable ${currentTab === 'posts' ? 'selected' : ''}`}
          onClick={() => setCurrentTab('posts')}
          role="button"
          tabIndex={0}
        >
          <span className="admin-stat-label">TOTAL POSTS</span>
          <strong className="admin-stat-value">{stats.totalPosts}</strong>
          <span className="admin-stat-desc">
            정상 <strong>{stats.activePosts}</strong> · 삭제{' '}
            <strong className={stats.deletedPosts > 0 ? 'text-red' : ''}>{stats.deletedPosts}</strong>
          </span>
        </div>

        <div
          className={`admin-stat-card clickable ${currentTab === 'comments' ? 'selected' : ''}`}
          onClick={() => setCurrentTab('comments')}
          role="button"
          tabIndex={0}
        >
          <span className="admin-stat-label">TOTAL COMMENTS</span>
          <strong className="admin-stat-value">{stats.totalComments}</strong>
          <span className="admin-stat-desc">
            정상 <strong>{stats.activeComments}</strong> · 삭제{' '}
            <strong className={stats.deletedComments > 0 ? 'text-red' : ''}>{stats.deletedComments}</strong>
          </span>
        </div>

        <div
          className={`admin-stat-card clickable ${currentTab === 'users' ? 'selected' : ''}`}
          onClick={() => setCurrentTab('users')}
          role="button"
          tabIndex={0}
        >
          <span className="admin-stat-label">ALL MEMBERS</span>
          <strong className="admin-stat-value">{stats.totalUsers}</strong>
          <span className="admin-stat-desc">전체 등록 및 활동 회원</span>
        </div>

        <div
          className={`admin-stat-card clickable ${stats.pendingReports > 0 ? 'alert' : ''} ${
            currentTab === 'reports' ? 'selected' : ''
          }`}
          onClick={() => setCurrentTab('reports')}
          role="button"
          tabIndex={0}
        >
          <span className="admin-stat-label">PENDING REPORTS</span>
          <strong className="admin-stat-value">{stats.pendingReports}</strong>
          <span className="admin-stat-desc">처리 대기 중인 접수 내역</span>
        </div>
      </section>

      {/* Main Console Section */}
      <section className="admin-section panel">
        {/* Navigation Tabs Bar */}
        <div className="admin-tab-nav-bar">
          <div className="admin-main-tabs">
            <button
              type="button"
              className={`admin-nav-tab ${currentTab === 'posts' ? 'active' : ''}`}
              onClick={() => setCurrentTab('posts')}
            >
              <FileText size={16} />
              <span>게시글 관리</span>
              <span className="admin-tab-pill">{stats.totalPosts}</span>
              {stats.deletedPosts > 0 && (
                <span className="admin-tab-pill danger">삭제 {stats.deletedPosts}</span>
              )}
            </button>

            <button
              type="button"
              className={`admin-nav-tab ${currentTab === 'comments' ? 'active' : ''}`}
              onClick={() => setCurrentTab('comments')}
            >
              <MessageCircle size={16} />
              <span>댓글 관리</span>
              <span className="admin-tab-pill">{stats.totalComments}</span>
              {stats.deletedComments > 0 && (
                <span className="admin-tab-pill danger">삭제 {stats.deletedComments}</span>
              )}
            </button>

            <button
              type="button"
              className={`admin-nav-tab ${currentTab === 'users' ? 'active' : ''}`}
              onClick={() => setCurrentTab('users')}
            >
              <Users size={16} />
              <span>사용자 관리</span>
              <span className="admin-tab-pill">{stats.totalUsers}</span>
            </button>

            <button
              type="button"
              className={`admin-nav-tab ${currentTab === 'reports' ? 'active' : ''}`}
              onClick={() => setCurrentTab('reports')}
            >
              <Flag size={16} />
              <span>신고 접수</span>
              <span className={`admin-tab-pill ${stats.pendingReports > 0 ? 'alert' : ''}`}>
                {stats.pendingReports}
              </span>
            </button>
          </div>
        </div>

        {/* ================= TAB 1: 게시글 관리 ================= */}
        {currentTab === 'posts' && (
          <div className="admin-tab-content">
            {/* Filter Toolbar */}
            <div className="admin-toolbar">
              <div className="admin-toolbar-left">
                <div className="admin-filter-item">
                  <Filter size={13} />
                  <select
                    value={postStatusFilter}
                    onChange={(e) => {
                      setPostStatusFilter(e.target.value as any);
                      setPostPage(1);
                    }}
                    className="admin-select"
                  >
                    <option value="all">전체 상태 (정상+삭제)</option>
                    <option value="active">정상 게시글만</option>
                    <option value="deleted">삭제된 게시글만</option>
                  </select>
                </div>

                <div className="admin-filter-item">
                  <select
                    value={postCategoryFilter}
                    onChange={(e) => {
                      setPostCategoryFilter(e.target.value as any);
                      setPostPage(1);
                    }}
                    className="admin-select"
                  >
                    <option value="전체">모든 카테고리</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-filter-item">
                  <select
                    value={postSortBy}
                    onChange={(e) => setPostSortBy(e.target.value as any)}
                    className="admin-select"
                  >
                    <option value="recent">최신순</option>
                    <option value="likes">추천 많은순</option>
                    <option value="views">조회수 많은순</option>
                    <option value="comments">댓글 많은순</option>
                  </select>
                </div>
              </div>

              <div className="admin-toolbar-right">
                <div className="admin-search-wrap">
                  <Search size={14} className="search-icon" />
                  <input
                    type="text"
                    placeholder="제목, 본문, 작성자, 이메일 검색..."
                    value={postSearchQuery}
                    onChange={(e) => {
                      setPostSearchQuery(e.target.value);
                      setPostPage(1);
                    }}
                    className="admin-search-box"
                  />
                  {postSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setPostSearchQuery('')}
                      className="admin-clear-search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Posts Table */}
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '8%', textAlign: 'center' }}>상태</th>
                    <th style={{ width: '38%' }}>게시글</th>
                    <th style={{ width: '18%' }}>작성자</th>
                    <th style={{ width: '16%' }}>이메일</th>
                    <th style={{ width: '10%' }}>작성일</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPosts.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px 16px' }}>
                        <div className="admin-empty">
                          <FileText size={28} />
                          <p>조건에 일치하는 게시글이 없습니다.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedPosts.map((post) => {
                      const isDeleted = Boolean(
                        post.isDeleted || post.status === 'deleted' || post.status === 'DELETED'
                      );
                      const authorUser = adminUsers.find((u) => u.uid === post.authorId);

                      return (
                        <tr key={post.id} className={isDeleted ? 'row-deleted' : ''}>
                          <td style={{ textAlign: 'center' }}>
                            {isDeleted ? (
                              <span className="status-badge deleted">삭제됨</span>
                            ) : (
                              <span className="status-badge active">정상</span>
                            )}
                          </td>
                          <td>
                            <div className="admin-cell-title">
                              <span className="tag">{post.category}</span>
                              <button
                                type="button"
                                className="admin-post-link"
                                onClick={() => navigate(getPostPath(post.id))}
                                title={post.title}
                              >
                                {post.title}
                              </button>
                              {post.commentCount > 0 && (
                                <span className="post-comment-badge">[{post.commentCount}]</span>
                              )}
                              <span className="admin-counts" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                추천 {post.likes} · 조회 {post.views}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="admin-cell-author">
                              <div
                                className="admin-author-line clickable"
                                onClick={() => authorUser && setSelectedUserForModal(authorUser)}
                                title="클릭하여 이 사용자의 모든 활동 내역 보기"
                              >
                                <span className="admin-author-name">{post.author}</span>
                                <AuthorBadge
                                  userId={post.authorId}
                                  email={post.authorEmail}
                                  generation={post.authorGeneration}
                                />
                              </div>
                              <span
                                className="admin-uid clickable"
                                onClick={() => handleCopyUid(post.authorId)}
                                title="클릭하여 UID 복사"
                              >
                                #{post.authorId ? `${post.authorId.slice(0, 6)}...` : '-'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="admin-email">{post.authorEmail || '-'}</span>
                          </td>
                          <td>
                            <span className="admin-date">{formatDate(post.createdAt)}</span>
                          </td>
                          <td>
                            <div className="admin-cell-actions">
                              <button
                                type="button"
                                onClick={() => handleEditPostOpen(post)}
                                className="admin-btn-action"
                                title="수정"
                              >
                                <Edit3 size={12} />
                                <span>수정</span>
                              </button>

                              {isDeleted ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRestorePost(post.id)}
                                    className="admin-btn-action restore"
                                    title="복구"
                                  >
                                    <RotateCcw size={12} />
                                    <span>복구</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePermanentDeletePost(post.id)}
                                    className="admin-btn-action delete"
                                    title="영구 삭제 (복구 불가)"
                                  >
                                    <Trash2 size={12} />
                                    <span>영구</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSoftDeletePost(post.id)}
                                  className="admin-btn-action delete"
                                  title="삭제"
                                >
                                  <Trash2 size={12} />
                                  <span>삭제</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={postPage}
              totalPages={totalPostPages}
              onPageChange={setPostPage}
              totalItems={filteredPosts.length}
              pageSize={postPageSize}
              onPageSizeChange={(newSize) => {
                setPostPageSize(newSize);
                setPostPage(1);
              }}
            />
          </div>
        )}

        {/* ================= TAB 2: 댓글 관리 ================= */}
        {currentTab === 'comments' && (
          <div className="admin-tab-content">
            {/* Filter Toolbar */}
            <div className="admin-toolbar">
              <div className="admin-toolbar-left">
                <div className="admin-filter-item">
                  <Filter size={13} />
                  <select
                    value={commentStatusFilter}
                    onChange={(e) => {
                      setCommentStatusFilter(e.target.value as any);
                      setCommentPage(1);
                    }}
                    className="admin-select"
                  >
                    <option value="all">전체 상태 (정상+삭제)</option>
                    <option value="active">정상 댓글만</option>
                    <option value="deleted">삭제된 댓글만</option>
                  </select>
                </div>
              </div>

              <div className="admin-toolbar-right">
                <div className="admin-search-wrap">
                  <Search size={14} className="search-icon" />
                  <input
                    type="text"
                    placeholder="댓글 내용, 작성자, 이메일, 원문 글 검색..."
                    value={commentSearchQuery}
                    onChange={(e) => {
                      setCommentSearchQuery(e.target.value);
                      setCommentPage(1);
                    }}
                    className="admin-search-box"
                  />
                  {commentSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCommentSearchQuery('')}
                      className="admin-clear-search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Comments Table */}
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '8%', textAlign: 'center' }}>상태</th>
                    <th style={{ width: '42%' }}>댓글 내용 및 원문</th>
                    <th style={{ width: '18%' }}>작성자</th>
                    <th style={{ width: '14%' }}>작성일</th>
                    <th style={{ width: '6%', textAlign: 'center' }}>추천</th>
                    <th style={{ width: '12%', textAlign: 'center' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedComments.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px 16px' }}>
                        <div className="admin-empty">
                          <MessageCircle size={28} />
                          <p>조건에 일치하는 댓글이 없습니다.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedComments.map((comment) => {
                      const isDeleted = Boolean(
                        comment.isDeleted || comment.status === 'deleted' || comment.status === 'DELETED'
                      );
                      const parentPost = adminPosts.find((p) => p.id === comment.postId);
                      const authorUser = adminUsers.find((u) => u.uid === comment.authorId);
                      const cleanBody = (comment.body || '').replace(/^\[REPLY_TO:[^\]]+\]\n?/, '');

                      return (
                        <tr key={comment.id} className={isDeleted ? 'row-deleted' : ''}>
                          <td style={{ textAlign: 'center' }}>
                            {isDeleted ? (
                              <span className="status-badge deleted">삭제됨</span>
                            ) : (
                              <span className="status-badge active">정상</span>
                            )}
                          </td>
                          <td>
                            <div className="admin-comment-content-cell">
                              {parentPost && (
                                <button
                                  type="button"
                                  className="admin-comment-parent-link"
                                  onClick={() => navigate(getPostPath(parentPost.id))}
                                  title={`원문: ${parentPost.title}`}
                                >
                                  원문: {parentPost.title}
                                </button>
                              )}
                              <div className="admin-comment-body-preview">{cleanBody}</div>
                            </div>
                          </td>
                          <td>
                            <div className="admin-cell-author">
                              <div
                                className="admin-author-line clickable"
                                onClick={() => authorUser && setSelectedUserForModal(authorUser)}
                                title="클릭하여 이 사용자의 모든 활동 내역 보기"
                              >
                                <span className="admin-author-name">{comment.author}</span>
                                <AuthorBadge
                                  userId={comment.authorId}
                                  email={comment.authorEmail}
                                  generation={comment.authorGeneration}
                                />
                              </div>
                              <span className="admin-email">{comment.authorEmail || '-'}</span>
                            </div>
                          </td>
                          <td>
                            <span className="admin-date">{formatDate(comment.createdAt)}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="admin-counts">{comment.likes || 0}</span>
                          </td>
                          <td>
                            <div className="admin-cell-actions">
                              {comment.postId && (
                                <button
                                  type="button"
                                  onClick={() => navigate(getPostPath(comment.postId))}
                                  className="admin-btn-action"
                                  title="원문 보기"
                                >
                                  <ExternalLink size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingComment(comment)}
                                className="admin-btn-action"
                                title="댓글 내용 수정"
                              >
                                <Edit3 size={12} />
                              </button>

                              {isDeleted ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreComment(comment.id)}
                                    className="admin-btn-action restore"
                                    title="복구"
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePermanentDeleteComment(comment.id)}
                                    className="admin-btn-action delete"
                                    title="영구 삭제 (복구 불가)"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSoftDeleteComment(comment.id)}
                                  className="admin-btn-action delete"
                                  title="삭제"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={commentPage}
              totalPages={totalCommentPages}
              onPageChange={setCommentPage}
              totalItems={filteredComments.length}
              pageSize={commentPageSize}
              onPageSizeChange={(newSize) => {
                setCommentPageSize(newSize);
                setCommentPage(1);
              }}
            />
          </div>
        )}

        {/* ================= TAB 3: 사용자 관리 ================= */}
        {currentTab === 'users' && (
          <div className="admin-tab-content">
            {/* Filter Toolbar */}
            <div className="admin-toolbar">
              <div className="admin-toolbar-left">
                <div className="admin-filter-item">
                  <Filter size={13} />
                  <select
                    value={userRoleFilter}
                    onChange={(e) => {
                      setUserRoleFilter(e.target.value as any);
                      setUserPage(1);
                    }}
                    className="admin-select"
                  >
                    <option value="all">전체 사용자</option>
                    <option value="admin">관리자만</option>
                    <option value="deleted_content">삭제된 글/댓글 보유자</option>
                  </select>
                </div>

                <div className="admin-filter-item">
                  <select
                    value={userSortBy}
                    onChange={(e) => setUserSortBy(e.target.value as any)}
                    className="admin-select"
                  >
                    <option value="recent">최근 활동순</option>
                    <option value="posts">작성 글 많은순</option>
                    <option value="comments">댓글 많은순</option>
                    <option value="likes">추천 많은순</option>
                    <option value="name">이름순</option>
                  </select>
                </div>
              </div>

              <div className="admin-toolbar-right">
                <div className="admin-search-wrap">
                  <Search size={14} className="search-icon" />
                  <input
                    type="text"
                    placeholder="이름, 이메일, UID, 기수 검색..."
                    value={userSearchQuery}
                    onChange={(e) => {
                      setUserSearchQuery(e.target.value);
                      setUserPage(1);
                    }}
                    className="admin-search-box"
                  />
                  {userSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setUserSearchQuery('')}
                      className="admin-clear-search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '26%' }}>사용자</th>
                    <th style={{ width: '22%' }}>이메일</th>
                    <th style={{ width: '12%' }}>UID</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>작성 글</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>작성 댓글</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>총 추천</th>
                    <th style={{ width: '12%', textAlign: 'center' }}>활동 관리</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px' }}>
                        <div className="admin-empty">
                          <Users size={28} />
                          <p>조건에 일치하는 사용자가 없습니다.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedUsers.map((u) => {
                      return (
                        <tr key={u.uid}>
                          <td>
                            <div className="admin-user-cell">
                              <UserAvatar src={u.photoURL} name={u.displayName || u.email} size={30} />
                              <div className="admin-user-cell-meta">
                                <div className="admin-author-line">
                                  <span className="admin-author-name">{u.displayName}</span>
                                  <AuthorBadge userId={u.uid} email={u.email} generation={u.generation} />
                                </div>
                                {u.isAdmin && (
                                  <span className="status-badge admin" style={{ fontSize: '10px' }}>
                                    ADMIN
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="admin-email">{u.email || '-'}</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="admin-uid-btn"
                              onClick={() => handleCopyUid(u.uid)}
                              title="UID 복사"
                            >
                              <span>{u.uid.slice(0, 7)}...</span>
                              {copiedUid === u.uid ? (
                                <Check size={11} color="#16a34a" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="admin-cell-counts">
                              <strong>{u.postCount}</strong>
                              {u.deletedPostCount > 0 && (
                                <span className="admin-count-sub text-red">
                                  (삭제 {u.deletedPostCount})
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="admin-cell-counts">
                              <strong>{u.commentCount}</strong>
                              {u.deletedCommentCount > 0 && (
                                <span className="admin-count-sub text-red">
                                  (삭제 {u.deletedCommentCount})
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="admin-counts">{u.totalLikesReceived}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedUserForModal(u)}
                              className="button secondary"
                              style={{ padding: '4px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                            >
                              활동 내역 보기
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={userPage}
              totalPages={totalUserPages}
              onPageChange={setUserPage}
              totalItems={filteredUsers.length}
              pageSize={userPageSize}
              onPageSizeChange={(newSize) => {
                setUserPageSize(newSize);
                setUserPage(1);
              }}
            />
          </div>
        )}

        {/* ================= TAB 4: 신고 접수 ================= */}
        {currentTab === 'reports' && (
          <div className="admin-tab-content">
            {reports.length === 0 ? (
              <div className="admin-empty">
                <Flag size={24} />
                <p>현재 접수된 미처리 신고 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="admin-reports-grid">
                {reports.map((report) => (
                  <article className="admin-report-card" key={report.id}>
                    <div className="admin-report-top">
                      <span className="tag">
                        {report.targetType === 'post' ? '게시글 신고' : '댓글 신고'}
                      </span>
                      <time className="admin-date">{formatDate(report.createdAt)}</time>
                    </div>
                    <h3 className="admin-report-title">{report.postTitle || '게시글 정보 없음'}</h3>
                    <p className="admin-report-meta">
                      <span>
                        대상: <strong>{report.targetAuthor || '-'}</strong>
                      </span>
                      <span className="admin-meta-sep">/</span>
                      <span>
                        사유: <strong>{report.reason || '사유 미입력'}</strong>
                      </span>
                    </p>
                    <div className="admin-report-actions">
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => navigate(getPostPath(report.postId))}
                      >
                        게시글 확인
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => handleDismissReport(report.id)}
                      >
                        처리 완료
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
