import React, { useState, useRef } from 'react';
import {
  Bold, Italic, Image as ImageIcon, Link as LinkIcon, ArrowLeft, X,
  Heading, Code, Quote, Table, ListCheck, Strikethrough, Eye, Edit3, EyeOff,
  UploadCloud, Loader2, Paperclip, Sparkles, Wand2, BarChart2, Users, Plus, Trash2, Zap, CheckSquare, Lock, ShoppingBag, Search
} from 'lucide-react';
import { useBoardStore } from '../../stores/useBoardStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { LoginModal } from '../LoginModal';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { ServerStatusNotice } from '../common/ServerStatusNotice';
import { useSlowLoading } from '../../hooks/useSlowLoading';
import type { PostCategory, Post, RecruitType, PostRecruitMeta, PostPoll } from '../../types';
import { canWriteContent, isStudentCouncilPresident } from '../../utils/member';
import { isAdminUser } from '../../constants/admin';
import { validateUploadFile, sanitizeOriginalFilename } from '../../utils/fileSecurity';

interface CreatePostPageProps {
  onBack: () => void;
  editPost?: Post;
}

export const CreatePostPage: React.FC<CreatePostPageProps> = ({ onBack, editPost }) => {
  const { addPost, updatePost } = useBoardStore();
  const { user } = useAuthStore();
  const addToast = useUIStore((state) => state.addToast);

  const [title, setTitle] = useState(editPost?.title || '');
  const [body, setBody] = useState(editPost?.body || '');
  const [category, setCategory] = useState<PostCategory>(editPost?.category || '잡담');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(!user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const isSlowSubmitting = useSlowLoading(isSubmitting, 3500);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Options
  const [spoilerProtection, setSpoilerProtection] = useState(
    Boolean(editPost?.isSpoiler || editPost?.body?.startsWith('[스포일러 주의]'))
  );

  // Image modal & upload states
  const [isImageUrlModalOpen, setIsImageUrlModalOpen] = useState(false);
  const [imageModalTab, setImageModalTab] = useState<'upload' | 'url'>('upload');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 2-1: Recruit / Lost & Found badge state
  const [enableRecruit, setEnableRecruit] = useState(Boolean(editPost?.recruitMeta));
  const [recruitType, setRecruitType] = useState<RecruitType>(editPost?.recruitMeta?.type || 'team');
  const [recruitMaxCount, setRecruitMaxCount] = useState<number>(editPost?.recruitMeta?.maxCount || 4);

  // 2-3: Quick Poll state
  const [enablePoll, setEnablePoll] = useState(Boolean(editPost?.poll));
  const [pollTitle, setPollTitle] = useState(editPost?.poll?.title || '');
  const [pollOptions, setPollOptions] = useState<string[]>(
    editPost?.poll?.options ? editPost.poll.options.map((o) => o.text) : ['', '']
  );
  const [pollIsMultiple, setPollIsMultiple] = useState(Boolean(editPost?.poll?.isMultiple));
  const [pollIsAnonymous, setPollIsAnonymous] = useState(Boolean(editPost?.poll?.isAnonymous));

  // 3-2: Auto AI first reply state
  const [autoAiReply, setAutoAiReply] = useState(Boolean(!editPost && category === '질문'));

  // 3-3: AI Writing Assistant state
  const [isAiAssisting, setIsAiAssisting] = useState(false);
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);

  const handleAiAssist = async (action: 'summarize' | 'latex_markdown_fix' | 'refine') => {
    if (!body.trim()) {
      addToast('먼저 본문 내용을 입력해 주세요.', 'info');
      return;
    }
    setIsAiAssisting(true);
    setIsAiMenuOpen(false);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
      const res = await fetch(`${API_BASE_URL}/ai/assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, text: body, title }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result) {
          if (action === 'summarize') {
            setBody(`> [!NOTE] **AI 3줄 핵심 요약**\n${data.result.split('\n').map((l: string) => `> ${l}`).join('\n')}\n\n${body}`);
            addToast('3줄 요약이 본문 상단에 추가되었습니다.', 'success');
          } else {
            setBody(data.result);
            addToast('AI 도우미가 본문을 교정했습니다.', 'success');
          }
        }
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.error || 'AI 도우미 호출에 실패했습니다.', 'error');
      }
    } catch {
      addToast('서버 연결 실패', 'error');
    } finally {
      setIsAiAssisting(false);
    }
  };

  const isAdmin = isAdminUser(user?.uid, user?.email);
  const isPresident = isStudentCouncilPresident(user?.email, user?.uid);
  const categories: PostCategory[] = ['질문', '리뷰', '자료', '정보', '잡담'];
  if (isAdmin || isPresident) {
    categories.unshift('공지');
  }
  const canWrite = canWriteContent(user?.uid, user?.email);

  const insertTextAtCursor = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;

      setBody((prevBody) => {
        const textToUse = typeof prevBody === 'string' ? prevBody : textarea.value;
        const s = Math.min(start, textToUse.length);
        const e = Math.min(end, textToUse.length);
        const selected = textToUse.substring(s, e) || defaultText;
        const replacement = `${before}${selected}${after}`;
        return textToUse.substring(0, s) + replacement + textToUse.substring(e);
      });

      setTimeout(() => {
        try {
          textarea.focus();
          const newPos = start + before.length + defaultText.length;
          textarea.setSelectionRange(newPos, newPos);
        } catch (_) {}
      }, 50);
    } else {
      setBody((prev) => `${prev || ''}${prev && !prev.endsWith('\n') ? '\n\n' : ''}${before}${defaultText}${after}\n`);
    }
  };

  const handleFormat = (type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'heading' | 'code' | 'math' | 'quote' | 'table' | 'task' | 'link' | 'spoiler') => {
    switch (type) {
      case 'bold':
        insertTextAtCursor('**', '**', '굵은 텍스트');
        break;
      case 'italic':
        insertTextAtCursor('*', '*', '기울임 텍스트');
        break;
      case 'underline':
        insertTextAtCursor('<u>', '</u>', '밑줄 텍스트');
        break;
      case 'strikethrough':
        insertTextAtCursor('~~', '~~', '취소선 텍스트');
        break;
      case 'spoiler':
        insertTextAtCursor('||', '||', '스포일러 내용');
        break;
      case 'heading':
        insertTextAtCursor('\n### ', '', '제목');
        break;
      case 'code':
        insertTextAtCursor('\n```javascript\n', '\n```\n', '// 여기에 코드를 입력하세요');
        break;
      case 'math':
        insertTextAtCursor('$', '$', '\\sqrt{x}');
        break;
      case 'quote':
        insertTextAtCursor('\n> ', '', '인용문 내용을 입력하세요');
        break;
      case 'table':
        insertTextAtCursor('\n| 항목 | 내용 | 비고 |\n| --- | --- | --- |\n| ', ' | 값 | 예시 |\n', '제목');
        break;
      case 'task':
        insertTextAtCursor('\n- [ ] ', '', '할 일 항목');
        break;
      case 'link': {
        const url = window.prompt('링크 URL을 입력하세요:', 'https://');
        if (url && url.trim()) {
          insertTextAtCursor('[', `](${url.trim()})`, '링크 텍스트');
        }
        break;
      }
    }
  };

  const handleInsertImageUrl = () => {
    const rawUrl = imageUrlInput.trim();
    if (!rawUrl) return;
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        addToast('안전하지 않은 URL 프로토콜입니다. http 또는 https만 가능합니다.', 'error');
        return;
      }
    } catch {
      addToast('올바른 URL 형식이 아닙니다.', 'error');
      return;
    }

    insertTextAtCursor(`\n![이미지](${rawUrl})\n`, '', '');
    addToast('이미지 URL이 본문에 삽입되었습니다.', 'success');
    setImageUrlInput('');
    setIsImageUrlModalOpen(false);
  };

  const uploadAndInsertFile = async (file: File) => {
    const validation = validateUploadFile(file);
    if (!validation.valid) {
      addToast(validation.error || '유효하지 않은 파일입니다.', 'error');
      return;
    }

    setIsUploadingImage(true);
    try {
      const { uploadAttachment } = useAuthStore.getState();
      const result = await uploadAttachment(file);
      const cleanName = sanitizeOriginalFilename(file.name || result.originalName);
      const fileDownloadUrl = `${result.url}${result.url.includes('?') ? '&' : '?'}name=${encodeURIComponent(cleanName)}`;

      if (result.fileType === 'image') {
        insertTextAtCursor(`\n\n![${cleanName}](${result.url})\n\n`, '', '');
        addToast('이미지가 본문에 성공적으로 삽입되었습니다.', 'success');
      } else if (result.fileType === 'video') {
        insertTextAtCursor(`\n\n[동영상: ${cleanName}](${result.url})\n\n`, '', '');
        addToast('동영상이 본문에 성공적으로 첨부되었습니다.', 'success');
      } else if (result.fileType === 'audio') {
        insertTextAtCursor(`\n\n[오디오: ${cleanName}](${result.url})\n\n`, '', '');
        addToast('오디오가 본문에 성공적으로 첨부되었습니다.', 'success');
      } else {
        insertTextAtCursor(`\n\n[첨부파일: ${cleanName}](${fileDownloadUrl})\n\n`, '', '');
        addToast('파일이 본문에 성공적으로 첨부되었습니다.', 'success');
      }
      setIsImageUrlModalOpen(false);
    } catch (err: any) {
      console.error('Failed to upload file:', err);
      addToast(err.message || '파일 업로드에 실패했습니다.', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAndInsertFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      e.preventDefault();
      await uploadAndInsertFile(file);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile();
      if (file) {
        e.preventDefault();
        await uploadAndInsertFile(file);
        break;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleFormat('bold');
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        handleFormat('italic');
      }
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (!canWrite) {
      addToast('현재 계정은 게시글 작성 권한이 없습니다.', 'info');
      return;
    }

    if (!title.trim() || !body.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitFailed(false);

    const finalBody = body.trim();
    const finalAuthor = user.displayName || user.email?.split('@')[0] || '사용자';

    const postRecruitMeta: PostRecruitMeta | undefined = enableRecruit
      ? {
          type: recruitType,
          status: editPost?.recruitMeta?.status || (recruitType === 'lost_found' ? 'searching' : 'open'),
          currentCount: editPost?.recruitMeta?.currentCount || 1,
          maxCount: recruitType !== 'lost_found' ? Math.max(2, Number(recruitMaxCount) || 4) : undefined,
        }
      : undefined;

    const validPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    const postPoll: PostPoll | undefined = enablePoll && pollTitle.trim() && validPollOptions.length >= 2
      ? {
          id: editPost?.poll?.id || `poll_${Date.now()}`,
          title: pollTitle.trim(),
          options: validPollOptions.map((text, idx) => {
            const existing = editPost?.poll?.options?.find((o) => o.text === text);
            return {
              id: existing?.id || `opt_${idx + 1}`,
              text,
              voterUids: existing?.voterUids || [],
            };
          }),
          isMultiple: pollIsMultiple,
          isAnonymous: pollIsAnonymous,
        }
      : undefined;

    try {
      if (editPost) {
        const updated = await updatePost(editPost.id, {
          category,
          title: title.trim(),
          body: finalBody,
          isSpoiler: spoilerProtection,
          author: finalAuthor,
          isNotice: category === '공지',
          recruitMeta: postRecruitMeta,
          poll: postPoll,
        });
        setIsSubmitting(false);
        if (updated) {
          addToast('게시글이 수정되었습니다.', 'success');
          onBack();
        } else {
          setSubmitFailed(true);
        }
      } else {
        const isSaved = await addPost({
          category,
          title: title.trim(),
          body: finalBody,
          isSpoiler: spoilerProtection,
          author: finalAuthor,
          authorId: user.uid,
          authorEmail: user.email || user.uid,
          isNotice: category === '공지',
          recruitMeta: postRecruitMeta,
          poll: postPoll,
          autoAiReply: Boolean(autoAiReply),
        });
        setIsSubmitting(false);
        if (isSaved) {
          addToast('게시글이 성공적으로 등록되었습니다.', 'success');
          onBack();
        } else {
          setSubmitFailed(true);
        }
      }
    } catch {
      setIsSubmitting(false);
      setSubmitFailed(true);
    }
  };

  const toolbarIconBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-sm)',
    transition: 'background-color 0.15s ease',
  };

  const getAddonChipStyle = (isActive: boolean, accentBlue = false): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: '32px',
    padding: '0 12px',
    borderRadius: 'var(--radius-sm, 2px)',
    fontSize: '12px',
    fontFamily: 'var(--font-sans)',
    fontWeight: isActive ? 700 : 500,
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'all 0.15s ease',
    backgroundColor: isActive
      ? accentBlue
        ? 'rgba(37, 99, 235, 0.1)'
        : 'var(--color-black, #000000)'
      : 'var(--color-bg-tertiary, #FFFFFF)',
    color: isActive
      ? accentBlue
        ? 'var(--color-mention-blue, #2563EB)'
        : 'var(--color-white, #FFFFFF)'
      : 'var(--color-text-secondary)',
    border: isActive
      ? accentBlue
        ? '1px solid rgba(37, 99, 235, 0.45)'
        : '1px solid var(--color-black, #000000)'
      : '1px solid var(--color-border-default)',
  });

  return (
    <div className="panel editor" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          setIsLoginModalOpen(false);
          if (!user) onBack();
        }}
        message="게시글을 작성하려면 로그인이 필요합니다."
      />

      {/* Global Hidden File Input for File/Media Upload */}
      <input
        type="file"
        ref={imageFileInputRef}
        accept="image/*,video/mp4,video/webm,video/ogg,audio/*,.mp3,.wav,.m4a,.flac,.aac,.opus,.pdf,.zip,.7z,.tar,.gz,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx"
        onChange={handleImageFileChange}
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'none' }}
      />

      {/* File/Image Modal (File Upload & URL Insertion) */}
      {isImageUrlModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
          onClick={() => {
            if (!isUploadingImage) setIsImageUrlModalOpen(false);
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              border: '1px solid var(--color-border-default)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                파일 및 미디어 첨부
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!isUploadingImage) setIsImageUrlModalOpen(false);
                }}
                disabled={isUploadingImage}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: isUploadingImage ? 'not-allowed' : 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', borderBottom: '1px solid var(--color-border-default)', paddingBottom: '8px' }}>
              <button
                type="button"
                onClick={() => setImageModalTab('upload')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: imageModalTab === 'upload' ? 'var(--color-bg-secondary)' : 'transparent',
                  color: imageModalTab === 'upload' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  fontWeight: imageModalTab === 'upload' ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                파일 업로드
              </button>
              <button
                type="button"
                onClick={() => setImageModalTab('url')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: imageModalTab === 'url' ? 'var(--color-bg-secondary)' : 'transparent',
                  color: imageModalTab === 'url' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  fontWeight: imageModalTab === 'url' ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                URL로 삽입
              </button>
            </div>

            {imageModalTab === 'upload' ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isUploadingImage) imageFileInputRef.current?.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (isUploadingImage) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file) uploadAndInsertFile(file);
                }}
                style={{
                  border: '2px dashed var(--color-border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '36px 20px',
                  textAlign: 'center',
                  cursor: isUploadingImage ? 'wait' : 'pointer',
                  backgroundColor: 'var(--color-bg-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                }}
              >
                {isUploadingImage ? (
                  <>
                    <Loader2 size={36} className="pdf-animate-spin" style={{ color: 'var(--color-functional-red)' }} />
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      파일 업로드 중...
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      잠시만 기다려주세요.
                    </div>
                  </>
                ) : (
                  <>
                    <UploadCloud size={36} style={{ color: 'var(--color-text-secondary)' }} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        클릭하여 첨부할 파일 선택
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                        또는 여기에 파일(사진, 동영상, 오디오, PDF, ZIP 등)을 드래그 앤 드롭하세요
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', opacity: 0.8 }}>
                      최대 25MB · 사진, 동영상, 오디오, PDF, ZIP 등 일반 파일 지원
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg 또는 미디어 링크"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: 'var(--radius-sm)',
                    outline: 'none',
                    fontSize: '14px',
                    marginBottom: '16px',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setIsImageUrlModalOpen(false)}
                    style={{
                      padding: '7px 16px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border-default)',
                      backgroundColor: 'transparent',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertImageUrl}
                    disabled={!imageUrlInput.trim()}
                    style={{
                      padding: '7px 16px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-black)',
                      backgroundColor: 'var(--color-black)',
                      color: 'var(--color-white)',
                      cursor: !imageUrlInput.trim() ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      opacity: !imageUrlInput.trim() ? 0.5 : 1,
                    }}
                  >
                    삽입
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. Top Navigation & Mode Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--color-border-default)',
        }}
      >
        <button onClick={onBack} className="back" type="button" style={{ margin: 0 }}>
          <ArrowLeft size={14} />
          <span>목록으로</span>
        </button>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: '12.5px', fontWeight: 600 }}>
          {editPost ? 'EDIT POST · 게시글 수정' : 'NEW POST · 새 게시글 작성'}
        </span>
      </div>

      {/* 2. Category Selector & Title Input Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '11.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--color-text-secondary)',
              marginRight: '4px',
            }}
          >
            분류
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {categories.map((c) => {
              const isSelected = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setCategory(c);
                    if (!editPost && c === '질문') {
                      setAutoAiReply(true);
                    }
                  }}
                  style={{
                    height: '28px',
                    padding: '0 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12.5px',
                    fontWeight: isSelected ? 700 : 500,
                    backgroundColor: isSelected ? 'var(--color-black)' : 'var(--color-bg-secondary)',
                    color: isSelected ? 'var(--color-white)' : 'var(--color-text-secondary)',
                    border: isSelected ? '1px solid var(--color-black)' : '1px solid var(--color-border-default)',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <input
          type="text"
          value={title}
          disabled={isSubmitting}
          onChange={(e) => {
            setTitle(e.target.value);
            if (submitFailed) setSubmitFailed(false);
          }}
          placeholder="제목을 입력하세요"
          style={{
            width: '100%',
            padding: '10px 14px',
            backgroundColor: 'var(--color-bg-tertiary, #FFFFFF)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-sm)',
            outline: 'none',
            fontSize: isMobile ? '17px' : '20px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            boxSizing: 'border-box',
            opacity: isSubmitting ? 0.7 : 1,
            transition: 'border-color 0.15s ease',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--color-black)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--color-border-default)')}
        />
      </div>

      {/* 3. Main Editor Studio Box */}
      <div
        style={{
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--color-bg-tertiary, #FFFFFF)',
          boxShadow: 'var(--shadow-subtle)',
        }}
      >
        {/* 3-A. Top Formatting & AI Assistant Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            padding: isMobile ? '8px 10px' : '8px 14px',
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-default)',
            borderTopLeftRadius: 'var(--radius-md)',
            borderTopRightRadius: 'var(--radius-md)',
            color: 'var(--color-text-secondary)',
            userSelect: 'none',
          }}
        >
          {/* Left Formatting & File Attachment Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            {/* Text Style Group */}
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => handleFormat('heading')}
                title="제목 추가 (###)"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Heading size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('bold')}
                title="굵게 (**bold**)"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Bold size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('italic')}
                title="기울임 (*italic*)"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Italic size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('strikethrough')}
                title="취소선 (~~strikethrough~~)"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Strikethrough size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('spoiler')}
                title="스포일러 블러 (||spoiler||)"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <EyeOff size={15} />
              </button>
            </div>

            <span style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-border-default)', margin: '0 4px' }} />

            {/* Elements & Math Group */}
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => handleFormat('quote')}
                title="인용구 (> quote)"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Quote size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('code')}
                title="코드 블록 (```code```)"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Code size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('math')}
                title="LaTeX 수식 삽입 ($\sqrt{x}$)"
                style={{
                  ...toolbarIconBtnStyle,
                  width: 'auto',
                  padding: '0 6px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>fx</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat('table')}
                title="표 / 테이블 (| col1 | col2 |)"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Table size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('task')}
                title="체크리스트 (- [ ])"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <ListCheck size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('link')}
                title="하이퍼링크 ([텍스트](URL))"
                style={toolbarIconBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <LinkIcon size={15} />
              </button>
            </div>

            <span style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-border-default)', margin: '0 4px' }} />

            {/* File & Media Upload Group */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  if (!isUploadingImage) imageFileInputRef.current?.click();
                }}
                disabled={isUploadingImage}
                title="내 PC에서 파일 바로 첨부 (최대 25MB)"
                style={{
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                  backgroundColor: 'var(--color-bg-tertiary, #FFFFFF)',
                  cursor: isUploadingImage ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  height: '28px',
                  padding: '0 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '11.5px',
                }}
              >
                {isUploadingImage ? (
                  <Loader2 size={13} className="pdf-animate-spin" />
                ) : (
                  <Paperclip size={13} />
                )}
                <span>{isUploadingImage ? '업로드 중...' : '파일 첨부'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isUploadingImage) {
                    setImageModalTab('upload');
                    setIsImageUrlModalOpen(true);
                  }
                }}
                disabled={isUploadingImage}
                title="드래그 앤 드롭 또는 이미지 URL 삽입"
                style={{
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-secondary)',
                  backgroundColor: 'transparent',
                  cursor: isUploadingImage ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '28px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 500,
                  fontSize: '11.5px',
                }}
              >
                <ImageIcon size={12} />
                <span>URL</span>
              </button>
            </div>
          </div>

          {/* Right Group: AI Writing Assistant & Preview Mode */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                disabled={isAiAssisting}
                onClick={() => setIsAiMenuOpen(!isAiMenuOpen)}
                style={{
                  backgroundColor: isAiMenuOpen ? 'var(--color-black)' : 'var(--color-bg-tertiary, #FFFFFF)',
                  border: '1px solid var(--color-border-default)',
                  color: isAiMenuOpen ? 'var(--color-white)' : 'var(--color-text-primary)',
                  cursor: isAiAssisting ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  height: '28px',
                  padding: '0 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
                title="AI 글쓰기 도우미 (요약, 수식 교정, 문장 다듬기)"
              >
                {isAiAssisting ? <Loader2 size={13} className="pdf-animate-spin" /> : <Sparkles size={13} />}
                <span>{isAiAssisting ? 'AI 처리 중...' : 'AI 글 도우미'}</span>
              </button>

              {isAiMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    backgroundColor: 'var(--color-bg-tertiary, #FFFFFF)',
                    border: '1px solid var(--color-black)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-elevated)',
                    zIndex: 100,
                    minWidth: '190px',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '4px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleAiAssist('summarize')}
                    style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      borderRadius: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      color: 'var(--color-text-primary)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Wand2 size={13} />
                    <span>3줄 핵심 요약 추가</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiAssist('latex_markdown_fix')}
                    style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      borderRadius: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      color: 'var(--color-text-primary)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Code size={13} />
                    <span>수식·마크다운 문법 교정</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiAssist('refine')}
                    style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      borderRadius: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      color: 'var(--color-text-primary)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Quote size={13} />
                    <span>문장 다듬기 (톤 개선)</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              style={{
                backgroundColor: isPreviewMode ? 'var(--color-black)' : 'var(--color-bg-tertiary, #FFFFFF)',
                border: '1px solid var(--color-border-default)',
                color: isPreviewMode ? 'var(--color-white)' : 'var(--color-text-primary)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                height: '28px',
                padding: '0 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11.5px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {isPreviewMode ? <Edit3 size={13} /> : <Eye size={13} />}
              <span>{isPreviewMode ? '편집하기' : '미리보기'}</span>
            </button>
          </div>
        </div>

        {/* Uploading Banner */}
        {isUploadingImage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 16px',
              backgroundColor: 'var(--color-bg-secondary)',
              borderBottom: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)',
              fontSize: '12.5px',
              fontWeight: 600,
            }}
          >
            <Loader2 size={15} className="pdf-animate-spin" />
            <span>파일을 업로드하고 본문에 삽입하는 중입니다 (최대 25MB)...</span>
          </div>
        )}

        {/* 3-B. Editor Body (Textarea or Live Markdown/KaTeX Preview) */}
        {isPreviewMode ? (
          <div
            style={{
              minHeight: '360px',
              padding: isMobile ? '14px' : '20px',
              backgroundColor: 'var(--color-bg-tertiary, #FFFFFF)',
            }}
          >
            {body.trim() ? (
              <MarkdownRenderer content={body} />
            ) : (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '13.5px' }}>
                작성된 본문 내용이 없습니다.
              </div>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            disabled={isSubmitting}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (submitFailed) setSubmitFailed(false);
            }}
            onKeyDown={handleKeyDown}
            onDrop={handleDrop}
            onPaste={handlePaste}
            onDragOver={(e) => e.preventDefault()}
            placeholder="GitHub 마크다운(GFM) 및 LaTeX 수식($\sqrt{x}$, $$...$$)을 지원합니다. (이미지 드래그&드롭 및 Ctrl+V 붙여넣기 가능)"
            style={{
              width: '100%',
              minHeight: '360px',
              padding: isMobile ? '14px' : '20px',
              backgroundColor: 'transparent',
              color: 'var(--color-text-primary)',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.65,
              fontSize: '14.5px',
              boxSizing: 'border-box',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          />
        )}

        {/* 3-C. Bottom Integrated Add-on & Options Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '10px 14px',
            backgroundColor: 'var(--color-bg-secondary)',
            borderTop: '1px solid var(--color-border-default)',
            borderBottomLeftRadius: 'var(--radius-md)',
            borderBottomRightRadius: 'var(--radius-md)',
          }}
        >
          {/* Left: Attachable Widgets (Recruit Badge & Quick Poll) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-secondary)', marginRight: '2px' }}>
              첨부 위젯
            </span>
            <button
              type="button"
              onClick={() => setEnableRecruit(!enableRecruit)}
              style={getAddonChipStyle(enableRecruit)}
              title="팀원 모집, 기숙사/배달 팟, 분실물 상태 배지를 게시글에 추가합니다."
            >
              <Users size={13} />
              <span>{enableRecruit ? '모집·상태 배지 사용 중' : '모집·상태 배지'}</span>
            </button>

            <button
              type="button"
              onClick={() => setEnablePoll(!enablePoll)}
              style={getAddonChipStyle(enablePoll)}
              title="게시글 본문 하단에 실시간 투표를 첨부합니다."
            >
              <BarChart2 size={13} />
              <span>{enablePoll ? '간편 투표 첨부됨' : '투표 추가'}</span>
            </button>
          </div>

          {/* Right: Post Behavior Options (Auto AI Reply & Spoiler) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {!editPost && (
              <button
                type="button"
                onClick={() => setAutoAiReply(!autoAiReply)}
                style={getAddonChipStyle(autoAiReply, true)}
                title="게시글 등록 즉시 asterisk AI가 학내 자료를 바탕으로 첫 답변 댓글을 작성합니다."
              >
                <Zap size={13} />
                <span>AI 자동 첫 답변 {autoAiReply ? 'ON' : 'OFF'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSpoilerProtection((prev) => !prev)}
              style={getAddonChipStyle(spoilerProtection)}
              title="게시글 열람 시 스포일러 주의 안내를 표시합니다."
            >
              <EyeOff size={13} />
              <span>스포일러 방지 {spoilerProtection ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Expandable Configuration Cards (Full Width Stack) */}
      {enableRecruit && (
        <div
          style={{
            padding: '16px 18px',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              <Users size={14} />
              <span>모집 · 분실물 상태 배지 설정</span>
            </div>
            <button
              type="button"
              onClick={() => setEnableRecruit(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', padding: '2px' }}
              title="배지 설정 닫기"
            >
              <X size={15} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'team', label: '팀원 모집', icon: Users },
                  { id: 'pot', label: '기숙사 / 배달 팟', icon: ShoppingBag },
                  { id: 'lost_found', label: '분실물 찾기', icon: Search },
                ] as const
              ).map((item) => {
                const IconComp = item.icon;
                const active = recruitType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRecruitType(item.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      height: '32px',
                      padding: '0 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      fontWeight: active ? 700 : 500,
                      backgroundColor: active ? 'var(--color-black)' : 'var(--color-bg-tertiary, #FFFFFF)',
                      color: active ? 'var(--color-white)' : 'var(--color-text-primary)',
                      border: active ? '1px solid var(--color-black)' : '1px solid var(--color-border-default)',
                      cursor: 'pointer',
                    }}
                  >
                    <IconComp size={13} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {recruitType !== 'lost_found' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px', fontWeight: 600 }}>목표 인원</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-tertiary, #FFFFFF)' }}>
                  <button
                    type="button"
                    onClick={() => setRecruitMaxCount((prev) => Math.max(2, prev - 1))}
                    style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={recruitMaxCount}
                    onChange={(e) => setRecruitMaxCount(Math.max(2, Math.min(50, Number(e.target.value) || 2)))}
                    style={{
                      width: '42px',
                      height: '28px',
                      textAlign: 'center',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      border: 'none',
                      borderLeft: '1px solid var(--color-border-default)',
                      borderRight: '1px solid var(--color-border-default)',
                      outline: 'none',
                      backgroundColor: 'transparent',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setRecruitMaxCount((prev) => Math.min(50, prev + 1))}
                    style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                  >
                    +
                  </button>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>명</span>
              </div>
            )}
          </div>
        </div>
      )}

      {enablePoll && (
        <div
          style={{
            padding: '16px 18px',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              <BarChart2 size={14} />
              <span>간편 투표 설정</span>
            </div>
            <button
              type="button"
              onClick={() => setEnablePoll(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', padding: '2px' }}
              title="투표 설정 닫기"
            >
              <X size={15} />
            </button>
          </div>

          <input
            type="text"
            placeholder="투표 질문을 입력하세요 (예: 이번 주말 기숙사 잔류 인원 조사)"
            value={pollTitle}
            onChange={(e) => setPollTitle(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--color-bg-tertiary, #FFFFFF)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-sm)',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pollOptions.map((opt, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11.5px', fontFamily: 'var(--font-mono)', fontWeight: 700, width: '22px', color: 'var(--color-text-secondary)' }}>
                  {idx + 1}.
                </span>
                <input
                  type="text"
                  placeholder={`선택지 ${idx + 1}`}
                  value={opt}
                  onChange={(e) => {
                    const next = [...pollOptions];
                    next[idx] = e.target.value;
                    setPollOptions(next);
                  }}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    fontSize: '12.5px',
                    backgroundColor: 'var(--color-bg-tertiary, #FFFFFF)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: 'var(--radius-sm)',
                    outline: 'none',
                  }}
                />
                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                    style={{
                      background: 'none',
                      border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-sm)',
                      width: '30px',
                      height: '30px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'var(--color-text-secondary)',
                    }}
                    title="선택지 삭제"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--color-border-default)' }}>
            <div>
              {pollOptions.length < 6 && (
                <button
                  type="button"
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    height: '28px',
                    padding: '0 10px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    backgroundColor: 'var(--color-bg-tertiary, #FFFFFF)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={12} />
                  <span>선택지 추가 ({pollOptions.length}/6)</span>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setPollIsMultiple(!pollIsMultiple)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  height: '28px',
                  padding: '0 10px',
                  fontSize: '11.5px',
                  fontWeight: pollIsMultiple ? 700 : 500,
                  backgroundColor: pollIsMultiple ? 'var(--color-black)' : 'var(--color-bg-tertiary, #FFFFFF)',
                  color: pollIsMultiple ? 'var(--color-white)' : 'var(--color-text-secondary)',
                  border: pollIsMultiple ? '1px solid var(--color-black)' : '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                <CheckSquare size={12} />
                <span>복수 선택 허용</span>
              </button>

              <button
                type="button"
                onClick={() => setPollIsAnonymous(!pollIsAnonymous)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  height: '28px',
                  padding: '0 10px',
                  fontSize: '11.5px',
                  fontWeight: pollIsAnonymous ? 700 : 500,
                  backgroundColor: pollIsAnonymous ? 'var(--color-black)' : 'var(--color-bg-tertiary, #FFFFFF)',
                  color: pollIsAnonymous ? 'var(--color-white)' : 'var(--color-text-secondary)',
                  border: pollIsAnonymous ? '1px solid var(--color-black)' : '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                <Lock size={12} />
                <span>익명 투표</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Dedicated Submit Footer Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '6px',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          style={{
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 600,
            backgroundColor: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-sm)',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          취소
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
            {body.length.toLocaleString()} 자
          </span>
          <button
            onClick={handleSubmit}
            disabled={!canWrite || !title.trim() || !body.trim() || isSubmitting || isUploadingImage}
            className="primary"
            type="button"
            style={{
              padding: '9px 26px',
              fontSize: '13.5px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: !user || !title.trim() || !body.trim() || isSubmitting || isUploadingImage ? 0.5 : 1,
            }}
          >
            {isUploadingImage ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                <span>이미지 업로드 중...</span>
              </>
            ) : isSubmitting ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                <span>{editPost ? '수정 중...' : '등록 중...'}</span>
              </>
            ) : (
              editPost ? '수정 완료' : '작성 완료'
            )}
          </button>
        </div>
      </div>

      {(isSlowSubmitting || submitFailed) && (
        <ServerStatusNotice
          message={editPost ? '게시글을 수정할 수 없나요?' : '게시글을 작성할 수 없나요?'}
          variant={submitFailed ? 'error' : 'info'}
          style={{ marginTop: '8px' }}
        />
      )}
    </div>
  );
};
