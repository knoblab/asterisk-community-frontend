import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useBoardStore } from '../../stores/useBoardStore';
import { useUIStore } from '../../stores/useUIStore';
import type { Comment, AiChatSessionSummary, AiChatSession } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import {
  MessageSquare,
  MessageCircle,
  ChevronRight,
  Clock,
  FileText,
  ArrowRight,
  Eye,
  ThumbsUp,
  Trash2,
  Sparkles,
  X,
  Play,
} from 'lucide-react';
import { UserAvatar } from '../common/UserAvatar';

interface MyActivityPageProps {
  onPostClick: (postId: string) => void;
  onWriteClick?: () => void;
}

const formatDate = (ts: number) => {
  if (!ts) return '-';
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}`;
};

export const MyActivityPage: React.FC<MyActivityPageProps> = ({ onPostClick, onWriteClick }) => {
  const { user } = useAuthStore();
  const { posts } = useBoardStore();
  const openLoginModal = useUIStore((state) => state.openLoginModal);
  const setMobileTab = useUIStore((state) => state.setMobileTab);
  const setMainChatSessionId = useUIStore((state) => state.setMainChatSessionId);
  const addToast = useUIStore((state) => state.addToast);

  const [activeTab, setActiveTab] = useState<'posts' | 'comments' | 'ai_chats'>('posts');
  const [fetchedMyPosts, setFetchedMyPosts] = useState<typeof posts | null>(null);
  const [myComments, setMyComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  // AI Chat Sessions state
  const [aiSessions, setAiSessions] = useState<AiChatSessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<AiChatSession | null>(null);
  const [isLoadingSessionDetail, setIsLoadingSessionDetail] = useState(false);

  const baseUrl = import.meta.env.VITE_API_URL || '';
  const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;

  useEffect(() => {
    if (!user) {
      setFetchedMyPosts(null);
      return;
    }
    const fetchUserPosts = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/posts?authorId=${encodeURIComponent(user.uid)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          const rawPosts = Array.isArray(data) ? data : data.posts || [];
          setFetchedMyPosts(
            rawPosts
              .filter((p: any) => !p.isDeleted && p.status !== 'deleted')
              .sort((a: any, b: any) => b.createdAt - a.createdAt)
          );
        }
      } catch (err) {
        console.error('Failed to fetch user posts:', err);
      }
    };
    fetchUserPosts();
  }, [user, API_BASE_URL]);

  useEffect(() => {
    if (user && activeTab === 'comments') {
      const fetchMyComments = async () => {
        setIsLoadingComments(true);
        try {
          const res = await fetch(`${API_BASE_URL}/comments?authorId=${encodeURIComponent(user.uid)}`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data: Comment[] = await res.json();
            setMyComments(
              data
                .filter(
                  (c) =>
                    !c.isDeleted &&
                    c.status !== 'deleted' &&
                    c.status !== 'DELETED' &&
                    (c.authorId === user.uid ||
                      (user.email && c.authorEmail && c.authorEmail.toLowerCase() === user.email.toLowerCase()))
                )
                .sort((a, b) => b.createdAt - a.createdAt)
            );
          }
        } catch (err) {
          console.error('Failed to fetch user comments:', err);
        } finally {
          setIsLoadingComments(false);
        }
      };
      fetchMyComments();
    }
  }, [user, activeTab, API_BASE_URL]);

  // Fetch AI chat sessions
  useEffect(() => {
    if (user && activeTab === 'ai_chats') {
      const fetchSessions = async () => {
        setIsLoadingSessions(true);
        try {
          const res = await fetch(`${API_BASE_URL}/ai/sessions`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            setAiSessions(Array.isArray(data) ? data : []);
          }
        } catch (err) {
          console.error('Failed to fetch AI chat sessions:', err);
        } finally {
          setIsLoadingSessions(false);
        }
      };
      fetchSessions();
    }
  }, [user, activeTab, API_BASE_URL]);

  const handleOpenSessionDetail = async (sessionId: string) => {
    setIsLoadingSessionDetail(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/sessions/${encodeURIComponent(sessionId)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const session = await res.json();
        setSelectedSession(session);
      } else {
        addToast('대화 상세 내역을 불러오지 못했습니다.', 'error');
      }
    } catch {
      addToast('대화 상세 내역을 불러오지 못했습니다.', 'error');
    } finally {
      setIsLoadingSessionDetail(false);
    }
  };

  const handleContinueSession = (sessionId: string) => {
    setMainChatSessionId(sessionId);
    setMobileTab('main');
  };

  const handleDeleteSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('이 대화 기록을 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/ai/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setAiSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        if (selectedSession?.sessionId === sessionId) {
          setSelectedSession(null);
        }
        addToast('대화 기록이 삭제되었습니다.', 'info');
      } else {
        addToast('삭제에 실패했습니다.', 'error');
      }
    } catch {
      addToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleClearAllSessions = async () => {
    if (!window.confirm('모든 Asterisk AI 대화 기록을 완전히 삭제하시겠습니까?\n삭제된 대화는 복구할 수 없습니다.')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/ai/sessions`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setAiSessions([]);
        setSelectedSession(null);
        addToast('모든 대화 기록이 삭제되었습니다.', 'info');
      } else {
        addToast('전체 삭제에 실패했습니다.', 'error');
      }
    } catch {
      addToast('전체 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  if (!user) {
    return (
      <div className="activity-auth-guard">
        <div className="activity-empty-box">
          <span className="activity-empty-asterisk">*</span>
          <h3>로그인이 필요한 서비스입니다</h3>
          <p>내 활동 내역(작성한 글, 댓글, Asterisk AI 대화 기록)을 확인하려면 로그인이 필요합니다.</p>
          <button
            type="button"
            onClick={() => openLoginModal()}
            className="activity-action-btn primary"
          >
            로그인하기
          </button>
        </div>
      </div>
    );
  }

  const myPosts =
    fetchedMyPosts ??
    posts
      .filter(
        (p) =>
          p.authorId === user.uid ||
          (user.email && p.authorEmail && p.authorEmail.toLowerCase() === user.email.toLowerCase())
      )
      .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="activity-container">
      {/* User Identity & Stats Header */}
      <div className="activity-header-bar">
        <div className="activity-profile-summary">
          <UserAvatar src={user.photoURL} name={user.displayName || user.email} size={36} />
          <div className="activity-profile-texts">
            <div className="activity-profile-name">
              <span>{user.displayName || user.email?.split('@')[0]}</span>
              <span className="activity-role-badge">USER</span>
            </div>
            <div className="activity-profile-email">{user.email}</div>
          </div>
        </div>

        <div className="activity-metrics-row">
          <button
            type="button"
            onClick={() => setActiveTab('posts')}
            className={`activity-metric-card ${activeTab === 'posts' ? 'active' : ''}`}
          >
            <span className="activity-metric-label">WRITTEN POSTS</span>
            <span className="activity-metric-num">{myPosts.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('comments')}
            className={`activity-metric-card ${activeTab === 'comments' ? 'active' : ''}`}
          >
            <span className="activity-metric-label">COMMENTS</span>
            <span className="activity-metric-num">{activeTab === 'comments' ? myComments.length : '—'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai_chats')}
            className={`activity-metric-card ${activeTab === 'ai_chats' ? 'active' : ''}`}
          >
            <span className="activity-metric-label">AI SESSIONS</span>
            <span className="activity-metric-num">{activeTab === 'ai_chats' ? aiSessions.length : '—'}</span>
          </button>
        </div>
      </div>

      {/* Segmented Tab Navigation: Posts, Comments, AI Chats */}
      <div className="activity-tab-nav">
        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`activity-tab-btn ${activeTab === 'posts' ? 'active' : ''}`}
        >
          <FileText size={15} />
          <span>작성한 글</span>
          <span className="activity-tab-count">{myPosts.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('comments')}
          className={`activity-tab-btn ${activeTab === 'comments' ? 'active' : ''}`}
        >
          <MessageCircle size={15} />
          <span>작성한 댓글</span>
          {activeTab === 'comments' && (
            <span className="activity-tab-count">{myComments.length}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ai_chats')}
          className={`activity-tab-btn ${activeTab === 'ai_chats' ? 'active' : ''}`}
        >
          <Sparkles size={15} />
          <span>AI 대화 기록</span>
          {activeTab === 'ai_chats' && (
            <span className="activity-tab-count">{aiSessions.length}</span>
          )}
        </button>
      </div>

      {/* Content List */}
      <div className="activity-content-body">
        {activeTab === 'posts' && (
          <div className="activity-list">
            {myPosts.length === 0 ? (
              <div className="activity-empty-box">
                <span className="activity-empty-asterisk">*</span>
                <h4>작성한 게시글이 없습니다</h4>
                <p>asterisk* 커뮤니티에 새로운 소식이나 질문을 공유해보세요.</p>
                {onWriteClick && (
                  <button
                    type="button"
                    onClick={onWriteClick}
                    className="activity-action-btn primary"
                  >
                    새 글 작성하기
                  </button>
                )}
              </div>
            ) : (
              myPosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => onPostClick(post.id)}
                  className="activity-item-card"
                  role="button"
                  tabIndex={0}
                >
                  <div className="activity-item-main">
                    <div className="activity-item-meta">
                      <span className="activity-cat-badge">{post.category}</span>
                      <span className="activity-date">
                        <Clock size={12} />
                        {formatDate(post.createdAt)}
                      </span>
                    </div>
                    <div className="activity-item-title">{post.title}</div>
                    <div className="activity-item-telemetry">
                      <span title="조회수">
                        <Eye size={12} /> {post.views}
                      </span>
                      <span title="추천수">
                        <ThumbsUp size={12} /> {post.likes}
                      </span>
                      <span title="댓글수">
                        <MessageSquare size={12} /> {post.commentCount}
                      </span>
                    </div>
                  </div>
                  <div className="activity-item-arrow">
                    <ChevronRight size={18} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="activity-list">
            {isLoadingComments ? (
              <div className="activity-empty-box">
                <div className="admin-spinner" style={{ margin: '0 auto 12px' }} />
                <p>작성한 댓글을 불러오는 중입니다...</p>
              </div>
            ) : myComments.length === 0 ? (
              <div className="activity-empty-box">
                <span className="activity-empty-asterisk">*</span>
                <h4>작성한 댓글이 없습니다</h4>
                <p>게시판의 다른 사용자 글에 첫 번째 댓글을 남겨보세요.</p>
              </div>
            ) : (
              myComments.map((comment) => {
                const parentPost = posts.find((p) => p.id === comment.postId);
                return (
                  <div
                    key={comment.id}
                    onClick={() => {
                      if (comment.postId) onPostClick(comment.postId);
                    }}
                    className="activity-item-card"
                    role="button"
                    tabIndex={0}
                  >
                    <div className="activity-item-main">
                      <div className="activity-item-meta">
                        {parentPost ? (
                          <span className="activity-parent-post-tag">
                            <ArrowRight size={11} /> 원문: {parentPost.title}
                          </span>
                        ) : (
                          <span className="activity-cat-badge">댓글</span>
                        )}
                        <span className="activity-date">
                          <Clock size={12} />
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <div className="activity-comment-body">
                        {(comment.body || '').replace(/^\[REPLY_TO:[^\]]+\]\n?/, '')}
                      </div>
                    </div>
                    <div className="activity-item-arrow">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'ai_chats' && (
          <div className="activity-list">
            {aiSessions.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                <button
                  type="button"
                  onClick={handleClearAllSessions}
                  className="btn-clear-ai-history"
                >
                  <Trash2 size={13} />
                  <span>전체 기록 삭제</span>
                </button>
              </div>
            )}

            {isLoadingSessions ? (
              <div className="activity-empty-box">
                <div className="admin-spinner" style={{ margin: '0 auto 12px' }} />
                <p>Asterisk AI 대화 기록을 불러오는 중입니다...</p>
              </div>
            ) : aiSessions.length === 0 ? (
              <div className="activity-empty-box">
                <span className="activity-empty-asterisk">*</span>
                <h4>저장된 AI 대화 기록이 없습니다</h4>
                <p>메인 탭에서 Asterisk AI에게 궁금한 점을 질문해 보세요.</p>
                <button
                  type="button"
                  onClick={() => setMobileTab('main')}
                  className="activity-action-btn primary"
                >
                  메인 탭에서 대화 시작하기
                </button>
              </div>
            ) : (
              aiSessions.map((session) => (
                <div
                  key={session.sessionId}
                  onClick={() => handleOpenSessionDetail(session.sessionId)}
                  className="activity-item-card ai-session-card"
                  role="button"
                  tabIndex={0}
                >
                  <div className="activity-item-main">
                    <div className="activity-item-meta">
                      <span className="activity-cat-badge">AI 대화</span>
                      <span className="activity-date">
                        <Clock size={12} />
                        {formatDate(session.updatedAt || session.createdAt)}
                      </span>
                    </div>
                    <div className="activity-item-title">{session.title}</div>
                    {session.lastMessage && (
                      <div className="activity-session-last-msg">
                        {session.lastMessage}
                      </div>
                    )}
                    <div className="activity-item-telemetry">
                      <span>
                        <MessageSquare size={12} /> 메시지 {session.messageCount}개
                      </span>
                    </div>
                  </div>

                  <div className="activity-session-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleContinueSession(session.sessionId)}
                      className="btn-session-action continue"
                      title="이어서 대화하기"
                    >
                      <Play size={12} />
                      <span>이어하기</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(session.sessionId, e)}
                      className="btn-session-action delete"
                      title="대화 삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected Session Detail Modal */}
      {selectedSession && (
        <div className="session-detail-modal-overlay" onClick={() => setSelectedSession(null)}>
          <div
            className="session-detail-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="session-detail-header">
              <div className="session-detail-title-wrap">
                <span className="session-detail-badge">AI 대화 기록</span>
                <h3>{selectedSession.title}</h3>
                <span className="session-detail-date">
                  {formatDate(selectedSession.updatedAt || selectedSession.createdAt)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="session-detail-close-btn"
                title="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="session-detail-messages">
              {isLoadingSessionDetail ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <div className="admin-spinner" style={{ margin: '0 auto 12px' }} />
                  <p>대화 내용을 불러오는 중입니다...</p>
                </div>
              ) : selectedSession.messages && selectedSession.messages.length > 0 ? (
                selectedSession.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`session-modal-msg ${
                      m.role === 'user' ? 'msg-user' : 'msg-bot'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <div className="session-modal-avatar-wrap">
                        <UserAvatar
                          src={user?.photoURL}
                          name={user?.displayName || user?.email}
                          size={26}
                        />
                      </div>
                    ) : (
                      <div className="session-modal-avatar">*</div>
                    )}
                    <div className="session-modal-bubble">
                      <MarkdownRenderer content={m.content} />
                      <div className="session-modal-msg-time">
                        {formatDate(m.createdAt)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ textAlign: 'center', padding: '20px', color: 'var(--color-telemetry)' }}>
                  메시지가 없습니다.
                </p>
              )}
            </div>

            <div className="session-detail-footer">
              <button
                type="button"
                onClick={() => handleDeleteSession(selectedSession.sessionId)}
                className="btn-modal-delete-session"
              >
                <Trash2 size={13} />
                <span>이 대화 삭제</span>
              </button>

              <button
                type="button"
                onClick={() => handleContinueSession(selectedSession.sessionId)}
                className="btn-modal-continue-session"
              >
                <Play size={13} />
                <span>메인 탭에서 이어서 대화하기</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
