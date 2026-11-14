import React from 'react';
import { PenSquare } from 'lucide-react';
import { useBoardStore } from '../../stores/useBoardStore';
import { useUIStore } from '../../stores/useUIStore';
import type { PostCategory } from '../../types';

interface CategoryTabsProps {
  onWriteClick?: () => void;
}

export const CategoryTabs: React.FC<CategoryTabsProps> = ({ onWriteClick }) => {
  const { selectedCategory, setCategory, totalPosts, posts, getFilteredPosts } = useBoardStore();
  const mobileTab = useUIStore((state) => state.mobileTab);

  const isPopular = mobileTab === 'popular';
  const displayedCount = isPopular ? getFilteredPosts().length : (totalPosts || posts.length);

  const categories: (PostCategory | '전체')[] = [
    '전체',
    '질문',
    '리뷰',
    '자료',
    '정보',
    '공지',
    '이벤트',
    '잡담',
  ];

  return (
    <>
      {/* Desktop Toolbar (>= 768px): Unified single-line layout */}
      <div className="board-toolbar board-toolbar-desktop">
        <div className="board-toolbar-left">
          <div className="board-filters" role="tablist" aria-label="게시글 카테고리 필터">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setCategory(cat as PostCategory)}
                  className={`board-filter-btn ${isSelected ? 'active' : ''}`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
          <span className="board-toolbar-count">
            {isPopular ? `인기 게시글 ${displayedCount}개` : `전체 게시글 ${displayedCount}개`}
          </span>
        </div>

        {onWriteClick && (
          <button
            onClick={onWriteClick}
            className="top-class-badge board-toolbar-write-btn"
            type="button"
          >
            <PenSquare size={13} />
            <span>새 글 작성</span>
          </button>
        )}
      </div>

      {/* Mobile Toolbar (< 768px): Dedicated 2-tier layout (count & write on top, tags below) */}
      <div className="board-toolbar-mobile">
        <div className="board-mobile-subbar">
          <span className="board-toolbar-count">
            {isPopular ? `인기 게시글 ${displayedCount}개` : `전체 게시글 ${displayedCount}개`}
          </span>

          {onWriteClick && (
            <button
              onClick={onWriteClick}
              className="top-class-badge board-toolbar-write-btn"
              type="button"
            >
              <PenSquare size={13} />
              <span>새 글 작성</span>
            </button>
          )}
        </div>

        <div className="board-filters-mobile" role="tablist" aria-label="게시글 카테고리 필터">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setCategory(cat as PostCategory)}
                className={`board-filter-btn ${isSelected ? 'active' : ''}`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
