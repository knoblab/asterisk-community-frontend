import React, { useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useAuthStore } from '../../stores/useAuthStore';

export const TermsAgreementModal: React.FC = () => {
  const { isTermsModalOpen, closeTermsModal, addToast } = useUIStore();
  const { updateTermsAgreement, user } = useAuthStore();

  const [agreeService, setAgreeService] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isTermsModalOpen) return null;

  const isAllChecked = agreeService && agreePrivacy;

  const handleToggleAll = () => {
    const next = !isAllChecked;
    setAgreeService(next);
    setAgreePrivacy(next);
  };

  const handleConfirm = async () => {
    if (!agreeService || !agreePrivacy) {
      addToast('필수 약관 및 개인정보 처리방침에 모두 동의해야 합니다.', 'error');
      return;
    }

    if (!user) {
      addToast('로그인이 필요합니다. 먼저 로그인해 주세요.', 'error');
      closeTermsModal();
      useUIStore.getState().openLoginModal('약관 동의를 위해 먼저 로그인해 주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateTermsAgreement(true, true);
      addToast('서비스 이용약관 및 개인정보 처리방침에 동의하였습니다.', 'success');
      closeTermsModal();
    } catch (err: any) {
      console.error('Terms agreement submit failed:', err);
      addToast(err.message || '약관 동의 상태 저장에 실패했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeTermsModal();
        }
      }}
    >
      <div
        className="modal-card"
        style={{
          background: 'var(--color-bg-primary, #ffffff)',
          color: 'var(--color-text-primary, #111111)',
          border: '1px solid var(--color-border, #e5e7eb)',
          borderRadius: 0,
          width: '100%',
          maxWidth: '460px',
          padding: '28px 24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'var(--font-brand, sans-serif)',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--color-telemetry, #888888)',
              }}
            >
              TERMS & PRIVACY
            </span>
          </div>
          <button
            type="button"
            onClick={closeTermsModal}
            style={{
              background: 'none',
              border: 0,
              padding: '4px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #666666)',
            }}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.02em' }}>
          서비스 이용약관 동의
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary, #666666)', lineHeight: 1.6, marginBottom: '20px' }}>
          asterisk* 및 cnsh.space 커뮤니티(글/댓글 작성, AI 질의 등)의 정상적인 이용을 위해 아래 필수 약관에 동의해 주세요.
        </p>

        {/* 동의 체크박스 박스 */}
        <div
          style={{
            background: 'var(--color-bg-secondary, #f9fafb)',
            border: '1px solid var(--color-border, #e5e7eb)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* 전체 동의 */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              fontSize: '13.5px',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={isAllChecked}
              onChange={handleToggleAll}
              style={{ width: '16px', height: '16px', accentColor: '#000000', cursor: 'pointer' }}
            />
            <span>
              <strong>전체 약관 및 방침에 동의합니다</strong>
            </span>
          </label>

          <div style={{ borderTop: '1px solid var(--color-border, #e5e7eb)', margin: '2px 0' }} />

          {/* 이용약관 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12.5px',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={agreeService}
                onChange={(e) => setAgreeService(e.target.checked)}
                style={{ width: '15px', height: '15px', accentColor: '#000000', cursor: 'pointer' }}
              />
              <span>
                <strong style={{ color: '#cf222e' }}>[필수]</strong> asterisk 이용약관에 동의합니다
              </span>
            </label>
            <a
              href="https://asterisk.knoblab.xyz/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-telemetry, #6b7280)',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <span>전문</span>
              <ExternalLink size={10} />
            </a>
          </div>

          {/* 개인정보 처리방침 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12.5px',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={agreePrivacy}
                onChange={(e) => setAgreePrivacy(e.target.checked)}
                style={{ width: '15px', height: '15px', accentColor: '#000000', cursor: 'pointer' }}
              />
              <span>
                <strong style={{ color: '#cf222e' }}>[필수]</strong> asterisk 개인정보 처리방침에 동의합니다
              </span>
            </label>
            <a
              href="https://asterisk.knoblab.xyz/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-telemetry, #6b7280)',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <span>전문</span>
              <ExternalLink size={10} />
            </a>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
          <button
            type="button"
            onClick={closeTermsModal}
            style={{
              flex: 1,
              padding: '11px',
              border: '1px solid var(--color-border, #d1d5db)',
              background: 'transparent',
              color: 'var(--color-text-primary, #111111)',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!isAllChecked || isSubmitting}
            onClick={handleConfirm}
            style={{
              flex: 2,
              padding: '11px',
              border: 0,
              background: isAllChecked ? '#000000' : 'var(--color-silver, #cccccc)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isAllChecked ? 'pointer' : 'not-allowed',
              opacity: isAllChecked ? 1 : 0.6,
              transition: 'background 0.2s ease, opacity 0.2s ease',
            }}
          >
            {isSubmitting ? '동의 저장 중...' : '동의하고 계속하기'}
          </button>
        </div>
      </div>
    </div>
  );
};
