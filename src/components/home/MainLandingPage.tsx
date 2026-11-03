import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import type { AiChatMessage } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { UserAvatar } from '../common/UserAvatar';
import { AiCommandDrawer, COMMAND_GUIDES, type ToolGuideItem } from '../ai/AiCommandDrawer';
export { COMMAND_GUIDES, type ToolGuideItem };
import { filterMentions, extractDaseinSearchQuery, type MentionDefinition } from '../../constants/mentions';
import { getSyncedDate } from '../../utils/timeSync';
import { formatAiModelDisplay } from '../community/CommentSection';
import {
  ArrowRight,
  Plus,
  Lock,
  Loader2,
  Paperclip,
  X,
  Info,
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Search,
  Wrench,
  Sparkles,
  PenTool,
} from 'lucide-react';

const renderAiStageIcon = (stage: string) => {
  switch (stage) {
    case 'selecting_model':
      return <Search size={13} className="ai-stage-icon" />;
    case 'loading_tools':
      return <Wrench size={13} className="ai-stage-icon" />;
    case 'thinking':
      return <Sparkles size={13} className="ai-stage-icon pulse-subtle" />;
    case 'writing':
      return <PenTool size={13} className="ai-stage-icon" />;
    default:
      return <Sparkles size={13} className="ai-stage-icon" />;
  }
};

const getAiStageText = (stage: string): string => {
  switch (stage) {
    case 'selecting_model':
      return '모델 선택 중...';
    case 'loading_tools':
      return '도구 불러오는 중...';
    case 'thinking':
      return '생각 중...';
    case 'writing':
      return '답변 작성 중...';
    default:
      return '생각 중...';
  }
};

const guessExpectedToolsFromPrompt = (promptText: string): string[] => {
  const tools: string[] = [];
  if (/(급식|메뉴|식단|밥|점심|저녁|알레르기)/i.test(promptText)) tools.push('학교 급식');
  if (/(시간표|일과|수업|교시|1학년|2학년|3학년)/i.test(promptText)) tools.push('학교 시간표');
  if (/(일정|시험|지필고사|고사|방학|학사일정|캘린더|스케줄|등록)/i.test(promptText)) tools.push('학사일정', '구글 캘린더');
  if (/(태스크|할\s*일|할일|tasks?)/i.test(promptText)) tools.push('구글 태스크');
  if (/(과제|수행평가|클래스룸|미제출)/i.test(promptText)) tools.push('구글 클래스룸');
  if (/(선배|기수|아카이브|족보|팁|노하우|과거)/i.test(promptText)) tools.push('선배 아카이브');
  if (/(인기글|공지|글|작성|게시판|요약)/i.test(promptText)) tools.push('커뮤니티 글 검색');
  if (/(날씨|뉴스|현재|시각|몇시|d-day|디데이)/i.test(promptText)) tools.push('현재 시간');
  return tools.length > 0 ? tools : ['커뮤니티 검색'];
};

interface MainLandingPageProps {
  onSelectPost?: (postId: string) => void;
}

interface WeatherInfo {
  temperature: number;
  condition: string;
  conditionLabel?: string;
  station?: string;
}



