import { describe, it, expect } from 'vitest';
import {
  calculatePostEngagementScore,
  getPopularPostIds,
  isPopularPost,
} from '../stores/useBoardStore';
import type { Post } from '../types';

describe('동적 상대적 인기 게시글 알고리즘 (Popular Posts Dynamic & Relative Evaluation)', () => {
  const baseTime = 1770000000000; // 기준 시각

  const createDummyPost = (
    id: string,
    createdAt: number,
    likes: number,
    commentCount: number,
    views: number,
    isPinned = false
  ): Post => ({
    id,
    title: `Post ${id}`,
    body: `Body ${id}`,
    author: `User ${id}`,
    authorId: `user_${id}`,
    category: '정보',
    likes,
    commentCount,
    views,
    createdAt,
    isPinned,
    status: 'ACTIVE',
  });

  describe('1. calculatePostEngagementScore 복합 참여도 점수 계산', () => {
    it('좋아요, 댓글, 조회수(로그 감쇠)가 올바른 가중치로 계산되어야 한다', () => {
      const post = createDummyPost('1', baseTime, 2, 3, 50);
      // likes * 4.0 = 8.0
      // comments * 2.5 = 7.5
      // Math.log(1 + 50) * 1.5 ≈ 3.9318 * 1.5 ≈ 5.8977
      // 합계 ≈ 21.3977
      const score = calculatePostEngagementScore(post);
      expect(score).toBeGreaterThan(20);
      expect(score).toBeLessThan(23);
    });

    it('모든 수치가 0일 때 0점을 반환해야 한다', () => {
      const post = createDummyPost('1', baseTime, 0, 0, 0);
      expect(calculatePostEngagementScore(post)).toBe(0);
    });

    it('조회수만 비정상적으로 높더라도 로그 감쇠로 인해 점수가 과도하게 폭증하지 않아야 한다', () => {
      const postA = createDummyPost('A', baseTime, 5, 2, 100);
      const postB = createDummyPost('B', baseTime, 0, 0, 10000); // 1만 조회수 어뷰징
      const scoreA = calculatePostEngagementScore(postA);
      const scoreB = calculatePostEngagementScore(postB);

      // 좋아요 5개 + 댓글 2개인 postA가 단순 조회수만 높은 postB보다 더 높은 가치를 지녀야 함
      expect(scoreA).toBeGreaterThan(scoreB);
    });
  });

  describe('2. getPopularPostIds 시기별 상대적 동적 판별', () => {
    it('동일한 시기에 작성된 글들 중 상대적으로 참여도가 높은 상위권 글을 인기글로 지정한다', () => {
      const posts: Post[] = [
        createDummyPost('p1', baseTime, 3, 2, 80),   // 매우 높음 -> 인기글
        createDummyPost('p2', baseTime + 1000, 1, 1, 20), // 중간
        createDummyPost('p3', baseTime + 2000, 0, 0, 10), // 낮음
        createDummyPost('p4', baseTime + 3000, 0, 0, 15), // 낮음
        createDummyPost('p5', baseTime + 4000, 0, 0, 5),  // 낮음
      ];

      const popularIds = getPopularPostIds(posts);
      expect(popularIds.has('p1')).toBe(true);
      expect(popularIds.has('p3')).toBe(false);
      expect(popularIds.has('p4')).toBe(false);
    });

    it('최소 노이즈 가드: 상호작용(좋아요/댓글)이 전혀 없는 글은 단순 조회수가 높아도 인기글이 되지 않아야 한다', () => {
      const posts: Post[] = [
        createDummyPost('noise1', baseTime, 0, 0, 300), // 조회수만 있고 반응 0
        createDummyPost('noise2', baseTime + 1000, 0, 0, 10),
        createDummyPost('noise3', baseTime + 2000, 0, 0, 5),
      ];

      const popularIds = getPopularPostIds(posts);
      expect(popularIds.size).toBe(0);
      expect(popularIds.has('noise1')).toBe(false);
    });

    it('글이 작성된 서로 다른 시기(예: 7일 전 vs 오늘) 각각의 코호트에서 상대적으로 우수한 글이 각각 인기글로 인정된다', () => {
      const sevenDaysAgo = baseTime - 7 * 24 * 60 * 60 * 1000;

      const posts: Post[] = [
        // 7일 전 코호트
        createDummyPost('old_top', sevenDaysAgo, 2, 2, 50),
        createDummyPost('old_sub1', sevenDaysAgo + 1000, 0, 0, 10),
        createDummyPost('old_sub2', sevenDaysAgo + 2000, 0, 0, 10),
        createDummyPost('old_sub3', sevenDaysAgo + 3000, 0, 0, 5),

        // 오늘 코호트
        createDummyPost('today_top', baseTime, 3, 3, 80),
        createDummyPost('today_sub1', baseTime + 1000, 0, 0, 20),
        createDummyPost('today_sub2', baseTime + 2000, 0, 0, 10),
        createDummyPost('today_sub3', baseTime + 3000, 0, 0, 5),
      ];

      const popularIds = getPopularPostIds(posts);
      // 과거 시기의 1등과 현재 시기의 1등이 모두 상대 평가를 통해 인기글로 식별됨
      expect(popularIds.has('old_top')).toBe(true);
      expect(popularIds.has('today_top')).toBe(true);
    });

    it('삭제된 게시글(isDeleted/status=deleted)은 계산 대상에서 제외되어야 한다', () => {
      const posts: Post[] = [
        { ...createDummyPost('del', baseTime, 10, 10, 100), isDeleted: true },
        createDummyPost('normal', baseTime + 1000, 1, 1, 20),
      ];

      const popularIds = getPopularPostIds(posts);
      expect(popularIds.has('del')).toBe(false);
      expect(popularIds.has('normal')).toBe(true);
    });
  });

  describe('3. isPopularPost 헬퍼 함수', () => {
    it('전체 글 목록과 대조하여 정상적으로 인기글 여부를 판단해야 한다', () => {
      const topPost = createDummyPost('top', baseTime, 4, 3, 100);
      const lowPost = createDummyPost('low', baseTime + 100, 0, 0, 5);
      const allPosts = [topPost, lowPost];

      expect(isPopularPost(topPost, allPosts)).toBe(true);
      expect(isPopularPost(lowPost, allPosts)).toBe(false);
    });

    it('서버에서 이미 isPopular: true로 내려준 경우 allPosts 없이도 true를 반환해야 한다', () => {
      const serverPopularPost = { ...createDummyPost('srv', baseTime, 1, 0, 10), isPopular: true };
      expect(isPopularPost(serverPopularPost)).toBe(true);
    });
  });

  describe('4. 인기 게시글 최신 순(createdAt 내림차순) 정렬 검증', () => {
    it('인기 게시글 목록 정렬 시 좋아요 개수가 아니라 작성일(createdAt)이 최신인 글이 먼저 나와야 한다', () => {
      // oldPop: 3일 전에 작성되었고 좋아요가 10개로 매우 많음
      const oldPop = createDummyPost('oldPop', baseTime - 3 * 24 * 60 * 60 * 1000, 10, 5, 200);
      // newPop: 1시간 전에 작성되었고 상대적 인기 기준을 충족했음 (좋아요 3개)
      const newPop = createDummyPost('newPop', baseTime - 1 * 60 * 60 * 1000, 3, 2, 50);
      // pinnedNotice: 고정 공지글
      const pinnedNotice = createDummyPost('pinned', baseTime - 10 * 24 * 60 * 60 * 1000, 1, 0, 100, true);

      const postsToSort = [oldPop, pinnedNotice, newPop];

      // 정렬 함수 시뮬레이션 (useBoardStore 및 upload-service와 동일한 로직)
      postsToSort.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        if ((b.createdAt || 0) !== (a.createdAt || 0)) {
          return (b.createdAt || 0) - (a.createdAt || 0);
        }
        const scoreA = calculatePostEngagementScore(a);
        const scoreB = calculatePostEngagementScore(b);
        return scoreB - scoreA;
      });

      // 1등: 고정 공지 (isPinned)
      expect(postsToSort[0].id).toBe('pinned');
      // 2등: 더 최근에 작성된 newPop (비록 oldPop보다 좋아요는 적지만 최신순 정렬 원칙)
      expect(postsToSort[1].id).toBe('newPop');
      // 3등: 더 오래전에 작성된 oldPop
      expect(postsToSort[2].id).toBe('oldPop');
    });
  });
});
