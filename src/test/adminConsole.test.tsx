import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Pagination } from '../components/common/Pagination';
import { AdminUserActivityModal } from '../components/admin/AdminUserActivityModal';
import { AdminPage } from '../pages/AdminPage';
import {
  aggregateAdminUsers,
  type AdminUserInfo,
  permanentDeletePost,
  permanentDeleteComment,
  restorePost,
  restoreComment,
} from '../services/adminService';
import { useAuthStore } from '../stores/useAuthStore';
import { useBoardStore } from '../stores/useBoardStore';
import { useUIStore } from '../stores/useUIStore';
import type { Post, Comment } from '../types';

describe('Admin Console Enhancements', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    useAuthStore.setState({
      user: {
        uid: 'gXPUzH8sZAfLKcGnQPmoXrQkxWY2',
        email: 'a66792427@gmail.com',
        displayName: '총괄관리자',
        photoURL: null,
      },
      loading: false,
    });

    useBoardStore.setState({
      posts: [],
      comments: [],
      totalPosts: 0,
      currentPage: 1,
    });

    useUIStore.setState({
      toasts: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Pagination Component', () => {
    it('renders numbered page buttons (1, 2, 3...) and fires onPageChange', () => {
      const handlePageChange = vi.fn();
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={handlePageChange}
          totalItems={75}
          pageSize={15}
        />
      );

      // Check number buttons
      expect(screen.getByRole('button', { name: '1' })).toBeDefined();
      expect(screen.getByRole('button', { name: '2' })).toBeDefined();
      expect(screen.getByRole('button', { name: '3' })).toBeDefined();
      expect(screen.getByRole('button', { name: '4' })).toBeDefined();
      expect(screen.getByRole('button', { name: '5' })).toBeDefined();

      // Click page 3
      fireEvent.click(screen.getByRole('button', { name: '3' }));
      expect(handlePageChange).toHaveBeenCalledWith(3);

      // Click next page
      const nextBtn = screen.getByTitle('다음 페이지');
      fireEvent.click(nextBtn);
      expect(handlePageChange).toHaveBeenCalledWith(2);
    });

    it('disables previous and first button on first page, and handles page size change', () => {
      const handleSizeChange = vi.fn();
      render(
        <Pagination
          currentPage={1}
          totalPages={4}
          onPageChange={vi.fn()}
          totalItems={40}
          pageSize={10}
          onPageSizeChange={handleSizeChange}
        />
      );

      const prevBtn = screen.getByTitle('이전 페이지');
      expect((prevBtn as HTMLButtonElement).disabled).toBe(true);

      const select = screen.getByLabelText('표시 개수:');
      fireEvent.change(select, { target: { value: '25' } });
      expect(handleSizeChange).toHaveBeenCalledWith(25);
    });
  });

  describe('aggregateAdminUsers Service', () => {
    const mockPosts: Post[] = [
      {
        id: 'p1',
        title: '첫 글',
        body: '본문 1',
        category: '질문',
        author: '학생A',
        authorId: 'user-a',
        authorEmail: 'cnsh32_1001@g.cnees.kr',
        authorGeneration: '32기',
        createdAt: 1000,
        views: 10,
        likes: 5,
        commentCount: 2,
      },
      {
        id: 'p2',
        title: '삭제된 글',
        body: '본문 2',
        category: '잡담',
        author: '학생A',
        authorId: 'user-a',
        authorEmail: 'cnsh32_1001@g.cnees.kr',
        authorGeneration: '32기',
        createdAt: 2000,
        views: 5,
        likes: 1,
        commentCount: 0,
        isDeleted: true,
        status: 'deleted',
      },
      {
        id: 'p3',
        title: '학생B의 글',
        body: '본문 3',
        category: '정보',
        author: '학생B',
        authorId: 'user-b',
        authorEmail: 'cnsh33_2002@g.cnees.kr',
        authorGeneration: '33기',
        createdAt: 3000,
        views: 20,
        likes: 3,
        commentCount: 1,
      },
    ];

    const mockComments: Comment[] = [
      {
        id: 'c1',
        postId: 'p1',
        author: '학생B',
        authorId: 'user-b',
        authorEmail: 'cnsh33_2002@g.cnees.kr',
        authorGeneration: '33기',
        body: '학생B 댓글',
        createdAt: 4000,
        likes: 2,
      },
      {
        id: 'c2',
        postId: 'p1',
        author: '학생A',
        authorId: 'user-a',
        authorEmail: 'cnsh32_1001@g.cnees.kr',
        authorGeneration: '32기',
        body: '삭제된 댓글',
        createdAt: 5000,
        likes: 0,
        isDeleted: true,
        status: 'deleted',
      },
    ];

    it('accurately aggregates user statistics including active and deleted counts', () => {
      const users = aggregateAdminUsers(mockPosts, mockComments);
      const userA = users.find((u) => u.uid === 'user-a');
      const userB = users.find((u) => u.uid === 'user-b');

      expect(userA).toBeDefined();
      expect(userA?.postCount).toBe(2);
      expect(userA?.activePostCount).toBe(1);
      expect(userA?.deletedPostCount).toBe(1);
      expect(userA?.commentCount).toBe(1);
      expect(userA?.activeCommentCount).toBe(0);
      expect(userA?.deletedCommentCount).toBe(1);
      expect(userA?.totalLikesReceived).toBe(6); // 5 (p1) + 1 (p2) + 0 (c2)
      expect(userA?.generation).toBe('32기');

      expect(userB).toBeDefined();
      expect(userB?.postCount).toBe(1);
      expect(userB?.activePostCount).toBe(1);
      expect(userB?.deletedPostCount).toBe(0);
      expect(userB?.commentCount).toBe(1);
      expect(userB?.activeCommentCount).toBe(1);
      expect(userB?.totalLikesReceived).toBe(5); // 3 (p3) + 2 (c1)
      expect(userB?.generation).toBe('33기');
    });
  });

  describe('AdminUserActivityModal Component', () => {
    const mockUser: AdminUserInfo = {
      uid: 'user-a',
      displayName: '홍길동',
      email: 'cnsh32_1001@g.cnees.kr',
      photoURL: null,
      generation: '32기',
      isAdmin: false,
      postCount: 2,
      activePostCount: 1,
      deletedPostCount: 1,
      commentCount: 1,
      activeCommentCount: 1,
      deletedCommentCount: 0,
      totalLikesReceived: 8,
      firstActivityAt: 1000,
      lastActivityAt: 5000,
    };

    const mockPosts: Post[] = [
      {
        id: 'p1',
        title: '정상 게시글 제목',
        body: '정상 본문 내용',
        category: '질문',
        author: '홍길동',
        authorId: 'user-a',
        authorEmail: 'cnsh32_1001@g.cnees.kr',
        createdAt: 1000,
        views: 12,
        likes: 4,
        commentCount: 1,
      },
      {
        id: 'p2',
        title: '삭제된 게시글 제목',
        body: '삭제된 본문 내용',
        category: '잡담',
        author: '홍길동',
        authorId: 'user-a',
        authorEmail: 'cnsh32_1001@g.cnees.kr',
        createdAt: 2000,
        views: 2,
        likes: 0,
        commentCount: 0,
        isDeleted: true,
        status: 'deleted',
      },
    ];

    const mockComments: Comment[] = [
      {
        id: 'c1',
        postId: 'p1',
        author: '홍길동',
        authorId: 'user-a',
        authorEmail: 'cnsh32_1001@g.cnees.kr',
        body: '홍길동이 작성한 댓글 본문',
        createdAt: 3000,
        likes: 2,
      },
    ];

    it('renders user details, both active and deleted posts, and allows restoring deleted post', () => {
      const handleRestorePost = vi.fn();
      const handlePermanentDelete = vi.fn();

      render(
        <AdminUserActivityModal
          user={mockUser}
          allPosts={mockPosts}
          allComments={mockComments}
          onClose={vi.fn()}
          onViewPost={vi.fn()}
          onEditPost={vi.fn()}
          onDeletePost={vi.fn()}
          onRestorePost={handleRestorePost}
          onPermanentDeletePost={handlePermanentDelete}
          onEditComment={vi.fn()}
          onDeleteComment={vi.fn()}
          onRestoreComment={vi.fn()}
          onPermanentDeleteComment={vi.fn()}
        />
      );

      // User header
      expect(screen.getByText('홍길동')).toBeDefined();
      expect(screen.getByText('cnsh32_1001@g.cnees.kr')).toBeDefined();
      expect(screen.getByText('32기')).toBeDefined();

      // Posts list
      expect(screen.getByText('정상 게시글 제목')).toBeDefined();
      expect(screen.getByText('삭제된 게시글 제목')).toBeDefined();

      // Check [삭제됨] badge
      expect(screen.getByText('삭제됨')).toBeDefined();

      // Restore button on deleted post
      const restoreBtn = screen.getByRole('button', { name: '복구' });
      fireEvent.click(restoreBtn);
      expect(handleRestorePost).toHaveBeenCalledWith('p2');

      // Permanent delete button on deleted post
      const permDeleteBtn = screen.getByRole('button', { name: '영구삭제' });
      fireEvent.click(permDeleteBtn);
      expect(handlePermanentDelete).toHaveBeenCalledWith('p2');
    });

    it('switches to comments tab and displays comments authored by this user', () => {
      render(
        <AdminUserActivityModal
          user={mockUser}
          allPosts={mockPosts}
          allComments={mockComments}
          onClose={vi.fn()}
          onViewPost={vi.fn()}
          onEditPost={vi.fn()}
          onDeletePost={vi.fn()}
          onRestorePost={vi.fn()}
          onPermanentDeletePost={vi.fn()}
          onEditComment={vi.fn()}
          onDeleteComment={vi.fn()}
          onRestoreComment={vi.fn()}
          onPermanentDeleteComment={vi.fn()}
        />
      );

      const commentsTabBtn = screen.getByRole('button', { name: /작성 댓글/ });
      fireEvent.click(commentsTabBtn);

      expect(screen.getByText('홍길동이 작성한 댓글 본문')).toBeDefined();
    });
  });

  describe('AdminPage Full Integration', () => {
    const mockPosts: Post[] = [
      {
        id: 'p100',
        title: '커뮤니티 안내 공지',
        body: '공지사항 본문',
        category: '공지',
        author: '관리자',
        authorId: 'gXPUzH8sZAfLKcGnQPmoXrQkxWY2',
        authorEmail: 'a66792427@gmail.com',
        createdAt: Date.now() - 10000,
        views: 150,
        likes: 12,
        commentCount: 1,
      },
      {
        id: 'p101',
        title: '부적절한 삭제글',
        body: '삭제 처리된 본문',
        category: '잡담',
        author: '악성유저',
        authorId: 'bad-uid',
        authorEmail: 'cnsh32_9999@g.cnees.kr',
        createdAt: Date.now() - 5000,
        views: 20,
        likes: 0,
        commentCount: 0,
        isDeleted: true,
        status: 'deleted',
      },
    ];

    const mockComments: Comment[] = [
      {
        id: 'c100',
        postId: 'p100',
        author: '학생1',
        authorId: 'student-1',
        authorEmail: 'cnsh32_1111@g.cnees.kr',
        authorGeneration: '32기',
        body: '확인했습니다 감사합니다',
        createdAt: Date.now() - 2000,
        likes: 3,
      },
      {
        id: 'c101',
        postId: 'p100',
        author: '학생2',
        authorId: 'student-2',
        authorEmail: 'cnsh33_2222@g.cnees.kr',
        authorGeneration: '33기',
        body: '삭제된 욕설 댓글',
        createdAt: Date.now() - 1000,
        likes: 0,
        isDeleted: true,
        status: 'deleted',
      },
    ];

    it('renders 4 tabs, stats, deleted post with badge, and allows switching to comments and users tabs', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        if (url.includes('/posts')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockPosts,
          });
        }
        if (url.includes('/comments')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockComments,
          });
        }
        if (url.includes('/reports')) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          });
        }
        if (url.includes('/admin/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, isAdmin: true, uid: 'gXPUzH8sZAfLKcGnQPmoXrQkxWY2' }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }));

      render(
        <MemoryRouter>
          <AdminPage />
        </MemoryRouter>
      );

      // Verify masthead and tabs after server verification
      await waitFor(() => {
        expect(screen.getByText('관리자 콘솔')).toBeDefined();
      });
      expect(screen.getByRole('button', { name: /게시글 관리/ })).toBeDefined();
      expect(screen.getByRole('button', { name: /댓글 관리/ })).toBeDefined();
      expect(screen.getByRole('button', { name: /사용자 관리/ })).toBeDefined();
      expect(screen.getByRole('button', { name: /신고 접수/ })).toBeDefined();

      // Wait for posts to load
      await waitFor(() => {
        expect(screen.getByText('커뮤니티 안내 공지')).toBeDefined();
      });

      // Both active and deleted posts are rendered!
      expect(screen.getByText('부적절한 삭제글')).toBeDefined();
      expect(screen.getByText('삭제됨')).toBeDefined();

      // Switch to Comments tab
      const commentsTabBtn = screen.getByRole('button', { name: /댓글 관리/ });
      fireEvent.click(commentsTabBtn);

      await waitFor(() => {
        expect(screen.getByText('확인했습니다 감사합니다')).toBeDefined();
      });
      expect(screen.getByText('삭제된 욕설 댓글')).toBeDefined();

      // Switch to Users tab
      const usersTabBtn = screen.getByRole('button', { name: /사용자 관리/ });
      fireEvent.click(usersTabBtn);

      await waitFor(() => {
        expect(screen.getByText('악성유저')).toBeDefined();
      });
      expect(screen.getByText('학생1')).toBeDefined();

      // Click "활동 내역 보기" for 악성유저 to open user drilldown modal
      const viewActivityButtons = screen.getAllByRole('button', { name: '활동 내역 보기' });
      fireEvent.click(viewActivityButtons[0]);

      // User drilldown modal is displayed
      await waitFor(() => {
        expect(screen.getByText(/작성 글 \(/)).toBeDefined();
      });
    });
  });

  describe('Admin Service Permanent Deletion & Restoration', () => {
    it('permanentDeletePost sends DELETE request with ?permanent=true', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
      vi.stubGlobal('fetch', fetchSpy);

      const result = await permanentDeletePost('target-post-123');
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/posts/target-post-123?permanent=true'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('permanentDeleteComment sends DELETE request with ?permanent=true', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
      vi.stubGlobal('fetch', fetchSpy);

      const result = await permanentDeleteComment('target-comment-456');
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/comments/target-comment-456?permanent=true'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('restorePost sends PATCH request to restore post with isDeleted: false', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ isDeleted: false, status: 'active' }) });
      vi.stubGlobal('fetch', fetchSpy);

      const result = await restorePost('target-post-123');
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/posts/target-post-123'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isDeleted: false, status: 'published' }),
        })
      );
    });

    it('restoreComment sends PATCH request to restore comment with isDeleted: false', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ isDeleted: false, status: 'active' }) });
      vi.stubGlobal('fetch', fetchSpy);

      const result = await restoreComment('target-comment-456');
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/comments/target-comment-456'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isDeleted: false, status: 'published' }),
        })
      );
    });
  });
});

