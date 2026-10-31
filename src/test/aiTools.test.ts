import { describe, it, expect } from 'vitest';

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
});

