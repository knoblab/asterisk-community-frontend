import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import type { AiChatMessage } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { UserAvatar } from '../common/UserAvatar';
import {
  ArrowRight,
  Plus,
  UtensilsCrossed,
  TrendingUp,
  Megaphone,
  FileText,
  Lock,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react';

interface MainLandingPageProps {
  onSelectPost?: (postId: string) => void;
}

const QUICK_PROMPTS = [
  {
    label: '오늘 급식 식단',
    icon: UtensilsCrossed,
    prompt: '오늘 학교 아침, 점심, 저녁 급식 메뉴와 주요 알레르기 정보를 알려줘.',
  },
  {
    label: '커뮤니티 인기글 요약',
    icon: TrendingUp,
    prompt: '현재 커뮤니티에서 가장 인기 있는 게시글들과 반응을 요약해줘.',
  },
  {
    label: '주요 공지사항 요약',
    icon: Megaphone,
    prompt: '게시판에 등록된 최근 공지사항 내용을 정리해줘.',
  },
  {
    label: '내가 쓴 글 목록 요약',
    icon: FileText,
    prompt: '내가 지금까지 작성한 글 목록과 주요 내용을 요약해서 정리해줘.',
  },
];

export const MainLandingPage: React.FC<MainLandingPageProps> = () => {
  const { user } = useAuthStore();
  const openLoginModal = useUIStore((state) => state.openLoginModal);
  const mainChatSessionId = useUIStore((state) => state.mainChatSessionId);
  const setMainChatSessionId = useUIStore((state) => state.setMainChatSessionId);

  const baseUrl = import.meta.env.VITE_API_URL || '';
  const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;

  const [sessionId, setSessionId] = useState<string | null>(mainChatSessionId);
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(Boolean(mainChatSessionId));
  const [inputPrompt, setInputPrompt] = useState('');
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
          ...prev.slice(0, 2), // Keep max 3 images
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollStreamRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const loadedSessionIdRef = useRef<string | null>(null);

  // Load existing session details if requested
  const loadSession = async (targetSessionId: string) => {
    if (!user) return;
    setIsLoadingSession(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/sessions/${encodeURIComponent(targetSessionId)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setSessionTitle(data.title || '대화');
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setSessionId(targetSessionId);
      } else {
        console.error('Failed to load session:', res.status);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setIsLoadingSession(false);
    }
  };

  // Sync with mainChatSessionId if changed or on mount
  useEffect(() => {
    if (mainChatSessionId && user) {
      if (loadedSessionIdRef.current !== mainChatSessionId) {
        loadedSessionIdRef.current = mainChatSessionId;
        loadSession(mainChatSessionId);
      }
    } else if (!mainChatSessionId && loadedSessionIdRef.current !== null) {
      loadedSessionIdRef.current = null;
      setSessionId(null);
      setSessionTitle('');
      setMessages([]);
      setIsLoadingSession(false);
    }
  }, [mainChatSessionId, user]);

  // Cooldown countdown timer
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

    const countdown = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(countdown);
  }, [user, API_BASE_URL]);

  // Scroll message stream to bottom within its isolated container (prevents window scrolling)
  useEffect(() => {
    if (messages.length > 0 && scrollStreamRef.current) {
      if (typeof scrollStreamRef.current.scrollTo === 'function') {
        scrollStreamRef.current.scrollTo({
          top: scrollStreamRef.current.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        scrollStreamRef.current.scrollTop = scrollStreamRef.current.scrollHeight;
      }
    }
  }, [messages, isGenerating]);

  const handleStartNewChat = () => {
    loadedSessionIdRef.current = null;
    setSessionId(null);
    setSessionTitle('');
    setMessages([]);
    setInputPrompt('');
    setMainChatSessionId(null);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputPrompt).trim();
    if (!prompt || isGenerating || cooldownSeconds > 0) return;

    if (!user) {
      openLoginModal('Asterisk AI와의 대화를 시작하려면 로그인이 필요합니다.');
      return;
    }

    const currentSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    if (!sessionId) {
      loadedSessionIdRef.current = currentSessionId;
      setSessionId(currentSessionId);
      setMainChatSessionId(currentSessionId);
      setSessionTitle(prompt.slice(0, 40) + (prompt.length > 40 ? '...' : ''));
    }

    const currentImages = [...attachedImages];
    const userMessage: AiChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: prompt,
      images: currentImages.length > 0 ? currentImages.map(img => ({ dataUrl: img.dataUrl, name: img.name })) : undefined,
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMessage];
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
          sessionId: currentSessionId,
          prompt,
          images: currentImages.length > 0 ? currentImages.map(img => ({ dataUrl: img.dataUrl, name: img.name })) : undefined,
          messages: nextMessages.slice(-8),
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
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
        setMainChatSessionId(data.sessionId);
      }

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
      console.error('[AI Chat Error]:', err);
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

  if (isLoadingSession) {
    return (
      <div className="main-chat-container" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--color-telemetry)', padding: '40px 20px' }}>
          <Loader2 size={24} className="main-chat-spinner" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', fontFamily: 'var(--font-mono)' }}>대화 기록을 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  // If there are messages in this session, render the in-line conversation mode
  if (messages.length > 0) {
    return (
      <div className="main-chat-container">
        {/* Top Session Subheader */}
        <div className="main-chat-session-bar">
          <div className="main-chat-session-title">
            <span>{sessionTitle || '새 대화'}</span>
            <span className="main-chat-saved-tag">저장됨 (내 활동 탭 연동)</span>
          </div>
          <button
            type="button"
            onClick={handleStartNewChat}
            className="main-chat-new-btn"
            title="새 대화 시작"
          >
            <Plus size={13} />
            <span>새 대화</span>
          </button>
        </div>

        {/* Scrollable Message List (The rest of the viewport remains locked) */}
        <div ref={scrollStreamRef} className="main-chat-scroll-stream">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`main-chat-msg-row ${
                msg.role === 'user' ? 'msg-row-user' : 'msg-row-bot'
              }`}
            >
              {msg.role === 'user' ? (
                <div className="main-chat-avatar-wrap">
                  <UserAvatar
                    src={user?.photoURL}
                    name={user?.displayName || user?.email}
                    size={28}
                  />
                </div>
              ) : (
                <div className="main-chat-avatar avatar-bot">*</div>
              )}
              <div className="main-chat-bubble-wrap">
                <div
                  className={`main-chat-bubble ${
                    msg.role === 'user' ? 'bubble-user' : 'bubble-bot'
                  } ${msg.isError ? 'bubble-error' : ''}`}
                >
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
                  <MarkdownRenderer content={msg.content} />
                </div>
                {msg.role === 'assistant' && !msg.isError && (
                  <div className="main-chat-telemetry">
                    <span>{msg.model || 'asterisk AI'}</span>
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <span> · {msg.toolsUsed.map((t) => t.name).join(', ')}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isGenerating && (
            <div className="main-chat-msg-row msg-row-bot">
              <div className="main-chat-avatar avatar-bot">*</div>
              <div className="main-chat-bubble-wrap">
                <div className="main-chat-bubble bubble-bot loading-state">
                  <Loader2 size={16} className="main-chat-spinner" />
                  <span>답변을 생성하는 중입니다...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Attached Images Preview in Conversation Mode */}
        {attachedImages.length > 0 && (
          <div className="ai-attached-images-preview" style={{ margin: '0 16px 8px' }}>
            {attachedImages.map((img) => (
              <div key={img.id} className="ai-attached-thumb-item">
                <img src={img.dataUrl} alt={img.name} className="ai-attached-thumb-img" />
                <button
                  type="button"
                  onClick={() => setAttachedImages(attachedImages.filter((i) => i.id !== img.id))}
                  className="ai-attached-thumb-del"
                  title="삭제"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Pinned Input Bar right above footer */}
        <div className="main-chat-bottom-bar">
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
            className="ai-attach-file-btn"
            title="이미지 첨부 (또는 이미지 복사 후 붙여넣기 Ctrl+V)"
          >
            <Paperclip size={15} />
          </button>
          <textarea
            ref={textareaRef}
            className="main-chat-bottom-input"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              cooldownSeconds > 0
                ? `${cooldownSeconds}초 후 다시 질문할 수 있습니다...`
                : '이어서 질문하기... (이미지 Ctrl+V, Shift+Enter 줄바꿈, Enter 전송)'
            }
            rows={1}
            disabled={isGenerating}
          />
          <button
            type="button"
            onClick={() => handleSendMessage()}
            className="main-chat-bottom-send-btn"
            disabled={!inputPrompt.trim() || isGenerating || cooldownSeconds > 0}
            title="전송"
          >
            {cooldownSeconds > 0 ? (
              <span className="cooldown-text">{cooldownSeconds}s</span>
            ) : (
              <ArrowRight size={14} />
            )}
          </button>
        </div>
      </div>
    );
  }

  // Initial Landing View (Screen fits 100vh with no scroll, input placed slightly below center)
  return (
    <div className="main-landing-stage">
      <div className="main-stage-box">
        {/* Brand Headline */}
        <div className="main-hero-brand">
          <div className="main-hero-title">
            <span>asterisk</span>
            <span className="main-hero-star">*</span>
            <span className="main-hero-ai-badge">AI</span>
          </div>
          <div className="main-hero-subtitle">
            The Answer to Campus Life, and Everything. 무엇이든 질문하세요.
          </div>
        </div>

        {/* Minimalist Prompt Box: No extra line, send button at bottom-right */}
        <div className="main-prompt-card">
          {attachedImages.length > 0 && (
            <div className="ai-attached-images-preview" style={{ margin: '8px 10px 4px' }}>
              {attachedImages.map((img) => (
                <div key={img.id} className="ai-attached-thumb-item">
                  <img src={img.dataUrl} alt={img.name} className="ai-attached-thumb-img" />
                  <button
                    type="button"
                    onClick={() => setAttachedImages(attachedImages.filter((i) => i.id !== img.id))}
                    className="ai-attached-thumb-del"
                    title="삭제"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="main-prompt-textarea"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="asterisk AI에게 무엇이든 물어보세요... (이미지 Ctrl+V 붙여넣기 가능)"
            disabled={isGenerating}
          />

          <div className="main-prompt-bottom-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                className="ai-attach-file-btn"
                title="이미지 첨부 (Ctrl+V 붙여넣기 지원)"
              >
                <Paperclip size={14} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputPrompt.trim() || isGenerating || cooldownSeconds > 0}
              className="main-prompt-send-btn"
              title="질문하기"
            >
              {cooldownSeconds > 0 ? (
                <span className="cooldown-text">{cooldownSeconds}s</span>
              ) : isGenerating ? (
                <Loader2 size={15} className="main-chat-spinner" />
              ) : (
                <ArrowRight size={15} />
              )}
            </button>
          </div>
        </div>

        {/* Quick Prompt Chips (Monochrome SVG icons, no emoji) */}
        <div className="main-chips-row">
          {QUICK_PROMPTS.map((item) => {
            const IconComponent = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleSendMessage(item.prompt)}
                className="main-chip-item"
              >
                <span className="main-chip-svg">
                  <IconComponent size={13} />
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Privacy Notice */}
        <div className="main-privacy-notice">
          <Lock size={12} />
          <span>
            Asterisk AI와 나눈 대화 내역은 안전을 위해 저장되지만, AI 학습이나 개인정보를 이용하는데 사용되지 않습니다.
          </span>
        </div>
      </div>
    </div>
  );
};
