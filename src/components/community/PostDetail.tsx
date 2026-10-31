import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, Share2, AlertTriangle, Trash2, Edit3, Eye, EyeOff, ShieldAlert, Flame, Plus, Minus, CheckCircle2, RotateCcw } from 'lucide-react';
import { useBoardStore, isPopularPost } from '../../stores/useBoardStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { CommentSection } from './CommentSection';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { PostPollWidget } from './PostPollWidget';
import { RecruitBadge } from '../common/RecruitBadge';
import { createReport } from '../../services/reportService';
import { isAdminUser } from '../../constants/admin';
import { AuthorBadge } from '../common/AuthorBadge';
import { UserAvatar } from '../common/UserAvatar';
import { formatAuthorName } from '../../utils/member';
import { ServerStatusNotice } from '../common/ServerStatusNotice';

interface PostDetailProps {
  postId: string;
  onBack: () => void;
  onEdit?: (postId: string) => void;
}

const formatDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export const PostDetail: React.FC<PostDetailProps> = ({ postId, onBack, onEdit }) => {
  const navigate = useNavigate();
  const { 
    posts, 
    likePost, 
    deletePost, 
    setAuthorFilterEmail, 
    incrementViews,
    updateRecruitMeta,
    votePoll,
    closePoll,
  } = useBoardStore();
  const { user } = useAuthStore();
  const addToast = useUIStore((state) => state.addToast);

  const post = posts.find((p) => p.id === postId);

  const isPostSpoiler = Boolean(post?.isSpoiler || post?.body?.startsWith('[스포일러 주의]'));
  const [isSpoilerRevealed, setIsSpoilerRevealed] = useState(!isPostSpoiler);

  useEffect(() => {
    setIsSpoilerRevealed(!isPostSpoiler);
  }, [postId, isPostSpoiler]);

  useEffect(() => {
    if (postId && postId !== 'pinned-community-rules-notice') {
      incrementViews(postId);
    }
  }, [postId, incrementViews]);

  if (!post) {
    return (
      <div className="panel detail" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p>게시글을 찾을 수 없습니다.</p>
        <ServerStatusNotice message="로딩이 되지 않나요?" />
        <button onClick={onBack} className="secondary" type="button" style={{ alignSelf: 'flex-start', padding: '6px 14px' }}>
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  const postBody = post.body || '';
  const displayBody = postBody.startsWith('[스포일러 주의]\n')
    ? postBody.slice('[스포일러 주의]\n'.length)
    : postBody.startsWith('[스포일러 주의]')
    ? postBody.slice('[스포일러 주의]'.length)
    : postBody;

  const isAdmin = isAdminUser(user?.uid, user?.email);
  const isAuthor =
    user && (user.uid === post.authorId || (post.authorEmail && user.email === post.authorEmail));
  const canManage = Boolean(isAdmin || isAuthor);

  const handleNavigateToAuthor = (authorId?: string | null, authorEmail?: string | null, authorName?: string | null) => {
    if (authorId || authorEmail || authorName) {
      const params = new URLSearchParams();
      if (authorId) {
        params.set('authorId', authorId);
      } else if (authorEmail && !authorEmail.includes('*')) {
        params.set('authorEmail', authorEmail);
      }
      const displayName = formatAuthorName(authorName, authorEmail);
      if (displayName) params.set('authorName', displayName);

      const filterEmail = !authorId && authorEmail && !authorEmail.includes('*') ? authorEmail : null;
      setAuthorFilterEmail(filterEmail, displayName, authorId || null);
      // Replace current post detail in history with '/', then navigate to author filter
      // so pressing browser Back (on PC or mobile) immediately returns to all posts ('/')!
      window.history.replaceState(null, '', '/');
      navigate(`/?${params.toString()}`);
    }
  };

  const handleReportPost = async () => {
    if (!user) {
      addToast('신고하려면 로그인이 필요합니다.', 'info');
      return;
    }
    const reason = window.prompt('신고 사유를 입력해주세요.', '부적절한 게시글')?.trim();
    if (!reason) return;
    try {
      await createReport({
        targetType: 'post',
        targetId: post.id,
        postId: post.id,
        postTitle: post.title,
        targetAuthor: post.author,
        reason,
      });
      addToast('게시글이 신고되었습니다. 관리자 검토 후 조치될 예정입니다.', 'success');
    } catch (error) {
      console.error('Failed to submit post report:', error);
      addToast('신고 접수에 실패했습니다.', 'error');
    }
  };

  const handleSharePost = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      addToast('게시글 주소가 클립보드에 복사되었습니다.', 'success');
    } else {
      addToast('게시글 공유 완료', 'success');
    }
  };

  const handleDeletePost = async () => {
    if (!window.confirm('정말로 이 게시글을 삭제하시겠습니까?')) return;
    const deleted = await deletePost(post.id);
    if (deleted) {
      addToast('게시글이 삭제되었습니다.', 'success');
      onBack();
    } else {
      addToast('게시글 삭제에 실패했습니다.', 'error');
    }
  };

  return (
    <div className="panel detail">
      <button onClick={onBack} className="back" type="button" aria-label="목록으로 돌아가기">
        <ArrowLeft size={14} />
        <span>목록으로</span>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <span className="tag">{post.category}</span>
        {post.recruitMeta && <RecruitBadge meta={post.recruitMeta} />}
        {isPostSpoiler && <span className="badge-spoiler">스포일러</span>}
        {isPopularPost(post, posts) && !post.isPinned && (
          <span className="badge-popular">
            <Flame size={11} fill="currentColor" /> 인기
          </span>
        )}
      </div>

      {/* Author Recruit Management Toolbar (No Emoji, pure SVG) */}
      {canManage && post.recruitMeta && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: 'var(--color-paper)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm, 2px)',
            marginBottom: '10px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>상태 관리:</span>
          {post.recruitMeta.status === 'open' || post.recruitMeta.status === 'searching' ? (
            <button
              type="button"
              className="secondary"
              style={{ padding: '2px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={() => {
                const nextStatus = post.recruitMeta?.type === 'lost_found' ? 'resolved' : 'closed';
                updateRecruitMeta(post.id, { ...post.recruitMeta!, status: nextStatus });
              }}
            >
              <CheckCircle2 size={12} />
              <span>{post.recruitMeta.type === 'lost_found' ? '해결 완료로 전환' : '마감하기'}</span>
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              style={{ padding: '2px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={() => {
                const nextStatus = post.recruitMeta?.type === 'lost_found' ? 'searching' : 'open';
                updateRecruitMeta(post.id, { ...post.recruitMeta!, status: nextStatus });
              }}
            >
              <RotateCcw size={12} />
              <span>{post.recruitMeta.type === 'lost_found' ? '다시 찾는 중으로 전환' : '다시 모집하기'}</span>
            </button>
          )}

          {post.recruitMeta.type !== 'lost_found' && post.recruitMeta.maxCount !== undefined && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>참여 인원:</span>
              <button
                type="button"
                className="secondary"
                disabled={(post.recruitMeta.currentCount || 1) <= 1}
                style={{ padding: '2px 6px', fontSize: '11px' }}
                onClick={() => {
                  const cur = Math.max(1, (post.recruitMeta?.currentCount || 1) - 1);
                  updateRecruitMeta(post.id, { ...post.recruitMeta!, currentCount: cur });
                }}
                title="인원 1명 감소"
              >
                <Minus size={11} />
              </button>
              <strong>{post.recruitMeta.currentCount || 1}명</strong>
              <button
                type="button"
                className="secondary"
                disabled={(post.recruitMeta.currentCount || 1) >= (post.recruitMeta.maxCount || 99)}
                style={{ padding: '2px 6px', fontSize: '11px' }}
                onClick={() => {
                  const cur = Math.min(post.recruitMeta?.maxCount || 99, (post.recruitMeta?.currentCount || 1) + 1);
                  updateRecruitMeta(post.id, { ...post.recruitMeta!, currentCount: cur });
                }}
                title="인원 1명 증가"
              >
                <Plus size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      <h2>{post.title}</h2>

      <div className="post-detail-meta">
        <div className="post-detail-author-info">
          <div
            onClick={() => handleNavigateToAuthor(post.authorId, post.authorEmail, post.author)}
            title={`${formatAuthorName(post.author)}님의 모든 글 모아보기`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
          >
            <UserAvatar src={post.authorPhotoURL} name={post.author} size={22} />
            <strong>{formatAuthorName(post.author)}</strong>
            <AuthorBadge userId={post.authorId} email={post.authorEmail} generation={post.authorGeneration} />
          </div>
          <span>•</span>
          <time>{formatDate(post.createdAt)}</time>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <span>추천 {post.likes}</span>
          <span>댓글 {post.commentCount}</span>
        </div>
      </div>

      {/* Body Area */}
      <div className="body">
        {isPostSpoiler && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <button
              onClick={() => setIsSpoilerRevealed(!isSpoilerRevealed)}
              type="button"
              className="secondary"
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              {isSpoilerRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{isSpoilerRevealed ? '스포일러 다시 가리기' : '스포일러 내용 보기'}</span>
            </button>
          </div>
        )}

        {isPostSpoiler && !isSpoilerRevealed ? (
          <div
            style={{
              padding: '24px',
              border: '1px dashed var(--color-silver)',
              background: 'var(--color-vellum)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
            }}
          >
            <ShieldAlert size={28} style={{ color: 'var(--color-graphite)' }} />
            <div>
              <strong style={{ fontSize: '14px' }}>스포일러 주의</strong>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-graphite)' }}>
                이 게시글에는 스포일러가 포함되어 있습니다.
              </p>
            </div>
            <button onClick={() => setIsSpoilerRevealed(true)} className="secondary" type="button">
              <Eye size={13} />
              <span>내용 확인하기</span>
            </button>
          </div>
        ) : (
          <MarkdownRenderer content={displayBody} />
        )}

        {/* Post Quick Poll Widget */}
        {post.poll && (
          <PostPollWidget
            poll={post.poll}
            isAuthor={Boolean(isAuthor)}
            isAdmin={Boolean(isAdmin)}
            onVote={async (optionIds) => {
              await votePoll(post.id, optionIds);
            }}
            onClosePoll={async () => {
              await closePoll(post.id);
            }}
          />
        )}
      </div>

      {/* Post Actions Bar: Desktop (>= 768px) */}
      <div className="post-actions-bar post-actions-bar-desktop">
        {/* Left: Engagement (추천 & 공유) */}
        <div className="post-actions-left">
          <button
            onClick={() => likePost(post.id)}
            className={`btn-post-like secondary ${post.hasLiked ? 'liked' : ''}`}
            type="button"
            aria-label="게시글 추천"
          >
            <ThumbsUp size={14} fill={post.hasLiked ? 'currentColor' : 'none'} />
            <span>추천 {post.likes}</span>
          </button>
          <button
            onClick={handleSharePost}
            className="btn-post-share-icon secondary"
            type="button"
            aria-label="게시글 링크 공유"
            title="게시글 공유"
          >
            <Share2 size={14} />
          </button>
        </div>

        {/* Right: Management (수정, 삭제) & Moderation (신고) */}
        <div className="post-actions-right">
          {canManage && (
            <div className="post-actions-manage-group">
              {onEdit && (
                <button
                  onClick={() => onEdit(post.id)}
                  className="btn-post-action-subtle"
                  type="button"
                  aria-label="게시글 수정"
                >
                  <Edit3 size={11.5} />
                  <span>수정</span>
                </button>
              )}
              <button
                onClick={handleDeletePost}
                className="btn-post-action-subtle delete"
                type="button"
                aria-label="게시글 삭제"
              >
                <Trash2 size={11.5} />
                <span>삭제</span>
              </button>
            </div>
          )}

          {(!isAuthor || isAdmin) && (
            <>
              {canManage && <span className="post-action-divider" />}
              <button
                onClick={handleReportPost}
                className="btn-post-report-icon secondary"
                type="button"
                aria-label="게시글 신고"
                title="게시글 신고"
              >
                <AlertTriangle size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Post Actions Bar: Mobile (< 768px) */}
      <div className="post-actions-bar-mobile">
        {/* Row 1 (Center aligned): 공유(아이콘만) / 큰추천 / 신고(아이콘만) */}
        <div className="post-actions-mobile-row1">
          <button
            onClick={handleSharePost}
            className="btn-post-action-icon-sm secondary"
            type="button"
            aria-label="게시글 링크 공유"
            title="게시글 공유"
          >
            <Share2 size={16} />
          </button>

          <button
            onClick={() => likePost(post.id)}
            className={`btn-post-like-lg ${post.hasLiked ? 'liked' : ''}`}
            type="button"
            aria-label="게시글 추천"
          >
            <ThumbsUp size={16} fill={post.hasLiked ? 'currentColor' : 'none'} />
            <span>추천 {post.likes}</span>
          </button>

          {(!isAuthor || isAdmin) ? (
            <button
              onClick={handleReportPost}
              className="btn-post-action-icon-sm secondary report"
              type="button"
              aria-label="게시글 신고"
              title="게시글 신고"
            >
              <AlertTriangle size={16} />
            </button>
          ) : (
            <div className="btn-post-action-icon-sm-spacer" />
          )}
        </div>

        {/* Row 2 (Right aligned): 수정 / 삭제 (테두리 넣지 말고 작게 표시) */}
        {canManage && (
          <div className="post-actions-mobile-row2">
            {onEdit && (
              <button
                onClick={() => onEdit(post.id)}
                className="btn-post-action-subtle"
                type="button"
                aria-label="게시글 수정"
              >
                <Edit3 size={11} />
                <span>수정</span>
              </button>
            )}
            <button
              onClick={handleDeletePost}
              className="btn-post-action-subtle delete"
              type="button"
              aria-label="게시글 삭제"
            >
              <Trash2 size={11} />
              <span>삭제</span>
            </button>
          </div>
        )}
      </div>

      {/* Comments */}
      <CommentSection
        postId={post.id}
        postAuthorId={post.authorId}
        postAuthorEmail={post.authorEmail}
        onSelectAuthor={handleNavigateToAuthor}
      />
    </div>
  );
};
