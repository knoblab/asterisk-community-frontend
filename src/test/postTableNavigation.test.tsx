import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostTable } from '../components/community/PostTable';
import { useBoardStore } from '../stores/useBoardStore';
import type { Post } from '../types';

describe('PostTable Navigation and Mobile Meta Structure', () => {
  const mockPost: Post = {
    id: 'post-test-123',
    title: '테스트 게시글 제목입니다',
    body: '게시글 본문 내용',
    category: '잡담',
    author: '테스트작성자',
    authorId: 'test-user-id',
    authorEmail: 'tester@example.com',
    authorGeneration: '33기',
    createdAt: new Date('2026-10-17T12:30:00').getTime(),
    likes: 5,
    views: 42,
    commentCount: 3,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useBoardStore.setState({
      posts: [mockPost],
      totalPosts: 1,
      currentPage: 1,
      postsPerPage: 15,
      isLoading: false,
      isPageLoading: false,
      hasFetchError: false,
      authorFilterEmail: null,
      authorFilterName: null,
      authorFilterId: null,
      setAuthorFilterEmail: vi.fn(),
    });
  });

  it('navigates to the post when clicking anywhere on the post row, including the author element', () => {
    const handleSelectPost = vi.fn();
    const setAuthorFilterMock = vi.fn();
    useBoardStore.setState({ setAuthorFilterEmail: setAuthorFilterMock });

    render(<PostTable onSelectPost={handleSelectPost} />);

    // 1. Click on the author text in the mobile meta line
    const authorElements = screen.getAllByText(/테스트작성자/);
    expect(authorElements.length).toBeGreaterThan(0);
    fireEvent.click(authorElements[0]);

    // Should call onSelectPost with post id
    expect(handleSelectPost).toHaveBeenCalledWith('post-test-123');
    // Should NEVER trigger author filtering
    expect(setAuthorFilterMock).not.toHaveBeenCalled();

    handleSelectPost.mockClear();

    // 2. Click on the title
    const titleElement = screen.getByText('테스트 게시글 제목입니다');
    fireEvent.click(titleElement);
    expect(handleSelectPost).toHaveBeenCalledWith('post-test-123');
    expect(setAuthorFilterMock).not.toHaveBeenCalled();

    handleSelectPost.mockClear();

    // 3. Click on the category in mobile meta
    const categoryElements = screen.getAllByText('잡담');
    fireEvent.click(categoryElements[0]);
    expect(handleSelectPost).toHaveBeenCalledWith('post-test-123');
    expect(setAuthorFilterMock).not.toHaveBeenCalled();
  });

  it('renders mobile meta information (category, author with generation, date, likes)', () => {
    render(<PostTable onSelectPost={vi.fn()} />);

    // Mobile meta container should be present in the document
    const mobileMeta = document.querySelector('.post-mobile-meta');
    expect(mobileMeta).not.toBeNull();

    // Check category inside mobile meta
    const catSpan = mobileMeta?.querySelector('.post-mobile-cat');
    expect(catSpan?.textContent).toBe('잡담');

    // Check author and generation badge inside mobile meta
    const authorSpan = mobileMeta?.querySelector('.post-mobile-author');
    expect(authorSpan?.textContent).toContain('테스트작성자');
    expect(authorSpan?.textContent).toContain('33기');

    // Check date inside mobile meta
    const dateSpan = mobileMeta?.querySelector('.post-mobile-date');
    expect(dateSpan).not.toBeNull();

    // Check likes inside mobile meta
    const likesSpan = mobileMeta?.querySelector('.post-mobile-likes');
    expect(likesSpan?.textContent).toContain('5');

    // Check title line has title and comment badge
    const titleLine = document.querySelector('.post-title-line');
    expect(titleLine?.querySelector('h3')?.textContent).toBe('테스트 게시글 제목입니다');
    expect(titleLine?.querySelector('.post-comment-badge')?.textContent).toBe('[3]');
  });

  it('does not display likes badge on mobile meta when likes is 0', () => {
    useBoardStore.setState({
      posts: [{ ...mockPost, likes: 0 }],
    });

    render(<PostTable onSelectPost={vi.fn()} />);

    const mobileMeta = document.querySelector('.post-mobile-meta');
    const likesSpan = mobileMeta?.querySelector('.post-mobile-likes');
    expect(likesSpan).toBeNull();
  });
});
