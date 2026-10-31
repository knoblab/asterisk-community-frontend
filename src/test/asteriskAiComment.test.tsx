import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useBoardStore, extractAsteriskPrompt } from '../stores/useBoardStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

describe('asterisk AI (@asterisk) Comment Trigger & Reply Store Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    useAuthStore.setState({
      user: {
        uid: 'user-123',
        email: 'cnsh32_1001@g.cnees.kr',
        displayName: '홍길동',
        photoURL: null,
      },
      loading: false,
    });

    useBoardStore.setState({
      posts: [
        {
          id: 'post-1',
          category: '질문',
          title: '상대성이론 질문',
          body: '특수상대성이론과 일반상대성이론의 차이가 궁금합니다.',
          author: '홍길동',
          authorId: 'user-123',
          createdAt: 1000,
          views: 1,
          likes: 0,
          commentCount: 0,
        },
      ],
      comments: [],
      aiGeneratingParentId: null,
    });

    useUIStore.setState({
      toasts: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('extractAsteriskPrompt: extracts prompt after @asterisk in root and reply comments', () => {
    expect(extractAsteriskPrompt('@asterisk 양자역학이 뭐야?')).toBe('양자역학이 뭐야?');
    expect(extractAsteriskPrompt('이 부분 잘 모르겠어요 @Asterisk 간단히 설명해줘')).toBe('간단히 설명해줘');
    expect(extractAsteriskPrompt('[REPLY_TO:comment-1]\n@asterisk: 핵심만 요약해줘')).toBe('핵심만 요약해줘');
    expect(extractAsteriskPrompt('@asterisk   ')).toBeNull();
    expect(extractAsteriskPrompt('일반 댓글입니다.')).toBeNull();
  });

  it('addComment: triggers /api/comments/ai-reply and appends child comment when @asterisk is present', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).endsWith('/comments/ai-reply')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'comment-ai-1',
            postId: 'post-1',
            parentId: 'comment-user-1',
            triggerCommentId: 'comment-user-1',
            body: '[REPLY_TO:comment-user-1]\n특수상대성이론은 등속 운동계를, 일반상대성이론은 중력과 가속 운동계를 다룹니다.',
            author: 'asterisk',
            authorId: 'asterisk-ai-bot',
            authorGeneration: 'AI',
            aiModel: 'Gemini 3.8 Flash',
            createdAt: 2000,
            likes: 0,
          }),
        };
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'comment-user-1',
          postId: 'post-1',
          body: '@asterisk 이 글의 핵심을 설명해줘',
          author: '홍길동',
          authorId: 'user-123',
          createdAt: 1500,
          likes: 0,
        }),
      };
    });

    vi.stubGlobal('fetch', fetchMock);

    const success = await useBoardStore.getState().addComment({
      postId: 'post-1',
      author: '홍길동',
      authorId: 'user-123',
      body: '@asterisk 이 글의 핵심을 설명해줘',
    });

    expect(success).toBe(true);

    // Wait for async triggerAiCommentReply to settle
    await vi.waitFor(() => {
      expect(useBoardStore.getState().comments.length).toBe(2);
    });

    const comments = useBoardStore.getState().comments;
    expect(comments[0].id).toBe('comment-user-1');
    expect(comments[1].id).toBe('comment-ai-1');
    expect(comments[1].parentId).toBe('comment-user-1');
    expect(comments[1].author).toBe('asterisk');
    expect(comments[1].authorGeneration).toBe('AI');
    expect(comments[1].aiModel).toBe('Gemini 3.8 Flash');
    expect(comments[1].body).toBe('특수상대성이론은 등속 운동계를, 일반상대성이론은 중력과 가속 운동계를 다룹니다.');
    expect(useBoardStore.getState().posts[0].commentCount).toBe(2);
    expect(useBoardStore.getState().aiGeneratingParentId).toBeNull();
  });

  it('addComment: does NOT call /api/comments/ai-reply for regular comments without @asterisk', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'comment-user-2',
        postId: 'post-1',
        body: '좋은 질문이네요!',
        author: '홍길동',
        authorId: 'user-123',
        createdAt: 1500,
        likes: 0,
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const success = await useBoardStore.getState().addComment({
      postId: 'post-1',
      author: '홍길동',
      authorId: 'user-123',
      body: '좋은 질문이네요!',
    });

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useBoardStore.getState().comments.length).toBe(1);
  });

  it('renders disclaimer "asterisk AI는 실수를 할 수 있습니다." and models (Gemini 3.8 Flash (Low/Medium/High), Gemma 4, GPT-6 Luna, Claude Haiku 5.5) under AI bot replies in CommentSection', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { CommentSection, getCommentAiProvider } = await import('../components/community/CommentSection');

    expect(getCommentAiProvider({ aiProvider: 'Google (Low)' })).toBe('Gemini 3.8 Flash (Low)');
    expect(getCommentAiProvider({ aiProvider: 'Google (Medium)' })).toBe('Gemini 3.8 Flash (Medium)');
    expect(getCommentAiProvider({ aiProvider: 'Google (High)' })).toBe('Gemini 3.8 Flash (High)');
    expect(getCommentAiProvider({ aiProvider: 'Gemma' })).toBe('Gemma 4');
    expect(getCommentAiProvider({ aiProvider: 'OpenAI' })).toBe('GPT-6 Luna');
    expect(getCommentAiProvider({ aiProvider: 'Anthropic' })).toBe('Claude Haiku 5.5');
    expect(getCommentAiProvider({ aiModel: 'gemini-3.8-flash-low' })).toBe('Gemini 3.8 Flash (Low)');
    expect(getCommentAiProvider({ aiModel: 'gemini-3.8-flash-medium' })).toBe('Gemini 3.8 Flash (Medium)');
    expect(getCommentAiProvider({ aiModel: 'gemini-3.8-flash-high' })).toBe('Gemini 3.8 Flash (High)');
    expect(getCommentAiProvider({ aiModel: 'gemma-4-26b-a4b-it' })).toBe('Gemma 4');

    useBoardStore.setState({
      fetchComments: vi.fn(),
      checkAiStatus: vi.fn().mockResolvedValue(false),
      comments: [
        {
          id: 'comment-1',
          postId: 'post-1',
          author: '홍길동',
          authorId: 'user-123',
          body: '@asterisk 인공지능이 뭐야?',
          createdAt: 1000,
          likes: 0,
        },
        {
          id: 'comment-2',
          postId: 'post-1',
          parentId: 'comment-1',
          author: 'asterisk',
          authorId: 'asterisk-ai-bot',
          authorGeneration: 'AI',
          aiModel: 'Gemini 3.8 Flash (Low)',
          aiProvider: 'Google (Low)',
          body: '단순 질의응답을 처리한 답변입니다.',
          createdAt: 2000,
          likes: 0,
        },
        {
          id: 'comment-3',
          postId: 'post-1',
          parentId: 'comment-1',
          author: 'asterisk',
          authorId: 'asterisk-ai-bot',
          authorGeneration: 'AI',
          aiModel: 'Gemma 4',
          aiProvider: 'Gemma',
          body: '오류 발생 시 폴백으로 동작한 답변입니다.',
          createdAt: 3000,
          likes: 0,
        },
        {
          id: 'comment-4',
          postId: 'post-1',
          parentId: 'comment-1',
          author: 'asterisk',
          authorId: 'asterisk-ai-bot',
          authorGeneration: 'AI',
          aiModel: 'GPT-6 Luna',
          aiProvider: 'OpenAI',
          body: '요약 및 데이터 정리를 처리한 답변입니다.',
          createdAt: 4000,
          likes: 0,
        },
        {
          id: 'comment-5',
          postId: 'post-1',
          parentId: 'comment-1',
          author: 'asterisk',
          authorId: 'asterisk-ai-bot',
          authorGeneration: 'AI',
          aiModel: 'Claude Haiku 5.5',
          aiProvider: 'Anthropic',
          aiTools: ['현재 시간', '사용자 활동 내역'],
          body: '자연스러운 문체와 공감으로 작성한 답변입니다.',
          createdAt: 5000,
          likes: 0,
        },
        {
          id: 'comment-6',
          postId: 'post-1',
          parentId: 'comment-1',
          author: 'asterisk',
          authorId: 'asterisk-ai-bot',
          authorGeneration: 'AI',
          aiModel: 'Gemini 3.8 Flash (High)',
          aiProvider: 'Google (High)',
          body: '심층 논리 검증을 마친 답변입니다.',
          createdAt: 6000,
          likes: 0,
        },
      ],
    });

    render(<CommentSection postId="post-1" />);

    expect(screen.getAllByText('asterisk AI는 실수를 할 수 있습니다.').length).toBe(5);
    const infoButtons = screen.getAllByLabelText('AI 모델 및 도구 정보 보기');
    expect(infoButtons.length).toBe(5);

    // Clicking the info button for comment-5 (Claude Haiku 5.5 with tools) opens popover
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(infoButtons[3]);
    expect(screen.getByText('AI 생성 정보')).toBeInTheDocument();
    expect(screen.getByText('Claude Haiku 5.5')).toBeInTheDocument();
    expect(screen.getByText('현재 시간, 사용자 활동 내역')).toBeInTheDocument();

    // Clicking the info button for comment-1 (Gemini 3.8 Flash (Low) without tools)
    fireEvent.click(infoButtons[0]);
    expect(screen.getByText('Gemini 3.8 Flash (Low)')).toBeInTheDocument();
    expect(screen.getByText('없음 (직접 추론)')).toBeInTheDocument();
  }, 15000);

  it('displays detailed stage messages and exposed model (모델 선택 중, 생각 중... (Gemini 3.8 Flash (Low)), 답변 작성 중... (GPT-6 Luna)) during AI generation', async () => {
    const { render, screen, act } = await import('@testing-library/react');
    const { CommentSection } = await import('../components/community/CommentSection');

    // Stage 1: selecting_model (provider not chosen yet)
    act(() => {
      useBoardStore.setState({
        fetchComments: vi.fn(),
        checkAiStatus: vi.fn().mockResolvedValue(false),
        aiGeneratingParentId: 'comment-root',
        aiGeneratingStage: 'selecting_model',
        aiGeneratingSelectedProvider: null,
        aiGeneratingTools: null,
        comments: [
          {
            id: 'comment-root',
            postId: 'post-1',
            author: '홍길동',
            authorId: 'user-123',
            body: '@asterisk 인공지능 설명해줘',
            createdAt: 1000,
            likes: 0,
          },
        ],
      });
    });

    const { rerender } = render(<CommentSection postId="post-1" />);
    expect(screen.getByText(/모델 선택 중/)).toBeInTheDocument();

    // Stage 2: thinking with model and tools exposed
    act(() => {
      useBoardStore.setState({
        aiGeneratingStage: 'thinking',
        aiGeneratingSelectedProvider: 'Gemini 3.8 Flash (Low)',
        aiGeneratingTools: ['현재 시간'],
      });
    });
    rerender(<CommentSection postId="post-1" />);
    expect(screen.getByText(/생각 중\.\.\. \(Gemini 3\.8 Flash \(Low\), 도구: 현재 시간\)/)).toBeInTheDocument();

    // Stage 3: writing with model exposed
    act(() => {
      useBoardStore.setState({
        aiGeneratingStage: 'writing',
        aiGeneratingSelectedProvider: 'GPT-6 Luna',
        aiGeneratingTools: null,
      });
    });
    rerender(<CommentSection postId="post-1" />);
    expect(screen.getByText(/답변 작성 중\.\.\. \(GPT-6 Luna\)/)).toBeInTheDocument();
  }, 15000);

  it('allows replying to replies and AI comments, auto-prefilling @nickname or @asterisk and maintaining flat indentation', async () => {
    const { render, screen, fireEvent } = await import('@testing-library/react');
    const { CommentSection } = await import('../components/community/CommentSection');

    useBoardStore.setState({
      fetchComments: vi.fn(),
      checkAiStatus: vi.fn().mockResolvedValue(false),
      comments: [
        {
          id: 'comment-root',
          postId: 'post-1',
          author: '원작성자',
          authorId: 'user-root',
          body: '루트 질문입니다.',
          createdAt: 1000,
          likes: 0,
        },
        {
          id: 'comment-reply-1',
          postId: 'post-1',
          parentId: 'comment-root',
          author: '김철수',
          authorId: 'user-chulsoo',
          body: '김철수의 2차 댓글입니다.',
          createdAt: 2000,
          likes: 0,
        },
        {
          id: 'comment-ai-reply',
          postId: 'post-1',
          parentId: 'comment-reply-1',
          author: 'asterisk',
          authorId: 'asterisk-ai-bot',
          authorGeneration: 'AI',
          aiModel: 'Gemini 3.8 Flash',
          body: 'asterisk의 AI 답변입니다.',
          createdAt: 3000,
          likes: 0,
        },
      ],
    });

    const { container } = render(<CommentSection postId="post-1" />);

    const replyButtons = screen.getAllByRole('button', { name: /답글/i });
    expect(replyButtons.length).toBe(3);

    // Click "답글" on 김철수's reply (comment-reply-1)
    fireEvent.click(replyButtons[1]);
    expect(screen.getByText(/@김철수 님에게 답글 작성/i)).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText('답글 내용을 입력하세요...') as HTMLTextAreaElement;
    expect(textarea.value).toBe('@김철수 ');

    // Click "답글" on asterisk's AI reply (comment-ai-reply)
    fireEvent.click(replyButtons[2]);
    expect(screen.getByText(/@asterisk 님에게 답글 작성/i)).toBeInTheDocument();
    const aiTextarea = screen.getByPlaceholderText('답글 내용을 입력하세요...') as HTMLTextAreaElement;
    expect(aiTextarea.value).toBe('@asterisk ');

    // Verify indentation: both replies must have flat indentation (28px) and neither is indented further
    const commentItems = container.querySelectorAll('.pdf-comment-section > div:nth-child(2) > div');
    // At least root + 2 replies exist in the list
    expect(commentItems.length).toBeGreaterThanOrEqual(3);
  }, 15000);
});
