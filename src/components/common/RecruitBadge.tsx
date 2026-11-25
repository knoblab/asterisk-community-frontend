import React from 'react';
import type { PostRecruitMeta } from '../../types';
import { Users, ShoppingBag, Search, CheckCircle2 } from 'lucide-react';

interface RecruitBadgeProps {
  meta?: PostRecruitMeta;
  className?: string;
}

export const RecruitBadge: React.FC<RecruitBadgeProps> = ({ meta, className = '' }) => {
  if (!meta) return null;

  const { type, status, currentCount, maxCount } = meta;

  const getStatusLabel = () => {
    if (type === 'lost_found') {
      return status === 'resolved' ? '해결됨' : '찾는 중';
    }
    return status === 'closed' ? '마감' : '모집 중';
  };

  const getIcon = () => {
    switch (type) {
      case 'team':
        return <Users size={12} />;
      case 'pot':
        return <ShoppingBag size={12} />;
      case 'lost_found':
        return status === 'resolved' ? <CheckCircle2 size={12} /> : <Search size={12} />;
      default:
        return <Users size={12} />;
    }
  };

  const getTypeLabel = () => {
    switch (type) {
      case 'team':
        return '팀원';
      case 'pot':
        return '기숙사팟';
      case 'lost_found':
        return '분실물';
      default:
        return '';
    }
  };

  const isClosed = status === 'closed' || status === 'resolved';

  return (
    <span
      className={`recruit-status-badge ${type} ${status} ${isClosed ? 'is-closed' : 'is-active'} ${className}`.trim()}
      title={`${getTypeLabel()} · ${getStatusLabel()}`}
    >
      <span className="recruit-badge-icon">{getIcon()}</span>
      <span className="recruit-badge-text">
        <span className="recruit-badge-type">{getTypeLabel()}</span>
        <span className="recruit-badge-status">{getStatusLabel()}</span>
      </span>

      {type !== 'lost_found' && maxCount !== undefined && maxCount > 0 && (
        <span className="recruit-badge-count">
          {currentCount || 1}/{maxCount}명
        </span>
      )}
    </span>
  );
};
