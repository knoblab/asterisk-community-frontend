import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useBoardStore } from '../../stores/useBoardStore';
import { useUIStore } from '../../stores/useUIStore';
import type { AiChatMessage, Post } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { formatAiModelDisplay } from '../community/CommentSection';
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
  Paperclip,
  Info,
  Loader2,
  Wrench,
  PenTool,
} from 'lucide-react';
import { AiCommandDrawer } from './AiCommandDrawer';
import { filterMentions, extractDaseinSearchQuery, type MentionDefinition } from '../../constants/mentions';

interface AsteriskAiPageProps {
  onSelectPost: (postId: string) => void;
}

export interface AiStreamingState {
  isActive: boolean;
  stage: 'selecting_model' | 'loading_tools' | 'thinking' | 'writing';
  model: string | null;
  provider: string | null;
  tools: string[];
  content: string;
}

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

const getAiStreamingStageLabel = (stage: string): string => {
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
  if (/@dasein\b|@dasein;/i.test(promptText)) tools.push('학술검색 powered by Dasein;');
  if (/@meal\b|@급식\b|(급식|메뉴|식단|밥|점심|저녁|알레르기)/i.test(promptText)) tools.push('학교 급식');
  if (/@timetable\b|@시간표\b|(시간표|일과|수업|교시|1학년|2학년|3학년)/i.test(promptText)) tools.push('학교 시간표');
  if (/@calendar\b|@캘린더\b|@일정\b|(일정|시험|지필고사|고사|방학|학사일정|캘린더|스케줄|등록)/i.test(promptText)) tools.push('학사일정', '구글 캘린더');
  if (/(태스크|할\s*일|할일|tasks?)/i.test(promptText)) tools.push('구글 태스크');
  if (/@classroom\b|@클래스룸\b|@과제\b|(과제|수행평가|클래스룸|미제출)/i.test(promptText)) tools.push('구글 클래스룸');
  if (/@archive\b|@아카이브\b|@족보\b|(선배|기수|아카이브|족보|팁|노하우|과거)/i.test(promptText)) tools.push('선배 아카이브');
  if (/@posts\b|@게시글\b|(인기글|공지|글|작성|게시판|요약)/i.test(promptText)) tools.push('커뮤니티 글 검색');
  if (/@history\b|@내기록\b|(내가\s*쓴|작성한\s*글|활동)/i.test(promptText)) tools.push('내 활동 기록');
  if (/@now\b|@time\b|@시간\b|(날씨|뉴스|현재|시각|몇시|d-day|디데이)/i.test(promptText)) tools.push('현재 시간');
  return tools.length > 0 ? tools : ['커뮤니티 검색'];
};

const STORAGE_KEY_PREFIX = 'asterisk_ai_chat_';

