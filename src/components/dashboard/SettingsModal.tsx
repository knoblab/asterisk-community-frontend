import React, { useState, useRef, useEffect } from 'react';
import { X, Moon, Sun, LogOut, User as UserIcon, Camera, Loader2, Check, Shield, BookOpen } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { isAdminUser } from '../../constants/admin';
import { validateUploadFile } from '../../utils/fileSecurity';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, logout, updateUserProfile, updateClassSettings, uploadProfileImage } = useAuthStore();
  const { theme, toggleTheme, addToast } = useUIStore();

  const [activeTab, setActiveTab] = useState<'general' | 'profile'>('general');
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [schoolGrade, setSchoolGrade] = useState('');
  const [schoolClass, setSchoolClass] = useState('');
  const [isSavingClass, setIsSavingClass] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [classroomStatus, setClassroomStatus] = useState<{ connected: boolean; email?: string | null; connectedAt?: number | null } | null>(null);
  const [isLoadingClassroom, setIsLoadingClassroom] = useState(false);
  const [isDisconnectingClassroom, setIsDisconnectingClassroom] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = isAdminUser(user?.uid, user?.email);
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

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || user.email?.split('@')[0] || '사용자');
      setPhotoURL(user.photoURL || '');
      setSchoolGrade(user.schoolGrade || '');
      setSchoolClass(user.schoolClass || '');
    } else {
      try {
        const rawClass = localStorage.getItem('class');
        if (rawClass) {
          const parsed = JSON.parse(rawClass);
          if (parsed?.g) setSchoolGrade(String(parsed.g));
          if (parsed?.c) setSchoolClass(String(parsed.c));
        }
      } catch (_) {}
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (isOpen && user) {
      setIsLoadingClassroom(true);
      fetch('/api/integrations/google/status', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.connected === 'boolean') {
            setClassroomStatus(data);
          }
        })
        .catch((err) => {
          console.warn('Failed to fetch Google Classroom status:', err);
        })
        .finally(() => {
          setIsLoadingClassroom(false);
        });
    }
  }, [isOpen, user]);

  const handleConnectClassroom = async () => {
    setIsLoadingClassroom(true);
    try {
      const res = await fetch('/api/integrations/google/authorize?format=json', {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });
      const data = await res.json().catch(() => null);
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      if (data?.error === 'auth_required') {
        addToast('구글 클래스룸을 연동하려면 먼저 로그인해 주세요.', 'error');
      } else {
        addToast(data?.error || '구글 연동 주소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      }
    } catch (err) {
      console.error('Failed to initiate Google Classroom OAuth:', err);
      addToast('네트워크 오류로 연동 창을 열 수 없습니다.', 'error');
    } finally {
      setIsLoadingClassroom(false);
    }
  };

  const handleDisconnectClassroom = async () => {
    if (!window.confirm('구글 클래스룸 연동을 해제하시겠습니까? 해제 시 asterisk AI가 과제 및 수행평가 일정을 자동으로 조회할 수 없게 됩니다.')) {
      return;
    }
    setIsDisconnectingClassroom(true);
    try {
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setClassroomStatus({ connected: false });
        addToast('구글 클래스룸 연동이 해제되었습니다.', 'info');
      } else {
        addToast('연동 해제 중 오류가 발생했습니다.', 'error');
      }
    } catch (err) {
      console.error('Failed to disconnect classroom:', err);
      addToast('네트워크 오류로 연동 해제에 실패했습니다.', 'error');
    } finally {
      setIsDisconnectingClassroom(false);
    }
  };

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

  const handleGradeChange = async (newGrade: string) => {
    setSchoolGrade(newGrade);
    setIsSavingClass(true);
    try {
      await updateClassSettings(newGrade || null, schoolClass || null);
      addToast(newGrade ? `${newGrade}학년으로 설정되었습니다.` : '학년 설정이 해제되었습니다.', 'success');
    } catch (err: any) {
      console.error('Failed to save grade setting:', err);
      addToast('학년 설정 저장 실패', 'error');
    } finally {
      setIsSavingClass(false);
    }
  };

  const handleClassChange = async (newClass: string) => {
    setSchoolClass(newClass);
    setIsSavingClass(true);
    try {
      await updateClassSettings(schoolGrade || null, newClass || null);
      addToast(newClass ? `${newClass}반으로 설정되었습니다.` : '학급 설정이 해제되었습니다.', 'success');
    } catch (err: any) {
      console.error('Failed to save class setting:', err);
      addToast('반 설정 저장 실패', 'error');
    } finally {
      setIsSavingClass(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('정말 로그아웃 하시겠습니까?')) {
      await logout();
      onClose();
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateUploadFile(file);
    if (!validation.valid) {
      addToast(validation.error || '유효하지 않은 파일입니다.', 'error');
      return;
    }
    if (validation.category !== 'image') {
      addToast('이미지 파일(JPEG, PNG, GIF, WebP)만 업로드 가능합니다.', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const uploadedUrl = await uploadProfileImage(file);
      setPhotoURL(uploadedUrl);
      addToast('프로필 이미지가 업로드되었습니다.', 'success');
    } catch (err: any) {
      console.error('Failed to upload profile image:', err);
      addToast(err.message || '프로필 이미지 업로드 실패', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      addToast('닉네임을 입력해주세요.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await updateUserProfile(displayName.trim(), photoURL, schoolGrade || null, schoolClass || null);
      addToast('프로필이 성공적으로 저장되었습니다.', 'success');
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      addToast(err.message || '프로필 저장 실패', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="settings-modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      onTouchStart={handleOverlayTouchStart}
      onClick={handleOverlayClick}
    >
      <div className="settings-modal-panel" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="settings-modal-head">
          <div className="settings-modal-title">
            <span className="settings-modal-badge">*</span>
            <h2>설정 (Settings)</h2>
          </div>
          <button
            type="button"
            className="settings-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="settings-tab-nav">
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            일반 설정
          </button>
          {user && (
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              프로필 관리
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="settings-modal-body">
          {activeTab === 'general' && (
            <div className="settings-section">
              {/* Account Quick Status */}
              {user ? (
                <div className="settings-account-card">
                  <div className="settings-account-avatar">
                    {photoURL ? (
                      <img src={photoURL} alt="Profile" referrerPolicy="no-referrer" />
                    ) : (
                      (displayName || user.email)?.[0]?.toUpperCase() || <UserIcon size={20} />
                    )}
                  </div>
                  <div className="settings-account-info">
                    <div className="settings-account-name-line">
                      <span className="settings-account-name">{user.displayName || user.email?.split('@')[0]}</span>
                      {isAdmin && (
                        <span className="settings-role-badge">
                          <Shield size={10} />
                          <span>ADMIN</span>
                        </span>
                      )}
                    </div>
                    <span className="settings-account-email">{user.email}</span>
                  </div>
                </div>
              ) : (
                <div className="settings-account-empty">
                  <span>로그인되지 않았습니다.</span>
                </div>
              )}

              {/* Theme Setting Group */}
              <div className="settings-group">
                <div className="settings-group-label">테마 (DISPLAY THEME)</div>
                <div className="settings-theme-row">
                  <div className="settings-theme-info">
                    <span className="settings-item-title">
                      {theme === 'dark' ? '다크 모드 (Absolute Black)' : '라이트 모드 (Base Paper White)'}
                    </span>
                    <span className="settings-item-desc">
                      {theme === 'dark'
                        ? '칠흑색 캔버스와 고대비 반전 인터페이스'
                        : '물리적 인쇄 용지의 질감을 살린 기본 인터페이스'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="settings-theme-toggle-btn"
                    title="테마 전환"
                  >
                    {theme === 'dark' ? (
                      <>
                        <Sun size={14} />
                        <span>라이트 모드로 전환</span>
                      </>
                    ) : (
                      <>
                        <Moon size={14} />
                        <span>다크 모드로 전환</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* School Class Setting Group */}
              <div className="settings-group">
                <div className="settings-group-label">학교 학급 설정 (TIMETABLE & AI SYNC)</div>
                <div className="settings-class-row">
                  <div className="settings-class-info">
                    <span className="settings-item-title">
                      내 학년 및 학급 (기기 간 클라우드 연동)
                    </span>
                    <span className="settings-item-desc">
                      학년과 반을 설정하면 계정에 저장되어 모든 기기에서 동기화되며, asterisk AI에게 시간표를 물어볼 때 내 학급 시간표를 자동으로 맞춤 안내합니다.
                    </span>
                  </div>
                  <div className="settings-class-controls">
                    <div className="settings-class-select-wrap">
                      <label htmlFor="settings-grade-select">학년</label>
                      <select
                        id="settings-grade-select"
                        value={schoolGrade}
                        onChange={(e) => handleGradeChange(e.target.value)}
                        className="settings-class-select"
                        disabled={isSavingClass}
                      >
                        <option value="">미설정</option>
                        <option value="1">1학년</option>
                        <option value="2">2학년</option>
                        <option value="3">3학년</option>
                      </select>
                    </div>
                    <div className="settings-class-select-wrap">
                      <label htmlFor="settings-class-select">반</label>
                      <select
                        id="settings-class-select"
                        value={schoolClass}
                        onChange={(e) => handleClassChange(e.target.value)}
                        className="settings-class-select"
                        disabled={isSavingClass}
                      >
                        <option value="">미설정</option>
                        <option value="1">1반</option>
                        <option value="2">2반</option>
                        <option value="3">3반</option>
                        <option value="4">4반</option>
                      </select>
                    </div>
                    {isSavingClass && (
                      <span className="settings-class-saving" title="저장 중...">
                        <Loader2 size={13} className="spin" />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Google Classroom Setting Group */}
              {user && (
                <div className="settings-group">
                  <div className="settings-group-label">구글 클래스룸 연동 (GOOGLE CLASSROOM SYNC)</div>
                  <div className="settings-class-row">
                    <div className="settings-class-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className="settings-item-title" style={{ margin: 0 }}>
                          과제 및 수행평가 자동 조회
                        </span>
                        {isLoadingClassroom ? (
                          <Loader2 size={12} className="spin" style={{ color: 'var(--color-text-secondary)' }} />
                        ) : classroomStatus?.connected ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#10b981',
                            background: 'rgba(16, 185, 129, 0.1)',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            <Check size={10} />
                            <span>연동됨 ({classroomStatus.email || user.email})</span>
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '11px',
                            color: 'var(--color-text-secondary)',
                            background: 'var(--color-bg-secondary)',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            미연동
                          </span>
                        )}
                      </div>
                      <span className="settings-item-desc">
                        학교 구글 계정과 연동하면 asterisk AI(@asterisk)에게 질문 시 마감 임박 과제, 수행평가 일정, 미제출 과제를 실시간으로 조회하여 안내합니다.
                      </span>
                    </div>
                    <div className="settings-class-controls" style={{ minWidth: 'auto' }}>
                      {classroomStatus?.connected ? (
                        <button
                          type="button"
                          onClick={handleDisconnectClassroom}
                          disabled={isDisconnectingClassroom}
                          className="button secondary"
                          style={{
                            fontSize: '12px',
                            height: '32px',
                            padding: '0 10px',
                            color: '#ef4444',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          title="구글 클래스룸 연동 해제"
                        >
                          {isDisconnectingClassroom ? <Loader2 size={12} className="spin" /> : <LogOut size={12} />}
                          <span>연동 해제</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleConnectClassroom}
                          className="button primary"
                          style={{
                            fontSize: '12px',
                            height: '32px',
                            padding: '0 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap'
                          }}
                          title="구글 클래스룸 계정 연동"
                        >
                          <BookOpen size={13} />
                          <span>구글 클래스룸 연동</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Logout Action */}
              {user && (
                <div className="settings-group" style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="settings-logout-btn"
                  >
                    <LogOut size={14} />
                    <span>로그아웃 (Sign Out)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'profile' && user && (
            <form onSubmit={handleSaveProfile} className="settings-profile-form">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageFileChange}
                onClick={(e) => e.stopPropagation()}
                accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: 'none' }}
              />

              {/* Avatar Upload */}
              <div className="settings-avatar-section">
                <div
                  className="settings-avatar-circle"
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  title={isUploading ? '업로드 진행 중...' : '클릭하여 프로필 사진 변경'}
                >
                  {photoURL ? (
                    <img src={photoURL} alt="Profile" referrerPolicy="no-referrer" />
                  ) : (
                    (displayName || user.email)?.[0]?.toUpperCase() || <UserIcon size={32} />
                  )}
                  {isUploading && (
                    <div className="settings-avatar-loading">
                      <Loader2 size={20} className="spin" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="settings-avatar-btn"
                >
                  <Camera size={13} />
                  <span>{isUploading ? '업로드 중 (최대 25MB)...' : '사진 변경 (최대 25MB)'}</span>
                </button>
              </div>

              {/* Email (Readonly) */}
              <div className="admin-form-group">
                <label>이메일 주소</label>
                <input type="text" value={user.email || '미등록'} disabled style={{ cursor: 'not-allowed', opacity: 0.7 }} />
              </div>

              {/* Display Name */}
              <div className="admin-form-group">
                <label>닉네임 (표시 이름)</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="닉네임을 입력하세요"
                  maxLength={20}
                  required
                />
              </div>

              {/* School Grade & Class in Profile Form */}
              <div className="admin-form-group">
                <label>내 학급 설정 (시간표 자동 연동)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <select
                      value={schoolGrade}
                      onChange={(e) => setSchoolGrade(e.target.value)}
                      className="settings-class-select"
                      style={{ width: '100%', height: '36px' }}
                    >
                      <option value="">학년 선택 (미설정)</option>
                      <option value="1">1학년</option>
                      <option value="2">2학년</option>
                      <option value="3">3학년</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <select
                      value={schoolClass}
                      onChange={(e) => setSchoolClass(e.target.value)}
                      className="settings-class-select"
                      style={{ width: '100%', height: '36px' }}
                    >
                      <option value="">반 선택 (미설정)</option>
                      <option value="1">1반</option>
                      <option value="2">2반</option>
                      <option value="3">3반</option>
                      <option value="4">4반</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="settings-modal-footer">
                <button
                  type="button"
                  className="button secondary"
                  onClick={onClose}
                  disabled={isSaving || isUploading}
                >
                  닫기
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={isSaving || isUploading || !displayName.trim()}
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={13} className="spin" />
                      <span>저장 중...</span>
                    </>
                  ) : (
                    <>
                      <Check size={13} />
                      <span>변경사항 저장</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
