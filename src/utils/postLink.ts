import type { Post } from '../types';

const MIN_POST_CODE = 1000000;
const POST_CODE_RANGE = 9000000;

export const getPostCode = (postId: string) => {
  let hash = 2166136261;
  for (let i = 0; i < postId.length; i += 1) {
    hash ^= postId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return String(MIN_POST_CODE + (hash >>> 0) % POST_CODE_RANGE);
};

export const getPostPath = (postId: string) => '/post/' + getPostCode(postId);

export const findPostByCode = (posts: Post[], code: string) =>
  posts.find((post) => getPostCode(post.id) === code);
