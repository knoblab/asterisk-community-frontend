import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecruitBadge } from '../components/common/RecruitBadge';
import { PostPollWidget } from '../components/community/PostPollWidget';
import type { PostRecruitMeta, PostPoll } from '../types';
import { useAuthStore } from '../stores/useAuthStore';

describe('RecruitBadge Component', () => {
  it('renders team recruit badge with pure SVG icon and correct status label', () => {
    const meta: PostRecruitMeta = {
      type: 'team',
      status: 'open',
      currentCount: 2,
      maxCount: 4,
    };

    const { container } = render(<RecruitBadge meta={meta} />);

    expect(screen.getByText('팀원')).toBeDefined();
    expect(screen.getByText('모집 중')).toBeDefined();

    // Check SVG icon exists
    const svgElements = container.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThanOrEqual(1);

    // Verify ZERO emojis in rendered text
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(container.textContent || '')).toBe(false);
  });

  it('renders pot (공구/나눔) badge with closed status', () => {
    const meta: PostRecruitMeta = {
      type: 'pot',
      status: 'closed',
      currentCount: 5,
      maxCount: 5,
    };

    const { container } = render(<RecruitBadge meta={meta} />);

    expect(screen.getByText('기숙사팟')).toBeDefined();
    expect(screen.getByText('마감')).toBeDefined();

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(container.textContent || '')).toBe(false);
  });

  it('renders lost_found (분실물) badge with resolved status', () => {
    const meta: PostRecruitMeta = {
      type: 'lost_found',
      status: 'resolved',
    };

    const { container } = render(<RecruitBadge meta={meta} />);

    expect(screen.getByText('분실물')).toBeDefined();
    expect(screen.getByText('해결됨')).toBeDefined();

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(container.textContent || '')).toBe(false);
  });
});

describe('PostPollWidget Component', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        uid: 'test-user-1',
        email: 'student@cns.hs.kr',
        displayName: '과학고학생',
      } as any,
    });
  });

  const samplePoll: PostPoll = {
    id: 'poll-1',
    title: '이번 주말 기숙사 잔류 인원 조사',
    options: [
      { id: 'opt-1', text: '금요일 귀가', voteCount: 15, voterUids: ['user-1', 'user-2'] },
      { id: 'opt-2', text: '토요일 귀가', voteCount: 5, voterUids: [] },
      { id: 'opt-3', text: '전체 잔류', voteCount: 10, voterUids: ['test-user-1'] },
    ],
    isMultiple: false,
    isAnonymous: true,
    isClosed: false,
  };

  it('renders poll title, options, and vote percentages when user has voted', () => {
    const { container } = render(
      <PostPollWidget
        poll={samplePoll}
        isAuthor={false}
        isAdmin={false}
        onVote={vi.fn()}
      />
    );

    expect(screen.getByText('이번 주말 기숙사 잔류 인원 조사')).toBeDefined();
    expect(screen.getByText('금요일 귀가')).toBeDefined();
    expect(screen.getByText('토요일 귀가')).toBeDefined();
    expect(screen.getByText('전체 잔류')).toBeDefined();

    // 15 + 5 + 10 = 30 total votes
    expect(container.textContent).toContain('총 30명 참여');
    expect(screen.getByText('익명')).toBeDefined();
    expect(screen.getByText('진행 중')).toBeDefined();

    // Shows votes and percentages in results view because user already voted for opt-3
    expect(screen.getByText('15표')).toBeDefined();
    expect(screen.getByText('50%')).toBeDefined();

    // Zero emojis check
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(container.textContent || '')).toBe(false);
  });

  it('allows changing vote and submitting new selection', async () => {
    const handleVote = vi.fn().mockResolvedValue(undefined);

    render(
      <PostPollWidget
        poll={samplePoll}
        isAuthor={false}
        isAdmin={false}
        onVote={handleVote}
      />
    );

    // Click "다시 투표"
    const changeVoteBtn = screen.getByText('다시 투표');
    fireEvent.click(changeVoteBtn);

    // Select option 1
    const opt1Btn = screen.getByText('금요일 귀가');
    fireEvent.click(opt1Btn);

    // Submit
    const submitBtn = screen.getByText('투표하기');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleVote).toHaveBeenCalledWith(['opt-1']);
    });
  });

  it('shows close button for author and triggers onClosePoll', async () => {
    const handleClose = vi.fn().mockResolvedValue(undefined);

    render(
      <PostPollWidget
        poll={samplePoll}
        isAuthor={true}
        isAdmin={false}
        onVote={vi.fn()}
        onClosePoll={handleClose}
      />
    );

    const closeBtn = screen.getByText('투표 마감');
    expect(closeBtn).toBeDefined();

    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it('displays closed badge when poll is closed and hides vote actions', () => {
    const closedPoll: PostPoll = {
      ...samplePoll,
      isClosed: true,
    };

    render(
      <PostPollWidget
        poll={closedPoll}
        isAuthor={false}
        isAdmin={false}
        onVote={vi.fn()}
      />
    );

    expect(screen.getByText('마감됨')).toBeDefined();
    expect(screen.queryByText('다시 투표')).toBeNull();
    expect(screen.queryByText('투표하기')).toBeNull();
  });
});
