import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Moon,
  Sun,
  LogOut,
  User as UserIcon,
  Camera,
  Loader2,
  Check,
  Shield,
  BookOpen,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Mail,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { authFetch } from '../../stores/useBoardStore';
import { isAdminUser } from '../../constants/admin';
import { validateUploadFile } from '../../utils/fileSecurity';
import { isSafeGoogleAuthorizeRedirect } from '../MarkdownRenderer';
import { getSafeAvatarUrl } from '../common/UserAvatar';
import { ExternalArrowIcon } from '../common/ExternalArrowIcon';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, logout, updateUserProfile, updateTermsAgreement, uploadProfileImage } = useAuthStore();
  const { theme, toggleTheme, addToast } = useUIStore();

  const [activeTab, setActiveTab] = useState<'general' | 'profile'>('general');
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [schoolGrade, setSchoolGrade] = useState('');
  const [schoolClass, setSchoolClass] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [classroomStatus, setClassroomStatus] = useState<{
    connected: boolean;
    email?: string | null;
    connectedAt?: number | null;
    requiresScopeUpgrade?: boolean;
    hasCalendarScope?: boolean;
  } | null>(null);
  const [isLoadingClassroom, setIsLoadingClassroom] = useState(false);
  const [isDisconnectingClassroom, setIsDisconnectingClassroom] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = isAdminUser(user);
  const isReadyToDismissRef = useRef(false);
  const backdropMouseDownRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      isReadyToDismissRef.current = false;
      const timer = setTimeout(() => {
        isReadyToDismissRef.current = true;
      }, 150);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!user && activeTab === 'profile') {
      setActiveTab('general');
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || user.email?.split('@')[0] || '사용자');
      setPhotoURL(user.photoURL || '');
      setSchoolGrade(user.schoolGrade || '');
      setSchoolClass(user.schoolClass || '');
    } else {
      setDisplayName('');
      setPhotoURL('');
      setSchoolGrade('');
      setSchoolClass('');
      setClassroomStatus(null);
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
    setClassroomStatus(null);
    if (isOpen && user) {
      let cancelled = false;
      setIsLoadingClassroom(true);
      authFetch('/api/integrations/google/status')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data && typeof data.connected === 'boolean') {
            setClassroomStatus(data);
          }
        })
        .catch((err) => {
          console.warn('Failed to fetch Google Classroom status:', err);
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoadingClassroom(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, user?.uid]);

  const handleConnectClassroom = async () => {
    setIsLoadingClassroom(true);
    try {
      const res = await authFetch('/api/integrations/google/authorize?format=json', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      const data = await res.json().catch(() => null);
      if (data?.url) {
        if (!isSafeGoogleAuthorizeRedirect(data.url)) {
          addToast('안전하지 않은 구글 연동 주소가 차단되었습니다.', 'error');
          return;
        }
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
      const res = await authFetch('/api/integrations/google/disconnect', {
        method: 'POST',
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

  const safeAvatarUrl = getSafeAvatarUrl(photoURL);
  const classSummary =
    user?.schoolGrade && user?.schoolClass
      ? `${user.schoolGrade}학년 ${user.schoolClass}반`
      : user?.schoolGrade
        ? `${user.schoolGrade}학년`
        : user?.schoolClass
          ? `${user.schoolClass}반`
          : null;

  return (
    <div
      className="settings-modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      onTouchStart={handleOverlayTouchStart}
      onClick={handleOverlayClick}
    >
      <div
        className="settings-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="settings-modal-head">
          <div className="settings-modal-title">
            <span className="settings-modal-badge" aria-hidden="true">*</span>
            <h2 id="settings-modal-title">설정 (Settings)</h2>
          </div>
          <button
            type="button"
            className="settings-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="settings-tab-nav" role="tablist" aria-label="설정 탭">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'general'}
            className={`settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            일반 설정
          </button>
          {user && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'profile'}
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
                    {safeAvatarUrl ? (
                      <img src={safeAvatarUrl} alt="Profile" referrerPolicy="no-referrer" />
                    ) : (
                      (displayName || user.email)?.[0]?.toUpperCase() || <UserIcon size={20} aria-hidden="true" />
                    )}
                  </div>
                  <div className="settings-account-info">
                    <div className="settings-account-name-line">
                      <span className="settings-account-name">{user.displayName || user.email?.split('@')[0]}</span>
                      {isAdmin && (
                        <span className="settings-role-badge">
                          <Shield size={10} aria-hidden="true" />
                          <span>ADMIN</span>
                        </span>
                      )}
                      {classSummary && (
                        <span className="settings-meta-badge">{classSummary}</span>
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
                <div className="settings-card settings-card--row">
                  <div className="settings-card-copy">
                    <span className="settings-item-title">
                      {theme === 'dark' ? '다크 모드 (Absolute Black)' : '라이트 모드 (Base Paper White)'}
                    </span>
                    <span className="settings-item-desc">
                      {theme === 'dark'
                        ? '칠흑색 캔버스와 고대비 반전 인터페이스'
                        : '물리적 인쇄 용지의 질감을 살린 기본 인터페이스'}
                    </span>
                  </div>
                  <div className="settings-theme-segment" role="group" aria-label="화면 테마 선택">
                    <button
                      type="button"
                      className={`settings-theme-segment-btn ${theme !== 'dark' ? 'active' : ''}`}
                      aria-pressed={theme !== 'dark'}
                      onClick={() => {
                        if (theme === 'dark') toggleTheme();
                      }}
                    >
                      <Sun size={13} aria-hidden="true" />
                      <span>라이트</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-theme-segment-btn ${theme === 'dark' ? 'active' : ''}`}
                      aria-pressed={theme === 'dark'}
                      onClick={() => {
                        if (theme !== 'dark') toggleTheme();
                      }}
                    >
                      <Moon size={13} aria-hidden="true" />
                      <span>다크</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Terms & Privacy Setting Group */}
              <div className="settings-group">
                <div className="settings-group-label">약관 및 개인정보 처리방침 (TERMS & PRIVACY)</div>
                <div className="settings-card">
                  <div className="settings-card-header">
                    <span className="settings-item-title">이용약관 및 방침 동의 상태</span>
                    {user?.agreedTerms && user?.agreedPrivacy ? (
                      <span className="settings-status-badge settings-status-badge--success">
                        <Check size={11} aria-hidden="true" />
                        <span>전체 필수 동의 완료</span>
                      </span>
                    ) : (
                      <span className="settings-status-badge settings-status-badge--danger">
                        <X size={11} aria-hidden="true" />
                        <span>미동의 (이용 제한)</span>
                      </span>
                    )}
                  </div>
                  <span className="settings-item-desc">
                    충남과학고 커뮤니티(cnsh.space) 이용 시 필수 약관 동의 여부입니다. 동의 상태는 계정 프로필에 안전하게 저장됩니다.
                  </span>
                  <div className="settings-card-footer">
                    <div className="settings-card-meta-group">
                      <div className="settings-link-group">
                        <a
                          href="https://asterisk.knoblab.xyz/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="settings-link-chip"
                        >
                          <span>이용약관</span>
                          <ExternalArrowIcon size={11} />
                        </a>
                        <a
                          href="https://asterisk.knoblab.xyz/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="settings-link-chip"
                        >
                          <span>개인정보처리방침</span>
                          <ExternalArrowIcon size={11} />
                        </a>
                      </div>
                      {user?.agreedAt && (
                        <span className="settings-meta-text">
                          동의일 {new Date(user.agreedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="settings-card-actions">
                      {user?.agreedTerms && user?.agreedPrivacy ? (
                        <button
                          type="button"
                          className="settings-btn settings-btn--danger"
                          onClick={async () => {
                            if (window.confirm('정말 이용약관 및 개인정보 처리방침 동의를 해제하시겠습니까?\n해제 시 글 작성, 댓글 작성 및 AI 기능 이용이 제한됩니다.')) {
                              try {
                                await updateTermsAgreement(false, false);
                                addToast('약관 동의가 해제되었습니다. 글/댓글/AI 이용이 제한됩니다.', 'info');
                              } catch (err: unknown) {
                                console.error('Failed to revoke terms agreement:', err);
                                addToast('약관 동의 해제 저장에 실패했습니다.', 'error');
                              }
                            }
                          }}
                        >
                          동의 해제하기
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="settings-btn settings-btn--primary"
                          onClick={async () => {
                            try {
                              await updateTermsAgreement(true, true);
                              addToast('약관 및 개인정보 처리방침에 동의하였습니다.', 'success');
                            } catch (err: unknown) {
                              console.error('Failed to accept terms agreement:', err);
                              addToast('약관 동의 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
                            }
                          }}
                        >
                          동의하기
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Google Classroom Setting Group */}
              {user && (
                <div className="settings-group">
                  <div className="settings-group-label">구글 서비스 연동 (GOOGLE CLASSROOM & CALENDAR)</div>
                  <div className="settings-card">
                    <div className="settings-card-header">
                      <span className="settings-item-title">과제 조회 및 캘린더 알림 등록</span>
                      {isLoadingClassroom ? (
                        <span className="settings-status-badge settings-status-badge--neutral">
                          <Loader2 size={11} className="spin" aria-hidden="true" />
                          <span>확인 중</span>
                        </span>
                      ) : classroomStatus?.connected ? (
                        classroomStatus?.requiresScopeUpgrade ? (
                          <span className="settings-status-badge settings-status-badge--warning">
                            <AlertCircle size={11} aria-hidden="true" />
                            <span>권한 업데이트 필요</span>
                          </span>
                        ) : (
                          <span className="settings-status-badge settings-status-badge--success">
                            <Check size={11} aria-hidden="true" />
                            <span>연동됨</span>
                          </span>
                        )
                      ) : (
                        <span className="settings-status-badge settings-status-badge--neutral">
                          <span>미연동</span>
                        </span>
                      )}
                    </div>
                    <span className="settings-item-desc">
                      학교 구글 계정과 연동하면 asterisk AI(@asterisk)에게 질문 시 마감 임박 과제/수행평가를 실시간으로 조회하고, 마감 전 구글 캘린더 푸시 알림(모바일 팝업 알람)을 자동으로 등록할 수 있습니다.
                    </span>
                    <div className="settings-card-footer">
                      <div className="settings-card-meta-group">
                        {classroomStatus?.connected ? (
                          <span className="settings-account-chip" title={classroomStatus.email || user.email || ''}>
                            <Mail size={12} aria-hidden="true" />
                            <span>{classroomStatus.email || user.email}</span>
                          </span>
                        ) : (
                          <span className="settings-meta-text">학교 Google 계정 연동 지원</span>
                        )}
                      </div>
                      <div className="settings-card-actions">
                        {classroomStatus?.connected ? (
                          <>
                            {classroomStatus?.requiresScopeUpgrade && (
                              <button
                                type="button"
                                onClick={handleConnectClassroom}
                                disabled={isLoadingClassroom}
                                className="settings-btn settings-btn--warning"
                                title="새로운 구글 캘린더 연동 권한 승인하기"
                              >
                                <RefreshCw size={12} aria-hidden="true" />
                                <span>권한 업데이트</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleDisconnectClassroom}
                              disabled={isDisconnectingClassroom}
                              className="settings-btn settings-btn--danger"
                              title="구글 클래스룸 연동 해제"
                            >
                              {isDisconnectingClassroom ? (
                                <Loader2 size={12} className="spin" aria-hidden="true" />
                              ) : (
                                <LogOut size={12} aria-hidden="true" />
                              )}
                              <span>연동 해제</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={handleConnectClassroom}
                            disabled={isLoadingClassroom}
                            className="settings-btn settings-btn--primary"
                            title="구글 클래스룸 계정 연동"
                          >
                            <BookOpen size={13} aria-hidden="true" />
                            <span>구글 클래스룸 연동</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Logout Action */}
              {user && (
                <div className="settings-logout-wrap">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="settings-logout-btn"
                  >
                    <LogOut size={14} aria-hidden="true" />
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
                  {safeAvatarUrl ? (
                    <img src={safeAvatarUrl} alt="Profile" referrerPolicy="no-referrer" />
                  ) : (
                    (displayName || user.email)?.[0]?.toUpperCase() || <UserIcon size={32} aria-hidden="true" />
                  )}
                  {isUploading && (
                    <div className="settings-avatar-loading">
                      <Loader2 size={20} className="spin" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="settings-btn settings-btn--secondary"
                >
                  <Camera size={13} aria-hidden="true" />
                  <span>{isUploading ? '업로드 중 (최대 25MB)...' : '사진 변경 (최대 25MB)'}</span>
                </button>
              </div>

              {/* Email (Readonly) */}
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="settings-email-input">이메일 주소</label>
                <input
                  id="settings-email-input"
                  type="text"
                  className="settings-input"
                  value={user.email || '미등록'}
                  disabled
                />
              </div>

              {/* Display Name */}
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="settings-displayname-input">닉네임 (표시 이름)</label>
                <input
                  id="settings-displayname-input"
                  type="text"
                  className="settings-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="닉네임을 입력하세요"
                  maxLength={20}
                  required
                />
              </div>

              {/* School Grade & Class in Profile Form */}
              <div className="settings-field">
                <span className="settings-field-label">내 학급 설정 (시간표 및 AI 동기화)</span>
                <div className="settings-class-grid">
                  <div className="settings-select-field">
                    <label htmlFor="settings-grade-select">학년</label>
                    <div className="settings-select-wrap">
                      <select
                        id="settings-grade-select"
                        value={schoolGrade}
                        onChange={(e) => setSchoolGrade(e.target.value)}
                        className="settings-class-select"
                      >
                        <option value="">학년 선택 (미설정)</option>
                        <option value="1">1학년</option>
                        <option value="2">2학년</option>
                        <option value="3">3학년</option>
                      </select>
                      <ChevronDown size={14} className="settings-select-chevron" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="settings-select-field">
                    <label htmlFor="settings-class-select">반</label>
                    <div className="settings-select-wrap">
                      <select
                        id="settings-class-select"
                        value={schoolClass}
                        onChange={(e) => setSchoolClass(e.target.value)}
                        className="settings-class-select"
                      >
                        <option value="">반 선택 (미설정)</option>
                        <option value="1">1반</option>
                        <option value="2">2반</option>
                        <option value="3">3반</option>
                        <option value="4">4반</option>
                      </select>
                      <ChevronDown size={14} className="settings-select-chevron" aria-hidden="true" />
                    </div>
                  </div>
                </div>
                <span className="settings-field-hint">
                  설정한 학년과 반은 모든 기기에 동기화되며 asterisk AI 시간표 안내에 반영됩니다.
                </span>
              </div>

              {/* Actions */}
              <div className="settings-modal-footer">
                <button
                  type="button"
                  className="settings-btn settings-btn--secondary"
                  onClick={onClose}
                  disabled={isSaving || isUploading}
                >
                  닫기
                </button>
                <button
                  type="submit"
                  className="settings-btn settings-btn--primary"
                  disabled={isSaving || isUploading || !displayName.trim()}
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={13} className="spin" aria-hidden="true" />
                      <span>저장 중...</span>
                    </>
                  ) : (
                    <>
                      <Check size={13} aria-hidden="true" />
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
