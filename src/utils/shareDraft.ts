import type { PostCategory } from '../types';
import { removeBidiControlChars } from './fileSecurity';

export const DAEPAE_PLAY_URL = 'https://daepae.pages.dev/';

export interface DaepaeScoreCardData {
  classLabel: string;
  playerName: string;
  runScore: number;
  bestSingle: number;
  clsRank: string;
  clsWeeklyScore: number;
  topFruitEmoji: string;
}

export interface InitialPostDraft {
  category: PostCategory;
  title: string;
  body: string;
  source?: 'daepae';
  scoreCard?: DaepaeScoreCardData;
}

const ALLOWED_FRUITS = new Set([
  '🍒',
  '🍓',
  '🍇',
  '🍊',
  '🍎',
  '🍐',
  '🍑',
  '🍍',
  '🍈',
  '🍉',
]);

const ALLOWED_PUBLIC_CATEGORIES: ReadonlySet<PostCategory> = new Set([
  '질문',
  '리뷰',
  '자료',
  '정보',
  '잡담',
]);

const MAX_SCORE = 999_999_999;

const stripControlChars = (raw: string): string => {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) {
      out += raw[i];
    }
  }
  return out;
};

const sanitizeSingleLineText = (raw: string | null, fallback: string, maxLen: number): string => {
  if (!raw || typeof raw !== 'string') return fallback;
  const cleaned = stripControlChars(removeBidiControlChars(raw))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
};

