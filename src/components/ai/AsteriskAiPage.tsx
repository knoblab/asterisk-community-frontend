import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useBoardStore } from '../../stores/useBoardStore';
import { useUIStore } from '../../stores/useUIStore';
import type { AiChatMessage, Post } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import {
  Send,
  Trash2,
  FileText,
  Search,
  X,
  MessageSquare,
  Clock,
  Sparkles,
  Pin,
  AlertCircle,
  Image as ImageIcon,
  Paperclip
} from 'lucide-react';

interface AsteriskAiPageProps {
  onSelectPost: (postId: string) => void;
}

const STORAGE_KEY_PREFIX = 'asterisk_ai_chat_';

const QUICK_PROMPTS = [
  { label: '내가 쓴 글 목록과 내용 요약해줘', prompt: '내가 지금까지 작성한 글 목록과 주요 내용을 요약해서 정리해줘.' },
  { label: '첨부 이미지 분석해줘', prompt: '이 게시글에 첨부된 이미지를 분석해서 어떤 내용인지, 글자나 주요 정보가 무엇인지 자세히 설명해줘.' },
  { label: '커뮤니티 최신 인기글 요약', prompt: '현재 커뮤니티에서 가장 인기 있는 게시글들과 반응을 요약해줘.' },
  { label: '오늘 학교 급식 식단', prompt: '오늘 아침, 점심, 저녁 급식 메뉴와 주요 알레르기 정보를 알려줘.' },
  { label: '학급 시간표 및 일과 안내', prompt: '오늘 우리 학교 1학년, 2학년, 3학년 각 학급 시간표와 오늘 일과 일정 알려줘.' },
  { label: '주요 공지사항 요약', prompt: '게시판에 등록된 최근 공지사항 내용을 정리해줘.' },
];

