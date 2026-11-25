import React from 'react';
import { AlertCircle, Clock, RefreshCw, X } from 'lucide-react';
import type { AiChatMessage } from '../../types';

export interface AiErrorBubbleProps {
  message: AiChatMessage;
  cooldownSeconds: number;
  isGenerating: boolean;
  onRetry?: (message: AiChatMessage) => void;
  onDismiss?: (messageId: string) => void;
  compact?: boolean;
}

export interface ParsedErrorContent {
  title: string;
  detail: string;
  inferredKind: 'rate_limit' | 'general';
}

export const parseLegacyErrorContent = (content: string): ParsedErrorContent => {
  const normalized = String(content || '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\*\*|\*\*$/g, '').trim())
    .filter(Boolean);

  const firstLine = normalized[0] || '답변을 불러오지 못했습니다.';
  const restLines = normalized.slice(1).join(' ');
  const fullJoined = `${firstLine} ${restLines}`;
  const isRateLimit = /20초에\s*1회만\s*호출할\s*수\s*있습니다/.test(fullJoined);

  return {
    title: firstLine,
    detail: restLines,
    inferredKind: isRateLimit ? 'rate_limit' : 'general',
  };
};

export const AiErrorBubble: React.FC<AiErrorBubbleProps> = ({
  message,
  cooldownSeconds,
  isGenerating,
  onRetry,
  onDismiss,
  compact = false,
}) => {
  const parsed = parseLegacyErrorContent(message.content);
  const kind = message.errorKind ?? parsed.inferredKind;
  const isCooldownWaiting = kind === 'rate_limit' && cooldownSeconds > 0;
  const isReadyRateLimit = kind === 'rate_limit' && cooldownSeconds <= 0;

  const variantClass = isCooldownWaiting
    ? 'ai-error-card--cooldown'
    : isReadyRateLimit
      ? 'ai-error-card--ready'
      : 'ai-error-card--error';

  const badgeText =
    kind === 'rate_limit'
      ? cooldownSeconds > 0
        ? `COOLDOWN · ${cooldownSeconds}s`
        : 'READY'
      : 'ERROR';

  const titleText =
    kind === 'rate_limit'
      ? cooldownSeconds > 0
        ? '호출 대기 중입니다.'
        : '지금 다시 요청할 수 있습니다.'
      : message.errorTitle || parsed.title || '답변을 불러오지 못했습니다.';

  const detailText =
    kind === 'rate_limit'
      ? cooldownSeconds > 0
        ? `asterisk AI는 20초에 1회만 호출할 수 있습니다. ${cooldownSeconds}초 후 아래 버튼으로 바로 다시 시도할 수 있습니다.`
        : '호출 대기 시간이 끝났습니다. 아래 버튼으로 이전 질문을 바로 다시 요청할 수 있습니다.'
      : message.errorDetail ||
        parsed.detail ||
        '요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

  const totalCooldown = Math.max(cooldownSeconds, message.retryCooldownTotal || 20, 1);
  const progressPercent = Math.max(0, Math.min(100, (cooldownSeconds / totalCooldown) * 100));

  const canRetry = Boolean(onRetry && message.retryPrompt);
  const retryDisabled = isGenerating || cooldownSeconds > 0;
  const retryLabel = isGenerating
    ? '생성 중...'
    : cooldownSeconds > 0
      ? `${cooldownSeconds}초 후 다시 시도`
      : kind === 'rate_limit'
        ? '바로 다시 시도'
        : '다시 시도';

  return (
    <div
      className={`ai-error-card ${variantClass}${compact ? ' ai-error-card--compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="ai-error-header">
        <div className="ai-error-title-group">
          {kind === 'rate_limit' ? (
            <Clock size={14} className="ai-error-icon" aria-hidden="true" />
          ) : (
            <AlertCircle size={14} className="ai-error-icon" aria-hidden="true" />
          )}
          <span className="ai-error-title">{titleText}</span>
        </div>
        <span className="ai-error-badge">{badgeText}</span>
      </div>

      <p className="ai-error-body">{detailText}</p>

      {isCooldownWaiting && (
        <div className="ai-error-progress-track" aria-hidden="true">
          <div
            className="ai-error-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {(canRetry || onDismiss) && (
        <div className="ai-error-actions">
          {canRetry && (
            <button
              type="button"
              className="ai-error-retry-btn"
              disabled={retryDisabled}
              onClick={() => onRetry?.(message)}
            >
              {cooldownSeconds > 0 ? (
                <Clock size={12} aria-hidden="true" />
              ) : (
                <RefreshCw size={12} aria-hidden="true" />
              )}
              <span>{retryLabel}</span>
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              className="ai-error-dismiss-btn"
              aria-label="오류 안내 닫기"
              onClick={() => onDismiss(message.id)}
            >
              <X size={12} aria-hidden="true" />
              <span>닫기</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