const escapeInlineMarkdown = (text: string): string =>
  text.replace(/([\\*_`[\]<>|])/g, '\\$1');

const parseSafeScore = (raw: string | null): number => {
  if (!raw || typeof raw !== 'string') return 0;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(MAX_SCORE, Math.floor(parsed));
};

const sanitizeRank = (raw: string | null): string => {
  if (!raw || typeof raw !== 'string') return '-';
  const trimmed = raw.trim();
  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    if (n >= 1 && n <= 99) return String(n);
  }
  return '-';
};

const sanitizeFruitEmoji = (raw: string | null): string => {
  if (!raw || typeof raw !== 'string') return '🍉';
  const trimmed = raw.trim();
  return ALLOWED_FRUITS.has(trimmed) ? trimmed : '🍉';
};

export const buildDaepaeShareDraft = (data: DaepaeScoreCardData): InitialPostDraft => {
  const displayScore = data.runScore > 0 ? data.runScore : data.bestSingle;
  const scoreTitlePart =
    data.runScore > 0
      ? `${displayScore.toLocaleString()} pt 기록 공유!`
      : `최고 기록 ${displayScore.toLocaleString()} pt 공유!`;

  const title = `🍉 [충수박] ${data.classLabel} ${data.playerName} — ${scoreTitlePart}`;

  const safeClass = escapeInlineMarkdown(data.classLabel);
  const safePlayer = escapeInlineMarkdown(data.playerName);
  const safeRank = escapeInlineMarkdown(data.clsRank);

  const lines = [
    '> 🍉 **충수박 점수 공유**',
    `> - 소속 · 닉네임: **${safeClass} · ${safePlayer}**`,
  ];

  if (data.runScore > 0) {
    lines.push(`> - 이번 판 점수: **${data.runScore.toLocaleString()} pt**`);
  }
  lines.push(`> - 내 최고 기록: **${data.bestSingle.toLocaleString()} pt**`);
  lines.push(
    `> - 우리 반 주간 순위: **${safeRank}위** (${data.clsWeeklyScore.toLocaleString()} pt)`
  );
  lines.push('>');
  lines.push(`> 🍉 **[충수박 플레이하러 가기](${DAEPAE_PLAY_URL})**`);
  lines.push('');
  lines.push('');

  return {
    category: '잡담',
    title,
    body: lines.join('\n'),
    source: 'daepae',
    scoreCard: data,
  };
};

export const parseWriteDraftFromSearch = (search: string): InitialPostDraft | null => {
  const params = new URLSearchParams(search || '');
  const shareSource = params.get('share')?.trim().toLowerCase();

  if (shareSource === 'daepae') {
    const classLabel = sanitizeSingleLineText(params.get('class'), '충수박', 24);
    const playerName = sanitizeSingleLineText(params.get('player'), '게스트', 24);
    const runScore = parseSafeScore(params.get('score'));
    const bestSingle = Math.max(runScore, parseSafeScore(params.get('best')));
    const clsRank = sanitizeRank(params.get('rank'));
    const clsWeeklyScore = parseSafeScore(params.get('classScore'));
    const topFruitEmoji = sanitizeFruitEmoji(params.get('fruit'));

    return buildDaepaeShareDraft({
      classLabel,
      playerName,
      runScore,
      bestSingle,
      clsRank,
      clsWeeklyScore,
      topFruitEmoji,
    });
  }

  const rawTitle = params.get('title');
  const rawBody = params.get('body');
  const rawCategory = params.get('category') as PostCategory | null;

  if (rawTitle || rawBody || rawCategory) {
    const category: PostCategory =
      rawCategory && ALLOWED_PUBLIC_CATEGORIES.has(rawCategory) ? rawCategory : '잡담';
    const title = sanitizeSingleLineText(rawTitle, '', 120);
    const body = rawBody
      ? removeBidiControlChars(rawBody)
          .replace(/\r\n/g, '\n')
          .slice(0, 4000)
      : '';
    if (title || body || rawCategory) {
      return {
        category,
        title,
        body,
      };
    }
  }

  return null;
};

export const hasDaepaePlayLink = (body?: string | null): boolean => {
  if (!body || typeof body !== 'string') return false;
  return /https?:\/\/daepae\.pages\.dev(?:\/|\b)/i.test(body);
};

function drawRoundedRectPath(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

export const renderDaepaeScoreCardCanvas = (
  canvas: HTMLCanvasElement,
  d: DaepaeScoreCardData
): boolean => {
  const c = canvas.getContext('2d');
  if (!c) return false;

  const W = canvas.width || 640;
  const H = canvas.height || 400;

  // 배경 그라데이션
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1c3023');
  bg.addColorStop(0.55, '#243b2c');
  bg.addColorStop(1, '#16261c');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // 외곽 골드 테두리
  c.strokeStyle = '#e0a44c';
  c.lineWidth = 6;
  drawRoundedRectPath(c, 12, 12, W - 24, H - 24, 22);
  c.stroke();

  // 우측 상단 장식 과일 원
  c.save();
  c.globalAlpha = 0.14;
  c.fillStyle = '#fde68a';
  c.beginPath();
  c.arc(W - 78, 86, 68, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // 타이틀 & 배지
  c.fillStyle = '#fde68a';
  c.font = '900 32px "Asta Sans", "Pretendard", "Noto Sans KR", sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText('🍉 충수박', 38, 58);

  // 소속 반 · 닉네임 필
  const tagText = `${d.classLabel} · ${d.playerName}`;
  c.font = '800 18px "Asta Sans", "Pretendard", "Noto Sans KR", sans-serif';
  const tagW = Math.min(340, c.measureText(tagText).width + 28);
  c.fillStyle = 'rgba(224, 164, 76, 0.22)';
  drawRoundedRectPath(c, 38, 86, tagW, 34, 10);
  c.fill();
  c.strokeStyle = 'rgba(253, 230, 138, 0.55)';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = '#fef3c7';
  c.fillText(tagText, 52, 103);

  // 우측 과일 이모지
  c.font = '58px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  c.textAlign = 'center';
  c.fillText(d.topFruitEmoji || '🍉', W - 78, 90);

  // 메인 점수 카드 (2칸)
  const mainLeftScore = d.runScore > 0 ? d.runScore : d.bestSingle;
  const mainLeftLabel = d.runScore > 0 ? '이번 판 점수' : '내 최고 기록 (한 판)';

  // 좌측 카드: 이번 판 / 최고 기록
  c.fillStyle = '#fffaf0';
  drawRoundedRectPath(c, 38, 144, 274, 142, 18);
  c.fill();
  c.textAlign = 'left';
  c.fillStyle = '#7a6652';
  c.font = '700 16px "Asta Sans", "Pretendard", "Noto Sans KR", sans-serif';
  c.fillText(mainLeftLabel, 58, 174);
  c.fillStyle = '#1f4d32';
  c.font = '900 40px "JetBrains Mono", monospace';
  c.fillText(mainLeftScore.toLocaleString(), 58, 224);
  c.fillStyle = '#6e5a47';
  c.font = '700 15px "Asta Sans", "Pretendard", "Noto Sans KR", sans-serif';
  c.fillText(
    d.runScore > 0 ? `내 최고 기록 ${d.bestSingle.toLocaleString()} pt` : '한 판 최고기록 대결',
    58,
    264
  );

  // 우측 카드: 우리 반 주간 순위
  c.fillStyle = '#fef3c7';
  drawRoundedRectPath(c, 328, 144, 274, 142, 18);
  c.fill();
  c.fillStyle = '#92400e';
  c.font = '700 16px "Asta Sans", "Pretendard", "Noto Sans KR", sans-serif';
  c.fillText(`${d.classLabel} 주간 순위`, 348, 174);
  c.fillStyle = '#78350f';
  c.font = '900 42px "Asta Sans", "Pretendard", "Noto Sans KR", sans-serif';
  c.fillText(`${d.clsRank}위`, 348, 224);
  c.fillStyle = '#92400e';
  c.font = '700 16px "JetBrains Mono", monospace';
  c.fillText(`총점 ${d.clsWeeklyScore.toLocaleString()} pt`, 348, 264);

  // 하단 푸터 바
  c.fillStyle = 'rgba(255, 255, 255, 0.08)';
  drawRoundedRectPath(c, 38, 308, W - 76, 54, 14);
  c.fill();
  c.fillStyle = '#d1e7d8';
  c.font = '700 16px "Asta Sans", "Pretendard", "Noto Sans KR", sans-serif';
  c.textAlign = 'left';
  c.fillText('1~3학년 12반 대항전 · 과일 합체 & 약탈 게임', 56, 336);
  c.fillStyle = '#fde68a';
  c.font = '800 16px "JetBrains Mono", monospace';
  c.textAlign = 'right';
  c.fillText('daepae.pages.dev', W - 56, 336);

  return true;
};

export const createDaepaeScoreCardFile = (
  canvas: HTMLCanvasElement,
  filename = 'chungsubak_score.png'
): Promise<File | null> =>
  new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], filename, { type: 'image/png' }));
      }, 'image/png');
    } catch {
      resolve(null);
    }
  });
