export type MentionType = 'bot' | 'role' | 'user';

export interface MentionCheckResult {
  enabled: boolean;
  disabledMessage?: string;
}

export interface MentionDefinition {
  id: string;
  handle: string; // e.g. '@asterisk'
  name: string;
  description?: string;
  type: MentionType;
  badge?: string;
  badgeBgColor?: string;
  badgeTextColor?: string;
  iconType?: 'knoblab' | 'user' | 'role';
  aliases?: string[]; // e.g. ['급식', 'meal']
  checkEnabled?: (context: { aiEnabled: boolean | null }) => MentionCheckResult;
}

/**
 * Built-in registered mentions registry.
 * Can be dynamically extended via registerMention().
 */
export const REGISTERED_MENTIONS: MentionDefinition[] = [
  {
    id: 'dasein',
    handle: '@dasein',
    name: 'Dasein;',
    description: '학술연구 전문 검색 (구글 CSE)',
    type: 'bot',
    badge: '학술',
    badgeBgColor: 'rgba(139, 31, 40, 0.12)',
    badgeTextColor: '#8B1F28',
    iconType: 'knoblab',
    aliases: ['dasein;', '다자인', '학술', '논문', '연구'],
  },
  {
    id: 'asterisk',
    handle: '@asterisk',
    name: 'asterisk',
    description: 'AI 어시스턴트',
    type: 'bot',
    badge: 'AI',
    badgeBgColor: 'rgba(229, 57, 53, 0.14)',
    badgeTextColor: 'var(--color-functional-red)',
    iconType: 'knoblab',
    aliases: ['ai', '어시스턴트', '아스테리스크'],
    checkEnabled: ({ aiEnabled }) => ({
      enabled: aiEnabled !== false,
      disabledMessage: '준비중인 기능입니다',
    }),
  },
  {
    id: 'meal',
    handle: '@meal',
    name: '학교 급식',
    description: '조식·중식·석식 메뉴 및 영양·알레르기',
    type: 'bot',
    badge: '급식',
    badgeBgColor: 'rgba(234, 88, 12, 0.12)',
    badgeTextColor: '#ea580c',
    iconType: 'knoblab',
    aliases: ['급식', '식단', '밥', '점심', '저녁'],
  },
  {
    id: 'timetable',
    handle: '@timetable',
    name: '학교 시간표',
    description: '학년/학급 실시간 시간표 및 학교 일과표',
    type: 'bot',
    badge: '시간표',
    badgeBgColor: 'rgba(59, 130, 246, 0.12)',
    badgeTextColor: '#2563eb',
    iconType: 'knoblab',
    aliases: ['시간표', '일과표', '수업', '교시'],
  },
  {
    id: 'calendar',
    handle: '@calendar',
    name: '구글 캘린더',
    description: '구글 캘린더/태스크 일정 등록 및 학사일정',
    type: 'bot',
    badge: '캘린더',
    badgeBgColor: 'rgba(16, 185, 129, 0.12)',
    badgeTextColor: '#059669',
    iconType: 'knoblab',
    aliases: ['캘린더', '일정', '스케줄', '태스크', '할일', '학사일정'],
  },
  {
    id: 'classroom',
    handle: '@classroom',
    name: '구글 클래스룸',
    description: '미제출 과제 및 수행평가 마감 현황',
    type: 'bot',
    badge: '과제',
    badgeBgColor: 'rgba(147, 51, 234, 0.12)',
    badgeTextColor: '#7c3aed',
    iconType: 'knoblab',
    aliases: ['클래스룸', '과제', '수행평가', '숙제'],
  },
  {
    id: 'archive',
    handle: '@archive',
    name: '선배 아카이브',
    description: '선배들의 과목 팁, 기출/수행평가 수기',
    type: 'bot',
    badge: '아카이브',
    badgeBgColor: 'rgba(217, 119, 6, 0.12)',
    badgeTextColor: '#d97706',
    iconType: 'knoblab',
    aliases: ['아카이브', '선배', '족보', '기출', '노하우'],
  },
  {
    id: 'posts',
    handle: '@posts',
    name: '게시글 검색',
    description: '커뮤니티 전체 게시글 및 공지사항 검색',
    type: 'bot',
    badge: '게시글',
    badgeBgColor: 'rgba(100, 116, 139, 0.12)',
    badgeTextColor: '#475569',
    iconType: 'knoblab',
    aliases: ['게시글', '글검색', '공지', '인기글'],
  },
  {
    id: 'history',
    handle: '@history',
    name: '내 활동 기록',
    description: '내가 작성한 글과 댓글 목록, 활동 이력',
    type: 'bot',
    badge: '내기록',
    badgeBgColor: 'rgba(79, 70, 229, 0.12)',
    badgeTextColor: '#4338ca',
    iconType: 'knoblab',
    aliases: ['내기록', '내글', '활동이력', '작성글'],
  },
  {
    id: 'now',
    handle: '@now',
    name: '현재 시각',
    description: 'KST 실시간 시각, 요일, 경과일, D-Day 계산',
    type: 'bot',
    badge: '시간',
    badgeBgColor: 'rgba(14, 165, 233, 0.12)',
    badgeTextColor: '#0284c7',
    iconType: 'knoblab',
    aliases: ['time', '시간', '시각', '디데이', 'd-day', '오늘'],
  },
];

