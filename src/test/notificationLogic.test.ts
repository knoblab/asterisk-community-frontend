import { describe, it, expect } from 'vitest';
import type { AppNotification } from '../types';

interface Post {
  id: string;
  title: string;
  authorId: string;
}

interface Comment {
  id: string;
  postId: string;
  parentId?: string | null;
  authorId: string;
  author: string;
  body: string;
}

// Emulate backend notification trigger function
function handleCommentNotificationTrigger(
  newComment: Comment,
  currentUserId: string,
  currentUserEmail: string,
  posts: Post[],
  comments: Comment[]
): AppNotification[] {
  const generated: AppNotification[] = [];
  const targetPost = posts.find((p) => p.id === newComment.postId);
  const postTitle = targetPost ? targetPost.title : '게시글';
  const contentSnippet = (newComment.body || '').replace(/^\[REPLY_TO:[^\]]+\]\n?/, '').trim().substring(0, 100);

  if (newComment.parentId) {
    // 대댓글: 원댓글 작성자에게 'reply' 알림
    const parentComment = comments.find((c) => c.id === newComment.parentId);
    if (parentComment && parentComment.authorId && parentComment.authorId !== currentUserId) {
      generated.push({
        id: `notif-${Date.now()}-1`,
        recipientId: parentComment.authorId,
        senderId: currentUserId,
        senderName: newComment.author,
        senderEmail: currentUserEmail,
        type: 'reply',
        postId: newComment.postId,
        postTitle,
        commentId: newComment.id,
        contentSnippet,
        isRead: false,
        createdAt: Date.now(),
      });
    }

    // 글 작성자가 원댓글 작성자와 다르고 현재 유저도 아닌 경우, 글 작성자에게도 알림
    if (
      targetPost &&
      targetPost.authorId &&
      targetPost.authorId !== currentUserId &&
      (!parentComment || parentComment.authorId !== targetPost.authorId)
    ) {
      generated.push({
        id: `notif-${Date.now()}-2`,
        recipientId: targetPost.authorId,
        senderId: currentUserId,
        senderName: newComment.author,
        senderEmail: currentUserEmail,
        type: 'comment',
        postId: newComment.postId,
        postTitle,
        commentId: newComment.id,
        contentSnippet,
        isRead: false,
        createdAt: Date.now(),
      });
    }
  } else {
    // 일반 댓글: 글 작성자에게 'comment' 알림
    if (targetPost && targetPost.authorId && targetPost.authorId !== currentUserId) {
      generated.push({
        id: `notif-${Date.now()}-3`,
        recipientId: targetPost.authorId,
        senderId: currentUserId,
        senderName: newComment.author,
        senderEmail: currentUserEmail,
        type: 'comment',
        postId: newComment.postId,
        postTitle,
        commentId: newComment.id,
        contentSnippet,
        isRead: false,
        createdAt: Date.now(),
      });
    }
  }

  return generated;
}

describe('Server Notification Trigger Logic', () => {
  const posts: Post[] = [
    { id: 'post-100', title: '커뮤니티 이용 규칙', authorId: 'author-A' },
  ];

  const comments: Comment[] = [
    { id: 'comment-1', postId: 'post-100', authorId: 'author-B', author: '작성자B', body: '첫 댓글입니다.' },
  ];

  it('generates a "comment" notification when someone comments on another person\'s post', () => {
    const newComment: Comment = {
      id: 'comment-2',
      postId: 'post-100',
      authorId: 'author-B',
      author: '작성자B',
      body: '좋은 정보 감사합니다.',
    };

    const notifs = handleCommentNotificationTrigger(
      newComment,
      'author-B',
      'b@test.com',
      posts,
      comments
    );

    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('comment');
    expect(notifs[0].recipientId).toBe('author-A');
    expect(notifs[0].senderName).toBe('작성자B');
    expect(notifs[0].postTitle).toBe('커뮤니티 이용 규칙');
  });

  it('does NOT generate a notification when author comments on their own post', () => {
    const newComment: Comment = {
      id: 'comment-self',
      postId: 'post-100',
      authorId: 'author-A',
      author: '작성자A',
      body: '추가 안내입니다.',
    };

    const notifs = handleCommentNotificationTrigger(
      newComment,
      'author-A',
      'a@test.com',
      posts,
      comments
    );

    expect(notifs).toHaveLength(0);
  });

  it('generates a "reply" notification to the comment author when someone replies to their comment', () => {
    const newReply: Comment = {
      id: 'reply-1',
      postId: 'post-100',
      parentId: 'comment-1', // comment-1 belongs to author-B
      authorId: 'author-C',
      author: '작성자C',
      body: '[REPLY_TO:comment-1]\n저도 그렇게 생각해요!',
    };

    const notifs = handleCommentNotificationTrigger(
      newReply,
      'author-C',
      'c@test.com',
      posts,
      comments
    );

    // Should notify author-B (comment author) with 'reply'
    // and author-A (post author) with 'comment'
    expect(notifs.some((n) => n.recipientId === 'author-B' && n.type === 'reply')).toBe(true);
    expect(notifs.some((n) => n.recipientId === 'author-A' && n.type === 'comment')).toBe(true);
    expect(notifs.find((n) => n.recipientId === 'author-B')?.contentSnippet).toBe('저도 그렇게 생각해요!');
  });

  it('does NOT generate a reply notification when author replies to their own comment', () => {
    const selfReply: Comment = {
      id: 'reply-self',
      postId: 'post-100',
      parentId: 'comment-1', // comment-1 belongs to author-B
      authorId: 'author-B',
      author: '작성자B',
      body: '[REPLY_TO:comment-1]\n오타 수정합니다.',
    };

    const notifs = handleCommentNotificationTrigger(
      selfReply,
      'author-B',
      'b@test.com',
      posts,
      comments
    );

    // author-B should not receive a reply notification to themselves
    expect(notifs.some((n) => n.recipientId === 'author-B')).toBe(false);
  });
});
