import React from 'react';
import { Flame } from 'lucide-react';
import { useBoardStore } from '../../stores/useBoardStore';
import { useUIStore } from '../../stores/useUIStore';

interface BoardHeaderProps {
  onWriteClick?: () => void;
}

export const BoardHeader: React.FC<BoardHeaderProps> = () => {
  const totalPosts = useBoardStore((state) => state.totalPosts);
  const posts = useBoardStore((state) => state.posts);
  const getFilteredPosts = useBoardStore((state) => state.getFilteredPosts);
  const mobileTab = useUIStore((state) => state.mobileTab);

  const isPopular = mobileTab === 'popular';
  const displayedCount = isPopular ? getFilteredPosts().length : (totalPosts || posts.length);

  return (
    <div className="board-head">
      <div className="board-meta-line">
        <span className="board-meta-badge">
          {isPopular ? <Flame size={13} /> : '*'}
          <span>{isPopular ? 'POPULAR ARCHIVE' : 'LIVE FORUM'}</span>
        </span>
        <span className="board-meta-sep">/</span>
        <span className="board-meta-count">
          {isPopular ? `인기 게시글 ${displayedCount}개` : `전체 게시글 ${displayedCount}개`}
        </span>
      </div>
    </div>
  );
};