/**
 * Register a new mention definition dynamically for future feature expansion.
 */
export const registerMention = (definition: MentionDefinition): void => {
  const existingIdx = REGISTERED_MENTIONS.findIndex(
    (m) => m.id === definition.id || m.handle.toLowerCase() === definition.handle.toLowerCase()
  );
  if (existingIdx >= 0) {
    REGISTERED_MENTIONS[existingIdx] = definition;
  } else {
    REGISTERED_MENTIONS.push(definition);
  }
};

/**
 * Return all registered mentions.
 */
export const getRegisteredMentions = (): MentionDefinition[] => {
  return [...REGISTERED_MENTIONS];
};

/**
 * Find a registered mention by its handle (e.g. '@asterisk') or id ('asterisk').
 */
export const getKnownMention = (handleOrId?: string | null): MentionDefinition | undefined => {
  if (!handleOrId) return undefined;
  const normalized = handleOrId.trim().toLowerCase();
  const handleWithAt = normalized.startsWith('@') ? normalized : `@${normalized}`;
  return REGISTERED_MENTIONS.find(
    (m) => m.handle.toLowerCase() === handleWithAt || m.id.toLowerCase() === normalized
  );
};

/**
 * Check whether a handle is an existing registered mention.
 */
export const isKnownMention = (handle?: string | null): boolean => {
  return Boolean(getKnownMention(handle));
};

export interface MentionFilterContext {
  aiEnabled?: boolean | null;
  target?: 'comment' | 'chat';
}

/**
 * Filter mentions matching typed query (e.g. after typing '@' or '@ast').
 * In community post comment sections (target === 'comment'), ONLY @asterisk is returned.
 * In 1:1 AI chat / home screen (target === 'chat'), ONLY @dasein is suggested (other tools do not use @tags).
 */
export const filterMentions = (
  query: string,
  context?: MentionFilterContext
): MentionDefinition[] => {
  const cleanQuery = query.replace(/^@/, '').trim().toLowerCase();
  let baseList = getRegisteredMentions();

  // If in comment section, strictly show only @asterisk
  if (context?.target === 'comment') {
    baseList = baseList.filter((m) => m.id === 'asterisk');
  }

  // In 1:1 AI chat / home screen, only @dasein retains tagging; other asterisk tools are called naturally
  if (context?.target === 'chat') {
    baseList = baseList.filter((m) => m.id === 'dasein');
  }

  if (!cleanQuery) {
    return baseList;
  }
  return baseList.filter((m) => {
    const handleWithoutAt = m.handle.slice(1).toLowerCase();
    const nameLower = m.name.toLowerCase();
    const idLower = m.id.toLowerCase();
    const matchesAlias = Boolean(
      m.aliases && m.aliases.some((al) => al.toLowerCase().includes(cleanQuery))
    );
    return (
      handleWithoutAt.includes(cleanQuery) ||
      nameLower.includes(cleanQuery) ||
      idLower.includes(cleanQuery) ||
      matchesAlias
    );
  });
};

