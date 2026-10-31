import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '../stores/useUIStore';
import { useBoardStore } from '../stores/useBoardStore';
import { useAuthStore } from '../stores/useAuthStore';
import { LoginModal } from '../components/LoginModal';
import { SettingsModal } from '../components/dashboard/SettingsModal';
import { CategoryTabs } from '../components/community/CategoryTabs';
import { PostTable } from '../components/community/PostTable';
import { PostDetail } from '../components/community/PostDetail';
import { CreatePostPage } from '../components/community/CreatePostPage';
import { findPostByCode, getPostPath } from '../utils/postLink';
const AdminPage = React.lazy(() => import('./AdminPage').then((m) => ({ default: m.AdminPage })));
import { MyActivityPage } from '../components/dashboard/MyActivityPage';
import { MainLandingPage } from '../components/home/MainLandingPage';
import { AsteriskAiPage } from '../components/ai/AsteriskAiPage';
import { ExternalArrowIcon } from '../components/common/ExternalArrowIcon';
import { canWriteContent } from '../utils/member';
import { isAdminUser } from '../constants/admin';
import { APP_VERSION } from '../constants';
import { User, Bell, X, Menu, Settings } from 'lucide-react';
import { UserAvatar } from '../components/common/UserAvatar';
import { useNotificationStore } from '../stores/useNotificationStore';
import { NotificationPopover } from '../components/notification/NotificationPopover';

