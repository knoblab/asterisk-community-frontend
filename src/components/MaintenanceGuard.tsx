import React, { useEffect, useState, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import {
  syncServerTime,
  getSyncedDate,
  checkMaintenanceActive,
  checkMaintenanceWarning,
  getSecondsUntilMaintenanceEnd,
  type MaintenanceWarningStatus,
} from '../utils/timeSync';
import { useUIStore } from '../stores/useUIStore';

interface MaintenanceGuardProps {
  children: React.ReactNode;
}

export const MaintenanceGuard: React.FC<MaintenanceGuardProps> = ({ children }) => {
  const [isMaintenance, setIsMaintenance] = useState<boolean | null>(null);
  const [warning, setWarning] = useState<MaintenanceWarningStatus>({
    active: false,
    minutesLeft: 0,
    secondsLeft: 0,
  });
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const notifiedMinutesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let checkInterval: any;

    const init = async () => {
      await syncServerTime();
      setLoading(false);

      const updateStatus = () => {
        const currentDate = getSyncedDate();
        const active = checkMaintenanceActive(currentDate);
        setIsMaintenance(active);

        if (active) {
          setTimeLeft(getSecondsUntilMaintenanceEnd(currentDate));
          setWarning({ active: false, minutesLeft: 0, secondsLeft: 0 });
          notifiedMinutesRef.current.clear();
        } else {
          const warningStatus = checkMaintenanceWarning(currentDate);
          setWarning(warningStatus);

          if (warningStatus.active) {
            const min = warningStatus.minutesLeft;
            // Send toast notification at entry (10m) and key milestones (e.g. 5m, 1m)
            if ([10, 5, 3, 1].includes(min) && !notifiedMinutesRef.current.has(min)) {
              notifiedMinutesRef.current.add(min);
              useUIStore
                .getState()
                .addToast(
                  `⚠️ 시스템 정기 점검이 ${min}분 뒤(23:55) 시작됩니다. 작성 중인 내용을 저장해 주세요.`,
                  'info'
                );
            }
          } else {
            notifiedMinutesRef.current.clear();
          }
        }
      };

      updateStatus();
      // Tick every second to update status and the countdown timer
      checkInterval = setInterval(updateStatus, 1000);
    };

    init();

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="pdf-app pdf-justify-center pdf-items-center" style={{ minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
        <div className="pdf-text-label-14-mono pdf-text-muted">서버 시간 동기화 중...</div>
      </div>
    );
  }

  if (isMaintenance) {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
      <div className="pdf-app pdf-justify-center pdf-items-center" style={{ minHeight: '100vh', background: 'var(--color-bg-secondary)', position: 'relative', overflow: 'hidden' }}>
        <div className="pdf-panel pdf-animate-fade-in" style={{
          width: '90%',
          maxWidth: '440px',
          padding: '32px 24px',
          textAlign: 'center',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border-default)',
          boxShadow: 'var(--shadow-elevated)',
          background: 'var(--color-bg-primary)',
          zIndex: 1
        }}>
          <div style={{ 
            display: 'inline-flex', 
            padding: '12px', 
            borderRadius: '50%', 
            background: 'var(--color-bg-secondary)', 
            border: '1px solid var(--color-border-default)',
            marginBottom: '16px' 
          }}>
            <Clock 
              size={36} 
              style={{ color: 'var(--color-functional-red)' }} 
            />
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
            시스템 정기 점검 안내
          </h2>

          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
            더욱 안정적인 서비스를 제공하기 위해 정기 점검 중입니다.<br />
            점검 완료 후 정상적인 서비스 이용이 가능합니다.
          </p>

          <div style={{
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
            marginBottom: '16px',
            border: '1px solid var(--color-border-default)',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>점검 기준 시간</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>한국 표준시 (KST)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>정기 점검 시간</span>
              <span style={{ fontWeight: 700, color: 'var(--color-functional-red)' }}>매월 1일 00:00 ~ 00:10 (사전 제한 23:55~)</span>
            </div>
          </div>

          <div style={{
            padding: '14px',
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border-default)',
            marginBottom: '14px'
          }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              점검 완료까지 남은 시간
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '26px', color: 'var(--color-text-primary)' }}>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            서버 시간과 동기화되어 있으며 점검 종료 시 자동 해제됩니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {warning.active && (
        <div
          role="alert"
          aria-live="polite"
          data-testid="maintenance-warning-banner"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 9998,
            backgroundColor: '#fffbe6',
            color: '#ad6800',
            borderBottom: '1px solid #ffe58f',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.2s ease-in-out',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, color: '#fa8c16' }} />
          <span>
            정기 점검 안내: 약 <strong>{warning.minutesLeft}분 뒤 (23:55)</strong>부터 시스템 점검으로 서비스 이용이 일시 제한됩니다. 작성 중인 내용을 저장해 주세요.
          </span>
        </div>
      )}
      {children}
    </>
  );
};
