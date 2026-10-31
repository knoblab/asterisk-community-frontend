import React from 'react';
import { useUIStore } from '../stores/useUIStore';
import { CheckCircle, AlertTriangle, Info, X, Sparkles, Bot, MessageSquare } from 'lucide-react';

const renderToastIcon = (toast: { type: string; icon?: 'sparkles' | 'bot' | 'message' }) => {
  if (toast.icon === 'sparkles') {
    return <Sparkles size={14} style={{ color: 'var(--color-functional-red)', flexShrink: 0 }} />;
  }
  if (toast.icon === 'bot') {
    return <Bot size={14} style={{ color: 'var(--color-functional-red)', flexShrink: 0 }} />;
  }
  if (toast.icon === 'message') {
    return <MessageSquare size={14} style={{ flexShrink: 0 }} />;
  }
  if (toast.type === 'success') {
    return <CheckCircle size={14} style={{ flexShrink: 0 }} />;
  }
  if (toast.type === 'error') {
    return <AlertTriangle size={14} style={{ color: 'var(--up-red)', flexShrink: 0 }} />;
  }
  return <Info size={14} style={{ flexShrink: 0 }} />;
};

const renderToastMessage = (message: string) => {
  const urlRegex = /(https?:\/\/[^\s]+|status\.knoblab\.xyz)/g;
  if (!urlRegex.test(message)) {
    return <span>{message}</span>;
  }

  const parts = message.split(/(https?:\/\/[^\s]+|status\.knoblab\.xyz)/g);
  return (
    <span>
      {parts.map((part, index) => {
        if (part === 'status.knoblab.xyz') {
          return (
            <a
              key={index}
              href="https://status.knoblab.xyz"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#79b8ff', textDecoration: 'underline', fontWeight: 600 }}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        if (part.startsWith('http://') || part.startsWith('https://')) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#79b8ff', textDecoration: 'underline', fontWeight: 600 }}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </span>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useUIStore();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '16px',
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          onClick={() => {
            if (toast.onClick) {
              toast.onClick();
              removeToast(toast.id);
            }
          }}
          style={{
            position: 'static',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            maxWidth: '100%',
            wordBreak: 'break-word',
            cursor: toast.onClick ? 'pointer' : 'default',
            boxShadow: toast.onClick ? '0 4px 12px rgba(0,0,0,0.15)' : undefined,
          }}
        >
          {renderToastIcon(toast)}
          <div style={{ flex: 1 }}>{renderToastMessage(toast.message)}</div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeToast(toast.id);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              marginLeft: '6px',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            aria-label="닫기"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
};
