import React, { useState, useMemo } from 'react';
import {
  X,
  FileText,
  MessageCircle,
  Copy,
  Check,
  Eye,
  ThumbsUp,
  MessageSquare,
  Trash2,
  RotateCcw,
  Edit3,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { UserAvatar } from '../common/UserAvatar';
import { AuthorBadge } from '../common/AuthorBadge';
import type { AdminUserInfo } from '../../services/adminService';
import type { Post, Comment } from '../../types';

interface AdminUserActivityModalProps {
  user: AdminUserInfo | null;
  allPosts: Post[];
  allComments: Comment[];
  onClose: () => void;
  onViewPost: (postId: string) => void;
  onEditPost: (post: Post) => void;
  onDeletePost: (postId: string) => void;
  onRestorePost: (postId: string) => void;
  onPermanentDeletePost: (postId: string) => void;
  onEditComment: (comment: Comment) => void;
  onDeleteComment: (commentId: string) => void;
  onRestoreComment: (commentId: string) => void;
  onPermanentDeleteComment: (commentId: string) => void;
  onFilterBoardByAuthor?: (authorId: string, authorName: string) => void;
}

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

export const AdminUserActivityModal: React.FC<AdminUserActivityModalProps> = ({
  user,
  allPosts,
  allComments,
  onClose,
  onViewPost,
  onEditPost,
  onDeletePost,
  onRestorePost,
  onPermanentDeletePost,
  onEditComment,
  onDeleteComment,
  onRestoreComment,
  onPermanentDeleteComment,
  onFilterBoardByAuthor,
}) => {
  const [activeTab, setActiveTab] = useState<'posts' | 'comments'>('posts');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deleted'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUid, setCopiedUid] = useState(false);

  // Filter posts authored by this user
  const userPosts = useMemo(() => {
    if (!user) return [];
    return allPosts.filter(
      (p) =>
        p.authorId === user.uid ||
        (user.email && p.authorEmail && p.authorEmail.toLowerCase() === user.email.toLowerCase())
    );
  }, [allPosts, user]);

  // Filter comments authored by this user
  const userComments = useMemo(() => {
    if (!user) return [];
    return allComments.filter(
      (c) =>
        c.authorId === user.uid ||
        (user.email && c.authorEmail && c.authorEmail.toLowerCase() === user.email.toLowerCase())
    );
  }, [allComments, user]);

  // Apply status and search filters for posts
  const filteredPosts = useMemo(() => {
    return userPosts.filter((p) => {
      const isDel = Boolean(p.isDeleted || p.status === 'deleted' || p.status === 'DELETED');
      if (statusFilter === 'active' && isDel) return false;
      if (statusFilter === 'deleted' && !isDel) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [userPosts, statusFilter, searchQuery]);

  // Apply status and search filters for comments
  const filteredComments = useMemo(() => {
    return userComments.filter((c) => {
      const isDel = Boolean(c.isDeleted || c.status === 'deleted' || c.status === 'DELETED');
      if (statusFilter === 'active' && isDel) return false;
      if (statusFilter === 'deleted' && !isDel) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return c.body.toLowerCase().includes(q);
      }
      return true;
    });
  }, [userComments, statusFilter, searchQuery]);

  if (!user) return null;

  const handleCopyUid = async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal-panel admin-user-activity-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '820px' }}
      >
        {/* Modal Head */}
        <div className="admin-modal-head">
          <div className="admin-user-summary-card">
            <UserAvatar src={user.photoURL} name={user.displayName || user.email} size={48} />
            <div className="admin-user-header-text">
              <div className="admin-user-title-line">
                <span className="admin-user-displayname">{user.displayName || '이름 없음'}</span>
                <AuthorBadge userId={user.uid} email={user.email} generation={user.generation} />
                {user.isAdmin && (
                  <span className="status-badge admin">
                    <ShieldCheck size={11} /> 관리자
                  </span>
                )}
              </div>
              <div className="admin-user-sub-line">
                <span className="admin-user-email">{user.email || '이메일 없음'}</span>
                <span className="admin-sep">·</span>
                <button
                  type="button"
                  onClick={handleCopyUid}
                  className="admin-copy-uid-btn"
                  title="UID 복사"
                >
                  <span className="admin-uid-text">UID: {user.uid}</span>
                  {copiedUid ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* User Stats Grid */}
        <div className="admin-user-stats-grid">
          <div className="admin-user-stat-box">
            <span className="admin-user-stat-label">작성한 글</span>
            <div className="admin-user-stat-nums">
              <span className="stat-main">{userPosts.length}</span>
              <span className="stat-sub">
                (정상 {userPosts.filter((p) => !p.isDeleted && p.status !== 'deleted').length} / 삭제{' '}
                <strong className="text-red">
                  {userPosts.filter((p) => p.isDeleted || p.status === 'deleted').length}
                </strong>
                )
              </span>
            </div>
          </div>

          <div className="admin-user-stat-box">
            <span className="admin-user-stat-label">작성한 댓글</span>
            <div className="admin-user-stat-nums">
              <span className="stat-main">{userComments.length}</span>
              <span className="stat-sub">
                (정상 {userComments.filter((c) => !c.isDeleted && c.status !== 'deleted').length} / 삭제{' '}
                <strong className="text-red">
                  {userComments.filter((c) => c.isDeleted || c.status === 'deleted').length}
                </strong>
                )
              </span>
            </div>
          </div>

          <div className="admin-user-stat-box">
            <span className="admin-user-stat-label">총 받은 추천수</span>
            <div className="admin-user-stat-nums">
              <span className="stat-main">
                {userPosts.reduce((sum, p) => sum + (p.likes || 0), 0) +
                  userComments.reduce((sum, c) => sum + (c.likes || 0), 0)}
              </span>
              <span className="stat-sub">회</span>
            </div>
          </div>

          <div className="admin-user-stat-box">
            <span className="admin-user-stat-label">최근 활동일</span>
            <div className="admin-user-stat-nums">
              <span className="stat-date">{formatDate(user.lastActivityAt)}</span>
            </div>
          </div>
        </div>

        {/* Tab & Filter Bar */}
        <div className="admin-user-controls-bar">
          <div className="admin-segmented-tabs">
            <button
              type="button"
              className={`segmented-tab-btn ${activeTab === 'posts' ? 'active' : ''}`}
              onClick={() => setActiveTab('posts')}
            >
              <FileText size={14} />
              <span>작성 글 ({userPosts.length})</span>
            </button>
            <button
              type="button"
              className={`segmented-tab-btn ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              <MessageCircle size={14} />
              <span>작성 댓글 ({userComments.length})</span>
            </button>
          </div>

          <div className="admin-user-filter-group">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="admin-compact-select"
            >
              <option value="all">전체 상태</option>
              <option value="active">정상만</option>
              <option value="deleted">삭제된 항목만</option>
            </select>

            <input
              type="text"
              placeholder="내역 내 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-compact-search"
            />

            {onFilterBoardByAuthor && (
              <button
                type="button"
                onClick={() => {
                  onFilterBoardByAuthor(user.uid, user.displayName);
                  onClose();
                }}
                className="button secondary"
                style={{ padding: '5px 9px', fontSize: '11px', whiteSpace: 'nowrap' }}
                title="메인 게시판에서 이 사용자의 글 모아보기"
              >
                <ExternalLink size={12} /> 메인 피드 모아보기
              </button>
            )}
          </div>
        </div>

        {/* Content List Body */}
        <div className="admin-user-activity-content">
          {activeTab === 'posts' ? (
            filteredPosts.length === 0 ? (
              <div className="admin-empty" style={{ padding: '32px 16px' }}>
                <FileText size={24} />
                <p>해당 조건의 작성 게시글이 없습니다.</p>
              </div>
            ) : (
              <div className="admin-activity-list">
                {filteredPosts.map((post) => {
                  const isDeleted = Boolean(
                    post.isDeleted || post.status === 'deleted' || post.status === 'DELETED'
                  );
                  return (
                    <article
                      key={post.id}
                      className={`admin-activity-card ${isDeleted ? 'deleted' : ''}`}
                    >
                      <div className="activity-card-header">
                        <div className="activity-card-tags">
                          <span className="tag">{post.category}</span>
                          {isDeleted ? (
                            <span className="status-badge deleted">삭제됨</span>
                          ) : (
                            <span className="status-badge active">정상</span>
                          )}
                        </div>
                        <time className="admin-date">{formatDate(post.createdAt)}</time>
                      </div>

                      <h4
                        className="activity-card-title"
                        onClick={() => onViewPost(post.id)}
                        role="button"
                        tabIndex={0}
                        title={post.title}
                      >
                        {post.title}
                      </h4>

                      <p className="activity-card-snippet">
                        {post.body.slice(0, 120)}
                        {post.body.length > 120 ? '...' : ''}
                      </p>

                      <div className="activity-card-footer">
                        <div className="activity-card-telemetry">
                          <span>
                            <Eye size={12} /> {post.views}
                          </span>
                          <span>
                            <ThumbsUp size={12} /> {post.likes}
                          </span>
                          <span>
                            <MessageSquare size={12} /> {post.commentCount}
                          </span>
                        </div>

                        <div className="admin-cell-actions">
                          <button
                            type="button"
                            onClick={() => onViewPost(post.id)}
                            className="admin-btn-action"
                            title="게시글 열기"
                          >
                            <ExternalLink size={12} />
                            <span>보기</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditPost(post)}
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
                                onClick={() => onRestorePost(post.id)}
                                className="admin-btn-action restore"
                                title="복구"
                              >
                                <RotateCcw size={12} />
                                <span>복구</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onPermanentDeletePost(post.id)}
                                className="admin-btn-action delete"
                                title="영구 삭제 (복구 불가)"
                              >
                                <Trash2 size={12} />
                                <span>영구삭제</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onDeletePost(post.id)}
                              className="admin-btn-action delete"
                              title="삭제"
                            >
                              <Trash2 size={12} />
                              <span>삭제</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : filteredComments.length === 0 ? (
            <div className="admin-empty" style={{ padding: '32px 16px' }}>
              <MessageCircle size={24} />
              <p>해당 조건의 작성 댓글이 없습니다.</p>
            </div>
          ) : (
            <div className="admin-activity-list">
              {filteredComments.map((comment) => {
                const isDeleted = Boolean(
                  comment.isDeleted || comment.status === 'deleted' || comment.status === 'DELETED'
                );
                const parentPost = allPosts.find((p) => p.id === comment.postId);
                const cleanBody = (comment.body || '').replace(/^\[REPLY_TO:[^\]]+\]\n?/, '');

                return (
                  <article
                    key={comment.id}
                    className={`admin-activity-card ${isDeleted ? 'deleted' : ''}`}
                  >
                    <div className="activity-card-header">
                      <div className="activity-card-tags">
                        <span className="tag">댓글</span>
                        {isDeleted ? (
                          <span className="status-badge deleted">삭제됨</span>
                        ) : (
                          <span className="status-badge active">정상</span>
                        )}
                        {parentPost && (
                          <button
                            type="button"
                            className="activity-parent-link"
                            onClick={() => onViewPost(parentPost.id)}
                            title={parentPost.title}
                          >
                            원문: {parentPost.title}
                          </button>
                        )}
                      </div>
                      <time className="admin-date">{formatDate(comment.createdAt)}</time>
                    </div>

                    <div className="activity-comment-text">{cleanBody}</div>

                    <div className="activity-card-footer">
                      <div className="activity-card-telemetry">
                        <span>
                          <ThumbsUp size={12} /> {comment.likes || 0}
                        </span>
                      </div>

                      <div className="admin-cell-actions">
                        {comment.postId && (
                          <button
                            type="button"
                            onClick={() => onViewPost(comment.postId)}
                            className="admin-btn-action"
                            title="원문 게시글 보기"
                          >
                            <ExternalLink size={12} />
                            <span>원문보기</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditComment(comment)}
                          className="admin-btn-action"
                          title="댓글 수정"
                        >
                          <Edit3 size={12} />
                          <span>수정</span>
                        </button>
                        {isDeleted ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onRestoreComment(comment.id)}
                              className="admin-btn-action restore"
                              title="댓글 복구"
                            >
                              <RotateCcw size={12} />
                              <span>복구</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onPermanentDeleteComment(comment.id)}
                              className="admin-btn-action delete"
                              title="영구 삭제 (복구 불가)"
                            >
                              <Trash2 size={12} />
                              <span>영구삭제</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onDeleteComment(comment.id)}
                            className="admin-btn-action delete"
                            title="삭제"
                          >
                            <Trash2 size={12} />
                            <span>삭제</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
