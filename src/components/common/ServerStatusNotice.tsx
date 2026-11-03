import React from 'react';
import { Activity, ExternalLink } from 'lucide-react';

interface ServerStatusNoticeProps {
  message?: string;
  style?: React.CSSProperties;
  className?: string;
  compact?: boolean;
  variant?: 'info' | 'error';
}

export const ServerStatusNotice: React.FC<ServerStatusNoticeProps> = ({
  message = '로딩이 되지 않나요?',
  style,
  className = '',
  compact = false,
  variant = 'info',
}) => {
  return (
    <div
      className={`server-status-notice ${compact ? 'compact' : ''} ${variant === 'error' ? 'error' : ''} ${className}`.trim()}
      style={style}
      role="status"
    >
      <div className="status-notice-content">
        <Activity size={compact ? 13 : 15} className="status-notice-icon" />
        <span className="status-notice-text">{message}</span>
        <a
          href="https://status.knoblab.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="status-notice-link"
        >
          <span>status.knoblab.xyz에서 서버 상태 확인</span>
          <ExternalLink size={11} style={{ marginLeft: 3 }} />
        </a>
      </div>
    </div>
  );
};
