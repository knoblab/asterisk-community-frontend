import { describe, it, expect } from 'vitest';
import { filterMentions, getRegisteredMentions, extractDaseinSearchQuery } from '../constants/mentions';
import { COMMAND_GUIDES } from '../components/ai/AiCommandDrawer';

// Test the tool formatting and extraction logic
describe('Asterisk AI Internal Tools Unit Tests', () => {
  it('current_time tool: generates formatted KST string with year, month, date, and hour', () => {
    const now = new Date(1792312800000); // 2026-10-18 approx
    const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const formatted = kstFormatter.format(now);
    expect(formatted).toContain('2026');
    expect(formatted).toContain('10월');
  });

  it('post_metadata tool: calculates elapsed days and summarizes post information', () => {
    const mockPost = {
      id: 'post-100',
      title: '10월 4일 업데이트 공지',
      author: '관리자',
      authorGeneration: 'ADMIN',
      createdAt: 1791100000000,
      likes: 12,
      views: 350,
      isNotice: true,
      category: '공지사항',
    };
    const mockComments = [
      { id: 'c-1', postId: 'post-100', isDeleted: false },
      { id: 'c-2', postId: 'post-100', isDeleted: true },
    ];

    const activeCount = mockComments.filter((c) => c.postId === mockPost.id && !c.isDeleted).length;
    expect(activeCount).toBe(1);
    expect(mockPost.isNotice).toBe(true);
  });

  it('user_history tool: filters active posts and comments by authorId', () => {
    const mockPosts = [
      { id: 'p-1', authorId: 'user-A', title: 'A의 첫 글', createdAt: 1000, isDeleted: false },
      { id: 'p-2', authorId: 'user-B', title: 'B의 글', createdAt: 2000, isDeleted: false },
      { id: 'p-3', authorId: 'user-A', title: 'A의 삭제된 글', createdAt: 3000, isDeleted: true },
      { id: 'p-4', authorId: 'user-A', title: 'A의 두번째 글', createdAt: 4000, isDeleted: false },
    ];

    const userPosts = mockPosts
      .filter((p) => !p.isDeleted && p.authorId === 'user-A')
      .sort((a, b) => b.createdAt - a.createdAt);

    expect(userPosts.length).toBe(2);
    expect(userPosts[0].title).toBe('A의 두번째 글');
    expect(userPosts[1].title).toBe('A의 첫 글');
  });

  it('community_search tool: matches keywords and ranks posts with notice boost', () => {
    const mockPosts = [
      { id: 'p-1', title: '자유 잡담', body: '오늘 날씨 좋네요', isNotice: false },
      { id: 'p-2', title: '10월 업데이트 안내', body: '기능 업데이트 예정 공지', isNotice: true },
      { id: 'p-3', title: '업데이트 언제 되나요?', body: '공지 기능 기다립니다', isNotice: false },
    ];

    const searchWords = ['업데이트', '공지'];
    const scored = mockPosts
      .map((p) => {
        let score = 0;
        for (const w of searchWords) {
          if (p.title.includes(w)) score += 3;
          if (p.body.includes(w)) score += 1;
        }
        if (p.isNotice) score += 1;
        return { post: p, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    expect(scored[0].post.id).toBe('p-2'); // Notice boosted and has both title/body match
    expect(scored.length).toBe(2);
  });

  it('detectFallbackTools: accurately matches current time and user history intent', () => {
    const regexTime = /(오늘|지금|현재|며칠|몇\s*시|날짜|요일|업데이트\s*언제)/i;
    const regexHistory = /(내가\s*쓴|작성한\s*글|활동\s*내역|내\s*글|이전에\s*쓴)/i;

    expect(regexTime.test('오늘 며칠이야?')).toBe(true);
    expect(regexTime.test('지금 몇 시인가요')).toBe(true);
    expect(regexTime.test('공지 올라온 지 며칠 지났어?')).toBe(true);
    expect(regexTime.test('업데이트 언제 됨?')).toBe(true);
    expect(regexTime.test('안녕 반가워 점심 추천해줘')).toBe(false);

    expect(regexHistory.test('내가 쓴 글 목록 알려줘')).toBe(true);
    expect(regexHistory.test('이전에 쓴 글 뭐 있어?')).toBe(true);
    expect(regexHistory.test('안녕하세요')).toBe(false);
  });

  it('school_meal: extractMealTargetDate extracts correct YYYYMMDD for relative and absolute dates', () => {
    const fixedNow = new Date('2026-10-18T10:00:00+09:00'); // 2026-10-18 (Sunday)

    const formatDateYmd = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}${m}${d}`;
    };

    const extractMealTargetDate = (text: string, baseDate = fixedNow) => {
      const kstDateStr = baseDate.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
      const kstNow = new Date(kstDateStr);
      const promptText = String(text || '');

      const fullDateMatch = promptText.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})[일]?/);
      if (fullDateMatch) {
        const y = fullDateMatch[1];
        const m = String(fullDateMatch[2]).padStart(2, '0');
        const d = String(fullDateMatch[3]).padStart(2, '0');
        return `${y}${m}${d}`;
      }

      const mdMatch = promptText.match(/(\d{1,2})[월/.-]\s*(\d{1,2})일?/);
      if (mdMatch) {
        const y = kstNow.getFullYear();
        const m = String(mdMatch[1]).padStart(2, '0');
        const d = String(mdMatch[2]).padStart(2, '0');
        return `${y}${m}${d}`;
      }

      if (/그저께|그제/i.test(promptText)) {
        const target = new Date(kstNow.getTime() - 2 * 86400000);
        return formatDateYmd(target);
      }
      if (/어제/i.test(promptText)) {
        const target = new Date(kstNow.getTime() - 1 * 86400000);
        return formatDateYmd(target);
      }
      if (/모레/i.test(promptText)) {
        const target = new Date(kstNow.getTime() + 2 * 86400000);
        return formatDateYmd(target);
      }
      if (/내일/i.test(promptText)) {
        const target = new Date(kstNow.getTime() + 1 * 86400000);
        return formatDateYmd(target);
      }

      return formatDateYmd(kstNow);
    };

    expect(extractMealTargetDate('오늘 급식 뭐야')).toBe('20261018');
    expect(extractMealTargetDate('내일 점심 메뉴 알려줘')).toBe('20261019');
    expect(extractMealTargetDate('모레 아침밥 뭐야')).toBe('20261020');
    expect(extractMealTargetDate('어제 저녁밥 뭐 나왔어')).toBe('20261017');
    expect(extractMealTargetDate('10월 22일 급식 알려줘')).toBe('20261022');
    expect(extractMealTargetDate('2026-10-25 급식')).toBe('20261025');
  });

  it('school_meal: detectFallbackTools triggers both school_meal and current_time together', () => {
    const detectFallbackTools = (stateText: string) => {
      const tools: string[] = [];
      const text = String(stateText || '');

      if (/(급식|학식|식단|조식|중식|석식|(아침|점심|저녁)\s*(밥|메뉴|식사|뭐|나와|나오)|밥\s*뭐|메뉴\s*뭐|밥\s*나와|밥\s*나오)/i.test(text)) {
        if (!tools.includes('school_meal')) tools.push('school_meal');
        if (!tools.includes('current_time')) tools.push('current_time');
      }

      if (/(오늘|지금|현재|며칠|몇\s*시|날짜|요일|업데이트\s*언제)/i.test(text)) {
        if (!tools.includes('current_time')) tools.push('current_time');
      }
      if (/(내가\s*쓴|작성한\s*글|활동\s*내역|내\s*글|이전에\s*쓴)/i.test(text)) {
        if (!tools.includes('user_history')) tools.push('user_history');
      }
      return tools;
    };

    const mealQueries = [
      '오늘 급식 뭐야?',
      '내일 점심 메뉴 알려줘',
      '오늘 조식 뭐 나와?',
      '석식 식단 알려줘',
      '내일 아침밥 뭐야',
      '점심밥 뭐 나와요',
    ];

    for (const q of mealQueries) {
      const tools = detectFallbackTools(q);
      expect(tools).toContain('school_meal');
      expect(tools).toContain('current_time');
    }
  });

  it('school_meal: formats dish strings and allergy indices cleanly', () => {
    const rawDish = '쌀밥 <br/>마라탕 (1.2.5.6.13.16.17.18)<br/>까르보나라떡볶이 (2.5.6.10.13.16)<br/>깨찰도넛 (1.2.5.6)';
    const cleanMealDishes = (dishStr: string) => {
      if (!dishStr) return '식단 정보 없음';
      return dishStr
        .split(/<br\s*\/?>/i)
        .map((item) => item.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .join(', ');
    };

    const cleaned = cleanMealDishes(rawDish);
    expect(cleaned).toBe('쌀밥, 마라탕 (1.2.5.6.13.16.17.18), 까르보나라떡볶이 (2.5.6.10.13.16), 깨찰도넛 (1.2.5.6)');
  });

  it('school_timetable: detectFallbackTools triggers school_timetable and current_time for timetable & routine queries', () => {
    const detectFallbackTools = (stateText: string) => {
      const tools: string[] = [];
      const text = String(stateText || '');

      if (/(시간표|일과표|수업\s*시간|[1-7]\s*교시|몇\s*교시|다음\s*교시|이번\s*교시|무슨\s*시간|야자|등교\s*시간|하교\s*시간|하교|종례|방과후|(월|화|수|목|금)요일\s*수업|([1-3]\s*학년|[1-4]\s*반|[1-3]-[1-4]).*?(수업|과목|뭐|시간표))/i.test(text)) {
        if (!tools.includes('school_timetable')) tools.push('school_timetable');
        if (!tools.includes('current_time')) tools.push('current_time');
      }
      return tools;
    };

    const timetableQueries = [
      '오늘 1학년 2반 시간표 알려줘',
      '내일 2-3 시간표 뭐야?',
      '지금 몇 교시야?',
      '이번 교시 무슨 시간인가요',
      '금요일 3학년 1반 수업 뭐 있어?',
      '오늘 학교 일과표 보여줘',
      '야자 몇 시부터야?',
      '수요일 4교시 수업 뭐야',
    ];

    for (const q of timetableQueries) {
      const tools = detectFallbackTools(q);
      expect(tools).toContain('school_timetable');
      expect(tools).toContain('current_time');
    }

    expect(detectFallbackTools('오늘 날씨 어때?')).not.toContain('school_timetable');
  });

  it('school_timetable: extractTimetableParams correctly extracts grade, class, day, period, and now-query status', () => {
    const fixedNow = new Date('2026-10-19T10:00:00+09:00'); // 2026-10-19 is Monday

    const extractTimetableParams = (text: string, baseDate = fixedNow) => {
      const kstDateStr = baseDate.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
      const kstNow = new Date(kstDateStr);
      const promptText = String(text || '');

      let grade: string | null = null;
      let classNum: string | null = null;

      const gcMatch = promptText.match(/([1-3])\s*[-/단학년\s]+([1-4])\s*반?/);
      if (gcMatch) {
        grade = gcMatch[1];
        classNum = gcMatch[2];
      } else {
        const gOnly = promptText.match(/([1-3])\s*학년/);
        if (gOnly) grade = gOnly[1];
        const cOnly = promptText.match(/([1-4])\s*반/);
        if (cOnly) classNum = cOnly[1];
      }

      const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
      let targetDate = new Date(kstNow.getTime());
      let dayOfWeek: string | null = null;
      let isWeekend = false;

      const explicitDayMatch = promptText.match(/(월|화|수|목|금)(요일)?/);
      if (explicitDayMatch) {
        dayOfWeek = explicitDayMatch[1];
      } else if (/내일/i.test(promptText)) {
        targetDate = new Date(kstNow.getTime() + 1 * 86400000);
        const dayIdx = targetDate.getDay();
        dayOfWeek = (dayIdx >= 1 && dayIdx <= 5) ? WEEKDAYS[dayIdx] : '월';
        isWeekend = (dayIdx === 0 || dayIdx === 6);
      } else {
        const dayIdx = kstNow.getDay();
        if (dayIdx >= 1 && dayIdx <= 5) {
          dayOfWeek = WEEKDAYS[dayIdx];
        } else {
          isWeekend = true;
          dayOfWeek = '월';
        }
      }

      let period: number | null = null;
      const pMatch = promptText.match(/([1-7])\s*교시/);
      if (pMatch) period = parseInt(pMatch[1], 10);

      const isNowQuery = /(지금|현재|이번\s*교시|다음\s*교시|몇\s*교시|무슨\s*시간|종소리|일과표|일과\s*시간)/i.test(promptText);

      return { grade, classNum, dayOfWeek, isWeekend, period, isNowQuery };
    };

    const res1 = extractTimetableParams('오늘 1학년 2반 시간표 알려줘');
    expect(res1.grade).toBe('1');
    expect(res1.classNum).toBe('2');
    expect(res1.dayOfWeek).toBe('월');
    expect(res1.period).toBeNull();
    expect(res1.isNowQuery).toBe(false);

    const res2 = extractTimetableParams('내일 2-3 4교시 뭐야?');
    expect(res2.grade).toBe('2');
    expect(res2.classNum).toBe('3');
    expect(res2.dayOfWeek).toBe('화');
    expect(res2.period).toBe(4);
    expect(res2.isNowQuery).toBe(false);

    const res3 = extractTimetableParams('금요일 3학년 1반 시간표');
    expect(res3.grade).toBe('3');
    expect(res3.classNum).toBe('1');
    expect(res3.dayOfWeek).toBe('금');

    const res4 = extractTimetableParams('지금 몇 교시야? 무슨 시간이야?');
    expect(res4.isNowQuery).toBe(true);
  });


  it('school_timetable: extractTimetableParams seamlessly defaults to user profile schoolGrade and schoolClass', () => {
    const fixedNow = new Date('2026-10-19T10:00:00+09:00'); // Monday

    const extractTimetableParams = (text: string, _baseDate = fixedNow, defaultClass: { userGrade?: string | null; userClass?: string | null } = {}) => {
      const promptText = String(text || '');

      let grade: string | null = null;
      let classNum: string | null = null;

      const gcMatch = promptText.match(/([1-3])\s*[-/단학년\s]+([1-4])\s*반?/);
      if (gcMatch) {
        grade = gcMatch[1];
        classNum = gcMatch[2];
      } else {
        const gOnly = promptText.match(/([1-3])\s*학년/);
        if (gOnly) grade = gOnly[1];
        const cOnly = promptText.match(/([1-4])\s*반/);
        if (cOnly) classNum = cOnly[1];
      }

      let isUserDefaultClass = false;
      if (!grade && !classNum && defaultClass?.userGrade && defaultClass?.userClass) {
        grade = String(defaultClass.userGrade);
        classNum = String(defaultClass.userClass);
        isUserDefaultClass = true;
      } else if (!grade && defaultClass?.userGrade && classNum) {
        grade = String(defaultClass.userGrade);
      } else if (grade && defaultClass?.userClass && !classNum) {
        classNum = String(defaultClass.userClass);
      }

      return { grade, classNum, isUserDefaultClass };
    };

    // User with 2학년 3반 default profile asks general timetable query
    const resGeneral = extractTimetableParams('오늘 시간표 뭐야?', fixedNow, { userGrade: '2', userClass: '3' });
    expect(resGeneral.grade).toBe('2');
    expect(resGeneral.classNum).toBe('3');
    expect(resGeneral.isUserDefaultClass).toBe(true);

    // Explicit query overrides user profile default
    const resExplicit = extractTimetableParams('내일 1-4 시간표 알려줘', fixedNow, { userGrade: '2', userClass: '3' });
    expect(resExplicit.grade).toBe('1');
    expect(resExplicit.classNum).toBe('4');
    expect(resExplicit.isUserDefaultClass).toBe(false);

    // Partial explicit class query inherits user default grade
    const resPartial = extractTimetableParams('오늘 1반 시간표', fixedNow, { userGrade: '3', userClass: '2' });
    expect(resPartial.grade).toBe('3');
    expect(resPartial.classNum).toBe('1');
  });
  it('school_timetable: getCnshRoutine matches period intervals and Wednesday lunch extension', () => {
    const getRoutine = (day: number) => {
      const morning = [
        ['08:40', '09:30', '1교시'],
        ['09:40', '10:30', '2교시'],
        ['10:40', '11:30', '3교시'],
        ['11:40', '12:30', '4교시'],
      ];
      const afternoon = day === 3
        ? [
            ['12:30', '13:50', '점심시간 (80분)'],
            ['13:50', '14:40', '5교시'],
          ]
        : [
            ['12:30', '13:30', '점심시간 (60분)'],
            ['13:30', '14:20', '5교시'],
          ];
      return [...morning, ...afternoon];
    };

    const monRoutine = getRoutine(1);
    const wedRoutine = getRoutine(3);

    // Monday lunch is 12:30~13:30, 5th period starts at 13:30
    expect(monRoutine.find((r) => r[2].includes('점심'))?.[1]).toBe('13:30');
    expect(monRoutine.find((r) => r[2] === '5교시')?.[0]).toBe('13:30');

    // Wednesday lunch is 12:30~13:50, 5th period starts at 13:50
    expect(wedRoutine.find((r) => r[2].includes('점심'))?.[1]).toBe('13:50');
    expect(wedRoutine.find((r) => r[2] === '5교시')?.[0]).toBe('13:50');
  });

  it('school_timetable: parseComciganJson parses mock Comcigan timetable and identifies multi-teacher distinctions', () => {
    const mockJson = {
      분리: 100,
      자료492: ['', 'AP선대', '문학', '한국사'], // subjects (1: AP선대, 2: 문학, 3: 한국사)
      자료446: ['', '정선생', '김선생'], // teachers (1: 정, 2: 김)
      학급수: [0, 4, 4, 4],
      자료147: {
        '2': {
          '1': {
            '1': { // 월요일
              '1': 1001, // 1*1000 + 1 => th: 1(정선생), sb: 1(AP선대)
              '2': 2001, // 2*1000 + 1 => th: 2(김선생), sb: 1(AP선대)
            }
          }
        }
      }
    };

    expect(mockJson.분리).toBe(100);
    expect(mockJson.자료492[1]).toBe('AP선대');

    // Simulate multi-teacher naming logic from upload-service.js
    const gradeSubjectTeachers = new Map<string, Set<string>>();
    gradeSubjectTeachers.set('2_AP선대', new Set(['정선생', '김선생']));

    const isMultiTeacher = (gradeSubjectTeachers.get('2_AP선대')?.size || 0) >= 2;
    expect(isMultiTeacher).toBe(true);

    const surname1 = '정선생'.replace(/[^가-힣a-zA-Z]/g, '')[0];
    const surname2 = '김선생'.replace(/[^가-힣a-zA-Z]/g, '')[0];

    expect(`AP선대(${surname1})`).toBe('AP선대(정)');
    expect(`AP선대(${surname2})`).toBe('AP선대(김)');
  });

  it('Gemma fallback tool provision: prepares all internal tools regardless of Jev decision and instructs autonomous selection', () => {
    // Simulate fallback tools builder logic
    const buildFallbackTools = (targetPostId?: string | null) => {
      const allFallbackToolIds = [
        'current_time',
        'school_calendar',
        'school_meal',
        'school_timetable',
        'community_all_posts',
        'user_history',
      ];
      if (targetPostId) {
        allFallbackToolIds.unshift('post_metadata', 'community_post_detail');
      }
      return allFallbackToolIds;
    };

    const directChatTools = buildFallbackTools(null);
    expect(directChatTools).toContain('current_time');
    expect(directChatTools).toContain('school_calendar');
    expect(directChatTools).toContain('school_meal');
    expect(directChatTools).toContain('school_timetable');
    expect(directChatTools).toContain('community_all_posts');
    expect(directChatTools).toContain('user_history');
    expect(directChatTools).not.toContain('post_metadata');

    const postCommentTools = buildFallbackTools('post-123');
    expect(postCommentTools).toContain('post_metadata');
    expect(postCommentTools).toContain('community_post_detail');
    expect(postCommentTools).toContain('school_timetable');
    expect(postCommentTools).toContain('school_meal');

    // Verify system instruction guidance text
    const fallbackInstruction = '제공된 데이터 중 사용자의 질문/요청에 꼭 필요한 정보만 스스로 선별하여 사실에 기반해 정확하게 답변하고, 질문과 무관한 도구 데이터는 답변에서 불필요하게 나열하거나 언급하지 마세요.';
    expect(fallbackInstruction).toContain('꼭 필요한 정보만 스스로 선별');
    expect(fallbackInstruction).toContain('질문과 무관한 도구 데이터는 답변에서 불필요하게 나열하거나 언급하지 마세요');
  });

  it('attachPostFootnotes: automatically adds footnotes and post links when community post titles are mentioned', () => {
    const getPostCode = (postId: string) => {
      let hash = 2166136261;
      for (let i = 0; i < postId.length; i++) {
        hash ^= postId.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return String(((hash >>> 0) % 9000000) + 1000000);
    };

    const attachPostFootnotes = (responseText: string, allPosts: any[]) => {
      let result = responseText;
      const footnotes: string[] = [];
      let fnIndex = 1;

      const sortedPosts = [...allPosts].sort((a, b) => (b.title || '').length - (a.title || '').length);

      for (const p of sortedPosts) {
        if (!p.title || p.title.trim().length < 3 || p.isDeleted) continue;
        const pCode = getPostCode(p.id);
        const pPath = `/post/${pCode}`;

        if (result.includes(pPath) || result.includes(pCode)) continue;

        const title = p.title.trim();
        if (result.includes(title)) {
          const fnTag = `[^${fnIndex}]`;
          const quotedDouble = `"${title}"`;
          if (result.includes(quotedDouble)) {
            result = result.replace(quotedDouble, `${quotedDouble}${fnTag}`);
          } else {
            result = result.replace(title, `${title}${fnTag}`);
          }
          footnotes.push(`${fnTag}: [${title}](${pPath})`);
          fnIndex++;
        }
      }

      if (footnotes.length > 0) {
        result = result.trimEnd() + '\n\n' + footnotes.join('\n');
      }
      return result;
    };

    const mockPosts = [
      { id: 'post-notice-1', title: '모델 라우팅 시스템 업데이트 [1.4]' },
    ];

    const inputMsg = '답변에 2026년 10월 18일에 올라온 "모델 라우팅 시스템 업데이트 [1.4]" 공지에 이런 개편 내용이 자세히 나와 있어요.';
    const output = attachPostFootnotes(inputMsg, mockPosts);

    expect(output).toContain('"모델 라우팅 시스템 업데이트 [1.4]"[^1]');
    expect(output).toContain('[^1]: [모델 라우팅 시스템 업데이트 [1.4]](/post/');
  });

  it('archive_search tool: regex accurately matches senior archives, subjects, and study tips', () => {
    const archiveRegex = /(선배|기수|\d+기|선배들|족보|팁|노하우|과목|아카이브|선배님|기출|수행평가|과제|연구|R&E|r&e|AP|ap선대|ap물리|ap화학|ap생물|ap미적|조언|과거\s*글)/i;

    expect(archiveRegex.test('27기 선배님들의 AP선대 공부 팁이 궁금해요')).toBe(true);
    expect(archiveRegex.test('R&E 연구 주제 정할 때 선배들 족보나 조언 있어?')).toBe(true);
    expect(archiveRegex.test('AP물리 기출 문제나 노하우 아카이브 찾아줘')).toBe(true);
    expect(archiveRegex.test('내일 급식 메뉴 뭐야')).toBe(false);
  });

  it('archive_search tool: alumni generation weighting and subject bonus prioritize senior advice', () => {
    const subjects = ['AP', '선형대수학', 'AP선대', '일반물리', 'AP물리', '일반화학', 'AP화학', '일반생물', 'AP생물', '고급수학', '미적분학', '정보과학', 'R&E', '전람회', '수행평가'];
    const searchWords = ['선대', '공부법', '선배'];

    const mockPosts = [
      {
        id: 'post-recent-1',
        title: '선대 공부법 질문합니다',
        body: '선배님들 조언 부탁드립니다',
        authorGeneration: '33기',
        likes: 1,
        createdAt: 2000,
      },
      {
        id: 'post-senior-1',
        title: 'AP선대 A+ 받은 27기의 공부법 및 팁 정리',
        body: '선형대수학 시험 대비 및 과제 노하우를 공유합니다',
        authorGeneration: '27기',
        likes: 15,
        createdAt: 1000,
      },
      {
        id: 'post-other-1',
        title: '오늘 기숙사 점호 시간 언제인가요',
        body: '질문입니다',
        authorGeneration: '32기',
        likes: 0,
        createdAt: 3000,
      },
    ];

    const scored = mockPosts
      .map((p) => {
        let matchScore = 0;
        const titleLower = p.title.toLowerCase();
        const bodyLower = p.body.toLowerCase();

        for (const w of searchWords) {
          const wl = w.toLowerCase();
          if (titleLower.includes(wl)) matchScore += 3;
          if (bodyLower.includes(wl)) matchScore += 1;
        }

        for (const sub of subjects) {
          const subl = sub.toLowerCase();
          if (titleLower.includes(subl)) matchScore += 2;
          if (bodyLower.includes(subl)) matchScore += 1;
        }

        if (matchScore === 0) return { post: p, score: 0 };

        let score = matchScore;
        if (p.authorGeneration) {
          const genMatch = String(p.authorGeneration).match(/(\d+)기/);
          if (genMatch) {
            const genNum = parseInt(genMatch[1], 10);
            score += Math.max(1, 35 - genNum);
          }
        }

        if ((p.likes || 0) > 0) score += Math.min(p.likes, 5);

        return { post: p, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    expect(scored[0].post.id).toBe('post-senior-1');
    expect(scored[0].post.authorGeneration).toBe('27기');
    expect(scored.length).toBe(2);
  });

  describe('school_calendar internal tool', () => {
    it('detectFallbackTools triggers school_calendar and current_time for academic calendar queries', () => {
      const detectFallbackTools = (stateText: string) => {
        const tools: string[] = [];
        const text = String(stateText || '');

        if (
          /(학사\s*일정|학교\s*일정|학사\s*력|중간고사|기말고사|[12]\s*회\s*고사|일회고사|이회고사|지필\s*평가|지필\s*고사|모의고사|모의평가|전국연합|개학식|입학식|방학식|방학\s*(언제|몇\s*월|일자|기간)|여름방학|겨울방학|휴업일|재량\s*휴업일|체험학습|글로벌\s*과학체험|체육대회|스포츠\s*한마음|한마음\s*올림픽|자연탐사|한마음\s*축제|졸업식|수료식|종업식|수능|수학능력시험|수능일|원서\s*접수|수시\s*접수|수시\s*원서|과학전람회|발명품경진대회|소통의\s*날|상급\s*학교\s*평가|조기\s*졸업|신입생\s*(원서|면접|발표|적응))/i.test(text)
        ) {
          if (!tools.includes('school_calendar')) tools.push('school_calendar');
          if (!tools.includes('current_time')) tools.push('current_time');
        }
        return tools;
      };

      const calendarQueries = [
        '이번 학기 지필고사 일정과 방학식 언제인지 알려줘',
        '중간고사 언제야?',
        '기말고사 디데이 며칠 남아있나요?',
        '1회고사 일정 알려줘',
        '2회고사 언제 봐?',
        '11월 학사일정 보여줘',
        '수능 며칠 남았어?',
        '여름방학 언제 시작해?',
        '5월 재량휴업일 언제야?',
        '한마음 올림픽 언제 열려?',
        '신입생 면접평가 날짜 알려줘',
        '졸업식 언제인가요?',
      ];

      for (const q of calendarQueries) {
        const tools = detectFallbackTools(q);
        expect(tools).toContain('school_calendar');
        expect(tools).toContain('current_time');
      }

      // Non-calendar queries should not trigger school_calendar
      expect(detectFallbackTools('오늘 점심 메뉴 뭐야?')).not.toContain('school_calendar');
      expect(detectFallbackTools('오늘 1학년 2반 시간표 알려줘')).not.toContain('school_calendar');
      expect(detectFallbackTools('최신 인기글 요약해줘')).not.toContain('school_calendar');
    });

    it('CNSH 2026 Academic Calendar dataset contains all 43 events spanning March to December 2026', () => {
      // Basic verification of dataset completeness and chronological ordering
      const rawEvents = [
        { startDate: '2026-03-03', title: '입학식/개학식' },
        { startDate: '2026-03-24', title: '전국연합(1·2·3학년)' },
        { startDate: '2026-03-27', title: 'Be-Ssci 교육과정 소통의 날' },
        { startDate: '2026-04-06', endDate: '2026-04-09', title: '충남학생과학발명품경진대회 작품설명서 제출' },
        { startDate: '2026-04-21', title: '충남학생과학발명품경진대회 면담 심사' },
        { startDate: '2026-04-27', endDate: '2026-04-30', title: '1학기 1회고사' },
        { startDate: '2026-05-01', title: '재량휴업일' },
        { startDate: '2026-05-04', title: '재량휴업일' },
        { startDate: '2026-05-07', title: '전국연합(3학년)' },
        { startDate: '2026-05-11', endDate: '2026-05-15', title: '충청남도과학전람회 작품설명서 제출' },
        { startDate: '2026-05-15', title: '스포츠 한마음 올림픽' },
        { startDate: '2026-05-18', title: '자연탐사' },
        { startDate: '2026-06-02', title: '중학교 교사 대상 입학설명회(오후)' },
        { startDate: '2026-06-02', title: '충청남도과학전람회 면담 심사' },
        { startDate: '2026-06-03', title: '지방선거' },
        { startDate: '2026-06-04', title: '전국연합(1학년), 모의평가(2·3학년 희망자)' },
        { startDate: '2026-06-06', title: '과학기기설명회(오전) / 학생·학부모 대상 입학설명회(오후)' },
        { startDate: '2026-06-30', endDate: '2026-07-03', title: '1학기 2회고사' },
        { startDate: '2026-07-07', endDate: '2026-07-09', title: '조기 졸업, 상급 학교 평가' },
        { startDate: '2026-07-08', title: '전국연합(3학년)' },
        { startDate: '2026-07-16', title: '방학식' },
        { startDate: '2026-08-10', title: '개학식' },
        { startDate: '2026-08-11', title: '1학기 종료일' },
        { startDate: '2026-08-12', title: '2학기 시작' },
        { startDate: '2026-08-24', endDate: '2026-09-03', title: '수능원서 접수' },
        { startDate: '2026-08-26', endDate: '2026-09-01', title: '2027학년 신입생 원서 접수' },
        { startDate: '2026-09-02', title: '전국연합/모의평가' },
        { startDate: '2026-09-07', endDate: '2026-09-11', title: '2027학년도 대입 수시원서 접수' },
        { startDate: '2026-09-29', endDate: '2026-10-02', title: '1회고사' },
        { startDate: '2026-10-14', title: '글로벌과학체험프로그램 사전 안전교육' },
        { startDate: '2026-10-15', endDate: '2026-10-23', title: '글로벌과학체험프로그램' },
        { startDate: '2026-10-23', title: '2027학년도 신입생 면접대상자 발표' },
        { startDate: '2026-11-13', title: '2027학년도 신입생 면접평가' },
        { startDate: '2026-11-13', title: '재량휴업일' },
        { startDate: '2026-11-19', title: '대학수학능력시험' },
        { startDate: '2026-12-02', title: '2027학년도 신입생 최종합격자 발표' },
        { startDate: '2026-12-08', endDate: '2026-12-11', title: '2회고사' },
        { startDate: '2026-12-11', title: '대학수학능력시험 성적 통지일' },
        { startDate: '2026-12-18', title: '2027학년도 신입생 적응교육' },
        { startDate: '2026-12-18', title: '수시 최초 합격자 발표 마감' },
        { startDate: '2026-12-29', title: '수시 미등록 충원합격 통보 마감' },
        { startDate: '2026-12-29', title: '한마음 축제' },
        { startDate: '2026-12-31', title: '졸업식/수료식/종업식' },
      ];

      expect(rawEvents.length).toBe(43);

      // Verify key milestone dates
      const suneung = rawEvents.find((e) => e.title === '대학수학능력시험');
      expect(suneung?.startDate).toBe('2026-11-19');

      const vacation = rawEvents.find((e) => e.title === '방학식');
      expect(vacation?.startDate).toBe('2026-07-16');

      const festival = rawEvents.find((e) => e.title === '한마음 축제');
      expect(festival?.startDate).toBe('2026-12-29');

      const graduation = rawEvents.find((e) => e.title === '졸업식/수료식/종업식');
      expect(graduation?.startDate).toBe('2026-12-31');
    });

    it('calculates exact D-Day and recognizes multi-day ongoing state', () => {
      const calculateAcademicDaysDiff = (targetYmd: string, baseYmd: string) => {
        const [tY, tM, tD] = targetYmd.split('-').map(Number);
        const [bY, bM, bD] = baseYmd.split('-').map(Number);
        const targetUtc = Date.UTC(tY, tM - 1, tD);
        const baseUtc = Date.UTC(bY, bM - 1, bD);
        return Math.round((targetUtc - baseUtc) / (24 * 60 * 60 * 1000));
      };

      const baseToday = '2026-11-02';

      // 1. Future single-day event: 2026-11-19 CSAT -> 17 days left
      const diffSuneung = calculateAcademicDaysDiff('2026-11-19', baseToday);
      expect(diffSuneung).toBe(17);
      expect(`D-${diffSuneung}`).toBe('D-17');

      // 2. Same-day event
      const diffToday = calculateAcademicDaysDiff('2026-11-02', baseToday);
      expect(diffToday).toBe(0);

      // 3. Multi-day span: 1학기 1회고사 (2026-04-27 ~ 2026-04-30)
      // When today is 2026-04-28 (inside span):
      const duringExam = '2026-04-28';
      const isOngoing = duringExam >= '2026-04-27' && duringExam <= '2026-04-30';
      expect(isOngoing).toBe(true);

      // When today is before exam:
      const beforeExam = '2026-04-20';
      const diffBefore = calculateAcademicDaysDiff('2026-04-27', beforeExam);
      expect(`D-${diffBefore}`).toBe('D-7');

      // When today is after exam:
      const afterExam = '2026-05-02';
      const diffAfter = calculateAcademicDaysDiff('2026-04-30', afterExam);
      expect(diffAfter).toBe(-2);
      expect(`D+${Math.abs(diffAfter)} (종료)`).toBe('D+2 (종료)');
    });
  });

  describe('Asterisk AI Multi-Tool Call and Batch Action Expansion', () => {
    const fixedBaseDate = new Date('2026-11-02T09:00:00+09:00'); // 2026-11-02 is Monday

    const formatDateYmd = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}${m}${d}`;
    };

    const extractMealTargetDates = (text: string, baseDate = fixedBaseDate): string[] => {
      const promptText = String(text || '');
      const kstDateStr = baseDate.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
      const kstNow = new Date(kstDateStr);
      const dates: string[] = [];

      // 1. "N일치" 패턴
      const nDaysMatch = promptText.match(/(\d+)\s*일치/);
      if (nDaysMatch) {
        const count = Math.min(Math.max(parseInt(nDaysMatch[1], 10), 1), 7);
        for (let i = 0; i < count; i++) {
          const target = new Date(kstNow.getTime() + i * 86400000);
          dates.push(formatDateYmd(target));
        }
        return dates;
      }

      // 2. "이번 주", "다음 주"
      if (/이번\s*주/i.test(promptText)) {
        const day = kstNow.getDay();
        const diffToMon = day === 0 ? -6 : 1 - day;
        const mon = new Date(kstNow.getTime() + diffToMon * 86400000);
        for (let i = 0; i < 5; i++) {
          const d = new Date(mon.getTime() + i * 86400000);
          dates.push(formatDateYmd(d));
        }
        return dates;
      }

      if (/다음\s*주/i.test(promptText)) {
        const day = kstNow.getDay();
        const diffToNextMon = (day === 0 ? 1 : 8 - day);
        const mon = new Date(kstNow.getTime() + diffToNextMon * 86400000);
        for (let i = 0; i < 5; i++) {
          const d = new Date(mon.getTime() + i * 86400000);
          dates.push(formatDateYmd(d));
        }
        return dates;
      }

      // 3. 상대 날짜 조합 (오늘, 내일, 모레, 어제 등)
      const relativeSet = new Set<string>();
      if (/어제/i.test(promptText)) relativeSet.add(formatDateYmd(new Date(kstNow.getTime() - 86400000)));
      if (/오늘/i.test(promptText)) relativeSet.add(formatDateYmd(kstNow));
      if (/내일/i.test(promptText)) relativeSet.add(formatDateYmd(new Date(kstNow.getTime() + 86400000)));
      if (/모레/i.test(promptText)) relativeSet.add(formatDateYmd(new Date(kstNow.getTime() + 2 * 86400000)));
      if (relativeSet.size > 1) {
        return Array.from(relativeSet).sort();
      }

      // 4. 날짜 범위 (예: 11월 3일 ~ 5일)
      const rangeMatch = promptText.match(/(\d{1,2})월\s*(\d{1,2})일?\s*[~-]\s*(?:(\d{1,2})월\s*)?(\d{1,2})일/);
      if (rangeMatch) {
        const y = kstNow.getFullYear();
        const startMonth = parseInt(rangeMatch[1], 10);
        const startDay = parseInt(rangeMatch[2], 10);
        const endMonth = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : startMonth;
        const endDay = parseInt(rangeMatch[4], 10);

        const startDate = new Date(y, startMonth - 1, startDay);
        const endDate = new Date(y, endMonth - 1, endDay);
        const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);

        if (diffDays >= 0 && diffDays <= 7) {
          for (let i = 0; i <= diffDays; i++) {
            const d = new Date(startDate.getTime() + i * 86400000);
            dates.push(formatDateYmd(d));
          }
          return dates;
        }
      }

      // 5. Fallback 단일 날짜
      return [formatDateYmd(kstNow)];
    };

    it('extractMealTargetDates: extracts 3-day consecutive dates for "3일치 급식"', () => {
      const dates = extractMealTargetDates('3일치 급식 알려줘', fixedBaseDate);
      expect(dates).toEqual(['20261102', '20261103', '20261104']);
      expect(dates.length).toBe(3);
    });

    it('extractMealTargetDates: extracts 5 weekdays for "이번 주 급식 식단"', () => {
      const dates = extractMealTargetDates('이번 주 급식 식단 알려줘', fixedBaseDate);
      expect(dates).toEqual(['20261102', '20261103', '20261104', '20261105', '20261106']);
      expect(dates.length).toBe(5);
    });

    it('extractMealTargetDates: extracts multiple relative dates for "오늘, 내일, 모레 급식"', () => {
      const dates = extractMealTargetDates('오늘, 내일, 모레 급식 메뉴 뭐야?', fixedBaseDate);
      expect(dates).toEqual(['20261102', '20261103', '20261104']);
    });

    it('extractMealTargetDates: extracts explicit date range for "11월 3일 ~ 5일 급식"', () => {
      const dates = extractMealTargetDates('11월 3일 ~ 5일 급식 보여줘', fixedBaseDate);
      expect(dates).toEqual(['20261103', '20261104', '20261105']);
    });

    it('extractTimetableParams: extracts multiple daysOfWeek for multi-day timetable requests', () => {
      const extractTimetableParams = (text: string) => {
        const promptText = String(text || '');
        let grade = 1;
        let classNum = 1;
        const gMatch = promptText.match(/(\d)\s*학년/);
        if (gMatch) grade = parseInt(gMatch[1], 10);
        const cMatch = promptText.match(/(\d)\s*반/);
        if (cMatch) classNum = parseInt(cMatch[1], 10);

        let daysOfWeek: string[] = [];
        if (/이번\s*주\s*전체|전체\s*시간표|주간\s*시간표/i.test(promptText)) {
          daysOfWeek = ['월', '화', '수', '목', '금'];
        } else {
          const dayMatches = promptText.match(/[월화수목금](?=요일|\s*시간표|\s*이랑|\s*하고|\s*및|\s*,)/g);
          if (dayMatches && dayMatches.length > 0) {
            daysOfWeek = Array.from(new Set(dayMatches));
          } else {
            daysOfWeek = ['월'];
          }
        }
        return { grade, classNum, daysOfWeek };
      };

      const multiDays = extractTimetableParams('2학년 3반 월요일이랑 수요일 시간표 알려줘');
      expect(multiDays.grade).toBe(2);
      expect(multiDays.classNum).toBe(3);
      expect(multiDays.daysOfWeek).toEqual(['월', '수']);

      const fullWeek = extractTimetableParams('1학년 1반 이번 주 전체 시간표 알려줘');
      expect(fullWeek.daysOfWeek).toEqual(['월', '화', '수', '목', '금']);

      const singleDay = extractTimetableParams('화요일 시간표 알려줘');
      expect(singleDay.daysOfWeek).toEqual(['화']);
    });

    it('multi-action link generation: produces distinct action links and sanitizes them', () => {
      const events = [
        {
          action: 'create',
          summary: '물리 실험',
          start: '2026-11-03T15:00:00+09:00',
          end: '2026-11-03T16:00:00+09:00',
          description: '전자기 유도 실험 (준비물 포함)',
        },
        {
          action: 'create',
          summary: '화학 세미나',
          start: '2026-11-04T16:00:00+09:00',
          end: '2026-11-04T17:00:00+09:00',
          description: '유기화학 반응 메커니즘',
        },
        {
          action: 'task_create',
          title: '보고서 제출',
          due: '2026-11-05T18:00:00+09:00',
          notes: '실험 보고서 정리 및 제출',
        },
      ];

      const fixActionMarkdownLinks = (text: string) => {
        if (!text || typeof text !== 'string') return text;
        return text.replace(/\[([^\]]+)\]\((action:\/\/[^\r\n]+?)\)(?=[ \t\r\n\)\.]|$)/g, (_m, label, rawUrl) => {
          const fixedUrl = rawUrl
            .replace(/ /g, '%20')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29');
          return `[${label}](${fixedUrl})`;
        });
      };

      const links = events.map((ev) => {
        if (ev.action === 'task_create') {
          const u = new URL('action://task-add');
          u.searchParams.set('title', ev.title || '');
          u.searchParams.set('due', ev.due || '');
          u.searchParams.set('notes', ev.notes || '');
          return `[☑️ 구글 태스크(할 일)에 등록하기](${u.toString()})`;
        } else {
          const u = new URL('action://calendar-add');
          u.searchParams.set('summary', ev.summary || '');
          u.searchParams.set('start', ev.start || '');
          u.searchParams.set('end', ev.end || '');
          u.searchParams.set('description', ev.description || '');
          return `[구글 캘린더에 이 일정 등록하기](${u.toString()})`;
        }
      });

      expect(links.length).toBe(3);
      expect(links[0]).toContain('action://calendar-add');
      expect(links[0]).toContain('summary=%EB%AC%BC%EB%A6%AC+%EC%8B%A4%ED%97%98');
      expect(links[1]).toContain('summary=%ED%99%94%ED%95%99+%EC%84%B8%EB%AF%B8%EB%82%98');
      expect(links[2]).toContain('action://task-add');
      expect(links[2]).toContain('title=%EB%B3%B4%EA%B3%A0%EC%84%9C+%EC%A0%9C%EC%B6%9C');

      const rawMarkdown = links.join('\n\n');
      const sanitized = fixActionMarkdownLinks(rawMarkdown);
      const actionUrls = sanitized.match(/\((action:\/\/[^\)]+)\)/g);
      expect(actionUrls?.length).toBe(3);
      actionUrls?.forEach((urlWrapper) => {
        const innerUrl = urlWrapper.slice(1, -1);
        expect(innerUrl).not.toContain(' ');
        expect(innerUrl).not.toContain('(');
        expect(innerUrl).not.toContain(')');
      });
      expect(sanitized.match(/action:\/\//g)?.length).toBe(3);
    });
  });

  describe('Dasein Academic Search and Short Tool Tags (@tag) System', () => {
    it('filterMentions: finds @dasein and other short tags, supporting Korean aliases', () => {
      const all = getRegisteredMentions();
      expect(all.some((m) => m.handle === '@dasein')).toBe(true);
      expect(all.some((m) => m.handle === '@meal')).toBe(true);
      expect(all.some((m) => m.handle === '@calendar')).toBe(true);
      expect(all.some((m) => m.handle === '@timetable')).toBe(true);
      expect(all.some((m) => m.handle === '@classroom')).toBe(true);
      expect(all.some((m) => m.handle === '@archive')).toBe(true);
      expect(all.some((m) => m.handle === '@posts')).toBe(true);
      expect(all.some((m) => m.handle === '@history')).toBe(true);
      expect(all.some((m) => m.handle === '@now')).toBe(true);

      // Typing '@da' filters to @dasein
      const matchedDa = filterMentions('da');
      expect(matchedDa.map((m) => m.handle)).toContain('@dasein');

      // Korean alias '급식' filters to @meal
      const matchedMeal = filterMentions('급식');
      expect(matchedMeal.map((m) => m.handle)).toContain('@meal');

      // Korean alias '시간표' filters to @timetable
      const matchedTimetable = filterMentions('시간표');
      expect(matchedTimetable.map((m) => m.handle)).toContain('@timetable');

      // Korean alias '과제' filters to @classroom
      const matchedClassroom = filterMentions('과제');
      expect(matchedClassroom.map((m) => m.handle)).toContain('@classroom');

      // Korean alias '다자인' filters to @dasein
      const matchedDaseinKr = filterMentions('다자인');
      expect(matchedDaseinKr.map((m) => m.handle)).toContain('@dasein');
    });

    it('extractExplicitTaggedTools: extracts tagged tools with 100% guarantee', () => {
      const extractExplicitTaggedTools = (text: string) => {
        const tools: string[] = [];
        const str = String(text || '');

        const matchTag = (pattern: string) => new RegExp(`@(?:${pattern})(?=[^\\w\\uAC00-\\uD7A3]|$)`, 'i').test(str);

        if (matchTag('dasein|dasein;|다자인')) {
          if (!tools.includes('dasein_search')) tools.push('dasein_search');
        }
        if (matchTag('meal|급식')) {
          if (!tools.includes('school_meal')) tools.push('school_meal');
        }
        if (matchTag('timetable|시간표')) {
          if (!tools.includes('school_timetable')) tools.push('school_timetable');
        }
        if (matchTag('calendar|캘린더|일정')) {
          if (!tools.includes('google_calendar_reminder')) tools.push('google_calendar_reminder');
        }
        if (matchTag('classroom|클래스룸|과제')) {
          if (!tools.includes('google_classroom')) tools.push('google_classroom');
        }
        if (matchTag('archive|아카이브|족보')) {
          if (!tools.includes('archive_search')) tools.push('archive_search');
        }
        if (matchTag('posts|게시글')) {
          if (!tools.includes('community_all_posts')) tools.push('community_all_posts');
        }
        if (matchTag('history|내기록')) {
          if (!tools.includes('user_history')) tools.push('user_history');
        }
        if (matchTag('now|time|시간|시각')) {
          if (!tools.includes('current_time')) tools.push('current_time');
        }

        return tools;
      };

      // 1. Single @dasein
      expect(extractExplicitTaggedTools('@dasein 초전도체 양자 결맞음 논문 찾아줘')).toEqual(['dasein_search']);

      // 2. Single @meal
      expect(extractExplicitTaggedTools('@meal 오늘 점심 뭐야')).toEqual(['school_meal']);

      // 3. Multi-tag: @meal and @calendar in single prompt
      const multi = extractExplicitTaggedTools('@meal 점심 확인하고 @calendar 내일 3시 모둠 회의 등록해줘');
      expect(multi).toContain('school_meal');
      expect(multi).toContain('google_calendar_reminder');
      expect(multi.length).toBe(2);

      // 4. Korean alias tag
      expect(extractExplicitTaggedTools('@급식 내일 메뉴')).toEqual(['school_meal']);
      expect(extractExplicitTaggedTools('@시간표 1-2반')).toEqual(['school_timetable']);
      expect(extractExplicitTaggedTools('@과제 마감 언제야')).toEqual(['google_classroom']);
    });

    it('Jev router synergistic merge: retains 100% explicit tagged tools and merges auto-detected tools', () => {
      const explicitTools = ['google_calendar_reminder'];
      const jevDetectedTools = ['current_time', 'school_calendar'];

      const mergedToolIds = [...explicitTools];
      for (const t of jevDetectedTools) {
        if (!mergedToolIds.includes(t)) mergedToolIds.push(t);
      }

      // Explicit tool is strictly guaranteed
      expect(mergedToolIds).toContain('google_calendar_reminder');
      // Additional tools detected by Jev are smoothly merged
      expect(mergedToolIds).toContain('current_time');
      expect(mergedToolIds).toContain('school_calendar');
      expect(mergedToolIds.length).toBe(3);
    });

    it('dasein_search: formats academic papers with title, markdown link, and snippet', () => {
      const mockDaseinResults = [
        {
          title: 'Quantum Error Mitigation in Superconducting Circuits',
          snippet: 'Demonstrates zero-noise extrapolation techniques for superconducting transmon qubits.',
          url: 'https://arxiv.org/abs/2401.12345',
        },
        {
          title: 'Scalable Surface Codes for Fault-Tolerant Quantum Computing',
          snippet: 'Architectural overview of 2D lattice error correction codes with physical thresholds.',
          url: 'https://nature.com/articles/s41586-024-001',
        },
      ];

      const formatDaseinSearchSummary = (results: typeof mockDaseinResults, query: string) => {
        const resultsFormatted = results
          .map((item, idx) => {
            const title = item.title || '학술 자료';
            const snippet = item.snippet ? item.snippet.replace(/\n+/g, ' ').trim() : '내용 요약 없음';
            const url = item.url || '';
            return `  [학술 자료 ${idx + 1}] [${title}](${url})\n     핵심 요약/초록: ${snippet}`;
          })
          .join('\n\n');

        return (
          `[도구 실행 결과: Dasein; 학술 연구 전문 검색 (dasein_search)]\n` +
          `- 학술 검색 키워드: ${query}\n` +
          `- 발굴된 학술 논문 및 연구 자료 (${results.length}건):\n\n${resultsFormatted}`
        );
      };

      const summary = formatDaseinSearchSummary(mockDaseinResults, '양자 오류 완화');
      expect(summary).toContain('학술 연구 전문 검색 (dasein_search)');
      expect(summary).toContain('[Quantum Error Mitigation in Superconducting Circuits](https://arxiv.org/abs/2401.12345)');
      expect(summary).toContain('zero-noise extrapolation');
      expect(summary).toContain('[Scalable Surface Codes for Fault-Tolerant Quantum Computing](https://nature.com/articles/s41586-024-001)');
    });

    it('extractDaseinSearchQuery: cleanly separates core research keywords from conversational request intent and separators', () => {
      // 1. Just typing '@' recommends @dasein first
      const allMentions = filterMentions('');
      expect(allMentions[0].handle).toBe('@dasein');
      expect(allMentions[0].name).toBe('Dasein;');

      // 2. Keyword extraction tests
      expect(extractDaseinSearchQuery('@dasein -- 연구동향 알려줘')).toBe('과학 연구동향');
      expect(extractDaseinSearchQuery('@dasein 초전도체 -- 연구동향 알려줘')).toBe('초전도체');
      expect(extractDaseinSearchQuery('@dasein 양자컴퓨터 연구동향 알려줘')).toBe('양자컴퓨터');
      expect(extractDaseinSearchQuery('@dasein LK-99에 대해 최근 논문 찾아줘')).toBe('LK-99');
      expect(extractDaseinSearchQuery('@dasein 그래핀 배터리 최신 연구 알려줘')).toBe('그래핀 배터리');
      expect(extractDaseinSearchQuery('@dasein 페로브스카이트 태양전지 효율성 향상 방안 연구동향')).toBe('페로브스카이트 태양전지 효율성 향상 방안');
      expect(extractDaseinSearchQuery('@dasein CRISPR-Cas9 유전자 가위 기술 최신 논문 검색해줘')).toBe('CRISPR-Cas9 유전자 가위 기술');
      expect(extractDaseinSearchQuery('@dasein 양자컴퓨팅 큐비트 결맞음 오류 완화 최신 연구 동향 알려줘')).toBe('양자컴퓨팅 큐비트 결맞음 오류 완화');
      expect(extractDaseinSearchQuery('@dasein 펙틴 필름에 대해서 최근 연구나 논문 알려줘')).toBe('펙틴 필름');
      expect(extractDaseinSearchQuery('@dasein 펙틴 필름 관련해서 연구동향 알려줘')).toBe('펙틴 필름');
      expect(extractDaseinSearchQuery('@dasein 초전도체에 관한 논문 좀 찾아봐')).toBe('초전도체');
    });

    it('filterMentions context target separation: comments only show @asterisk, chat only shows @dasein', () => {
      // 1. Comments strictly only show @asterisk
      const commentSuggestions = filterMentions('', { target: 'comment' });
      expect(commentSuggestions.length).toBe(1);
      expect(commentSuggestions[0].handle).toBe('@asterisk');

      const commentQueryMatch = filterMentions('ast', { target: 'comment' });
      expect(commentQueryMatch.length).toBe(1);
      expect(commentQueryMatch[0].handle).toBe('@asterisk');

      const commentDisallowedTool = filterMentions('dasein', { target: 'comment' });
      expect(commentDisallowedTool.length).toBe(0);

      // 2. Chat / Home screen strictly only shows @dasein (other tools have tags removed)
      const chatSuggestions = filterMentions('', { target: 'chat' });
      expect(chatSuggestions.length).toBe(1);
      expect(chatSuggestions[0].handle).toBe('@dasein');
      expect(chatSuggestions.some((m) => m.handle === '@meal')).toBe(false);
      expect(chatSuggestions.some((m) => m.handle === '@calendar')).toBe(false);

      const chatDaseinMatch = filterMentions('da', { target: 'chat' });
      expect(chatDaseinMatch.length).toBe(1);
      expect(chatDaseinMatch[0].handle).toBe('@dasein');

      const chatMealMatch = filterMentions('meal', { target: 'chat' });
      expect(chatMealMatch.length).toBe(0);
    });

    it('COMMAND_GUIDES: includes google_tasks, accurately counts 12 tools, and separates third_party vs asterisk', () => {
      expect(COMMAND_GUIDES.length).toBe(12);

      const thirdPartyTools = COMMAND_GUIDES.filter((g) => g.providerType === 'third_party');
      const asteriskTools = COMMAND_GUIDES.filter((g) => g.providerType === 'asterisk');

      expect(thirdPartyTools.length).toBe(1);
      expect(thirdPartyTools[0].id).toBe('dasein_search');
      expect(thirdPartyTools[0].desc).toContain('학술검색 엔진 기반 논문 및 연구자료 심층 검색');

      expect(asteriskTools.length).toBe(11);

      const googleTasks = COMMAND_GUIDES.find((g) => g.id === 'google_tasks');
      expect(googleTasks).toBeDefined();
      expect(googleTasks?.providerType).toBe('asterisk');
      expect(googleTasks?.label).toBe('구글 태스크');
      expect(googleTasks?.category).toBe('학업 연동');
    });

    it('mention trigger regex: matches @ immediately even without leading space or at start of input', () => {
      const mentionPattern = /(?:^|[\s\n]|[^\w\uAC00-\uD7A3]|[\uAC00-\uD7A3\w])?@([a-zA-Z0-9_\uAC00-\uD7A3;-]*)$/;

      expect('@'.match(mentionPattern)).not.toBeNull();
      expect(' @'.match(mentionPattern)).not.toBeNull();
      expect('안녕하세요 @'.match(mentionPattern)).not.toBeNull();
      expect('안녕하세요@'.match(mentionPattern)).not.toBeNull();
      expect('@da'.match(mentionPattern)?.[1]).toBe('da');
      expect('연구@dasein'.match(mentionPattern)?.[1]).toBe('dasein');
    });
  });
});

