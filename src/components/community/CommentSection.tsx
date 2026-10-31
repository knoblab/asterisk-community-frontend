import React, { useState, useEffect } from 'react';
import { useBoardStore } from '../../stores/useBoardStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { LoginModal } from '../LoginModal';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { LogIn, MessageSquare, CornerDownRight, Heart, AlertTriangle, Send, X, Trash2, Loader2, Clock, RefreshCw, Sparkles, Info } from 'lucide-react';
import type { Comment } from '../../types';
import { createReport } from '../../services/reportService';
import { isAdminUser } from '../../constants/admin';
import { getMemberGenerationLabel, canWriteContent, isSpecialOrangeAdmin, isStudentCouncilPresident, formatAuthorName } from '../../utils/member';
import { AuthorBadge } from '../common/AuthorBadge';
import { KnoblabIcon } from '../common/KnoblabIcon';
import { getSafeAvatarUrl } from '../common/UserAvatar';
import { ServerStatusNotice } from '../common/ServerStatusNotice';
import { useSlowLoading } from '../../hooks/useSlowLoading';
import { filterMentions, type MentionDefinition } from '../../constants/mentions';

interface CommentSectionProps {
  postId: string;
  postAuthorId?: string;
  postAuthorEmail?: string;
  onSelectAuthor?: (authorId?: string | null, authorEmail?: string | null, authorName?: string | null) => void;
}

const formatDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export const formatAiModelDisplay = (raw?: string | null): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes('haiku') || lower.includes('claude') || lower.includes('anthropic')) {
    return 'Claude Haiku 5.5';
  }
  if (lower.includes('luna') || lower.includes('gpt') || lower.includes('openai')) {
    return 'GPT-6 Luna';
  }
  if (lower.includes('gemma')) {
    return 'Gemma 4';
  }
  if (lower.includes('gemini') || lower.includes('google')) {
    if (lower.includes('low')) return 'Gemini 3.8 Flash (Low)';
    if (lower.includes('medium')) return 'Gemini 3.8 Flash (Medium)';
    if (lower.includes('high')) return 'Gemini 3.8 Flash (High)';
    return 'Gemini 3.8 Flash';
  }
  return trimmed;
};

export const getCommentAiProvider = (comment: { aiProvider?: string; aiModel?: string }): string | null => {
  if (comment.aiModel) {
    const formatted = formatAiModelDisplay(comment.aiModel);
    if (formatted) return formatted;
  }
  if (comment.aiProvider) {
    const formatted = formatAiModelDisplay(comment.aiProvider);
    if (formatted) return formatted;
  }
  return null;
};

const getAiStageButtonLabel = (stage: string, modelOrProvider?: string | null, tools?: string[] | null) => {
  const name = formatAiModelDisplay(modelOrProvider);
  const toolSuffix = tools && tools.length > 0 ? `, 도구: ${tools.join(', ')}` : '';
  switch (stage) {
    case 'selecting_model':
      return '모델 선택 중...';
    case 'thinking':
      return name ? `생각 중... (${name}${toolSuffix})` : '생각 중...';
    case 'writing':
      return name ? `답변 작성 중... (${name}${toolSuffix})` : '답변 작성 중...';
    default:
      return name ? `답변 생성 중... (${name}${toolSuffix})` : '모델 선택 중...';
  }
};

const getAiStageDescription = (stage: string, modelOrProvider?: string | null, tools?: string[] | null) => {
  const name = formatAiModelDisplay(modelOrProvider);
  const toolSuffix = tools && tools.length > 0 ? `, 도구: ${tools.join(', ')}` : '';
  switch (stage) {
    case 'selecting_model':
      return '모델 선택 중...';
    case 'thinking':
      return name ? `생각 중... (${name}${toolSuffix})` : '생각 중...';
    case 'writing':
      return name ? `답변 작성 중... (${name}${toolSuffix})` : '답변 작성 중...';
    default:
      return name ? `답변 생성 중... (${name}${toolSuffix})` : '모델 선택 중...';
  }
};

