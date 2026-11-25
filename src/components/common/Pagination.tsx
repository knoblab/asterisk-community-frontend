import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  maxPageButtons?: number;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 15, 25, 50],
  maxPageButtons = 5,
  className = '',
}) => {
  if (totalPages <= 1 && (!pageSize || !onPageSizeChange)) {
    // If only 1 page and no page size selector, still show totalItems if available
    if (totalItems !== undefined && totalItems > 0) {
      return (
        <div className={`pagination-container ${className}`}>
          <div className="pagination-info">
            총 <strong>{totalItems}</strong>개 항목 (1 / 1 페이지)
          </div>
        </div>
      );
    }
    return null;
  }

  // Calculate window of visible page numbers
  let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
  if (endPage - startPage + 1 < maxPageButtons) {
    startPage = Math.max(1, endPage - maxPageButtons + 1);
  }

  const pages: number[] = [];
  for (let p = startPage; p <= endPage; p++) {
    pages.push(p);
  }

  const startIndex = pageSize ? (currentPage - 1) * pageSize + 1 : 1;
  const endIndex = pageSize && totalItems !== undefined ? Math.min(currentPage * pageSize, totalItems) : null;

  return (
    <div className={`pagination-container ${className}`}>
      {totalItems !== undefined && (
        <div className="pagination-info">
          총 <strong>{totalItems}</strong>개 {endIndex !== null ? `(${startIndex}-${endIndex} 표시)` : ''} · {currentPage} / {Math.max(1, totalPages)} 페이지
        </div>
      )}

      <div className="pagination-controls">
        {/* First Page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="page-btn nav-btn"
          title="첫 페이지"
          aria-label="첫 페이지"
        >
          <ChevronsLeft size={14} />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="page-btn nav-btn"
          title="이전 페이지"
          aria-label="이전 페이지"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Ellipsis before if needed */}
        {startPage > 1 && (
          <>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              className="page-btn"
            >
              1
            </button>
            {startPage > 2 && <span className="pagination-ellipsis">…</span>}
          </>
        )}

        {/* Number Buttons: 1, 2, 3, 4, 5... */}
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`page-btn ${currentPage === p ? 'active' : ''}`}
            aria-current={currentPage === p ? 'page' : undefined}
          >
            {p}
          </button>
        ))}

        {/* Ellipsis after if needed */}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="pagination-ellipsis">…</span>}
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              className="page-btn"
            >
              {totalPages}
            </button>
          </>
        )}

        {/* Next Page */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="page-btn nav-btn"
          title="다음 페이지"
          aria-label="다음 페이지"
        >
          <ChevronRight size={14} />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="page-btn nav-btn"
          title="마지막 페이지"
          aria-label="마지막 페이지"
        >
          <ChevronsRight size={14} />
        </button>
      </div>

      {pageSize && onPageSizeChange && (
        <div className="pagination-pagesize">
          <label htmlFor="admin-pagesize-select">표시 개수:</label>
          <select
            id="admin-pagesize-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="pagination-select"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}개씩
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
