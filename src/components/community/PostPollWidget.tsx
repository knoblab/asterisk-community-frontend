import React, { useState } from 'react';
import type { PostPoll } from '../../types';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { 
  BarChart2, CheckCircle2, Lock, Users, Clock, 
  RotateCcw, Check, Square, CheckSquare, Circle
} from 'lucide-react';

interface PostPollWidgetProps {
  poll: PostPoll;
  isAuthor: boolean;
  isAdmin: boolean;
  onVote: (optionIds: string[]) => Promise<void>;
  onClosePoll?: () => Promise<void>;
}

export const PostPollWidget: React.FC<PostPollWidgetProps> = ({
  poll,
  isAuthor,
  isAdmin,
  onVote,
  onClosePoll,
}) => {
  const { user } = useAuthStore();
  const openLoginModal = useUIStore((state) => state.openLoginModal);
  const addToast = useUIStore((state) => state.addToast);

  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(() => {
    if (!user) return [];
    return poll.options
      .filter((opt) => (opt.voterUids || []).includes(user.uid) || opt.hasVoted)
      .map((opt) => opt.id);
  });

  const [isVoting, setIsVoting] = useState(false);
  const [isChangingVote, setIsChangingVote] = useState(false);

  // Check if current user has already voted
  const hasUserVoted = Boolean(
    user && poll.options.some((opt) => (opt.voterUids || []).includes(user.uid) || opt.hasVoted)
  );

  const isClosed = Boolean(poll.isClosed || (poll.closedAt && Date.now() > poll.closedAt));
  const showResults = hasUserVoted && !isChangingVote;

  const totalVotes = poll.totalVotes !== undefined
    ? poll.totalVotes
    : poll.options.reduce((sum, opt) => sum + (opt.voteCount ?? (opt.voterUids || []).length), 0);

  const handleToggleOption = (optionId: string) => {
    if (isClosed) return;
    if (poll.isMultiple) {
      setSelectedOptionIds((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      );
    } else {
      setSelectedOptionIds([optionId]);
    }
  };

  const handleSubmitVote = async () => {
    if (!user) {
      openLoginModal('투표에 참여하려면 로그인이 필요합니다.');
      return;
    }
    if (selectedOptionIds.length === 0) {
      addToast('투표할 항목을 1개 이상 선택해 주세요.', 'info');
      return;
    }
    setIsVoting(true);
    try {
      await onVote(selectedOptionIds);
      setIsChangingVote(false);
      addToast('투표가 반영되었습니다.', 'success');
    } catch (err: any) {
      addToast(err?.message || '투표 처리에 실패했습니다.', 'error');
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="post-poll-card">
      {/* Poll Header */}
      <div className="post-poll-header">
        <div className="post-poll-title-wrap">
          <span className="post-poll-icon">
            <BarChart2 size={16} />
          </span>
          <h4 className="post-poll-title">{poll.title}</h4>
        </div>

        <div className="post-poll-badges">
          {poll.isAnonymous ? (
            <span className="poll-badge" title="익명 투표: 참여자 이름이 공개되지 않습니다.">
              <Lock size={11} />
              <span>익명</span>
            </span>
          ) : (
            <span className="poll-badge" title="실명 투표: 참여자가 공개됩니다.">
              <Users size={11} />
              <span>실명</span>
            </span>
          )}

          {poll.isMultiple && (
            <span className="poll-badge">
              <CheckSquare size={11} />
              <span>복수 선택</span>
            </span>
          )}

          {isClosed ? (
            <span className="poll-badge closed">
              <Clock size={11} />
              <span>마감됨</span>
            </span>
          ) : (
            <span className="poll-badge active">
              <CheckCircle2 size={11} />
              <span>진행 중</span>
            </span>
          )}
        </div>
      </div>

      {/* Options List */}
      <div className="post-poll-options">
        {poll.options.map((option) => {
          const optVotes = option.voteCount ?? (option.voterUids || []).length;
          const percentage = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
          const isSelected = selectedOptionIds.includes(option.id);
          const isUserPick = user && ((option.voterUids || []).includes(user.uid) || option.hasVoted);

          if (showResults) {
            // Results Mode
            return (
              <div
                key={option.id}
                className={`post-poll-result-item ${isUserPick ? 'user-picked' : ''}`}
              >
                <div
                  className="post-poll-bar-fill"
                  style={{ width: `${percentage}%` }}
                />
                <div className="post-poll-result-content">
                  <div className="post-poll-opt-label">
                    {isUserPick && (
                      <span className="post-poll-check-icon">
                        <Check size={13} />
                      </span>
                    )}
                    <span>{option.text}</span>
                  </div>
                  <div className="post-poll-opt-meta">
                    <span className="post-poll-votes">{optVotes}표</span>
                    <span className="post-poll-percent">{percentage}%</span>
                  </div>
                </div>
              </div>
            );
          }

          // Voting Mode
          return (
            <button
              key={option.id}
              type="button"
              disabled={isClosed}
              onClick={() => handleToggleOption(option.id)}
              className={`post-poll-vote-item ${isSelected ? 'selected' : ''}`}
            >
              <span className="post-poll-selector">
                {poll.isMultiple ? (
                  isSelected ? <CheckSquare size={16} /> : <Square size={16} />
                ) : (
                  isSelected ? <CheckCircle2 size={16} /> : <Circle size={16} />
                )}
              </span>
              <span className="post-poll-vote-text">{option.text}</span>
            </button>
          );
        })}
      </div>

      {/* Poll Footer & Actions */}
      <div className="post-poll-footer">
        <span className="post-poll-total">
          총 <strong>{totalVotes}</strong>명 참여
        </span>

        <div className="post-poll-actions">
          {showResults && !isClosed && (
            <button
              type="button"
              onClick={() => setIsChangingVote(true)}
              className="btn-poll-change"
              title="선택 변경하기"
            >
              <RotateCcw size={12} />
              <span>다시 투표</span>
            </button>
          )}

          {!showResults && !isClosed && (
            <button
              type="button"
              disabled={isVoting || selectedOptionIds.length === 0}
              onClick={handleSubmitVote}
              className="btn-poll-submit"
            >
              <span>{isVoting ? '반영 중...' : '투표하기'}</span>
            </button>
          )}

          {(isAuthor || isAdmin) && !isClosed && onClosePoll && (
            <button
              type="button"
              onClick={onClosePoll}
              className="btn-poll-close"
              title="투표 마감하기"
            >
              <Clock size={12} />
              <span>투표 마감</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