/**
 * Extract clean academic search query from user prompt containing conversational intent.
 * (e.g. "@dasein -- 연구동향 알려줘" -> "과학 연구동향", "@dasein 초전도체 -- 연구동향 알려줘" -> "초전도체")
 */
export const extractDaseinSearchQuery = (rawText?: string | null): string => {
  if (!rawText) return '';
  let text = String(rawText);

  // 1. Remove @dasein and any other mention tags
  text = text.replace(/@(?:dasein;?|다자인|학술|논문)(?=[^\w\uAC00-\uD7A3]|$)/gi, ' ');
  text = text.replace(/@[a-zA-Z0-9_\uAC00-\uD7A3;-]+/g, ' ');

  // 2. Normalize standalone separators (-- or - or :) but preserve intra-word hyphens (LK-99, CRISPR-Cas9)
  text = text.replace(/(?:^|\s)[-—–~:|]+(?:\s|$)/g, ' ');

  // 3. Remove conversational request prefixes & suffixes
  const conversationalStopwords = [
    /(?:에\s*대해(?:서)?|에\s*대한|에\s*관해(?:서)?|에\s*관한|관련(?:해서|하여|된)?|관하여|대하여|대해)/gi,
    /(?:최신|최근|주요|새로운|올해)?\s*(?:학술\s*)?(?:연구\s*동향|개발\s*동향|연구\s*현황|동향|트렌드|연구|논문|자료|보고서|문헌)(?:이나|나|들|도)?/gi,
    /(?:알려줘(?:요|라|봐|줄래|세요)?|알려\s*주세요|알려\s*줘)/gi,
    /(?:찾아줘(?:요|라|봐|줄래|세요)?|찾아\s*주세요|찾아\s*줘|찾아봐|찾아\s*봐)/gi,
    /(?:검색해줘(?:요|라|봐|줄래|세요)?|검색\s*해주세요|검색\s*해줘|검색해|검색)/gi,
    /(?:조사해줘(?:요|라|봐|줄래|세요)?|조사\s*해주세요|조사\s*해줘|조사해|조사)/gi,
    /(?:정리해줘(?:요|라|봐|줄래|세요)?|정리\s*해주세요|정리\s*해줘|정리)/gi,
    /(?:설명해줘(?:요|라|봐|줄래|세요)?|설명\s*해주세요|설명\s*해줘|설명)/gi,
    /(?:소개해줘(?:요|라|봐|줄래|세요)?|소개\s*해주세요|소개\s*해줘|소개)/gi,
    /(?:요약해줘(?:요|라|봐|줄래|세요)?|요약\s*해주세요|요약\s*해줘|요약)/gi,
    /(?:추천해줘(?:요|라|봐|줄래|세요)?|추천\s*해주세요|추천\s*해줘|추천)/gi,
    /(?:분석해줘(?:요|라|봐|줄래|세요)?|분석\s*해주세요|분석\s*해줘|분석)/gi,
    /(?:궁금해(?:요)?|알고\s*싶어(?:요)?|보고\s*싶어(?:요)?)/gi,
    /(?:부탁해(?:요)?|해줘(?:요)?|해줘라|해봐|부탁드립니다)/gi,
    /(?:있을까(?:요)?|있나(?:요)?|뭐가\s*있어(?:요)?|어떤\s*게\s*있어(?:요)?)/gi,
    /(?:^|\s)(?:좀|혹시|제발|한번|다시|모두|전부|관련)(?:\s|$)/gi,
  ];

  for (const pattern of conversationalStopwords) {
    text = text.replace(pattern, ' ');
  }

  // 4. Remove trailing Korean postpositions/particles from words (e.g. 펙틴필름을 -> 펙틴필름, 초전도체에 -> 초전도체)
  text = text.replace(/(?<=[가-힣0-9a-zA-Z])(?:으로|로|의|에|을|를|은|는|이|가|과|와)(?=\s|$)/g, '');

  // 5. Strip punctuation and excessive whitespace
  text = text.replace(/[?!.,;:~`^&*+=_\"']/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  // If everything was stripped (e.g. user typed literally '@dasein -- 연구동향 알려줘')
  if (!text) {
    return '과학 연구동향';
  }

  return text;
};