export const CommentSection: React.FC<CommentSectionProps> = ({ postId, postAuthorId, postAuthorEmail, onSelectAuthor }) => {
  const {
    posts,
    comments,
    aiGeneratingParentId,
    aiGeneratingStage,
    aiGeneratingSelectedProvider,
    aiGeneratingTools,
    aiEnabled,
    checkAiStatus,
    addComment,
    fetchComments,
    likeComment,
    deleteComment,
    regenerateAiCommentReply,
    cleanupExpiredRateLimitedComment,
    setAuthorFilterEmail,
  } = useBoardStore();
  const { user } = useAuthStore();
  const addToast = useUIStore((state) => state.addToast);
  const canWrite = canWriteContent(user?.uid, user?.email);

  const [commentText, setCommentText] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [regeneratingCommentId, setRegeneratingCommentId] = useState<string | null>(null);

  const [isMainSubmitting, setIsMainSubmitting] = useState(false);
  const [mainSubmitFailed, setMainSubmitFailed] = useState(false);
  const isSlowMainSubmitting = useSlowLoading(isMainSubmitting, 3500);

  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
  const [replySubmitFailedId, setReplySubmitFailedId] = useState<string | null>(null);
  const isSlowReplySubmitting = useSlowLoading(Boolean(submittingReplyId), 3500);

  const [showMainMention, setShowMainMention] = useState(false);
  const [mainMentionQuery, setMainMentionQuery] = useState('');
  const [showReplyMention, setShowReplyMention] = useState(false);
  const [replyMentionQuery, setReplyMentionQuery] = useState('');
  const [activeAiInfoCommentId, setActiveAiInfoCommentId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeAiInfoCommentId) return;
    const handleOutsideClick = () => {
      setActiveAiInfoCommentId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [activeAiInfoCommentId]);

  React.useEffect(() => {
    checkAiStatus();
  }, [checkAiStatus]);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleReportComment = async (comment: Comment, isReply: boolean) => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!canWrite) {
      addToast('현재 계정은 댓글 작성 권한이 없습니다.', 'info');
      return;
    }
    const reason = window.prompt('신고 사유를 입력해주세요.', '부적절한 댓글')?.trim();
    if (!reason) return;
    try {
      await createReport({
        targetType: 'comment',
        targetId: comment.id,
        postId: comment.postId,
        postTitle: posts.find((post) => post.id === comment.postId)?.title,
        targetAuthor: comment.author,
        reason,
      });
      addToast(
        isReply ? '답글이 신고되었습니다. 관리자 검토 후 조치될 예정입니다.' : '댓글이 신고되었습니다. 관리자 검토 후 조치될 예정입니다.',
        'success'
      );
    } catch (error) {
      console.error('Failed to submit comment report:', error);
      addToast('신고 접수에 실패했습니다.', 'error');
    }
  };

  React.useEffect(() => {
    if (postId) {
      fetchComments(postId);
    }
  }, [postId, fetchComments]);

  // Keep currentTime live if there are any rate-limited comments
  React.useEffect(() => {
    const hasRateLimited = comments.some((c) => c.postId === postId && c.isRateLimited);
    if (!hasRateLimited) return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [comments, postId]);

  // Auto-cleanup expired rate-limited comments (1 minute after retry became available without clicking)
  React.useEffect(() => {
    const expiredRateLimited = comments.filter(
      (c) => c.postId === postId && c.isRateLimited && c.retryExpireAt && currentTime > c.retryExpireAt
    );
    if (expiredRateLimited.length > 0) {
      expiredRateLimited.forEach((c) => {
        cleanupExpiredRateLimitedComment(c.id);
        deleteComment(c.id);
      });
    }
  }, [currentTime, comments, postId, cleanupExpiredRateLimitedComment, deleteComment]);

  const postComments = comments.filter(
    (c) => c.postId === postId && (!c.isRateLimited || !c.retryExpireAt || currentTime <= c.retryExpireAt)
  );

  const handleRegenerateAi = async (rateLimitedComment: Comment) => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    const triggerId = rateLimitedComment.triggerCommentId || rateLimitedComment.parentId;
    if (!triggerId) {
      addToast('원본 댓글 정보를 찾을 수 없습니다.', 'error');
      return;
    }
    setRegeneratingCommentId(rateLimitedComment.id);
    try {
      await regenerateAiCommentReply(rateLimitedComment.id, triggerId);
    } finally {
      setRegeneratingCommentId(null);
    }
  };

  // Group comments into top-level threads and flat descendant replies
  const commentMap = React.useMemo(() => new Map<string, Comment>(postComments.map((c) => [c.id, c])), [postComments]);

  const getThreadRootId = React.useCallback(
    (comment: Comment): string => {
      let curr = comment;
      const visited = new Set<string>();
      while (curr.parentId && commentMap.has(curr.parentId)) {
        if (visited.has(curr.id)) break;
        visited.add(curr.id);
        curr = commentMap.get(curr.parentId)!;
      }
      return curr.id;
    },
    [commentMap]
  );

  const rootComments = React.useMemo(
    () => postComments.filter((c) => !c.parentId || !commentMap.has(c.parentId)),
    [postComments, commentMap]
  );

  const getThreadReplies = React.useCallback(
    (rootId: string) =>
      postComments
        .filter((c) => c.id !== rootId && getThreadRootId(c) === rootId)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [postComments, getThreadRootId]
  );

  const handleSubmitMainComment = async () => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!canWrite) {
      addToast('현재 계정은 댓글 작성 권한이 없습니다.', 'info');
      return;
    }
    if (!commentText.trim() || isMainSubmitting) return;

    setIsMainSubmitting(true);
    setMainSubmitFailed(false);
    const finalAuthor = user.displayName || user.email?.split('@')[0] || '사용자';
    try {
      const success = await addComment({
        postId,
        author: finalAuthor,
        authorId: user.uid,
        authorEmail: user.email || undefined,
        authorGeneration: isSpecialOrangeAdmin(user.email, user.uid)
          ? 'ORANGE_ADMIN'
          : isStudentCouncilPresident(user.email, user.uid)
          ? 'PRESIDENT'
          : isAdminUser(user.uid, user.email)
          ? 'ADMIN'
          : (getMemberGenerationLabel(user.email, user.uid) || undefined),
        body: commentText.trim(),
        parentId: undefined,
      });
      setIsMainSubmitting(false);
      if (success) {
        setCommentText('');
        setMainSubmitFailed(false);
        addToast('댓글이 등록되었습니다.', 'success');
      } else {
        setMainSubmitFailed(true);
      }
    } catch {
      setIsMainSubmitting(false);
      setMainSubmitFailed(true);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!canWrite) {
      addToast('현재 계정은 댓글 작성 권한이 없습니다.', 'info');
      return;
    }
    if (!replyText.trim() || Boolean(submittingReplyId)) return;

    setSubmittingReplyId(parentId);
    setReplySubmitFailedId(null);
    const finalAuthor = user.displayName || user.email?.split('@')[0] || '사용자';
    try {
      const success = await addComment({
        postId,
        author: finalAuthor,
        authorId: user.uid,
        authorEmail: user.email || undefined,
        authorGeneration: isSpecialOrangeAdmin(user.email, user.uid)
          ? 'ORANGE_ADMIN'
          : isStudentCouncilPresident(user.email, user.uid)
          ? 'PRESIDENT'
          : isAdminUser(user.uid, user.email)
          ? 'ADMIN'
          : (getMemberGenerationLabel(user.email, user.uid) || undefined),
        body: replyText.trim(),
        parentId,
      });
      setSubmittingReplyId(null);
      if (success) {
        setReplyText('');
        setReplyingToId(null);
        setReplySubmitFailedId(null);
        addToast('답글이 등록되었습니다.', 'success');
      } else {
        setReplySubmitFailedId(parentId);
      }
    } catch {
      setSubmittingReplyId(null);
      setReplySubmitFailedId(parentId);
    }
  };

  const handleReplyClick = (targetComment: Comment) => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!canWrite) {
      addToast('현재 계정은 답글 작성 권한이 없습니다.', 'info');
      return;
    }
    if (replyingToId === targetComment.id) {
      setReplyingToId(null);
      setReplyText('');
      setReplySubmitFailedId(null);
    } else {
      setReplyingToId(targetComment.id);
      setReplySubmitFailedId(null);
      const isTargetAi = targetComment.authorId === 'asterisk-ai-bot' || targetComment.authorGeneration === 'AI';
      const handle = isTargetAi ? '@asterisk' : `@${formatAuthorName(targetComment.author)}`;
      setReplyText(`${handle} `);
    }
    setShowReplyMention(false);
  };

  const handleCommentTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentText(val);
    if (mainSubmitFailed) setMainSubmitFailed(false);
    const cursor = e.target.selectionStart;
    const beforeCursor = val.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|[\s\n])@([a-zA-Z0-9_-]*)$/);
    if (match) {
      const q = match[1];
      const matched = filterMentions(q);
      if (matched.length > 0) {
        setMainMentionQuery(q);
        setShowMainMention(true);
      } else {
        setShowMainMention(false);
      }
    } else {
      setShowMainMention(false);
    }
  };

  const insertMainMention = (mention: MentionDefinition) => {
    if (mention.checkEnabled) {
      const status = mention.checkEnabled({ aiEnabled });
      if (!status.enabled) {
        addToast(status.disabledMessage || '현재 이용할 수 없는 기능입니다.', 'info');
        setShowMainMention(false);
        return;
      }
    }
    setCommentText((prev) => {
      return prev.replace(/(?:^|(?<=[\s\n]))@([a-zA-Z0-9_-]*)$/, '') + `${mention.handle} `;
    });
    setShowMainMention(false);
  };

  const handleReplyTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setReplyText(val);
    if (replySubmitFailedId) setReplySubmitFailedId(null);
    const cursor = e.target.selectionStart;
    const beforeCursor = val.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|[\s\n])@([a-zA-Z0-9_-]*)$/);
    if (match) {
      const q = match[1];
      const matched = filterMentions(q);
      if (matched.length > 0) {
        setReplyMentionQuery(q);
        setShowReplyMention(true);
      } else {
        setShowReplyMention(false);
      }
    } else {
      setShowReplyMention(false);
    }
  };

  const insertReplyMention = (mention: MentionDefinition) => {
    if (mention.checkEnabled) {
      const status = mention.checkEnabled({ aiEnabled });
      if (!status.enabled) {
        addToast(status.disabledMessage || '현재 이용할 수 없는 기능입니다.', 'info');
        setShowReplyMention(false);
        return;
      }
    }
    setReplyText((prev) => {
      return prev.replace(/(?:^|(?<=[\s\n]))@([a-zA-Z0-9_-]*)$/, '') + `${mention.handle} `;
    });
    setShowReplyMention(false);
  };

  const renderMentionPopup = (
    query: string,
    onSelect: (mention: MentionDefinition) => void
  ) => {
    const suggestions = filterMentions(query);
    if (suggestions.length === 0) return null;

    return (
      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: '4px',
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-subtle)',
          padding: '4px',
          zIndex: 20,
          minWidth: '220px',
          maxWidth: 'min(320px, calc(100vw - 48px))',
        }}
      >
        {suggestions.map((mention) => {
          const status = mention.checkEnabled ? mention.checkEnabled({ aiEnabled }) : { enabled: true };
          const isEnabled = status.enabled;

          return (
            <button
              key={mention.id}
              type="button"
              onClick={() => onSelect(mention)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 10px',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: !isEnabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: !isEnabled ? 0.6 : 1,
                color: !isEnabled ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
              }}
              onMouseEnter={(e) => {
                if (isEnabled) (e.currentTarget.style.backgroundColor = 'var(--color-bg-primary)');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: !isEnabled
                      ? 'var(--color-border-default)'
                      : mention.badgeTextColor || 'var(--color-functional-red)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {mention.iconType === 'knoblab' ? (
                    <KnoblabIcon size={11} color="var(--color-bg-primary)" />
                  ) : (
                    <span style={{ fontSize: '10px', color: 'var(--color-bg-primary)', fontWeight: 700 }}>@</span>
                  )}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{mention.handle}</span>
                {mention.description && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {mention.description}
                  </span>
                )}
              </div>
              {!isEnabled ? (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor: 'var(--color-border-default)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {status.disabledMessage || '준비중인 기능입니다'}
                </span>
              ) : mention.badge ? (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor: mention.badgeBgColor || 'rgba(229, 57, 53, 0.14)',
                    color: mention.badgeTextColor || 'var(--color-functional-red)',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {mention.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('정말로 이 댓글을 삭제하시겠습니까?')) return;
    const deleted = await deleteComment(commentId);
    addToast(
      deleted ? '댓글이 삭제되었습니다.' : '댓글 삭제에 실패했습니다. 서버 응답을 확인해주세요.',
      deleted ? 'success' : 'error'
    );
  };

  const handleAuthorClick = (authorId?: string | null, authorEmail?: string | null, authorName?: string | null) => {
    if (authorId === 'asterisk-ai-bot') return;
    if (onSelectAuthor) {
      onSelectAuthor(authorId, authorEmail, authorName);
      return;
    }
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
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/');
        window.history.pushState(null, '', `/?${params.toString()}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  };

  const renderCommentItem = (comment: Comment, isReply = false) => {
    const isAiBot = comment.authorId === 'asterisk-ai-bot' || comment.authorGeneration === 'AI';
    const hasValidUnmaskedEmails = Boolean(
      postAuthorEmail &&
      comment.authorEmail &&
      !postAuthorEmail.includes('*') &&
      !comment.authorEmail.includes('*')
    );
    const isPostAuthor = Boolean(
      !isAiBot &&
      ((postAuthorId && comment.authorId && comment.authorId === postAuthorId) ||
        (!postAuthorId && hasValidUnmaskedEmails && postAuthorEmail!.toLowerCase() === comment.authorEmail!.toLowerCase()))
    );
    const isAdmin = isAdminUser(user?.uid, user?.email);
    const parentOrTriggerComment = isAiBot
      ? postComments.find((c) => c.id === (comment.triggerCommentId || comment.parentId))
      : undefined;
    const isTriggerCommentAuthor = Boolean(
      isAiBot &&
      parentOrTriggerComment &&
      ((user?.uid && user.uid === parentOrTriggerComment.authorId) ||
        (user?.email && parentOrTriggerComment.authorEmail && user.email.toLowerCase() === parentOrTriggerComment.authorEmail.toLowerCase()))
    );
    const isCommentAuthor = Boolean(
      isAdmin ||
      isTriggerCommentAuthor ||
      (user?.uid && user.uid === comment.authorId) ||
      (user?.email && comment.authorEmail && user.email.toLowerCase() === comment.authorEmail.toLowerCase())
    );
    const isReplying = replyingToId === comment.id;

    return (
      <div
        key={comment.id}
        style={{
          marginLeft: isReply ? (isMobile ? '14px' : '28px') : '0',
          marginTop: '8px',
          padding: isMobile ? '10px 12px' : '12px 16px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: isReply ? 'var(--color-bg-primary)' : 'var(--color-bg-secondary)',
          borderLeft: isReply ? '2px solid var(--color-functional-red)' : '1px solid var(--color-border-default)',
          borderTop: '1px solid var(--color-border-default)',
          borderRight: '1px solid var(--color-border-default)',
          borderBottom: '1px solid var(--color-border-default)',
          transition: 'background-color 0.15s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
            {isReply && <CornerDownRight size={13} style={{ color: 'var(--color-functional-red)', flexShrink: 0 }} />}
            <div
              onClick={() => {
                if (!isAiBot) {
                  handleAuthorClick(comment.authorId, comment.authorEmail, comment.author);
                }
              }}
              title={!isAiBot ? `${formatAuthorName(comment.author)}님의 모든 글 모아보기` : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: !isAiBot ? 'pointer' : 'default',
                minWidth: 0,
              }}
            >
              {isAiBot ? (
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-functional-red)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  title="asterisk AI"
                >
                  <KnoblabIcon size={14} color="var(--color-bg-primary)" />
                </div>
              ) : getSafeAvatarUrl(comment.authorPhotoURL) ? (
                <img
                  src={getSafeAvatarUrl(comment.authorPhotoURL)!}
                  alt={comment.author}
                  referrerPolicy="no-referrer"
                  style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: isPostAuthor ? 'var(--color-functional-red)' : 'var(--color-border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    color: 'var(--color-bg-primary)',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {formatAuthorName(comment.author).charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
                <span
                  style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}
                  title={formatAuthorName(comment.author)}
                >
                  {formatAuthorName(comment.author)}
                </span>
                <AuthorBadge
                  userId={comment.authorId}
                  email={comment.authorEmail}
                  generation={comment.authorGeneration}
                />
                {isPostAuthor && (
                  <span
                    title="원글 작성자"
                    className="comment-post-author-badge"
                  >
                    작성자
                  </span>
                )}
              </div>
            </div>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '11.5px', marginLeft: '2px', whiteSpace: 'nowrap' }}>
              {formatDate(comment.createdAt)}
            </span>
          </div>

          {/* Action buttons right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 'auto' }}>
            {!comment.isRateLimited && (
              <button
                onClick={() => handleReplyClick(comment)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isReplying ? 'var(--color-functional-red)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                <CornerDownRight size={12} />
                답글
              </button>
            )}
            {!comment.isRateLimited && (
              <button
                onClick={() => likeComment(comment.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: comment.hasLiked ? 'var(--color-functional-red)' : (comment.likes || 0) > 0 ? 'var(--color-functional-red)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
                title={comment.hasLiked ? '추천 취소' : '댓글 추천'}
              >
                <Heart size={12} fill={comment.hasLiked ? 'var(--color-functional-red)' : 'none'} />
                {comment.likes || 0}
              </button>
            )}
            {isCommentAuthor && (
              <button
                onClick={() => handleDeleteComment(comment.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-functional-red)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
                title="삭제"
              >
                <Trash2 size={12} /> 삭제
              </button>
            )}
            <button
              onClick={() => handleReportComment(comment, isReply)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '11.5px',
                whiteSpace: 'nowrap',
              }}
              title="신고"
            >
              <AlertTriangle size={12} />
              신고
            </button>
          </div>
        </div>

        {comment.isRateLimited ? (
          <div
            style={{
              marginTop: '6px',
              padding: '10px 12px',
              backgroundColor: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-default)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-primary)' }}>
              <Clock size={15} style={{ color: 'var(--color-functional-red)', flexShrink: 0 }} />
              {currentTime < (comment.retryAvailableAt || 0) ? (
                <span>
                  asterisk AI는 20초에 1회만 호출할 수 있습니다. 약 <strong>{Math.max(1, Math.ceil(((comment.retryAvailableAt || 0) - currentTime) / 1000))}초</strong> 후에 다시 시도해 주세요.
                </span>
              ) : (
                <span>
                  쿨다운이 완료되었습니다. 지금 다시 답변을 요청할 수 있습니다. (남은 시간: <strong>{Math.max(1, Math.ceil(((comment.retryExpireAt || 0) - currentTime) / 1000))}초</strong>)
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              {currentTime < (comment.retryAvailableAt || 0) ? (
                <button
                  disabled
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'not-allowed',
                    opacity: 0.7,
                  }}
                >
                  <RefreshCw size={13} />
                  약 {Math.max(1, Math.ceil(((comment.retryAvailableAt || 0) - currentTime) / 1000))}초 후 다시 생성 가능
                </button>
              ) : (
                (isAdmin || isTriggerCommentAuthor) ? (
                  <button
                    onClick={() => handleRegenerateAi(comment)}
                    disabled={regeneratingCommentId === comment.id || aiGeneratingParentId === (comment.parentId || comment.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      backgroundColor: 'var(--color-functional-red)',
                      color: '#ffffff',
                      cursor: (regeneratingCommentId === comment.id || aiGeneratingParentId === (comment.parentId || comment.id)) ? 'wait' : 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <RefreshCw
                      size={13}
                      style={{
                        animation: (regeneratingCommentId === comment.id || aiGeneratingParentId === (comment.parentId || comment.id)) ? 'spin 1s linear infinite' : 'none',
                      }}
                    />
                    {(regeneratingCommentId === comment.id || aiGeneratingParentId === (comment.parentId || comment.id)) ? getAiStageButtonLabel(aiGeneratingStage, aiGeneratingSelectedProvider, aiGeneratingTools) : '다시 생성하기'}
                  </button>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    (요청자만 다시 생성할 수 있습니다)
                  </span>
                )
              )}
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--color-text-primary)', fontSize: '13.5px', lineHeight: 1.6, paddingLeft: '2px' }}>
            <MarkdownRenderer content={comment.body} />
          </div>
        )}

        {/* Disclaimer under AI Bot answers */}
        {isAiBot && !comment.isRateLimited && (
          <div
            style={{
              position: 'relative',
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
              marginTop: '6px',
              paddingLeft: '2px',
              userSelect: 'none',
              letterSpacing: '-0.01em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span style={{ opacity: 0.85 }}>asterisk AI는 실수를 할 수 있습니다.</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveAiInfoCommentId(activeAiInfoCommentId === comment.id ? null : comment.id);
              }}
              aria-label="AI 모델 및 도구 정보 보기"
              title="AI 모델 및 도구 정보"
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                margin: 0,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activeAiInfoCommentId === comment.id ? 'var(--color-brand-primary, #6366f1)' : 'var(--color-text-secondary)',
                borderRadius: '50%',
                transition: 'all 0.15s ease',
              }}
            >
              <Info size={13} />
            </button>

            {/* AI Info Popover (작은 정보 창) */}
            {activeAiInfoCommentId === comment.id && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  left: 0,
                  zIndex: 40,
                  width: '270px',
                  backgroundColor: 'var(--color-bg-primary, #ffffff)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-sm, 8px)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
                  padding: '11px 13px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={12} style={{ color: 'var(--color-brand-primary, #6366f1)' }} />
                    AI 생성 정보
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveAiInfoCommentId(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: 1.4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '11.5px', flexShrink: 0 }}>사용 모델:</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-brand-primary, #6366f1)', textAlign: 'right' }}>
                      {getCommentAiProvider(comment) || '기본 어시스턴트'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '11.5px', flexShrink: 0 }}>호출한 도구:</span>
                    <span style={{ textAlign: 'right', fontWeight: 500, color: (comment.aiTools && comment.aiTools.length > 0) ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                      {(comment.aiTools && comment.aiTools.length > 0) ? comment.aiTools.join(', ') : '없음 (직접 추론)'}
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: '6px', fontSize: '10.5px', color: 'var(--color-text-secondary)', lineHeight: 1.35 }}>
                  TypeSafe Jev가 요청 맥락을 분석하여 최적의 모델과 도구를 선택했습니다.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Inline Reply Form */}
        {isReplying && (
          <div
            style={{
              marginTop: '10px',
              padding: '10px 12px',
              backgroundColor: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-functional-red)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CornerDownRight size={12} /> @{formatAuthorName(comment.author)} 님에게 답글 작성
              </span>
              <button
                onClick={() => setReplyingToId(null)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={13} />
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <textarea
                autoFocus
                value={replyText}
                disabled={submittingReplyId === comment.id}
                onChange={handleReplyTextChange}
                placeholder="답글 내용을 입력하세요..."
                rows={2}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  color: 'var(--color-text-primary)',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                  marginBottom: '6px',
                  opacity: submittingReplyId === comment.id ? 0.7 : 1,
                }}
              />

              {/* Reply Mention Suggestion Popup */}
              {showReplyMention && renderMentionPopup(replyMentionQuery, insertReplyMention)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setReplyingToId(null)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-border-default)',
                    color: 'var(--color-text-secondary)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: '11.5px',
                  }}
                >
                  취소
                </button>
                <button
                  onClick={() => handleSubmitReply(comment.id)}
                  disabled={!replyText.trim() || Boolean(submittingReplyId)}
                  style={{
                    backgroundColor: 'var(--color-functional-red)',
                    color: 'var(--color-bg-primary)',
                    border: '1px solid var(--color-functional-red)',
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: !replyText.trim() || Boolean(submittingReplyId) ? 'not-allowed' : 'pointer',
                    opacity: !replyText.trim() || Boolean(submittingReplyId) ? 0.5 : 1,
                    fontWeight: 600,
                    fontSize: '11.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {submittingReplyId === comment.id ? (
                    <>
                      <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> 답글 등록 중...
                    </>
                  ) : (
                    <>
                      <Send size={11} /> 답글 등록
                    </>
                  )}
                </button>
              </div>
            </div>
            {((isSlowReplySubmitting && submittingReplyId === comment.id) || replySubmitFailedId === comment.id) && (
              <ServerStatusNotice
                compact
                variant={replySubmitFailedId === comment.id ? 'error' : 'info'}
                message="답글을 작성할 수 없나요?"
                style={{ marginTop: '8px' }}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pdf-comment-section" style={{ padding: '8px 0 0', backgroundColor: 'transparent' }}>
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        message="댓글을 작성하려면 로그인이 필요합니다."
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          borderBottom: '1px solid var(--color-border-default)',
          paddingBottom: '10px',
        }}
      >
        <h3 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MessageSquare size={17} style={{ color: 'var(--color-functional-red)' }} />
          댓글
          <span
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-functional-red)',
              fontSize: '12px',
              padding: '1px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-default)',
              fontWeight: 700,
            }}
          >
            {postComments.length}
          </span>
        </h3>
      </div>

      {/* Comment List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        {rootComments.length === 0 ? (
          <div
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: '13px',
              padding: '32px 0',
              textAlign: 'center',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--color-border-default)',
            }}
          >
            <MessageSquare size={28} style={{ marginBottom: '6px', opacity: 0.4 }} />
            <div>아직 작성된 댓글이 없습니다.</div>
            <div style={{ fontSize: '12px', marginTop: '3px', opacity: 0.7 }}>첫 번째 댓글을 남겨 이야기를 시작해보세요!</div>
          </div>
        ) : (
          rootComments.map((rootComment) => {
            const replies = getThreadReplies(rootComment.id);
            const isAiGeneratingHere =
              aiGeneratingParentId === rootComment.id ||
              replies.some((r) => r.id === aiGeneratingParentId);
            return (
              <React.Fragment key={rootComment.id}>
                {renderCommentItem(rootComment, false)}
                {replies.map((reply) => renderCommentItem(reply, true))}
                {isAiGeneratingHere && (
                  <div
                    style={{
                      marginLeft: isMobile ? '14px' : '28px',
                      marginTop: '8px',
                      padding: isMobile ? '10px 12px' : '12px 16px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border-default)',
                      borderLeft: '3px solid var(--color-functional-red)',
                      boxShadow: 'var(--shadow-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      position: 'relative',
                    }}
                  >
                    {/* Header: avatar, name, generation badge, and right provider pill */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--color-functional-red)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                          title="asterisk AI"
                        >
                          <KnoblabIcon size={14} color="var(--color-bg-primary)" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: '13px' }}>
                            asterisk
                          </span>
                          <AuthorBadge userId="asterisk-ai-bot" generation="AI" />
                        </div>
                      </div>

                      {/* Provider / Status Pill */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--color-functional-red)',
                          backgroundColor: 'var(--color-bg-primary)',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          border: '1px solid var(--color-border-default)',
                        }}
                      >
                        <Loader2 size={11} style={{ animation: 'spin 1.2s linear infinite' }} />
                        <span>{formatAiModelDisplay(aiGeneratingSelectedProvider) || 'AI'}</span>
                      </div>
                    </div>

                    {/* Stage status message with Sparkles */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '2px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: 'var(--color-text-primary)',
                          fontSize: '13px',
                          fontWeight: 500,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        <Sparkles size={13} style={{ color: 'var(--color-functional-red)', flexShrink: 0 }} />
                        <span>{getAiStageDescription(aiGeneratingStage, aiGeneratingSelectedProvider, aiGeneratingTools)}</span>
                      </div>

                      {/* Subtle loading skeleton lines */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', opacity: 0.35, marginTop: '2px' }}>
                        <div
                          style={{
                            height: '6px',
                            width: '68%',
                            borderRadius: '2px',
                            backgroundColor: 'var(--color-text-secondary)',
                            animation: 'pulse-subtle 1.8s ease-in-out infinite',
                          }}
                        />
                        <div
                          style={{
                            height: '6px',
                            width: '40%',
                            borderRadius: '2px',
                            backgroundColor: 'var(--color-text-secondary)',
                            animation: 'pulse-subtle 1.8s ease-in-out infinite',
                            animationDelay: '0.25s',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Main Comment Input Box */}
      <div
        style={{
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px',
          backgroundColor: 'var(--color-bg-secondary)',
          boxShadow: 'var(--shadow-subtle)',
          position: 'relative',
        }}
      >
        {!user ? (
          <div
            style={{
              padding: '24px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: 500 }}>
              로그인 후 댓글을 작성할 수 있습니다.
            </span>
            <button
              onClick={() => setIsLoginModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                backgroundColor: 'var(--color-functional-red)',
                color: 'var(--color-bg-primary)',
                border: '1px solid var(--color-functional-red)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <LogIn size={15} /> 로그인하기
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || '사용자'}
                  style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-functional-red)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    color: 'var(--color-bg-primary)',
                    fontWeight: 700,
                  }}
                >
                  {(user.displayName || '사용자').charAt(0).toUpperCase()}
                </div>
              )}
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {user.displayName || '사용자'}
              </span>
              <AuthorBadge userId={user.uid} email={user.email} />
            </div>

            <div style={{ position: 'relative' }}>
              <textarea
                value={commentText}
                disabled={isMainSubmitting}
                onChange={handleCommentTextChange}
                placeholder="따뜻한 댓글을 남겨주세요..."
                maxLength={500}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-primary)',
                  resize: 'vertical',
                  minHeight: '70px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  marginBottom: '8px',
                  fontSize: '13.5px',
                  lineHeight: '1.5',
                  boxSizing: 'border-box',
                  opacity: isMainSubmitting ? 0.7 : 1,
                }}
              />

              {/* Main Comment Mention Suggestion Popup */}
              {showMainMention && renderMentionPopup(mainMentionQuery, insertMainMention)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-default)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  {commentText.length} / 500자
                </span>
              </div>
              <button
                onClick={handleSubmitMainComment}
                disabled={!commentText.trim() || isMainSubmitting}
                style={{
                  backgroundColor: 'var(--color-functional-red)',
                  color: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-functional-red)',
                  padding: '6px 18px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: !commentText.trim() || isMainSubmitting ? 'not-allowed' : 'pointer',
                  opacity: !commentText.trim() || isMainSubmitting ? 0.5 : 1,
                  fontWeight: 600,
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                {isMainSubmitting ? (
                  <>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> 작성 중...
                  </>
                ) : (
                  <>
                    <Send size={13} /> 작성
                  </>
                )}
              </button>
            </div>
            {(isSlowMainSubmitting || mainSubmitFailed) && (
              <ServerStatusNotice
                compact
                variant={mainSubmitFailed ? 'error' : 'info'}
                message="댓글을 작성할 수 없나요?"
                style={{ marginTop: '8px' }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