const QUICK_PROMPTS = [
  { label: '학술 논문 검색 (@dasein)', prompt: '@dasein 초전도체 양자 결맞음 최신 연구 동향 알려줘.' },
  { label: '오늘 학교 급식 식단', prompt: '오늘 점심 급식 메뉴와 알레르기 정보 알려줘.' },
  { label: '학급 시간표 및 일과 안내', prompt: '오늘 1학년 2반 시간표와 수업 시간 알려줘.' },
  { label: '학사일정 및 시험 일정', prompt: '이번 학기 지필고사 일정과 방학식 언제인지 알려줘.' },
  { label: '클래스룸 미제출 과제', prompt: '이번 주 마감인 미제출 과제와 수행평가 알려줘.' },
  { label: '구글 캘린더 일정 등록', prompt: '내일 오후 3시 모둠 연구 회의 캘린더에 등록해줘.' },
  { label: '구글 태스크 할 일 등록', prompt: '오늘 할 일 목록에 수학 과제 제출 추가해줘.' },
  { label: '커뮤니티 최신 인기글 요약', prompt: '현재 커뮤니티 최신 인기글과 주요 공지사항 요약해줘.' },
  { label: '내가 쓴 글 목록과 내용 요약', prompt: '내가 지금까지 작성한 글과 댓글 목록 요약해줘.' },
  { label: '선배 아카이브 노하우 검색', prompt: '선배들의 AP선대 공부 팁이나 R&E 노하우 찾아줘.' },
  { label: '첨부 이미지 내용 분석', prompt: '첨부한 이미지의 내용 분석하고 글자 읽어줘.' },
  { label: '현재 시각 및 D-Day 계산', prompt: '지금 정확한 시간과 시험일까지 며칠 남았는지 알려줘.' },
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
  const [streamingState, setStreamingState] = useState<AiStreamingState>({
    isActive: false,
    stage: 'selecting_model',
    model: null,
    provider: null,
    tools: [],
    content: '',
  });
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [attachedImages, setAttachedImages] = useState<Array<{ id: string; dataUrl: string; name: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // @ mention autocomplete state
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  // Load Dasein Google CSE script once
  useEffect(() => {
    const scriptId = 'google-cse-dasein-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = 'https://cse.google.com/cse.js?cx=b794e851ac2524ee7';
      document.head.appendChild(script);
    }
  }, []);

  // Initialize Google CSE for Dasein search if loaded
  useEffect(() => {
    const initCse = () => {
      try {
        const cseApi = (window as any).google?.search?.cse?.element;
        if (cseApi && typeof cseApi.go === 'function') {
          cseApi.go('dasein-cse-holder');
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
          const container = document.getElementById('dasein-cse-holder');
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

        const container = document.getElementById('dasein-cse-holder');
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
              cseApi.go('dasein-cse-holder');
            }
            const cse = cseApi?.getElement('daseinSearch');
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
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Close guide popover on click outside
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
    inputRef.current?.focus();
  };

  const renderGuideButton = (size = 15) => (
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

  // Save messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, storageKey]);

  // Scroll to bottom on new message or streaming progress
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, streamingState.content, streamingState.stage]);

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

  // Check if Google OAuth scopes need upgrade (e.g. newly added calendar scope)
  const [googleReauthRequired, setGoogleReauthRequired] = useState(false);
  useEffect(() => {
    if (!user) return;
    fetch('/api/integrations/google/status', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.connected && data?.requiresScopeUpgrade) {
          setGoogleReauthRequired(true);
        }
      })
      .catch(() => {});
  }, [user]);

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
    if (!user.agreedTerms || !user.agreedPrivacy) {
      useUIStore.getState().openTermsModal();
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

    // 댓글 UI 스타일의 부드러운 진행 단계 전이 타이머
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
          'Accept': 'application/json, text/event-stream',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          stream: false,
          images: currentImages.length > 0 ? currentImages.map(img => ({ dataUrl: img.dataUrl, name: img.name })) : undefined,
          targetPostId: targetPost ? targetPost.id : null,
          messages: nextMessages.slice(-8), // Send recent context
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
      const finalModel = data.model || 'Claude Haiku 5.5';
      const rawTools = Array.isArray(data.toolsUsed) && data.toolsUsed.length > 0
        ? data.toolsUsed.map((t: any) => t.name || t)
        : expectedTools;
      const fullText = data.text || '답변을 생성하지 못했습니다.';

      // 실시간 답변 작성 중으로 전환
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

  const checkAndUpdateMention = (val: string, cursor: number) => {
    const beforeCursor = val.slice(0, cursor);
    // Matches @ followed by optional tag characters right before the cursor
    // Works with "@", " @", "안녕@", "@d", "@meal", etc.
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
    const textarea = inputRef.current;
    const currentVal = inputPrompt;
    const cursor = textarea ? textarea.selectionStart : currentVal.length;
    const beforeCursor = currentVal.slice(0, cursor);
    const afterCursor = currentVal.slice(cursor);

    // Find the @ symbol directly preceding the cursor
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

  // Close mention popup on click outside
  useEffect(() => {
    if (!showMentionPopup) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.ai-chat-mention-popover') || target?.closest('.ai-input-wrapper')) {
        return;
      }
      setShowMentionPopup(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [showMentionPopup]);

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
                      학술검색 (<span className="dasein-wordmark">Dasein;</span>)
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

        {/* Google OAuth Scope Upgrade Warning Banner */}
        {user && googleReauthRequired && (
          <div style={{
            margin: '8px 16px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm, 4px)',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12.5px',
            gap: '10px'
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>새로운 구글 캘린더 일정 등록 기능이 추가되었습니다. 원활한 캘린더 연동을 위해 권한을 업데이트해 주세요.</span>
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch('/api/integrations/google/authorize?format=json', {
                    method: 'GET',
                    credentials: 'include',
                    headers: { Accept: 'application/json' },
                  });
                  const data = await res.json();
                  if (data?.url) window.location.href = data.url;
                  else window.location.href = '/api/integrations/google/authorize';
                } catch {
                  window.location.href = '/api/integrations/google/authorize';
                }
              }}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: '#f59e0b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              권한 업데이트
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
                          {msg.toolsUsed.map((tool) => {
                            const isDasein = tool.id === 'dasein_search' || tool.name.includes('Dasein');
                            return (
                              <span
                                key={tool.id}
                                className={`ai-tool-pill ${isDasein ? 'dasein-pill' : ''}`}
                                title={`도구 실행: ${tool.name}`}
                              >
                                <Sparkles size={10} />
                                {isDasein ? (
                                  <span>
                                    학술검색 powered by <strong className="dasein-wordmark">Dasein;</strong>
                                    {tool.name.includes("('") ? ` ('${tool.name.split("('")[1]}` : ''}
                                  </span>
                                ) : (
                                  <span>{tool.name}</span>
                                )}
                              </span>
                            );
                          })}
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
              <div className="ai-message-bubble assistant streaming">
                {/* Meta bar: model and tools */}
                <div className="ai-msg-meta">
                  <span className="ai-msg-sender">asterisk AI</span>
                  {streamingState.model ? (
                    <span className="ai-msg-model ai-streaming-model-badge">
                      <Loader2 size={10} className="spin-inline" />
                      <span>{formatAiModelDisplay(streamingState.model)}</span>
                    </span>
                  ) : (
                    <span className="ai-msg-model ai-streaming-model-badge pending">
                      <Loader2 size={10} className="spin-inline" />
                      <span>모델 분석 중</span>
                    </span>
                  )}

                  {streamingState.tools && streamingState.tools.length > 0 && (
                    <div className="ai-msg-tools">
                      {streamingState.tools.map((toolName, idx) => {
                        const isDasein = toolName.includes('Dasein') || toolName.includes('학술검색');
                        return (
                          <span
                            key={idx}
                            className={`ai-tool-pill pulse-subtle ${isDasein ? 'dasein-pill' : ''}`}
                            title={`도구 실행: ${toolName}`}
                          >
                            <Sparkles size={10} />
                            {isDasein ? (
                              <span>
                                학술검색 powered by <strong className="dasein-wordmark">Dasein;</strong>
                                {toolName.includes("('") ? ` ('${toolName.split("('")[1]}` : ''}
                              </span>
                            ) : (
                              <span>{toolName}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Stage status message (Comment-UI Style) */}
                <div
                  className="ai-streaming-stage-banner"
                  style={{
                    marginBottom: streamingState.content ? '8px' : '0'
                  }}
                >
                  <div className="ai-streaming-stage-header">
                    {renderAiStageIcon(streamingState.stage)}
                    <span className="ai-stage-title-text">
                      {getAiStreamingStageLabel(streamingState.stage)}
                    </span>
                  </div>
                </div>

                {/* Content Area: Real-time Markdown (내용이 생성되기 시작했을 때만 노출) */}
                {streamingState.content && (
                  <div className="ai-msg-content ai-streaming-content" style={{ marginTop: '6px' }}>
                    <div className="ai-streamed-text-wrapper">
                      <MarkdownRenderer content={streamingState.content} />
                      <span className="ai-streaming-cursor" aria-hidden="true" />
                    </div>
                  </div>
                )}
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
            {renderMentionPopup()}
            <div className="ai-input-main-row">
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
              {renderGuideButton(16)}
              <textarea
                ref={inputRef}
                value={inputPrompt}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  targetPost
                    ? `지정된 '${targetPost.title}' 내용 및 댓글 질문... (학술검색은 @dasein, Enter 전송)`
                    : 'asterisk에게 질문을 입력하세요... (학술검색은 @dasein, Enter 전송)'
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
            <AiCommandDrawer isOpen={isGuideOpen} onSelectPrompt={handleSelectGuidePrompt} />
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

      {/* Hidden Dasein Google Custom Search Engine (cx=b794e851ac2524ee7) for headless extraction */}
      <div
        id="dasein-cse-holder"
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
        <div className="gcse-searchbox" data-gname="daseinSearch" data-mobilelayout="disabled"></div>
        <div className="gcse-searchresults" data-gname="daseinSearch" data-mobilelayout="disabled"></div>
      </div>
    </div>
  );
};
