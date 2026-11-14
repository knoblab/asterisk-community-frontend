import React, { useState } from 'react';
import { ExternalArrowIcon } from '../common/ExternalArrowIcon';

export type ToolProviderType = 'third_party' | 'asterisk';

export interface ToolGuideItem {
  id: string;
  providerType: ToolProviderType;
  category: '학술연구' | '학교 생활' | '학업 연동' | '커뮤니티' | '아카이브' | '멀티모달' | '정보/유틸';
  tag?: string;
  label: string;
  example: string;
  desc: string;
}

export const COMMAND_GUIDES: ToolGuideItem[] = [
  // 서드파티 툴: 외부에서 제공받는 학술 엔진 (Dasein;)
  {
    id: 'dasein_search',
    providerType: 'third_party',
    category: '학술연구',
    label: '학술검색',
    example: '@dasein 펙틴 필름 최신 연구 동향 알려줘',
    desc: '학술검색 엔진 기반 논문 및 연구자료 심층 검색',
  },
  // asterisk 툴: 자체 제작 도구 (구글 클래스룸, 캘린더, 태스크 포함 나머지 툴들)
  {
    id: 'google_classroom',
    providerType: 'asterisk',
    category: '학업 연동',
    label: '클래스룸 과제',
    example: '이번 주 마감인 미제출 과제와 수행평가 알려줘',
    desc: '연동된 구글 클래스룸 미제출 과제 및 마감 기한 조회',
  },
  {
    id: 'google_calendar_reminder',
    providerType: 'asterisk',
    category: '학업 연동',
    label: '캘린더 일정',
    example: '내일 오후 3시 모둠 연구 회의 캘린더에 등록해줘',
    desc: '구글 캘린더 일정 조회, 대화형 승인 등록/수정/삭제',
  },
  {
    id: 'google_tasks',
    providerType: 'asterisk',
    category: '학업 연동',
    label: '구글 태스크',
    example: '오늘 할 일 목록에 수학 과제 제출 추가해줘',
    desc: '구글 태스크(Google Tasks) 할 일 목록 조회 및 새 할 일 등록/관리',
  },
  {
    id: 'school_meal',
    providerType: 'asterisk',
    category: '학교 생활',
    label: '급식 조회',
    example: '오늘 점심 급식 메뉴와 알레르기 정보 알려줘',
    desc: '오늘/내일/주간 아침·점심·저녁 급식 및 영양·알레르기 안내',
  },
  {
    id: 'school_timetable',
    providerType: 'asterisk',
    category: '학교 생활',
    label: '시간표 조회',
    example: '오늘 1학년 2반 시간표와 수업 시간 알려줘',
    desc: '학급별 실시간 시간표 및 오늘 학교 일과/야자 시간',
  },
  {
    id: 'school_calendar',
    providerType: 'asterisk',
    category: '학교 생활',
    label: '학사일정',
    example: '이번 학기 1회 지필고사 일정 확인하고 캘린더에 등록해줘',
    desc: '지필평가, 모의고사, 방학/개학 등 충남과학고 연간 학사일정 조회',
  },
  {
    id: 'community_all_posts',
    providerType: 'asterisk',
    category: '커뮤니티',
    label: '커뮤니티 요약',
    example: '현재 커뮤니티 최신 인기글과 주요 공지사항 요약해줘',
    desc: '최신 인기글 및 공지사항 실시간 열람/요약',
  },
  {
    id: 'user_history',
    providerType: 'asterisk',
    category: '커뮤니티',
    label: '내 활동 요약',
    example: '내가 지금까지 작성한 글과 댓글 목록 요약해줘',
    desc: '내가 작성한 게시글 및 댓글 목록, 추천 통계 요약',
  },
  {
    id: 'archive_search',
    providerType: 'asterisk',
    category: '아카이브',
    label: '선배 노하우',
    example: '선배들의 AP선대 공부 팁이나 R&E 노하우 찾아줘',
    desc: '충남과학고 선배들의 과목 팁, 기출/수행평가 수기 검색',
  },
  {
    id: 'image_analysis',
    providerType: 'asterisk',
    category: '멀티모달',
    label: '이미지 분석',
    example: '첨부한 이미지의 내용 분석하고 글자 읽어줘',
    desc: '클립 버튼 또는 Ctrl+V로 이미지 첨부 후 OCR 및 시각 분석',
  },
  {
    id: 'current_time',
    providerType: 'asterisk',
    category: '정보/유틸',
    label: '시각 · D-Day',
    example: '지금 정확한 시간과 시험일까지 며칠 남았는지 알려줘',
    desc: 'KST 기준 실시간 시각, 오늘 요일, 경과일 및 D-Day 계산',
  },
];

