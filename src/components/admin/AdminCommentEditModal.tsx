import React, { useState, useEffect } from 'react';
import { Edit3, X, Save } from 'lucide-react';
import type { Comment } from '../../types';

interface AdminCommentEditModalProps {
  comment: Comment | null;
  onClose: () => void;
  onSave: (commentId: string, newBody: string) => Promise<void>;
}

export const AdminCommentEditModal: React.FC<AdminCommentEditModalProps> = ({
  comment,
  onClose,
  onSave,
}) => {
  const [body, setBody] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (comment) {
      // If comment body has reply tag prefix [REPLY_TO:...], keep or clean it
      const clean = (comment.body || '').replace(/^\[REPLY_TO:[^\]]+\]\n?/, '');
      setBody(clean);
    }
  }, [comment]);

  if (!comment) return null;

  const handleSave = async () => {
    if (!body.trim()) return;
    setIsSaving(true);
    try {
      // preserve reply tag prefix if originally present
      const match = (comment.body || '').match(/^(\[REPLY_TO:[^\]]+\]\n?)/);
      const prefix = match ? match[1] : '';
      await onSave(comment.id, `${prefix}${body.trim()}`);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="admin-modal-head">
          <div className="admin-modal-title">
            <Edit3 size={18} />
            <h2>댓글 내용 수정</h2>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="admin-modal-body">
          <div className="admin-form-group">
            <label>작성자</label>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-black)' }}>
              {comment.author} ({comment.authorEmail || comment.authorId})
            </div>
          </div>

          <div className="admin-form-group">
            <label>댓글 본문</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="댓글 내용을 입력하세요"
              rows={6}
              disabled={isSaving}
            />
          </div>

          <div className="admin-modal-footer">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              취소
            </button>
            <button
              type="button"
              className="button primary"
              onClick={handleSave}
              disabled={isSaving || !body.trim()}
            >
              <Save size={13} />
              <span>{isSaving ? '저장 중...' : '변경사항 저장'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