export const AsteriskAiPage: React.FC<AsteriskAiPageProps> = ({ onSelectPost }) => {
  const { user } = useAuthStore();
  const { posts } = useBoardStore();
  const openLoginModal = useUIStore((state) => state.openLoginModal);

  const baseUrl = import.meta.env.VITE_API_URL || '';
  const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;

  // Messages state
  const storageKey = user ? `${STORAGE_KEY_PREFIX}${user.uid}` : `${STORAGE_KEY_PREFIX}guest`;
  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: `안녕하세요! **asterisk AI**입니다.\n\n커뮤니티 내 모든 게시글과 댓글을 열람하여 분석하고, 게시글에 첨부된 **이미지(사진, 도표, 캡처, 문서)**를 직접 확인하여 답변해 드릴 수 있습니다.\n\n- 특정 글이나 첨부 이미지에 대해 궁금한 점이 있다면 우측에서 **게시글을 선택(포커스)** 하거나 질문해 보세요.\n- 내가 작성한 글 요약, 최신 소식, 학교 급식 정보 및 실시간 학급 시간표/일과도 바로 찾아드립니다.`,
        createdAt: Date.now(),
        model: 'gemini-2.5-flash',
      },
    ];
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [targetPost, setTargetPost] = useState<Post | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [attachedImages, setAttachedImages] = useState<Array<{ id: string; dataUrl: string; name: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      useUIStore.getState().addToast('이미지는 최대 5MB까지 첨부할 수 있습니다.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setAttachedImages((prev) => [
          ...prev.slice(0, 2),
          { id: `img_${Date.now()}_${Math.random()}`, dataUrl, name: file.name || 'image.png' },
        ]);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleProcessImageFile(file);
        }
      }
    }
  };

  // User posts side panel state
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [isLoadingUserPosts, setIsLoadingUserPosts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSideTab, setActiveSideTab] = useState<'my_posts' | 'all_posts'>('my_posts');
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Save messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, storageKey]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Check rate limit status on mount and sync interval
  useEffect(() => {
    const checkStatus = async () => {
      if (!user) return;
      try {
        const res = await fetch(`${API_BASE_URL}/ai/chat/status`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.remainingSeconds > 0) {
            setCooldownSeconds(data.remainingSeconds);
          }
        }
      } catch {
        // ignore
      }
    };

    checkStatus();

    // 1-second countdown timer for cooldownSeconds
    const countdown = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(countdown);
    };
  }, [user, API_BASE_URL]);

  // Fetch user posts for the side panel
  useEffect(() => {
    if (!user) {
      setUserPosts([]);
      return;
    }

    const fetchMyPosts = async () => {
      setIsLoadingUserPosts(true);
      try {
        const res = await fetch(`${API_BASE_URL}/posts?authorId=${encodeURIComponent(user.uid)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          const rawPosts = Array.isArray(data) ? data : data.posts || [];
          setUserPosts(
            rawPosts
              .filter((p: any) => !p.isDeleted && p.status !== 'deleted')
              .sort((a: any, b: any) => b.createdAt - a.createdAt)
          );
        }
      } catch (err) {
        console.error('Failed to fetch user posts for AI view:', err);
      } finally {
        setIsLoadingUserPosts(false);
      }
    };

    fetchMyPosts();
  }, [user, API_BASE_URL]);

  const handleClearChat = () => {
    if (window.confirm('대화 기록을 모두 초기화하시겠습니까?')) {
      const resetMsg: AiChatMessage[] = [
        {
          id: 'welcome',
          role: 'assistant',
          content: `대화 기록이 초기화되었습니다.\n\n무엇이든 편하게 물어보세요!`,
          createdAt: Date.now(),
          model: 'gemini-2.5-flash',
        },
      ];
      setMessages(resetMsg);
      localStorage.removeItem(storageKey);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputPrompt).trim() || (attachedImages.length > 0 ? '첨부된 이미지를 분석하고 설명해줘.' : '');
    if (!prompt || isGenerating || cooldownSeconds > 0) return;

    if (!user) {
      openLoginModal();
      return;
    }

    const currentImages = [...attachedImages];
    const userMessageId = `user_${Date.now()}`;
    const newUserMessage: AiChatMessage = {
      id: userMessageId,
      role: 'user',
      content: prompt,
      images: currentImages.length > 0 ? currentImages.map(img => ({ dataUrl: img.dataUrl, name: img.name })) : undefined,
      targetPost: targetPost ? { id: targetPost.id, title: targetPost.title } : undefined,
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, newUserMessage];
    setMessages(nextMessages);
    setInputPrompt('');
    setAttachedImages([]);
    setIsGenerating(true);
    setCooldownSeconds(20);

    try {
      const res = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          images: currentImages.length > 0 ? currentImages.map(img => ({ dataUrl: img.dataUrl, name: img.name })) : undefined,
          targetPostId: targetPost ? targetPost.id : null,
          messages: nextMessages.slice(-8), // Send recent context
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          const remaining = errData.remainingSeconds || 20;
          setCooldownSeconds(remaining);
          throw new Error(errData.error || `20초에 1회만 호출할 수 있습니다. (${remaining}초 후 가능)`);
        }
        throw new Error(errData.error || `오류 발생 (${res.status})`);
      }

      const data = await res.json();

      const botMessage: AiChatMessage = {
        id: `bot_${Date.now()}`,
        role: 'assistant',
        content: data.text || '답변을 생성하지 못했습니다.',
        model: data.model,
        provider: data.provider,
        toolsUsed: data.toolsUsed,
        targetPost: data.targetPost,
        createdAt: data.createdAt || Date.now(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err: any) {
      console.error('[AI Chat Send Error]:', err);
      const errorMessage: AiChatMessage = {
        id: `bot_err_${Date.now()}`,
        role: 'assistant',
        content: `**답변을 불러오지 못했습니다.**\n\n${err.message || '잠시 후 다시 시도해 주세요.'}`,
        isError: true,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSelectTargetPost = (post: Post) => {
    if (targetPost?.id === post.id) {
      setTargetPost(null);
    } else {
      setTargetPost(post);
      setIsSidePanelOpen(false);
    }
  };

  // Filter posts for the side panel search
  const filteredAllPosts = posts
    .filter((p) => !p.isDeleted && p.status !== 'deleted')
    .filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q);
    });

  const filteredUserPosts = userPosts.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q);
  });

  return (
    <div className="ai-chat-layout">
      {/* Main Chat Pane */}
      <div className="ai-chat-main">
        {/* Chat Header */}
        <div className="ai-chat-header">
          <div className="ai-chat-header-info">
            <div className="ai-chat-title">
              <span className="ai-chat-star">*</span>
              <h2>asterisk AI</h2>
              <span className="ai-badge-live">LIVE</span>
            </div>
            <p className="ai-chat-subtitle">커뮤니티 전문 어시스턴트 · 실시간 게시글/댓글/작성기록 검색</p>
          </div>

          <div className="ai-chat-header-actions">
            {cooldownSeconds > 0 && (
              <div className="ai-cooldown-badge" title="호출 쿨다운 (20초)">
                <Clock size={12} />
                <span>{cooldownSeconds}s</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
              className={`btn-ai-header-side ${isSidePanelOpen ? 'active' : ''}`}
              title="게시글 열람 패널 토글"
            >
              <FileText size={14} />
              <span>게시글 목록</span>
            </button>
            <button
              type="button"
              onClick={handleClearChat}
              className="btn-ai-header-clear"
              title="대화 기록 초기화"
              aria-label="대화 기록 초기화"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Guest Warning */}
        {!user && (
          <div className="ai-guest-banner">
            <AlertCircle size={15} />
            <span>asterisk AI와 1:1 대화를 이용하고 내 게시글 기록을 조회하려면 로그인이 필요합니다.</span>
            <button type="button" onClick={() => openLoginModal()} className="btn-ai-login">
              로그인
            </button>
          </div>
        )}

        {/* Messages Stream */}
        <div className="ai-messages-container">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div key={msg.id} className={`ai-message-row ${isUser ? 'user' : 'assistant'}`}>
                {!isUser && (
                  <div className="ai-avatar">
                    <span className="ai-avatar-star">*</span>
                  </div>
                )}

                <div className={`ai-message-bubble ${isUser ? 'user' : 'assistant'} ${msg.isError ? 'error' : ''}`}>
                  {/* Meta bar for assistant */}
                  {!isUser && (
                    <div className="ai-msg-meta">
                      <span className="ai-msg-sender">asterisk AI</span>
                      {msg.model && <span className="ai-msg-model">{msg.model}</span>}

                      {/* Tool call badges */}
                      {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                        <div className="ai-msg-tools">
                          {msg.toolsUsed.map((tool) => (
                            <span key={tool.id} className="ai-tool-pill" title={`도구 실행: ${tool.name}`}>
                              <Sparkles size={10} />
                              <span>{tool.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attached Target Post indication if user attached it */}
                  {msg.targetPost && (
                    <div className="ai-msg-attached-post">
                      <Pin size={11} />
                      <span>지정 글: </span>
                      <button
                        type="button"
                        onClick={() => onSelectPost(msg.targetPost!.id)}
                        className="ai-attached-post-btn"
                        title="해당 게시글 보기"
                      >
                        {msg.targetPost.title}
                      </button>
                    </div>
                  )}

                  {/* Content body */}
                  <div className="ai-msg-content">
                    {msg.images && msg.images.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {msg.images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img.dataUrl}
                            alt={img.name || '첨부 이미지'}
                            style={{
                              maxHeight: '120px',
                              maxWidth: '180px',
                              borderRadius: 'var(--radius-sm, 2px)',
                              border: '1px solid var(--color-border)',
                              objectFit: 'contain',
                              background: '#000',
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {isUser ? (
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="ai-msg-time">
                    {new Intl.DateTimeFormat('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(msg.createdAt))}
                  </div>
                </div>
              </div>
            );
          })}

          {isGenerating && (
            <div className="ai-message-row assistant">
              <div className="ai-avatar">
                <span className="ai-avatar-star pulse">*</span>
              </div>
              <div className="ai-message-bubble assistant generating">
                <div className="ai-generating-indicator">
                  <div className="ai-dot-pulse">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="ai-generating-text">게시판 및 데이터 열람 중...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input & Controls Bottom Section */}
        <div className="ai-chat-input-section">
          {/* Active Target Post Banner */}
          {targetPost && (
            <div className="ai-active-target-bar">
              <div className="ai-target-info">
                <Pin size={13} className="ai-target-icon" />
                <span className="ai-target-label">질문 대상 글:</span>
                <span className="ai-target-title">[{targetPost.category}] {targetPost.title}</span>
                <span className="ai-target-meta">(댓글 {targetPost.commentCount}개)</span>
                {/(?:!\[|<img|\/uploads\/images\/)/i.test(targetPost.body || '') && (
                  <span className="ai-target-has-image-badge" title="이미지가 포함된 게시글입니다. 이미지 분석 가능!">
                    <ImageIcon size={11} />
                    <span>이미지 포함</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setTargetPost(null)}
                className="ai-target-clear-btn"
                title="글 지정 해제"
              >
                <X size={13} />
                <span>해제</span>
              </button>
            </div>
          )}

          {/* Quick Prompts Chips */}
          <div className="ai-quick-prompts-bar">
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setInputPrompt(qp.prompt);
                  inputRef.current?.focus();
                }}
                disabled={isGenerating || cooldownSeconds > 0}
                className="ai-prompt-chip"
              >
                <Sparkles size={11} />
                <span>{qp.label}</span>
              </button>
            ))}
          </div>

          {/* Attached Images Preview */}
          {attachedImages.length > 0 && (
            <div className="ai-attached-images-preview" style={{ marginBottom: '8px' }}>
              {attachedImages.map((img) => (
                <div key={img.id} className="ai-attached-thumb-item">
                  <img src={img.dataUrl} alt={img.name} className="ai-attached-thumb-img" />
                  <button
                    type="button"
                    onClick={() => setAttachedImages((prev) => prev.filter((i) => i.id !== img.id))}
                    className="ai-attached-thumb-del"
                    title="삭제"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Prompt Textarea Form */}
          <div className="ai-input-wrapper">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleProcessImageFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || !user || attachedImages.length >= 3}
              className="ai-attach-file-btn"
              title="이미지 첨부 (또는 붙여넣기 Ctrl+V)"
              aria-label="이미지 파일 첨부"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              ref={inputRef}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                targetPost
                  ? `지정된 '${targetPost.title}' 글 내용 및 댓글에 대해 질문해 보세요... (이미지 Ctrl+V, Enter 전송)`
                  : '커뮤니티 글, 내가 쓴 글, 급식 정보 등 질문을 입력하세요... (이미지 Ctrl+V, Enter 전송)'
              }
              rows={2}
              className="ai-chat-textarea"
              disabled={isGenerating || !user}
            />

            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={(!inputPrompt.trim() && attachedImages.length === 0) || isGenerating || cooldownSeconds > 0 || !user}
              className={`ai-btn-send ${cooldownSeconds > 0 ? 'cooldown' : ''}`}
              title={
                cooldownSeconds > 0
                  ? `쿨다운 중 (${cooldownSeconds}초)`
                  : '메시지 전송 (Enter)'
              }
            >
              {cooldownSeconds > 0 ? (
                <span className="ai-cooldown-timer">{cooldownSeconds}s</span>
              ) : (
                <Send size={15} />
              )}
            </button>
          </div>

          <div className="ai-input-notice">
            <span>asterisk AI는 커뮤니티 전용 모델이며, 질문 간 20초 간격이 적용됩니다.</span>
          </div>
        </div>
      </div>

      {/* Side Panel: Post Explorer & User Post History */}
      <div className={`ai-side-panel ${isSidePanelOpen ? 'open' : ''}`}>
        <div className="ai-side-header">
          <div className="ai-side-tabs">
            <button
              type="button"
              onClick={() => setActiveSideTab('my_posts')}
              className={`ai-side-tab-btn ${activeSideTab === 'my_posts' ? 'active' : ''}`}
            >
              내 작성 글 ({userPosts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSideTab('all_posts')}
              className={`ai-side-tab-btn ${activeSideTab === 'all_posts' ? 'active' : ''}`}
            >
              전체 게시글
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsSidePanelOpen(false)}
            className="ai-side-close-btn"
            title="패널 닫기"
          >
            <X size={15} />
          </button>
        </div>

        {/* Search input in side panel */}
        <div className="ai-side-search-bar">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeSideTab === 'my_posts' ? '내 글 검색...' : '게시글 검색...'}
            className="ai-side-search-input"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="search-clear">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Posts list */}
        <div className="ai-side-posts-list">
          {activeSideTab === 'my_posts' ? (
            !user ? (
              <div className="ai-side-empty">
                <p>로그인 후 내가 쓴 글 목록을 확인할 수 있습니다.</p>
                <button type="button" onClick={() => openLoginModal()} className="btn-ai-login">
                  로그인하기
                </button>
              </div>
            ) : isLoadingUserPosts ? (
              <div className="ai-side-empty">
                <p>내가 작성한 글을 불러오는 중...</p>
              </div>
            ) : filteredUserPosts.length === 0 ? (
              <div className="ai-side-empty">
                <p>{searchQuery ? '검색 결과가 없습니다.' : '작성한 게시글이 없습니다.'}</p>
              </div>
            ) : (
              filteredUserPosts.map((post) => {
                const isTarget = targetPost?.id === post.id;
                return (
                  <div
                    key={post.id}
                    className={`ai-side-post-card ${isTarget ? 'selected' : ''}`}
                  >
                    <div className="ai-card-top">
                      <span className="ai-card-cat">{post.category}</span>
                      <span className="ai-card-date">
                        {new Intl.DateTimeFormat('ko-KR', {
                          month: 'numeric',
                          day: 'numeric',
                        }).format(new Date(post.createdAt))}
                      </span>
                    </div>

                    <h4
                      className="ai-card-title"
                      onClick={() => onSelectPost(post.id)}
                      title="게시글 열람"
                    >
                      {post.title}
                    </h4>

                    <p className="ai-card-snippet">
                      {post.body.slice(0, 70)}...
                    </p>

                    <div className="ai-card-actions">
                      <span className="ai-card-comments">
                        <MessageSquare size={11} />
                        댓글 {post.commentCount}
                      </span>
                      {/(?:!\[|<img|\/uploads\/images\/)/i.test(post.body || '') && (
                        <span className="ai-card-has-img" title="이미지가 포함된 게시글입니다">
                          <ImageIcon size={11} />
                          <span>이미지</span>
                        </span>
                      )}

                      <div className="ai-card-action-btns">
                        <button
                          type="button"
                          onClick={() => handleSelectTargetPost(post)}
                          className={`btn-card-focus ${isTarget ? 'active' : ''}`}
                          title="이 글을 AI 질문 대상으로 지정"
                        >
                          <Pin size={11} />
                          <span>{isTarget ? '지정 해제' : '질문 대상으로 지정'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            filteredAllPosts.length === 0 ? (
              <div className="ai-side-empty">
                <p>게시글이 없습니다.</p>
              </div>
            ) : (
              filteredAllPosts.map((post) => {
                const isTarget = targetPost?.id === post.id;
                return (
                  <div
                    key={post.id}
                    className={`ai-side-post-card ${isTarget ? 'selected' : ''}`}
                  >
                    <div className="ai-card-top">
                      <span className="ai-card-cat">{post.category}</span>
                      <span className="ai-card-author">{post.author}</span>
                    </div>

                    <h4
                      className="ai-card-title"
                      onClick={() => onSelectPost(post.id)}
                      title="게시글 열람"
                    >
                      {post.title}
                    </h4>

                    <p className="ai-card-snippet">
                      {post.body.slice(0, 70)}...
                    </p>

                    <div className="ai-card-actions">
                      <span className="ai-card-comments">
                        <MessageSquare size={11} />
                        댓글 {post.commentCount}
                      </span>
                      {/(?:!\[|<img|\/uploads\/images\/)/i.test(post.body || '') && (
                        <span className="ai-card-has-img" title="이미지가 포함된 게시글입니다">
                          <ImageIcon size={11} />
                          <span>이미지</span>
                        </span>
                      )}

                      <div className="ai-card-action-btns">
                        <button
                          type="button"
                          onClick={() => handleSelectTargetPost(post)}
                          className={`btn-card-focus ${isTarget ? 'active' : ''}`}
                          title="이 글을 AI 질문 대상으로 지정"
                        >
                          <Pin size={11} />
                          <span>{isTarget ? '지정 해제' : '질문 대상으로 지정'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
    </div>
  );
};
