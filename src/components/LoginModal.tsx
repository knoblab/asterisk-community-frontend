import React, { useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { X } from 'lucide-react';
import { KnoblabIcon } from './common/KnoblabIcon';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, message }) => {
  const { login } = useAuthStore();
  const isReadyToDismissRef = useRef(false);
  const backdropMouseDownRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      isReadyToDismissRef.current = false;
      const timer = setTimeout(() => {
        isReadyToDismissRef.current = true;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      backdropMouseDownRef.current = true;
    }
  };

  const handleOverlayTouchStart = (e: React.TouchEvent) => {
    if (e.target === e.currentTarget) {
      backdropMouseDownRef.current = true;
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (!isReadyToDismissRef.current) {
      backdropMouseDownRef.current = false;
      return;
    }
    if (e.target === e.currentTarget && backdropMouseDownRef.current) {
      onClose();
    }
    backdropMouseDownRef.current = false;
  };

  const handleKnoblabLogin = () => {
    login();
  };

  return (
    <div
      className="welcome"
      onMouseDown={handleOverlayMouseDown}
      onTouchStart={handleOverlayTouchStart}
      onClick={handleOverlayClick}
    >
      <div className="welcome-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>로그인이 필요합니다</h2>
          <button onClick={onClose} className="modal-close-btn" type="button" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <p className="welcome-desc">
          {message || '글쓰기 및 댓글 작성은 로그인 후 이용하실 수 있습니다.'}
        </p>

        <div className="welcome-auth-section">
          <button
            onClick={handleKnoblabLogin}
            className="btn-welcome-knoblab"
            type="button"
          >
            <KnoblabIcon size={20} color="#FFFFFF" />
            <span>Knoblab으로 로그인</span>
          </button>
          <div className="welcome-subtext">
            충남과학고 재학생 및 졸업생 통합 계정 지원
          </div>
        </div>
      </div>
    </div>
  );
};