interface AiCommandDrawerProps {
  isOpen: boolean;
  onSelectPrompt: (promptText: string) => void;
}

export const AiCommandDrawer: React.FC<AiCommandDrawerProps> = ({ isOpen, onSelectPrompt }) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'asterisk' | 'third_party'>('all');

  const asteriskCount = COMMAND_GUIDES.filter((c) => c.providerType === 'asterisk').length;
  const thirdPartyCount = COMMAND_GUIDES.filter((c) => c.providerType === 'third_party').length;

  const filteredGuides = COMMAND_GUIDES.filter((cmd) => {
    if (selectedFilter === 'asterisk') return cmd.providerType === 'asterisk';
    if (selectedFilter === 'third_party') return cmd.providerType === 'third_party';
    return true;
  });

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      className={`ai-guide-expand-drawer ${isOpen ? 'open' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ai-guide-drawer-inner">
        <div className="commands-tooltip-header">
          <div className="commands-tooltip-title-row">
            <div className="commands-tooltip-title-group">
              <span className="commands-tooltip-title" title="사용 가능한 도구">
                사용 가능한 도구
              </span>
            </div>

            <div className="tool-provider-filter-row">
              <button
                type="button"
                className={`tool-filter-btn ${selectedFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedFilter('all')}
              >
                전체 {COMMAND_GUIDES.length}
              </button>
              <button
                type="button"
                className={`tool-filter-btn ${selectedFilter === 'asterisk' ? 'active' : ''}`}
                onClick={() => setSelectedFilter('asterisk')}
              >
                asterisk 툴 {asteriskCount}
              </button>
              <button
                type="button"
                className={`tool-filter-btn ${selectedFilter === 'third_party' ? 'active' : ''}`}
                onClick={() => setSelectedFilter('third_party')}
              >
                서드파티 툴 {thirdPartyCount}
              </button>
            </div>
          </div>
        </div>

        <div
          className="ai-guide-scroll-track"
          onWheel={handleWheel}
          role="region"
          aria-label="도구 질문 예시 가로 탭"
        >
          {filteredGuides.map((cmd) => (
            <button
              key={cmd.id || cmd.label}
              type="button"
              className="ai-tool-tab-chip"
              onClick={() => onSelectPrompt(cmd.example)}
              title={`${cmd.label}: "${cmd.example}" 클릭 시 입력`}
            >
              <div className="tool-tab-chip-top">
                <span className="tool-tab-chip-tag">
                  {cmd.id === 'dasein_search' ? (
                    <span>
                      <span
                        className="dasein-wordmark"
                        style={{
                          fontFamily: "'Playfair Display', serif",
                          fontWeight: 700,
                          color: '#8B1F28',
                          marginRight: 4,
                        }}
                      >
                        Dasein;
                      </span>
                      학술검색
                    </span>
                  ) : (
                    cmd.label
                  )}
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className={`tool-tab-chip-provider ${cmd.providerType}`}>
                    {cmd.providerType === 'third_party' ? '서드파티' : 'asterisk'}
                  </span>
                  <span className="tool-tab-chip-cat">{cmd.category}</span>
                </div>
              </div>
              <div className="tool-tab-chip-desc">{cmd.desc}</div>
            </button>
          ))}
        </div>

        <div className="commands-tooltip-footer">
          <a
            href="https://asterisk.knoblab.xyz/ai"
            target="_blank"
            rel="noopener noreferrer"
            className="commands-tooltip-link"
          >
            <span>asterisk ai가 무엇인가요?</span>
            <ExternalArrowIcon size={11} className="commands-tooltip-arrow" />
          </a>
        </div>
      </div>
    </div>
  );
};
