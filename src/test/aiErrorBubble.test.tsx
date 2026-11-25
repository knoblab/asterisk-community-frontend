import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiErrorBubble, parseLegacyErrorContent } from '../components/ai/AiErrorBubble';
import { MainLandingPage } from '../components/home/MainLandingPage';
import { useAuthStore } from '../stores/useAuthStore';
import type { AiChatMessage } from '../types';

describe('AiErrorBubble UI & Retry Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders general error state with ERROR badge, safe body, retry callback, and dismiss callback', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const msg: AiChatMessage = {
      id: 'err-1',
      role: 'assistant',
      content: '답변을 불러오지 못했습니다.\n\n요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      isError: true,
      errorKind: 'general',
      errorTitle: '답변을 불러오지 못했습니다.',
      errorDetail: '요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      retryPrompt: '@dasein 펙틴 연구동향',
      createdAt: 1000,
    };

    const { container } = render(
      <AiErrorBubble
        message={msg}
        cooldownSeconds={0}
        isGenerating={false}
        onRetry={onRetry}
        onDismiss={onDismiss}
      />
    );

    expect(container.querySelector('.ai-error-card--error')).toBeInTheDocument();
    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText('답변을 불러오지 못했습니다.')).toBeInTheDocument();
    expect(
      screen.getByText('요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    ).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: '다시 시도' });
    expect(retryBtn).toBeEnabled();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledWith(msg);

    const dismissBtn = screen.getByRole('button', { name: '오류 안내 닫기' });
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledWith('err-1');
  });

  it('renders live cooldown badge, progress bar, disabled retry button, and switches to READY when cooldown reaches 0', () => {
    const onRetry = vi.fn();
    const msg: AiChatMessage = {
      id: 'err-rl-1',
      role: 'assistant',
      content: '호출 대기 중입니다.\n\n20초에 1회만 호출할 수 있습니다.',
      isError: true,
      errorKind: 'rate_limit',
      retryPrompt: '@dasein 펙틴 연구동향',
      retryCooldownTotal: 20,
      createdAt: 1000,
    };

    const { container, rerender } = render(
      <AiErrorBubble
        message={msg}
        cooldownSeconds={5}
        isGenerating={false}
        onRetry={onRetry}
      />
    );

    expect(container.querySelector('.ai-error-card--cooldown')).toBeInTheDocument();
    expect(screen.getByText('COOLDOWN · 5s')).toBeInTheDocument();
    expect(container.querySelector('.ai-error-progress-fill')).toHaveStyle({ width: '25%' });

    const waitingBtn = screen.getByRole('button', { name: '5초 후 다시 시도' });
    expect(waitingBtn).toBeDisabled();

    rerender(
      <AiErrorBubble
        message={msg}
        cooldownSeconds={0}
        isGenerating={false}
        onRetry={onRetry}
      />
    );

    expect(container.querySelector('.ai-error-card--ready')).toBeInTheDocument();
    expect(screen.getByText('READY')).toBeInTheDocument();
    expect(screen.getByText('지금 다시 요청할 수 있습니다.')).toBeInTheDocument();

    const readyBtn = screen.getByRole('button', { name: '바로 다시 시도' });
    expect(readyBtn).toBeEnabled();
    fireEvent.click(readyBtn);
    expect(onRetry).toHaveBeenCalledWith(msg);
  });

  it('strips legacy ** bold markdown markers without passing through MarkdownRenderer', () => {
    const legacyContent =
      '**답변을 불러오지 못했습니다.**\n\n요청을 처리하는 중 오류가 발생했습니다.';
    const parsed = parseLegacyErrorContent(legacyContent);
    expect(parsed.title).toBe('답변을 불러오지 못했습니다.');
    expect(parsed.detail).toBe('요청을 처리하는 중 오류가 발생했습니다.');
    expect(parsed.inferredKind).toBe('general');

    render(
      <AiErrorBubble
        message={{
          id: 'err-legacy',
          role: 'assistant',
          content: legacyContent,
          isError: true,
          createdAt: 1000,
        }}
        cooldownSeconds={0}
        isGenerating={false}
        compact
      />
    );

    expect(screen.getByText('답변을 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('MainLandingPage renders cooldown error card on 429 and retries once cooldown expires without duplicating the user bubble', async () => {
    let chatCallCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const sUrl = String(url);
        if (sUrl.includes('/api/ai/chat/status')) {
          return Promise.resolve({ ok: true, json: async () => ({ remainingSeconds: 0 }) });
        }
        if (sUrl.includes('/api/ai/chat')) {
          chatCallCount += 1;
          if (chatCallCount === 1) {
            return Promise.resolve({
              ok: false,
              status: 429,
              json: async () => ({ remainingSeconds: 1 }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              text: '펙틴 최신 연구 동향 요약입니다.',
              model: 'Claude Haiku 5.5',
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    useAuthStore.setState({
      user: {
        uid: 'uid-retry-user',
        email: 'cnsh32_1234@g.cnees.kr',
        displayName: '재시도유저',
        photoURL: null,
        agreedTerms: true,
        agreedPrivacy: true,
      },
      loading: false,
    });

    render(<MainLandingPage />);

    const textarea = screen.getByPlaceholderText('The answer of campus...');
    fireEvent.change(textarea, { target: { value: '@dasein 펙틴 연구동향' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('COOLDOWN · 1s')).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(screen.getByText('READY')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const retryBtn = screen.getByRole('button', { name: '바로 다시 시도' });
    expect(retryBtn).toBeEnabled();
    fireEvent.click(retryBtn);

    await waitFor(
      () => {
        expect(screen.getByText('펙틴 최신 연구 동향 요약입니다.')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(chatCallCount).toBe(2);
    expect(screen.queryByText('지금 다시 요청할 수 있습니다.')).toBeNull();
    expect(screen.getAllByText('@dasein 펙틴 연구동향')).toHaveLength(1);
  });
});
