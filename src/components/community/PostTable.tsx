import React, { useEffect, useState, useMemo } from 'react';
import { useBoardStore, getPopularPostIds } from '../../stores/useBoardStore';
import { Image as ImageIcon, Flame, ChevronLeft, ChevronRight, X, User, ThumbsUp, BarChart2 } from 'lucide-react';
import { AuthorBadge } from '../common/AuthorBadge';
import { RecruitBadge } from '../common/RecruitBadge';
import { formatAuthorName } from '../../utils/member';
import { ServerStatusNotice } from '../common/ServerStatusNotice';
import { useSlowLoading } from '../../hooks/useSlowLoading';

interface PostTableProps {
  onSelectPost: (postId: string) => void;
  onClearAuthorFilter?: () => void;
}

const formatDate = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}`;
};

export const PostTable: React.FC<PostTableProps> = ({ onSelectPost, onClearAuthorFilter }) => {
  const {
    posts,
    totalPosts,
    currentPage,
    setPage,
    postsPerPage,
    isPageLoading,
    isLoading,
    hasFetchError,
    authorFilterEmail,
    authorFilterName,
    authorFilterId,
    setAuthorFilterEmail,
  } = useBoardStore();

  const popularPostIds = useMemo(() => getPopularPostIds(posts), [posts]);
  const totalPages = Math.max(1, Math.ceil(totalPosts / postsPerPage));
  const displayPosts = posts;

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isSlowLoading = useSlowLoading(isPageLoading || isLoading, 3500);
  const shouldShowNotice = isSlowLoading || hasFetchError;

  const maxPageButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
  if (endPage - startPage + 1 < maxPageButtons) {
    startPage = Math.max(1, endPage - maxPageButtons + 1);
  }
  const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  return (
    <div className="postlist-container">
      {shouldShowNotice && (
        <ServerStatusNotice
          message="로딩이 되지 않나요?"
          variant={hasFetchError ? 'error' : 'info'}
          style={{ marginBottom: '12px' }}
        />
      )}

      {isPageLoading && (
        <div
          style={{
            height: '2px',
            backgroundColor: 'var(--color-black)',
            animation: 'pulse 1s infinite ease-in-out',
            marginBottom: '8px',
          }}
        />
      )}

      {(authorFilterEmail || authorFilterId || authorFilterName) && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--color-vellum)',
            border: 'var(--border-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
            <User size={13} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{authorFilterName || '작성자'}</strong>님의 글 모아보기
            </span>
          </div>
          <button
            onClick={() => {
              setAuthorFilterEmail(null);
              if (onClearAuthorFilter) {
                onClearAuthorFilter();
              } else if (typeof window !== 'undefined') {
                window.history.pushState(null, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}
            type="button"
            className="secondary"
            style={{ padding: '3px 8px', fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <X size={12} /> 전체 글 보기
          </button>
        </div>
      )}

      {/* Desktop Header */}
      <div className="post-table-head">
        <div style={{ textAlign: 'center' }}>번호</div>
        <div>제목</div>
        <div style={{ textAlign: 'center' }}>태그</div>
        <div>작성자</div>
        <div style={{ textAlign: 'center' }}>작성일</div>
        <div style={{ textAlign: 'center' }}>추천</div>
      </div>

      {displayPosts.length === 0 ? (
        <div className="empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div>{isLoading || isPageLoading ? '게시글을 불러오는 중입니다...' : '게시글이 없습니다.'}</div>
          {isSlowLoading && (
            <ServerStatusNotice
              compact
              message="로딩이 되지 않나요?"
              style={{ marginTop: '6px' }}
            />
          )}
        </div>
      ) : (
        <div className="postlist">
          {displayPosts.map((post, idx) => {
            const isPop = Boolean(post.isPopular || popularPostIds.has(post.id));
            const hasImage =
              post.body &&
              (post.body.includes('![') || post.body.includes('<img') || post.body.includes('[첨부이미지_'));
            const isSpecialRow = Boolean(post.isPinned);

            return (
              <div
                key={post.id}
                onClick={() => onSelectPost(post.id)}
                className={`post-row ${isSpecialRow ? 'pinned' : ''}`}
              >
                {/* Index (Desktop Only) */}
                <div className="post-index post-desktop-col">
                  {isSpecialRow ? (
                    <span className="badge-pinned">필독</span>
                  ) : (
                    Math.max(1, totalPosts - ((currentPage - 1) * postsPerPage + idx))
                  )}
                </div>

                {/* Title line (1st row on mobile: only title & comment count & image icon) */}
                <div className="post-title-line">
                  {isSpecialRow && <span className="badge-pinned">필독</span>}
                  {post.recruitMeta && <RecruitBadge meta={post.recruitMeta} />}
                  {post.poll && (
                    <span className="poll-badge" title="투표 첨부글">
                      <BarChart2 size={11} />
                      <span>투표</span>
                    </span>
                  )}
                  {(post.isSpoiler || post.body?.startsWith('[스포일러 주의]')) && (
                    <span className="badge-spoiler">스포일러</span>
                  )}
                  {isPop && !isSpecialRow && (
                    <span className="badge-popular">
                      <Flame size={10} fill="currentColor" /> 인기
                    </span>
                  )}
                  <h3>{post.title}</h3>
                  {hasImage && <ImageIcon size={13} style={{ color: 'var(--color-graphite)' }} />}
                  {post.commentCount > 0 && (
                    <span className="post-comment-badge">[{post.commentCount}]</span>
                  )}
                </div>

                {/* Mobile Meta Line (2nd row: 게시판 · 작성자 · 시간 [· 추천]) */}
                <div className="post-mobile-meta">
                  <span className="post-mobile-cat">{post.category}</span>
                  <span className="post-meta-dot">·</span>
                  <span className="post-mobile-author">
                    <span className="post-mobile-author-name">{formatAuthorName(post.author, post.authorEmail)}</span>
                    <AuthorBadge userId={post.authorId} email={post.authorEmail} generation={post.authorGeneration} style={{ margin: 0 }} />
                  </span>
                  <span className="post-meta-dot">·</span>
                  <span className="post-mobile-date">{formatDate(post.createdAt)}</span>
                  {post.likes > 0 && (
                    <span className="post-mobile-likes">
                      <ThumbsUp size={10} /> {post.likes}
                    </span>
                  )}
                </div>

                {/* Desktop Column: Tag (No border, text-sized, in front of author) */}
                <div className="post-category post-desktop-col">{post.category}</div>

                {/* Desktop Columns: Author, Date, Likes */}
                <div className="post-author post-desktop-col">
                  <span>{formatAuthorName(post.author, post.authorEmail)}</span>
                  <AuthorBadge userId={post.authorId} email={post.authorEmail} generation={post.authorGeneration} style={{ margin: 0 }} />
                </div>

                <div className="post-date post-desktop-col">{formatDate(post.createdAt)}</div>

                <div className="post-likes post-desktop-col">{post.likes}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      <div className="pagination-wrap">
        <button
          type="button"
          onClick={() => {
            setPage(Math.max(1, currentPage - 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          disabled={currentPage === 1}
          className="page-btn"
          aria-label="이전 페이지"
        >
          <ChevronLeft size={14} />
        </button>

        {isMobile ? (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 600,
              padding: '0 8px',
            }}
          >
            {currentPage} / {totalPages}
          </span>
        ) : (
          visiblePages.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => {
                setPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`page-btn ${currentPage === page ? 'active' : ''}`}
            >
              {page}
            </button>
          ))
        )}

        <button
          type="button"
          onClick={() => {
            setPage(Math.min(totalPages, currentPage + 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          disabled={currentPage === totalPages}
          className="page-btn"
          aria-label="다음 페이지"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