export const Dashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    mobileTab,
    setMobileTab,
    isLoginModalOpen,
    openLoginModal,
    closeLoginModal,
    loginModalMessage,
    isSettingsModalOpen,
    openSettingsModal,
    closeSettingsModal,
  } = useUIStore();
  const [view, setView] = useState<'feed' | 'detail' | 'write' | 'edit'>('feed');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [editPostId, setEditPostId] = useState<string | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const fetchPosts = useBoardStore((state) => state.fetchPosts);
  const posts = useBoardStore((state) => state.posts);
  const isLoading = useBoardStore((state) => state.isLoading);
  const fetchPostById = useBoardStore((state) => state.fetchPostById);

  const { user, logout } = useAuthStore();
  const isAdmin = isAdminUser(user?.uid, user?.email);
  const startPolling = useNotificationStore((state) => state.startPolling);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  useEffect(() => {
    fetchPosts(1);
  }, [fetchPosts, mobileTab]);

  useEffect(() => {
    if (user) {
      const stop = startPolling();
      return () => {
        stop();
      };
    }
  }, [user, startPolling]);

  // Auto-close login modal on successful login
  useEffect(() => {
    if (user && isLoginModalOpen) {
      closeLoginModal();
    }
  }, [user, isLoginModalOpen, closeLoginModal]);

  // Handle direct post URL resolution
  useEffect(() => {
    const match = location.pathname.match(/^\/post\/(\d{7})\/?$/);
    if (!match) {
      if (view === 'detail') {
        setSelectedPostId(null);
        setView('feed');
      }
      return;
    }

    // Prevent resetting edit view back to detail view while editing a post at /post/:code
    if (view === 'edit') {
      return;
    }

    const postCode = match[1];
    const post = findPostByCode(posts, postCode);
    if (post) {
      setSelectedPostId(post.id);
      setView('detail');
    } else if (!isLoading) {
      const resolvePost = async () => {
        try {
          const baseUrl = import.meta.env.VITE_API_URL || '';
          const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
          const res = await fetch(`${API_BASE_URL}/posts?code=${encodeURIComponent(postCode)}`);
          if (res.ok) {
            const all = await res.json();
            const rawPosts = Array.isArray(all) ? all : all.posts || [];
            const found = findPostByCode(rawPosts, postCode);
            if (found) {
              const loaded = await fetchPostById(found.id);
              if (loaded) {
                setSelectedPostId(loaded.id);
                setView('detail');
                return;
              }
            }
          }
        } catch (e) {
          console.error('Failed to resolve direct post URL:', e);
        }
        navigate('/', { replace: true });
      };
      resolvePost();
    }
  }, [location.pathname, posts, isLoading, navigate, view, fetchPostById]);

  // Synchronize author filter with URL query parameters for back/forward navigation
  useEffect(() => {
    // Fallback if an older PWA Service Worker intercepted navigation to /api/integrations/google/*
    if (location.pathname === '/api/integrations/google/authorize') {
      fetch('/api/integrations/google/authorize?format=json', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.url) {
            window.location.replace(data.url);
          } else {
            navigate('/?google_error=auth_required', { replace: true });
          }
        })
        .catch(() => {
          navigate('/?google_error=server_error', { replace: true });
        });
      return;
    }

    if (location.pathname === '/api/integrations/google/callback') {
      const qs = location.search
        ? `${location.search}&format=json`
        : '?format=json';
      fetch(`/api/integrations/google/callback${qs}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
        .then((res) => res.json())
        .then((data) => {
          navigate(data?.redirectUrl || '/?google_connected=success', { replace: true });
        })
        .catch(() => {
          navigate('/?google_error=server_error', { replace: true });
        });
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const googleConnected = searchParams.get('google_connected');
    const googleError = searchParams.get('google_error');

    if (googleConnected === 'success') {
      useUIStore.getState().addToast('🎉 구글 클래스룸이 성공적으로 연동되었습니다! 이제 asterisk AI에게 과제나 수행평가를 물어보세요.', 'success');
      searchParams.delete('google_connected');
      const newSearch = searchParams.toString();
      navigate(newSearch ? `${location.pathname}?${newSearch}` : location.pathname, { replace: true });
      return;
    } else if (googleError) {
      let msg = '구글 클래스룸 연동에 실패했습니다.';
      if (googleError === 'email_mismatch') {
        const expected = searchParams.get('expected') || '';
        const actual = searchParams.get('actual') || '';
        msg = `로그인된 학교 계정(${expected})과 다른 구글 계정(${actual})으로 로그인되었습니다. 동일한 학교 구글 계정으로 연동해 주세요.`;
      } else if (googleError === 'access_denied') {
        msg = '구글 클래스룸 접근 권한이 승인되지 않았습니다.';
      } else if (googleError === 'invalid_state') {
        msg = '보안 인증 토큰(state)이 만료되었거나 유효하지 않습니다. 다시 시도해 주세요.';
      } else if (googleError === 'auth_required') {
        msg = '구글 클래스룸을 연동하려면 먼저 로그인해 주세요.';
      } else if (googleError === 'no_refresh_token') {
        msg = '구글 권한 토큰을 발급받지 못했습니다. 연동 창에서 권한을 모두 허용해 주세요.';
      }
      useUIStore.getState().addToast(msg, 'error');
      searchParams.delete('google_error');
      searchParams.delete('expected');
      searchParams.delete('actual');
      const newSearch = searchParams.toString();
      navigate(newSearch ? `${location.pathname}?${newSearch}` : location.pathname, { replace: true });
      return;
    }

    const authorId = searchParams.get('authorId');
    const authorEmail = searchParams.get('authorEmail');
    const authorName = searchParams.get('authorName');
    const author = searchParams.get('author');

    if (authorId || authorEmail || authorName || author) {
      const rawEmail = authorEmail || (!authorId && author && author.includes('@') ? author : null);
      const emailOrId = rawEmail && !rawEmail.includes('*') ? rawEmail : null;
      const resolvedId = authorId || (!rawEmail && author && !author.includes('@') ? author : null);
      const name = authorName || (author && !author.includes('@') ? author : null);
      useBoardStore.getState().setAuthorFilterEmail(
        emailOrId,
        name,
        resolvedId
      );
    } else {
      const { authorFilterEmail, authorFilterId, authorFilterName, setAuthorFilterEmail } = useBoardStore.getState();
      if (authorFilterEmail || authorFilterId || authorFilterName) {
        setAuthorFilterEmail(null);
      }
    }
  }, [location.search]);

  const handlePostClick = (id: string) => {
    setSelectedPostId(id);
    setView('detail');
    navigate(getPostPath(id));
    if (!posts.some((p) => p.id === id)) {
      void fetchPostById(id);
    }
  };

  const handleBackToFeed = () => {
    const { authorFilterEmail, authorFilterId, authorFilterName, setAuthorFilterEmail } = useBoardStore.getState();
    if (authorFilterEmail || authorFilterId || authorFilterName) {
      setAuthorFilterEmail(null);
    }
    setSelectedPostId(null);
    setView('feed');
    navigate('/');
  };

  const handleEditPost = (postId: string) => {
    setEditPostId(postId);
    setView('edit');
  };

  const handleWriteClick = () => {
    if (!user) {
      openLoginModal();
    } else if (!canWriteContent(user.uid, user.email)) {
      useUIStore.getState().addToast('현재 계정은 게시글 작성 권한이 없습니다.', 'info');
    } else {
      setView('write');
    }
  };

  const renderContent = () => {
    if (location.pathname === '/admin') {
      return (
        <React.Suspense fallback={<div className="admin-loading-spinner" />}>
          <AdminPage />
        </React.Suspense>
      );
    }

    if (view === 'write') {
      return <CreatePostPage onBack={handleBackToFeed} />;
    }

    if (view === 'edit' && editPostId) {
      const editTarget = posts.find((p) => p.id === editPostId);
      if (editTarget) {
        return <CreatePostPage onBack={handleBackToFeed} editPost={editTarget} />;
      }
    }

    if (view === 'detail' && selectedPostId) {
      return <PostDetail postId={selectedPostId} onBack={handleBackToFeed} onEdit={handleEditPost} />;
    }

    if (mobileTab === 'main') {
      return <MainLandingPage onSelectPost={handlePostClick} />;
    }

    if (mobileTab === 'activity') {
      return <MyActivityPage onPostClick={handlePostClick} onWriteClick={handleWriteClick} />;
    }

    if (mobileTab === 'ai') {
      if (!user) {
        return (
          <div className="activity-auth-guard">
            <div className="activity-empty-box">
              <span className="activity-empty-asterisk">*</span>
              <h3>로그인이 필요한 서비스입니다</h3>
              <p>asterisk AI와의 1:1 대화 및 커뮤니티 분석 기능을 이용하려면 로그인이 필요합니다.</p>
              <button
                type="button"
                onClick={() => openLoginModal()}
                className="btn-activity-login"
              >
                로그인하기
              </button>
            </div>
          </div>
        );
      }
      return <AsteriskAiPage onSelectPost={handlePostClick} />;
    }

    return (
      <div className="board-wrap">
        <CategoryTabs onWriteClick={handleWriteClick} />
        <PostTable onSelectPost={handlePostClick} onClearAuthorFilter={() => navigate('/')} />
      </div>
    );
  };

  return (
    <div className={`shell ${mobileTab === 'main' && view === 'feed' ? 'shell-no-scroll' : ''}`}>
      {/* Modals */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={closeLoginModal}
        message={loginModalMessage || '게시글 및 댓글 작성을 위해 로그인이 필요합니다.'}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={closeSettingsModal}
      />

      {/* Header */}
      <header>
        {/* Desktop Header (>= 768px) */}
        <div className="head head-desktop">
          {/* Brand Wordmark */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <a
              href="https://asterisk.knoblab.xyz"
              className="brand asterisk-brand"
              title="asterisk* 홈으로 이동"
            >
              <div className="asterisk-wordmark">
                <div>aste</div>
                <div className="asterisk-wordmark-bottom">
                  <span>risk</span>
                  <span className="asterisk-wordmark-star">*</span>
                </div>
              </div>
            </a>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                handleBackToFeed();
                setMobileTab('main');
              }}
              className="brand-community-badge"
              title="메인"
            >
              cnsh.space
            </a>
          </div>

          {/* Desktop Navigation */}
          <nav className="desktop-nav">
            <button
              type="button"
              onClick={() => {
                handleBackToFeed();
                setMobileTab('main');
              }}
              className={view === 'feed' && mobileTab === 'main' ? 'active' : ''}
            >
              메인
            </button>
            <button
              type="button"
              onClick={() => {
                handleBackToFeed();
                setMobileTab('board');
              }}
              className={view === 'feed' && mobileTab === 'board' ? 'active' : ''}
            >
              게시판
            </button>
            <button
              type="button"
              onClick={() => {
                handleBackToFeed();
                setMobileTab('popular');
              }}
              className={view === 'feed' && mobileTab === 'popular' ? 'active' : ''}
            >
              인기글
            </button>
            {user && (
              <button
                type="button"
                onClick={() => {
                  setView('feed');
                  setMobileTab('activity');
                }}
                className={mobileTab === 'activity' ? 'active' : ''}
              >
                내 활동
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className={location.pathname === '/admin' ? 'active' : ''}
              >
                관리자
              </button>
            )}
            <a
              href="https://cnsh.life"
              target="_blank"
              rel="noopener noreferrer"
              title="시간표 / 급식 / 학사일정 바로가기"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
            >
              <span>cnsh.life</span>
              <ExternalArrowIcon size={11} />
            </a>
          </nav>

          {/* Controls on the Right */}
          <div className="nav-controls-right">
            {/* Notification Bell */}
            {user && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="btn-icon-nav"
                  title="알림"
                  aria-label="알림"
                >
                  <Bell size={17} />
                  {unreadCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--up-red)',
                      }}
                    />
                  )}
                </button>
                <NotificationPopover
                  isOpen={isNotificationOpen}
                  onClose={() => setIsNotificationOpen(false)}
                  onSelectPost={handlePostClick}
                  anchorPosition="header"
                />
              </div>
            )}

            {/* User Auth: Merged Profile & Settings Button (or Login for guests) */}
            {user ? (
              <button
                type="button"
                onClick={openSettingsModal}
                className="btn-nav-profile"
                title="프로필 및 설정 열기"
              >
                <UserAvatar src={user.photoURL} name={user.displayName || user.email} size={22} />
                <span className="btn-nav-profile-name">
                  {user.displayName || user.email?.split('@')[0]}
                </span>
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={openSettingsModal}
                  className="btn-icon-nav"
                  title="설정 (다크모드)"
                  aria-label="설정"
                >
                  <Settings size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => openLoginModal()}
                  className="primary"
                  style={{ padding: '6px 14px' }}
                >
                  <User size={14} />
                  <span>로그인</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Header (< 768px): [Profile] ---- [asterisk*] ---- [Bell] [Hamburger] */}
        <div className="head head-mobile">
          {/* Left: Profile / Login (Icon only) */}
          <div className="head-mobile-left">
            {user ? (
              <button
                type="button"
                onClick={openSettingsModal}
                className="btn-nav-profile-mobile-icon"
                title="프로필 및 설정 열기"
                aria-label="프로필 및 설정 열기"
              >
                <UserAvatar src={user.photoURL} name={user.displayName || user.email} size={24} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openLoginModal()}
                className="btn-nav-profile-mobile-icon"
                title="로그인"
                aria-label="로그인"
              >
                <User size={18} />
              </button>
            )}
          </div>

          {/* Center: Single-line asterisk* (no community badge) */}
          <div className="head-mobile-center">
            <a
              href="https://asterisk.knoblab.xyz"
              className="brand asterisk-brand-mobile"
              title="asterisk* 홈으로 이동"
            >
              <div className="asterisk-wordmark-inline">
                <span>asterisk</span>
                <span className="asterisk-wordmark-star">*</span>
              </div>
            </a>
          </div>

          {/* Right: Notifications & Hamburger Drawer */}
          <div className="head-mobile-right">
            {user ? (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="btn-icon-nav"
                  title="알림"
                  aria-label="알림"
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--up-red)',
                      }}
                    />
                  )}
                </button>
                <NotificationPopover
                  isOpen={isNotificationOpen}
                  onClose={() => setIsNotificationOpen(false)}
                  onSelectPost={handlePostClick}
                  anchorPosition="header"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={openSettingsModal}
                className="btn-icon-nav"
                title="설정 (다크모드)"
                aria-label="설정"
              >
                <Settings size={18} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="mobile-menu-toggle"
              aria-label="메뉴 열기"
            >
              <Menu size={19} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div className={`mobile-drawer ${!isDrawerOpen ? 'hidden' : ''}`}>
        <div className="drawer-backdrop" onClick={() => setIsDrawerOpen(false)} />
        <div className="drawer-panel">
          <div>
            <div className="drawer-head">
              <div className="drawer-brand-title">
                <span>
                  asterisk<span className="ast-star">*</span> cnsh.space
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="drawer-close-btn"
                aria-label="메뉴 닫기"
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Auth Container */}
            <div className="drawer-auth-container">
              {user ? (
                <>
                  <div
                    className="drawer-auth-user-card"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDrawerOpen(false);
                      setTimeout(() => {
                        openSettingsModal();
                      }, 50);
                    }}
                  >
                    <div className="drawer-auth-user-info">
                      <div className="user-name">
                        <UserAvatar src={user.photoURL} name={user.displayName || user.email} size={22} />
                        <span>{user.displayName || user.email?.split('@')[0]}</span>
                      </div>
                      <div className="user-email">{user.email}</div>
                    </div>
                  </div>
                  <div className="drawer-auth-actions">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDrawerOpen(false);
                        setTimeout(() => {
                          openSettingsModal();
                        }, 50);
                      }}
                      className="btn-drawer-primary"
                    >
                      설정 & 프로필
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm('정말 로그아웃 하시겠습니까?')) {
                          await logout();
                          setIsDrawerOpen(false);
                        }
                      }}
                      className="btn-drawer-secondary"
                    >
                      로그아웃
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDrawerOpen(false);
                      setTimeout(() => {
                        openLoginModal();
                      }, 50);
                    }}
                    className="btn-drawer-primary"
                  >
                    로그인
                  </button>
                </div>
              )}
            </div>

            {/* Drawer Navigation */}
            <div className="drawer-section-label">NAVIGATION</div>
            <div className="drawer-nav">
              <button
                type="button"
                onClick={() => {
                  handleBackToFeed();
                  setMobileTab('main');
                  setIsDrawerOpen(false);
                }}
                className={`drawer-nav-item ${view === 'feed' && mobileTab === 'main' ? 'active' : ''}`}
              >
                <span className="drawer-idx">01</span>
                <span className="drawer-label">메인</span>
                <span className="drawer-sub">MAIN</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleBackToFeed();
                  setMobileTab('board');
                  setIsDrawerOpen(false);
                }}
                className={`drawer-nav-item ${view === 'feed' && mobileTab === 'board' ? 'active' : ''}`}
              >
                <span className="drawer-idx">02</span>
                <span className="drawer-label">게시판</span>
                <span className="drawer-sub">COMMUNITY</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleBackToFeed();
                  setMobileTab('popular');
                  setIsDrawerOpen(false);
                }}
                className={`drawer-nav-item ${view === 'feed' && mobileTab === 'popular' ? 'active' : ''}`}
              >
                <span className="drawer-idx">03</span>
                <span className="drawer-label">인기글</span>
                <span className="drawer-sub">POPULAR</span>
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    setView('feed');
                    setMobileTab('activity');
                    setIsDrawerOpen(false);
                  }}
                  className={`drawer-nav-item ${mobileTab === 'activity' ? 'active' : ''}`}
                >
                  <span className="drawer-idx">04</span>
                  <span className="drawer-label">내 활동</span>
                  <span className="drawer-sub">ACTIVITY</span>
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    navigate('/admin');
                    setIsDrawerOpen(false);
                  }}
                  className={`drawer-nav-item ${location.pathname === '/admin' ? 'active' : ''}`}
                >
                  <span className="drawer-idx">05</span>
                  <span className="drawer-label">관리자</span>
                  <span className="drawer-sub">ADMIN</span>
                </button>
              )}
            </div>

            {/* External Links */}
            <div className="drawer-section-label">EXTERNAL</div>
            <div className="drawer-ext-links">
              <a
                href="https://cnsh.life"
                target="_blank"
                rel="noopener noreferrer"
                className="drawer-ext-item"
              >
                <span>시간표 · 급식 · 학사일정</span>
                <ExternalArrowIcon size={13} className="drawer-arrow" />
              </a>
            </div>
          </div>

          <div className="drawer-footer">
            <span>
              asterisk<span className="ast-star">*</span> cnsh.space
            </span>
            <span>v{APP_VERSION}</span>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <main>
        {/* Content Area */}
        {renderContent()}
      </main>

      {/* Footer */}
      <footer>
        <div className="footer-content">
          <div className="footer-copy">
            <b>
              asterisk<span className="ast-star">*</span> cnsh.space
            </b>
            <span>The Answer to Campus Life, and Everything.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <a
              href="https://cnsh.life"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--color-telemetry)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>cnsh.life</span>
              <ExternalArrowIcon size={11} />
            </a>
            <span className="footer-version-tag">v{APP_VERSION}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
