import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ServerStatusNotice } from '../components/common/ServerStatusNotice';
import { CreatePostPage } from '../components/community/CreatePostPage';
import { CommentSection } from '../components/community/CommentSection';
import { PostTable } from '../components/community/PostTable';
import { useAuthStore } from '../stores/useAuthStore';
import { useBoardStore } from '../stores/useBoardStore';
import { useUIStore } from '../stores/useUIStore';

describe('Submission Status Notice & Non-Optimistic Posting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    useAuthStore.setState({
      user: {
        uid: 'test-user-id',
        email: 'cnsh32_1234@cnsh.hs.kr',
        displayName: '테스터',
        photoURL: null,
      },
      loading: false,
    });

    useBoardStore.setState({
      posts: [],
      comments: [],
      totalPosts: 0,
      currentPage: 1,
      postsPerPage: 15,
      isLoading: false,
      isPageLoading: false,
      hasFetchError: false,
      selectedCategory: '전체',
      searchQuery: '',
      sortBy: 'recent',
      authorFilterEmail: null,
      authorFilterId: null,
      authorFilterName: null,
    });

    useUIStore.setState({
      toasts: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ServerStatusNotice Component', () => {
    it('renders with error variant and custom prompt message', () => {
      const { container } = render(
        <ServerStatusNotice message="게시글을 작성할 수 없나요?" variant="error" />
      );

      expect(screen.getByText('게시글을 작성할 수 없나요?')).toBeDefined();
      const link = screen.getByRole('link', { name: /status\.knoblab\.xyz/i });
      expect(link.getAttribute('href')).toBe('https://status.knoblab.xyz');
      expect(container.querySelector('.server-status-notice.error')).toBeDefined();
    });

    it('renders comment and reply messages correctly', () => {
      render(
        <div>
          <ServerStatusNotice message="댓글을 작성할 수 없나요?" />
          <ServerStatusNotice message="답글을 작성할 수 없나요?" />
        </div>
      );

      expect(screen.getByText('댓글을 작성할 수 없나요?')).toBeDefined();
      expect(screen.getByText('답글을 작성할 수 없나요?')).toBeDefined();
    });
  });

  describe('CreatePostPage Failure Handling', () => {
    it('shows "게시글을 작성할 수 없나요?" notice and retains input text on addPost failure', async () => {
      // Mock addPost returning false (server error)
      const mockAddPost = vi.fn().mockResolvedValue(false);
      useBoardStore.setState({ addPost: mockAddPost });

      const handleBack = vi.fn();
      render(<CreatePostPage onBack={handleBack} />);

      const titleInput = screen.getByPlaceholderText('제목을 입력하세요');
      const bodyTextarea = screen.getByPlaceholderText(/GitHub 마크다운/i);
      const submitButton = screen.getByRole('button', { name: '작성 완료' });

      fireEvent.change(titleInput, { target: { value: '실패할 게시글 제목' } });
      fireEvent.change(bodyTextarea, { target: { value: '실패할 게시글 본문 내용' } });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockAddPost).toHaveBeenCalled();
      });

      // Should not navigate back on failure
      expect(handleBack).not.toHaveBeenCalled();

      // Input text should be retained
      expect((titleInput as HTMLInputElement).value).toBe('실패할 게시글 제목');
      expect((bodyTextarea as HTMLTextAreaElement).value).toBe('실패할 게시글 본문 내용');

      // Status notice with link to status.knoblab.xyz should be visible
      await waitFor(() => {
        expect(screen.getByText('게시글을 작성할 수 없나요?')).toBeDefined();
      });
      const link = screen.getByRole('link', { name: /status\.knoblab\.xyz/i });
      expect(link.getAttribute('href')).toBe('https://status.knoblab.xyz');
    });

    it('shows "게시글을 수정할 수 없나요?" notice on edit failure', async () => {
      const mockUpdatePost = vi.fn().mockResolvedValue(false);
      useBoardStore.setState({ updatePost: mockUpdatePost });

      const handleBack = vi.fn();
      const existingPost = {
        id: 'post-123',
        title: '기존 제목',
        body: '기존 내용',
        category: '잡담' as const,
        author: '테스터',
        authorId: 'test-user-id',
        createdAt: 1000,
        likes: 0,
        views: 0,
        commentCount: 0,
      };

      render(<CreatePostPage onBack={handleBack} editPost={existingPost} />);

      const submitButton = screen.getByRole('button', { name: '수정 완료' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockUpdatePost).toHaveBeenCalled();
      });

      expect(handleBack).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByText('게시글을 수정할 수 없나요?')).toBeDefined();
      });
    });
  });

  describe('CommentSection Failure & Non-Optimistic Behavior', () => {
    it('shows "댓글을 작성할 수 없나요?" notice and preserves comment text on addComment failure', async () => {
      const mockAddComment = vi.fn().mockResolvedValue(false);
      useBoardStore.setState({
        addComment: mockAddComment,
        fetchComments: vi.fn(),
        checkAiStatus: vi.fn().mockResolvedValue(false),
      });

      render(<CommentSection postId="post-1" />);

      const commentTextarea = screen.getByPlaceholderText('따뜻한 댓글을 남겨주세요...');
      const submitButton = screen.getByRole('button', { name: /작성/i });

      fireEvent.change(commentTextarea, { target: { value: '등록 실패할 댓글' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockAddComment).toHaveBeenCalled();
      });

      // Text should not be cleared
      expect((commentTextarea as HTMLTextAreaElement).value).toBe('등록 실패할 댓글');

      // Notice should appear with status link
      await waitFor(() => {
        expect(screen.getByText('댓글을 작성할 수 없나요?')).toBeDefined();
      });
      const link = screen.getByRole('link', { name: /status\.knoblab\.xyz/i });
      expect(link.getAttribute('href')).toBe('https://status.knoblab.xyz');
    });

    it('shows "답글을 작성할 수 없나요?" notice and preserves reply text on reply failure', async () => {
      const mockAddComment = vi.fn().mockResolvedValue(false);
      useBoardStore.setState({
        comments: [
          {
            id: 'comment-1',
            postId: 'post-1',
            author: '원댓글작성자',
            authorId: 'user-2',
            body: '원댓글 내용',
            createdAt: 1000,
            likes: 0,
          },
        ],
        addComment: mockAddComment,
        fetchComments: vi.fn(),
        checkAiStatus: vi.fn().mockResolvedValue(false),
      });

      render(<CommentSection postId="post-1" />);

      // Click reply button on the comment
      const replyButton = screen.getByRole('button', { name: /답글/i });
      fireEvent.click(replyButton);

      const replyTextarea = screen.getByPlaceholderText('답글 내용을 입력하세요...');
      fireEvent.change(replyTextarea, { target: { value: '실패할 답글' } });

      const replySubmitButton = screen.getByRole('button', { name: /답글 등록/i });
      fireEvent.click(replySubmitButton);

      await waitFor(() => {
        expect(mockAddComment).toHaveBeenCalled();
      });

      // Reply text should be preserved
      expect((replyTextarea as HTMLTextAreaElement).value).toBe('실패할 답글');

      // Notice should appear with link
      await waitFor(() => {
        expect(screen.getByText('답글을 작성할 수 없나요?')).toBeDefined();
      });
      const link = screen.getByRole('link', { name: /status\.knoblab\.xyz/i });
      expect(link.getAttribute('href')).toBe('https://status.knoblab.xyz');
    });
  });

  describe('PostTable Error Status Notice', () => {
    it('renders "로딩이 되지 않나요?" when hasFetchError is true', () => {
      useBoardStore.setState({
        hasFetchError: true,
        posts: [],
      });

      render(<PostTable onSelectPost={vi.fn()} />);

      expect(screen.getByText('로딩이 되지 않나요?')).toBeDefined();
      const link = screen.getByRole('link', { name: /status\.knoblab\.xyz/i });
      expect(link.getAttribute('href')).toBe('https://status.knoblab.xyz');
    });
  });
});