const formatCompactKST = (date: Date): string => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  try {
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    let month = '';
    let day = '';
    let hour = '';
    let minute = '';
    for (const p of parts) {
      if (p.type === 'month') month = p.value;
      if (p.type === 'day') day = p.value;
      if (p.type === 'hour') hour = p.value;
      if (p.type === 'minute') minute = p.value;
    }
    const dayOfWeek = days[new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getDay()] || '';
    return `${month}.${day}(${dayOfWeek}) ${hour}:${minute}`;
  } catch {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const dayOfWeek = days[date.getDay()] || '';
    return `${m}.${d}(${dayOfWeek}) ${hh}:${mm}`;
  }
};

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
  const [streamingState, setStreamingState] = useState<{
    isActive: boolean;
    stage: 'selecting_model' | 'loading_tools' | 'thinking' | 'writing';
    model: string | null;
    provider: string | null;
    tools: string[];
    content: string;
  }>({
    isActive: false,
    stage: 'selecting_model',
    model: null,
    provider: null,
    tools: [],
    content: '',
  });
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [attachedImages, setAttachedImages] = useState<Array<{ id: string; dataUrl: string; name: string }>>([]);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentTimeStr, setCurrentTimeStr] = useState<string>(() => formatCompactKST(getSyncedDate()));
  const [weather, setWeather] = useState<WeatherInfo | null>(() => {
    try {
      const cached = localStorage.getItem('asterisk_weather_cache');
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return null;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeStr(formatCompactKST(getSyncedDate()));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchWeather = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/weather`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.temperature === 'number') {
            setWeather(data);
            try {
              localStorage.setItem('asterisk_weather_cache', JSON.stringify(data));
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [API_BASE_URL]);

  const renderWeatherIcon = (condition: string) => {
    switch (condition) {
      case 'sun':
        return <Sun size={13} className="telemetry-weather-icon icon-sun" />;
      case 'moon':
        return <Moon size={13} className="telemetry-weather-icon icon-moon" />;
      case 'cloud-sun':
        return <CloudSun size={13} className="telemetry-weather-icon icon-cloud-sun" />;
      case 'cloud-moon':
        return <CloudMoon size={13} className="telemetry-weather-icon icon-cloud-moon" />;
      case 'cloud':
        return <Cloud size={13} className="telemetry-weather-icon icon-cloud" />;
      case 'rain':
        return <CloudRain size={13} className="telemetry-weather-icon icon-rain" />;
      case 'snow':
        return <CloudSnow size={13} className="telemetry-weather-icon icon-snow" />;
      case 'lightning':
        return <CloudLightning size={13} className="telemetry-weather-icon icon-lightning" />;
      case 'fog':
        return <CloudFog size={13} className="telemetry-weather-icon icon-fog" />;
      default:
        return <CloudSun size={13} className="telemetry-weather-icon" />;
    }
  };

  useEffect(() => {
    if (!isGuideOpen) return;
    const handleOutsideClick = () => {
      setIsGuideOpen(false);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [isGuideOpen]);

  const handleSelectGuidePrompt = (promptText: string) => {
    setInputPrompt(promptText);
    setIsGuideOpen(false);
    textareaRef.current?.focus();
  };

  const renderToolName = (toolName: string) => {
    if (toolName.includes('Dasein')) {
      const parts = toolName.split('Dasein;');
      return (
        <span>
          {parts[0]}
          <strong className="dasein-wordmark">Dasein;</strong>
          {parts[1] || ''}
        </span>
      );
    }
    return <span>{toolName}</span>;
  };

  const renderGuideButton = (size = 14) => (
    <button
      type="button"
      className={`ai-info-guide-btn ${isGuideOpen ? 'active' : ''}`}
      title="사용 가능한 명령어 보기"
      aria-label="명령어 가이드"
      onClick={(e) => {
        e.stopPropagation();
        setIsGuideOpen((prev) => !prev);
      }}
    >
      <Info size={size} />
    </button>
  );

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

  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  // Initialize Google CSE for Dasein search if loaded
  useEffect(() => {
    const initCse = () => {
      try {
        const cseApi = (window as any).google?.search?.cse?.element;
        if (cseApi && typeof cseApi.go === 'function') {
          cseApi.go('dasein-cse-holder-home');
        }
      } catch {
        // ignore
      }
    };

    if ((window as any).google?.search?.cse?.element) {
      initCse();
    } else {
      const interval = setInterval(() => {
        if ((window as any).google?.search?.cse?.element) {
          clearInterval(interval);
          initCse();
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, []);

  const searchDaseinCse = async (
    rawQuery: string
  ): Promise<Array<{ title: string; snippet: string; url: string }>> => {
    const cleanQuery = rawQuery
      .replace(/@dasein;?/gi, '')
      .replace(/@\w+/g, '')
      .replace(/[^\w\s\uAC00-\uD7A3-]/g, ' ')
      .trim();
    if (!cleanQuery) return [];

    const doSearchOnce = (searchKeyword: string): Promise<Array<{ title: string; snippet: string; url: string }>> => {
      return new Promise((resolve) => {
        const extractResults = () => {
          const container = document.getElementById('dasein-cse-holder-home');
          if (!container) return [];
          const items = Array.from(container.querySelectorAll('.gsc-webResult.gsc-result'));
          return items
            .map((el) => {
              const titleEl = el.querySelector('.gs-title');
              const snippetEl = el.querySelector('.gs-snippet');
              const linkEl = el.querySelector('.gs-title a') as HTMLAnchorElement | null;
              return {
                title: titleEl?.textContent?.trim() || '',
                snippet: snippetEl?.textContent?.trim() || '',
                url: linkEl?.href || '',
              };
            })
            .filter((item) => item.title && !item.title.startsWith('Google') && !item.title.includes('Custom Search Engine'))
            .slice(0, 8);
        };

        let resolved = false;
        let observer: MutationObserver | null = null;
        let checkInterval: any = null;

        const finish = (results: Array<{ title: string; snippet: string; url: string }>) => {
          if (resolved) return;
          resolved = true;
          if (observer) observer.disconnect();
          if (checkInterval) clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          resolve(results);
        };

        const timeoutTimer = setTimeout(() => {
          finish(extractResults());
        }, 3200);

        const container = document.getElementById('dasein-cse-holder-home');
        if (container) {
          observer = new MutationObserver(() => {
            const results = extractResults();
            if (results.length > 0) {
              finish(results);
            }
          });
          observer.observe(container, { childList: true, subtree: true });
        }

        checkInterval = setInterval(() => {
          const results = extractResults();
          if (results.length > 0) {
            finish(results);
          }
        }, 200);

        const triggerExecution = () => {
          try {
            const cseApi = (window as any).google?.search?.cse?.element;
            if (cseApi && typeof cseApi.go === 'function') {
              cseApi.go('dasein-cse-holder-home');
            }
            const cse = cseApi?.getElement('daseinSearchHome');
            if (cse && typeof cse.execute === 'function') {
              cse.execute(searchKeyword);
              return true;
            }
            const input = container?.querySelector('input.gsc-input') as HTMLInputElement | null;
            const btn = container?.querySelector('.gsc-search-button') as HTMLButtonElement | null;
            if (input && btn) {
              input.value = searchKeyword;
              btn.click();
              return true;
            }
          } catch {
            // ignore
          }
          return false;
        };

        if (!triggerExecution()) {
          let pollCount = 0;
          const pollTimer = setInterval(() => {
            pollCount++;
            if (triggerExecution() || pollCount > 15) {
              clearInterval(pollTimer);
            }
          }, 100);
        }
      });
    };

    let results = await doSearchOnce(cleanQuery);
    if (results.length === 0) {
      const words = cleanQuery.split(/\s+/).filter(Boolean);
      if (words.length > 2) {
        const fallbackQuery = words.slice(0, 2).join(' ');
        results = await doSearchOnce(fallbackQuery);
      }
    }

    return results;
  };

  const checkAndUpdateMention = (val: string, cursor: number) => {
    const beforeCursor = val.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|[\s\n]|[^\w\uAC00-\uD7A3]|[\uAC00-\uD7A3\w])?@([a-zA-Z0-9_\uAC00-\uD7A3;-]*)$/);
    if (match) {
      const q = match[1];
      const matched = filterMentions(q, { target: 'chat' });
      if (matched.length > 0) {
        setMentionQuery(q);
        setShowMentionPopup(true);
        setActiveMentionIndex(0);
        return;
      }
    }
    setShowMentionPopup(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputPrompt(val);
    const cursor = e.target.selectionStart ?? val.length;
    checkAndUpdateMention(val, cursor);
  };

  const insertMention = (mention: MentionDefinition) => {
    const textarea = textareaRef.current;
    const currentVal = inputPrompt;
    const cursor = textarea ? textarea.selectionStart : currentVal.length;
    const beforeCursor = currentVal.slice(0, cursor);
    const afterCursor = currentVal.slice(cursor);

    const atMatch = beforeCursor.match(/@([a-zA-Z0-9_\uAC00-\uD7A3;-]*)$/);
    if (atMatch) {
      const atIndex = beforeCursor.length - atMatch[0].length;
      const prefix = beforeCursor.slice(0, atIndex);
      const newVal = `${prefix}${mention.handle} ${afterCursor}`;
      setInputPrompt(newVal);
      setShowMentionPopup(false);
      setTimeout(() => {
        if (textarea) {
          const nextPos = prefix.length + mention.handle.length + 1;
          textarea.focus();
          textarea.setSelectionRange(nextPos, nextPos);
        }
      }, 0);
    } else {
      setInputPrompt((prev) => `${prev}${mention.handle} `);
      setShowMentionPopup(false);
      textarea?.focus();
    }
  };

  useEffect(() => {
    if (!showMentionPopup) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('.ai-chat-mention-popover') ||
        target?.closest('.main-prompt-card') ||
        target?.closest('.main-chat-bottom-bar')
      ) {
        return;
      }
      setShowMentionPopup(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [showMentionPopup]);

  const renderMentionPopup = () => {
    if (!showMentionPopup) return null;
    const suggestions = filterMentions(mentionQuery, { target: 'chat' });
    if (suggestions.length === 0) return null;

    return (
      <div className="ai-chat-mention-popover" role="listbox">
        {suggestions.map((mention, idx) => {
          const isSelected = idx === activeMentionIndex;
          const isDasein = mention.id === 'dasein';
          return (
            <button
              key={mention.id}
              type="button"
              className={`ai-mention-item ${isSelected ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(mention);
              }}
              onMouseEnter={() => setActiveMentionIndex(idx)}
            >
              <div className="ai-mention-item-left">
                <div
                  className="ai-mention-badge-icon"
                  style={{ backgroundColor: mention.badgeTextColor || 'var(--color-functional-red)' }}
                >
                  @
                </div>
                <span className="ai-mention-handle">{mention.handle}</span>
                <span className="ai-mention-desc">
                  {isDasein ? (
                    <span>
                      학술검색 (<span className="dasein-wordmark" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: '#8B1F28' }}>Dasein;</span>)
                    </span>
                  ) : (
                    mention.description || mention.name
                  )}
                </span>
              </div>
              {mention.badge && (
                <span
                  className="ai-mention-badge-tag"
                  style={{
                    backgroundColor: mention.badgeBgColor || 'var(--color-vellum)',
                    color: mention.badgeTextColor || 'var(--color-black)',
                  }}
                >
                  {mention.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

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
  }, [messages, isGenerating, streamingState.content, streamingState.stage]);

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

    const expectedTools = guessExpectedToolsFromPrompt(prompt);
    setStreamingState({
      isActive: true,
      stage: 'selecting_model',
      model: null,
      provider: null,
      tools: [],
      content: '',
    });
    setCooldownSeconds(20);

    const timerTools = setTimeout(() => {
      setStreamingState((prev) => {
        if (!prev.isActive || prev.stage !== 'selecting_model') return prev;
        return {
          ...prev,
          stage: 'loading_tools',
          tools: prev.tools.length > 0 ? prev.tools : expectedTools,
        };
      });
    }, 800);

    const timerThinking = setTimeout(() => {
      setStreamingState((prev) => {
        if (!prev.isActive || prev.stage === 'writing') return prev;
        return {
          ...prev,
          stage: 'thinking',
          model: prev.model || 'Claude Haiku 5.5',
          tools: prev.tools.length > 0 ? prev.tools : expectedTools,
        };
      });
    }, 1900);

    try {
      let daseinSearchResults: Array<{ title: string; snippet: string; url: string }> = [];
      let daseinSearchQuery = '';

      if (/@dasein\b|@dasein;/i.test(prompt)) {
        daseinSearchQuery = extractDaseinSearchQuery(prompt);
        setStreamingState((prev) => ({
          ...prev,
          stage: 'loading_tools',
          tools: [`학술검색 powered by Dasein; ('${daseinSearchQuery}')`],
        }));
        try {
          daseinSearchResults = await searchDaseinCse(daseinSearchQuery);
        } catch (err) {
          console.warn('[Dasein CSE Search Error]:', err);
        }
      }

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
          daseinSearchResults,
          daseinSearchQuery,
        }),
      });

      clearTimeout(timerTools);
      clearTimeout(timerThinking);

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

      const finalModel = data.model || 'Claude Haiku 5.5';
      const rawTools = Array.isArray(data.toolsUsed) && data.toolsUsed.length > 0
        ? data.toolsUsed.map((t: any) => t.name || t)
        : expectedTools;
      const fullText = data.text || '답변을 생성하지 못했습니다.';

      setStreamingState((prev) => ({
        ...prev,
        stage: 'writing',
        model: finalModel,
        provider: data.provider,
        tools: rawTools,
      }));

      // 실시간 타자기(Typewriter) 타이핑 효과로 답변이 작성되는 과정 시각화
      const charsPerStep = Math.max(3, Math.ceil(fullText.length / 45));
      let currentLength = 0;

      await new Promise<void>((resolve) => {
        const typeTimer = setInterval(() => {
          currentLength += charsPerStep;
          if (currentLength >= fullText.length) {
            clearInterval(typeTimer);
            setStreamingState((prev) => ({ ...prev, content: fullText }));
            resolve();
          } else {
            setStreamingState((prev) => ({ ...prev, content: fullText.slice(0, currentLength) }));
          }
        }, 18);
      });

      const botMessage: AiChatMessage = {
        id: `bot_${Date.now()}`,
        role: 'assistant',
        content: fullText,
        model: finalModel,
        provider: data.provider,
        toolsUsed: data.toolsUsed,
        targetPost: data.targetPost,
        createdAt: data.createdAt || Date.now(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err: any) {
      clearTimeout(timerTools);
      clearTimeout(timerThinking);
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
      setStreamingState({
        isActive: false,
        stage: 'selecting_model',
        model: null,
        provider: null,
        tools: [],
        content: '',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionPopup) {
      const suggestions = filterMentions(mentionQuery, { target: 'chat' });
      if (suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveMentionIndex((prev) => (prev + 1) % suggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveMentionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          insertMention(suggestions[activeMentionIndex] || suggestions[0]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowMentionPopup(false);
          return;
        }
      }
    }

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
                      <span>
                        {' · '}
                        {msg.toolsUsed.map((t, idx) => (
                          <React.Fragment key={t.id || idx}>
                            {idx > 0 && ', '}
                            {renderToolName(t.name)}
                          </React.Fragment>
                        ))}
                      </span>
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
                <div className="main-chat-bubble bubble-bot ai-streaming-container">
                  {/* 상단 단계 인디케이터 (댓글 UI 스타일 + SVG 아이콘) */}
                  <div
                    className="ai-stage-status-row"
                    style={{
                      marginBottom: (streamingState.tools && streamingState.tools.length > 0)
                        ? '6px'
                        : (streamingState.content ? '8px' : '0')
                    }}
                  >
                    {renderAiStageIcon(streamingState.stage)}
                    <span className="ai-stage-status-text">
                      {getAiStageText(streamingState.stage)}
                    </span>
                  </div>

                  {/* 활성화된 도구 칩들 */}
                  {streamingState.tools && streamingState.tools.length > 0 && (
                    <div
                      className="ai-stage-tools-chips"
                      style={{ marginBottom: streamingState.content ? '8px' : '0' }}
                    >
                      {streamingState.tools.map((toolName, idx) => {
                        const isDasein = toolName.includes('Dasein');
                        return (
                          <span
                            key={idx}
                            className={`ai-tool-pill pulse-subtle ${isDasein ? 'dasein-pill' : ''}`}
                            title={`도구: ${toolName}`}
                          >
                            <Sparkles size={10} />
                            {renderToolName(toolName)}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* 본문 영역: 실시간 타이핑 마크다운 (답변 내용이 있을 때만 노출하여 여백 균일화) */}
                  {streamingState.content && (
                    <div className="ai-stage-body" style={{ marginTop: '6px' }}>
                      <div className="ai-streamed-text-wrapper">
                        <MarkdownRenderer content={streamingState.content} />
                        <span className="ai-streaming-cursor" aria-hidden="true" />
                      </div>
                    </div>
                  )}
                </div>

                {/* 하단 모델 뱃지 */}
                <div className="main-chat-telemetry">
                  <span>{formatAiModelDisplay(streamingState.model) || 'asterisk AI'}</span>
                  {streamingState.tools && streamingState.tools.length > 0 && (
                    <span>
                      {' · '}
                      {streamingState.tools.map((toolName, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && ', '}
                          {renderToolName(toolName)}
                        </React.Fragment>
                      ))}
                    </span>
                  )}
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
        <div className="main-chat-bottom-bar" style={{ position: 'relative' }}>
          {renderMentionPopup()}
          <div className="main-chat-bottom-main-row">
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="ai-attach-file-btn"
                title="이미지 첨부 (또는 이미지 복사 후 붙여넣기 Ctrl+V)"
              >
                <Paperclip size={15} />
              </button>
              {renderGuideButton(15)}
            </div>
            <textarea
              ref={textareaRef}
              className="main-chat-bottom-input"
              value={inputPrompt}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                cooldownSeconds > 0
                  ? `${cooldownSeconds}초 후 다시 질문할 수 있습니다...`
                  : 'The answer of campus...'
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
          <AiCommandDrawer isOpen={isGuideOpen} onSelectPrompt={handleSelectGuidePrompt} />
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
          <div className="main-hero-telemetry">
            <span className="telemetry-time">{currentTimeStr}</span>
            {weather && (
              <>
                <span className="telemetry-sep">·</span>
                <span
                  className="telemetry-weather"
                  title={`기상청 관측 (충남과학고 인근): ${weather.conditionLabel || ''} (${weather.temperature}°C)`}
                >
                  {renderWeatherIcon(weather.condition)}
                  <span className="telemetry-temp">{weather.temperature}°</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Minimalist Prompt Box: No extra line, send button at bottom-right */}
        <div className="main-prompt-card" style={{ position: 'relative' }}>
          {renderMentionPopup()}
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
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="The answer of campus..."
            disabled={isGenerating}
            rows={1}
          />

          <div className="main-prompt-bottom-row">
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
              {renderGuideButton(14)}
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

          <AiCommandDrawer isOpen={isGuideOpen} onSelectPrompt={handleSelectGuidePrompt} />
        </div>

        {/* Privacy Notice */}
        <div className="main-privacy-notice-wrapper">
          <div className="main-privacy-notice">
            <Lock size={12} />
            <span>
              Asterisk AI와 나눈 대화 내역은 안전을 위해 저장되지만, AI 학습이나 개인정보를 이용하는데 사용되지 않습니다.
            </span>
          </div>
          <div className="main-privacy-subnotice">
            워크스페이스 API에서 수신한 원시 또는 파생 사용자 데이터의 사용은 제한적 사용 요건을 포함한 Google 사용자 데이터 정책을 준수합니다.
          </div>
        </div>
      </div>

      {/* Hidden Dasein Google Custom Search Engine (cx=b794e851ac2524ee7) for headless extraction */}
      <div
        id="dasein-cse-holder-home"
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: 800,
          height: 600,
          opacity: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <div className="gcse-searchbox" data-gname="daseinSearchHome" data-mobilelayout="disabled"></div>
        <div className="gcse-searchresults" data-gname="daseinSearchHome" data-mobilelayout="disabled"></div>
      </div>
    </div>
  );
};
