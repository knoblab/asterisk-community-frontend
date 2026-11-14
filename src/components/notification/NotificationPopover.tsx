import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, CornerDownRight, CheckCheck, Trash2, X, Sparkles } from 'lucide-react';
import { useNotificationStore } from '../../stores/useNotificationStore';
import { getPostPath } from '../../utils/postLink';
import type { AppNotification } from '../../types';

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorPosition?: 'sidebar' | 'header';
  onSelectPost?: (postId: string) => void;
}

const formatRelativeTime = (ts: number): string => {
  const diff = Math.max(0, Date.now() - ts);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '방금 전';
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}일 전`;

  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  isOpen,
  onClose,
  anchorPosition = 'sidebar',
  onSelectPost,
}) => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, fetchNotifications } =
    useNotificationStore();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications(true);
    }
  }, [isOpen, fetchNotifications]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleNotificationClick = (notif: AppNotification) => {
    // Optimistically and asynchronously mark as read
    if (!notif.isRead) {
      void markAsRead(notif.id);
    }
    onClose();
    if (onSelectPost) {
      onSelectPost(notif.postId);
    } else {
      navigate(getPostPath(notif.postId));
    }
  };

  const handleDelete = (e: React.MouseEvent | React.TouchEvent, notifId: string) => {
    e.stopPropagation();
    deleteNotification(notifId);
  };

  return (
    <>
      {/* Outside click backdrop */}
      <div
        className="notif-popover-backdrop"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={popoverRef}
        className={`notif-popover-card ${anchorPosition}`}
        onClick={(e) => e.stopPropagation()}
      >
      {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-silver)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-vellum)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={18} style={{ color: 'var(--color-functional-red)' }} />
            <h3
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              알림
            </h3>
            {unreadCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'var(--color-functional-red)',
                  color: 'var(--color-bg-primary)',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  minWidth: '18px',
                  textAlign: 'center',
                }}
              >
                {unreadCount}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsRead();
                }}
                onTouchStart={(e) => e.stopPropagation()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  transition: 'color 0.15s ease',
                }}
                title="모두 읽음으로 표시"
              >
                <CheckCheck size={14} />
                모두 읽음
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              onTouchStart={(e) => e.stopPropagation()}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
              }}
              title="닫기"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: '460px',
          }}
        >
          {notifications.length === 0 ? (
            <div
              style={{
                padding: '48px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                color: 'var(--color-text-secondary)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-bg-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <Bell size={22} style={{ opacity: 0.5 }} />
              </div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>새로운 알림이 없습니다.</p>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', opacity: 0.8 }}>
                내 글에 댓글이나 답글이 달리면 여기에 표시됩니다.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {notifications.map((notif) => {
                const isReply = notif.type === 'reply';
                const isAi = notif.senderName === 'asterisk' || notif.senderName === 'asterisk-ai-bot';
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    style={{
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--color-border-default)',
                      backgroundColor: notif.isRead ? 'transparent' : 'var(--color-bg-secondary)',
                      transition: 'background-color 0.15s ease',
                      position: 'relative',
                    }}
                    className="notif-item-hover"
                  >
                    {/* Icon */}
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: notif.isRead
                          ? 'var(--color-bg-secondary)'
                          : 'var(--color-functional-red)',
                        color: notif.isRead
                          ? 'var(--color-text-secondary)'
                          : 'var(--color-bg-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      {isAi ? <Sparkles size={15} /> : isReply ? <CornerDownRight size={15} /> : <MessageSquare size={15} />}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          color: 'var(--color-text-primary)',
                          fontWeight: notif.isRead ? 500 : 600,
                          lineHeight: 1.4,
                          marginBottom: '4px',
                        }}
                      >
                        <span style={{ color: 'var(--color-functional-red)', fontWeight: 700 }}>
                          {notif.senderName}
                        </span>
                        {isAi && (
                          <span
                            style={{
                              marginLeft: '5px',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '3px',
                              backgroundColor: 'rgba(239, 68, 68, 0.12)',
                              color: 'var(--color-functional-red)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            AI
                          </span>
                        )}
                        님이{' '}
                        {isAi ? (
                          '회원님의 질문에 답변을 남겼습니다.'
                        ) : isReply ? (
                          '회원님의 댓글에 답글을 남겼습니다.'
                        ) : (
                          <>
                            글 <span style={{ fontWeight: 600 }}>&lsquo;{notif.postTitle}&rsquo;</span>에 댓글을 남겼습니다.
                          </>
                        )}
                      </div>

                      {notif.contentSnippet && (
                        <p
                          style={{
                            margin: '0 0 4px',
                            fontSize: '12px',
                            color: 'var(--color-text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.4,
                          }}
                        >
                          &ldquo;{notif.contentSnippet}&rdquo;
                        </p>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          color: 'var(--color-text-secondary)',
                          opacity: 0.8,
                        }}
                      >
                        <span>{formatRelativeTime(notif.createdAt)}</span>
                        {!notif.isRead && (
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--color-functional-red)',
                              display: 'inline-block',
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Delete action */}
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, notif.id)}
                      onTouchStart={(e) => e.stopPropagation()}
                      title="삭제"
                      aria-label="알림 삭제"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        padding: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '36px',
                        minHeight: '36px',
                        opacity: 0.6,
                        transition: 'opacity 0.15s ease, color 0.15s ease',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
