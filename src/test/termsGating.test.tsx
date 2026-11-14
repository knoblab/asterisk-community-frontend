import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreatePostPage } from '../components/community/CreatePostPage';
import { CommentSection } from '../components/community/CommentSection';
import { TermsAgreementModal } from '../components/common/TermsAgreementModal';
import { useAuthStore } from '../stores/useAuthStore';
import { useBoardStore } from '../stores/useBoardStore';
import { useUIStore } from '../stores/useUIStore';

describe('Terms and Privacy Policy Gating & Modal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    useBoardStore.setState({
      posts: [],
      comments: [],
      addPost: vi.fn(),
      addComment: vi.fn(),
      fetchComments: vi.fn(),
      checkAiStatus: vi.fn().mockResolvedValue(false),
    });

    useUIStore.setState({
      isTermsModalOpen: false,
      toasts: [],
    });
  });

  it('blocks post creation and triggers TermsAgreementModal if user has not agreed to terms', async () => {
    const mockAddPost = vi.fn().mockResolvedValue(true);
    useBoardStore.setState({ addPost: mockAddPost });

    useAuthStore.setState({
      user: {
        uid: 'user-without-terms',
        email: 'cnsh32_1234@cnsh.hs.kr',
        displayName: '미동의유저',
        photoURL: null,
        agreedTerms: false,
        agreedPrivacy: false,
      },
      loading: false,
    });

    render(<CreatePostPage onBack={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText('제목을 입력하세요');
    const bodyInput = screen.getByPlaceholderText(/GitHub 마크다운/i);
    fireEvent.change(titleInput, { target: { value: '테스트 제목' } });
    fireEvent.change(bodyInput, { target: { value: '테스트 내용입니다.' } });

    const submitBtn = screen.getByRole('button', { name: /작성 완료/i });
    fireEvent.click(submitBtn);

    // Terms modal should open and addPost should not be called
    expect(useUIStore.getState().isTermsModalOpen).toBe(true);
    expect(mockAddPost).not.toHaveBeenCalled();
  });

  it('blocks comment creation and triggers TermsAgreementModal if user has not agreed', async () => {
    const mockAddComment = vi.fn().mockResolvedValue(true);
    useBoardStore.setState({ addComment: mockAddComment });

    useAuthStore.setState({
      user: {
        uid: 'user-without-terms',
        email: 'cnsh32_1234@cnsh.hs.kr',
        displayName: '미동의유저',
        photoURL: null,
        agreedTerms: false,
        agreedPrivacy: false,
      },
      loading: false,
    });

    render(<CommentSection postId="post-1" />);

    const commentTextarea = screen.getByPlaceholderText(/따뜻한 댓글을 남겨주세요/i);
    fireEvent.change(commentTextarea, { target: { value: '테스트 댓글' } });

    const submitBtn = screen.getByRole('button', { name: '작성' });
    fireEvent.click(submitBtn);

    expect(useUIStore.getState().isTermsModalOpen).toBe(true);
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('renders TermsAgreementModal with required checkboxes and links', async () => {
    const mockUpdateTerms = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      user: {
        uid: 'user-1',
        email: 'cnsh32_1234@cnsh.hs.kr',
        displayName: '유저1',
        photoURL: null,
        agreedTerms: false,
        agreedPrivacy: false,
      },
      updateTermsAgreement: mockUpdateTerms,
    });
    useUIStore.setState({ isTermsModalOpen: true });

    render(<TermsAgreementModal />);

    expect(screen.getByText('서비스 이용약관 동의')).toBeDefined();
    expect(screen.getByText(/전체 약관 및 방침에 동의합니다/i)).toBeDefined();
    expect(screen.getByText(/asterisk 이용약관에 동의합니다/i)).toBeDefined();
    expect(screen.getByText(/asterisk 개인정보 처리방침에 동의합니다/i)).toBeDefined();

    // Check all checkbox
    const allCheckbox = screen.getByLabelText(/전체 약관 및 방침/i);
    fireEvent.click(allCheckbox);

    const confirmBtn = screen.getByRole('button', { name: /동의하고 계속하기/i });
    expect(confirmBtn.getAttribute('disabled')).toBeNull();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockUpdateTerms).toHaveBeenCalledWith(true, true);
    });
  });
});
