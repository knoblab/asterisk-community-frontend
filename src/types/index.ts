export type TabType = 'main' | 'board' | 'popular' | 'settings' | 'activity' | 'profile' | 'ai';
export type ThemeType = 'dark' | 'light';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  toolsUsed?: Array<{ id: string; name: string }>;
  targetPost?: { id: string; title: string };
  images?: Array<{ dataUrl: string; name: string }>;
  createdAt: number;
  isError?: boolean;
}

export interface AiChatSessionSummary {
  sessionId: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  lastMessage?: string;
}

export interface AiChatSession {
  sessionId: string;
  uid: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiChatMessage[];
}

export type PostCategory = '전체' | '질문' | '리뷰' | '자료' | '정보' | '공지' | '이벤트' | '잡담';

export type RecruitType = 'team' | 'pot' | 'lost_found';
export type RecruitStatus = 'open' | 'closed' | 'searching' | 'resolved';

export interface PostRecruitMeta {
  type: RecruitType; // 'team': 팀원 모집, 'pot': 기숙사/배달 팟, 'lost_found': 분실물 찾기
  status: RecruitStatus; // 'open' | 'closed' | 'searching' | 'resolved'
  currentCount?: number;
  maxCount?: number;
}

export interface PollOption {
  id: string;
  text: string;
  voterUids: string[];
  voteCount?: number;
  hasVoted?: boolean;
}

export interface PostPoll {
  id: string;
  title: string;
  options: PollOption[];
  isMultiple?: boolean;
  isAnonymous?: boolean;
  closedAt?: number;
  isClosed?: boolean;
  totalVotes?: number;
}

export interface Post {
  id: string;
  category: PostCategory;
  title: string;
  body: string;
  author: string;
  authorId: string;
  authorEmail?: string;
  createdAt: number;
  views: number;
  likes: number;
  commentCount: number;
  isPinned?: boolean;
  isNotice?: boolean;
  isSpoiler?: boolean;
  isDeleted?: boolean;
  status?: string;
  isPopular?: boolean;
  hasLiked?: boolean;
  authorPhotoURL?: string | null;
  authorGeneration?: string;
  recruitMeta?: PostRecruitMeta;
  poll?: PostPoll;
}

export interface Comment {
  id: string;
  postId: string;
  author: string;
  authorId: string;
  authorEmail?: string;
  authorPhotoURL?: string | null;
  authorGeneration?: string;
  body: string;
  createdAt: number;
  likes: number;
  parentId?: string; // for nested replies
  triggerCommentId?: string; // ID of the comment that triggered an AI reply
  isDeleted?: boolean;
  status?: string;
  hasLiked?: boolean;
  isRateLimited?: boolean;
  retryAvailableAt?: number;
  retryExpireAt?: number;
  aiModel?: string;
  aiProvider?: 'Google' | 'OpenAI' | 'Anthropic' | 'Gemma' | string;
  aiTools?: string[];
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  onClick?: () => void;
  icon?: 'sparkles' | 'bot' | 'message';
}

export interface PaginatedPostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type NotificationType = 'comment' | 'reply';

export interface AppNotification {
  id: string;
  recipientId: string;
  senderId?: string;
  senderName: string;
  senderEmail?: string;
  type: NotificationType;
  postId: string;
  postTitle: string;
  commentId: string;
  contentSnippet: string;
  isRead: boolean;
  createdAt: number;
}
export interface KnoblabUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  schoolGrade?: string | null;
  schoolClass?: string | null;
}
