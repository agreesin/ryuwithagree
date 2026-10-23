// =========================================================
// changelog.js - 류이어리 업데이트 내역(Changelog) 관리 모듈
// 중요도에 따른 체계적인 시맨틱 버전(Semantic Versioning) 기록
// =========================================================

import { openModal, closeModal } from "./ui.js";

// 업데이트 히스토리 데이터 (최신순)
export const CHANGELOG_DATA = [
  {
    version: "v3.9.0",
    date: "2026.10.23",
    type: "major",
    tag: "전체 코드 리팩토링 & 성능 최적화",
    title: "전체 아키텍처 리팩토링 & 캘린더 DOM 배치 렌더링 & 이벤트 위임 & XSS 보안 강화",
    desc: "1) 캘린더 렌더링 성능 대폭 개선: 42개 셀마다 개별 이벤트 리스너를 중복 생성하던 구조를 이벤트 위임(Event Delegation)으로 단일화하고, DocumentFragment를 도입하여 DOM 리플로우를 획기적으로 줄였습니다. 2) 전역 XSS 보안 방어: 공통 HTML 이스케이프(escapeHtml) 유틸리티를 구축하여 디데이, 문답 및 닉네임 입력 데이터의 안전성을 완벽히 확보했습니다. 3) 디데이 정렬 알고리즘 최적화: 정렬 스코어링을 O(N)으로 1회만 계산하는 Map 캐싱을 적용하여 목록 렌더링 속도를 향상했습니다. 4) 알림 및 디데이 모듈 간 중복 로직 일원화: 오늘 당일 이벤트 검사 로직을 단일화하여 코드 중복을 제거하고 유지보수성을 극대화했습니다.",
  },
  {
    version: "v3.8.5",
    date: "2026.10.23",
    type: "patch",
    tag: "UI/UX 디자인 리파인",
    title: "디데이 관리 모달 감성 리파인 & 글씨 크기·여백 최적화 & 배경 누수 방지",
    desc: "1) 디데이 모달 카드에 솔리드 화이트(#ffffff) 배경과 20px 라운딩 및 부드러운 섀도우를 입혀 뒷배경이 비쳐 보이는 현상을 해결했습니다. 2) 과도하게 컸던 제목, 날짜, 셀렉트 폰트 크기를 모바일 화면에 꼭 맞는 단정한 크기(0.84rem)로 재조정하여 가독성과 감성을 극대화했습니다. 3) 일정 카드 내 날짜 및 태그가 2줄로 어색하게 줄바꿈되던 현상을 white-space: nowrap 및 유연한 flex 레이아웃으로 완벽히 정리했습니다. 4) 헤더 아이콘(2.2rem ➔ 1.15rem)과 닫기 버튼 및 하단 폼 버튼의 시각적 계층 구조를 정돈했습니다.",
  },
  {
    version: "v3.8.4",
    date: "2026.10.23",
    type: "patch",
    tag: "iOS UX 버그 픽스",
    title: "아이폰(iOS Safari/PWA) 입력창 포커스 시 화면 확대 버그 차단 & 모달 상단 고정 및 닫기 버튼 추가",
    desc: "1) iOS WebKit에서 16px 미만 입력창 클릭 시 화면이 1.3배 강제 확대되어 축소되지 않던 현상을 뷰포트 meta 태그(maximum-scale=1.0) 및 전역 모바일 폰트 16px 표준화로 원천 차단했습니다. 2) 기념일/일정 관리 모달의 헤더(✕ 닫기 버튼)를 상단에 고정(Sticky)하고 하단 폼에 전용 [닫기] 버튼을 추가하여 모바일 키보드가 올라온 상태에서도 언제든 안전하게 모달을 닫을 수 있도록 개선했습니다. 3) 모달 자체의 터치 스크롤(-webkit-overflow-scrolling)을 지원하여 어떤 해상도에서도 화면이 잘리지 않도록 보강했습니다.",
  },
  {
    version: "v3.8.3",
    date: "2026.10.23",
    type: "feature",
    tag: "디데이 정렬 & 알림 최적화",
    title: "디데이 일정 목록 오늘 시점 기준 정렬 & 대표 기념일 최상단 고정 & 마일스톤 안내",
    desc: "1) 디데이 일정 목록에서 홈 화면 뱃지인 [★ 대표 기념일(사귄 날)]을 최상단에 안정적으로 고정하고, 그 아래 모든 일정들을 오늘 시점과 가장 가까운 순(오늘 당일 D-Day ➔ 다가오는 일정/생일 ➔ 지난 일정)으로 정렬했습니다. 2) 오늘 당일 데이트나 생일인 경우 '🔥 오늘' 뱃지와 함께 최우선으로 주목받도록 시각적 강조를 부여했습니다. 3) 사귄 날 등 함께한 날(count_up) 항목에 다음 100일 단위 마일스톤이나 N주년까지 남은 날짜(예: '다음 900일까지 D-5') 안내를 표시합니다. 4) 알림 내역에 오늘 당일 기념일 및 일정 알림을 통합하여 즉시 디데이 모달로 이동할 수 있도록 개선했습니다.",
  },
  {
    version: "v3.8.2",
    date: "2026.10.23",
    type: "feature",
    tag: "모바일 탭 애니메이션 & UX",
    title: "모바일 3단 탭 실시간 손가락 드래그 추종 & 방향 반응형 부드러운 슬라이드 애니메이션",
    desc: "1) 3단 탭(피드 ↔ 달력 ↔ 오늘의 질문) 간 모바일 터치 제스처 시 손가락 움직임을 실시간으로 부드럽게 추종(Translate3D)하며 경계부 댐핑(Rubber-band) 효과를 제공합니다. 2) 스와이프 및 상단 탭 버튼 클릭 시 이동 방향에 맞춰 화면이 유려하게 미끄러져 들어오는 GPU 가속 큐빅 베지어 슬라이드 애니메이션(.tab-slide-left, .tab-slide-right)을 적용했습니다. 3) 햅틱 진동 피드백(12ms)과 함께 네이티브 앱 이상의 쾌적한 화면 전환을 완성했습니다.",
  },
  {
    version: "v3.8.1",
    date: "2026.10.22",
    type: "patch",
    tag: "긴급 핫픽스 & 안정화",
    title: "일기 카드 렌더링 참조 오류 수정 & 렌더링 예외 방어 격리 & 고화질 사진 압축 최적화",
    desc: "1) 일기 카드(entry-card.js) 모듈 내 미참조 변수 호출 오류를 수정하여 기존 일기 및 신규 일기가 정상적으로 즉시 렌더링되도록 복구했습니다. 2) 일기 렌더링 루프(render.js)에 예외 방어 격리(Try-Catch Boundary)를 구축하여 특정 카드의 오류가 전체 피드를 중단시키지 않도록 안정성을 강화했습니다. 3) 최대 5장 다중 사진 첨부 시 문서 용량 초과를 방지하기 위해 스마트 압축 해상도와 품질을 모바일 화면에 최적화했습니다.",
  },
  {
    version: "v3.8.0",
    date: "2026.10.22",
    type: "major",
    tag: "모바일 UX & 멀티포토 & 폰트",
    title: "모바일 3단 탭 스와이프 제스처 & 당겨서 새로고침(PTR) & 감성 웹 폰트 & 최대 5장 사진 캐러셀 & 오프라인 안심 동기화",
    desc: "1) 모바일 스와이프 제스처: 피드/달력/오늘의 질문 3단 탭을 네이티브 앱처럼 좌우 화면 스와이프로 부드럽게 전환할 수 있습니다. 2) iOS PWA 당겨서 새로고침(Pull-to-refresh): 화면 최상단에서 아래로 당기면 감성 핑크 하트 인디케이터와 함께 최신 데이터를 실시간 동기화합니다. 3) 프리미엄 웹 폰트: 앱 전반에 Pretendard Variable을 적용하고 일기 본문 및 커플 톡 메시지에는 따뜻한 다이어리 감성의 마루부리(MaruBuri) 폰트를 적용했습니다. 4) 일기당 최대 5장 다중 사진 첨부: 한 번에 여러 장의 데이트/여행 사진을 고화질 자동 압축 첨부하고, 카드 내 터치 스와이프 캐러셀과 도트 인디케이터로 감상할 수 있습니다. 5) 오프라인 안심 동기화: 지하철/단절 상태에서도 안전하게 글을 작성(IndexedDB 즉시 보관)하고 연결 복구 시 자동 동기화됩니다.",
  },
  {
    version: "v3.7.2",
    date: "2026.10.22",
    type: "patch",
    tag: "D-Day 뱃지 & 리팩토링",
    title: "홈화면 D-Day 뱃지 간결화 (D+ 숫자) & 전역 닉네임 유틸 통합 리팩토링",
    desc: "1) 홈 화면 우측 상단 디데이 뱃지를 불필요한 제목 텍스트 없이 심플하게 'D+ 숫자' 형식으로만 표시하도록 개선했습니다. 2) 사용자가 지정한 고유 기념일 타이틀('현피뜨는날' 등)을 그대로 보존하고, 필요 시 언제든 바꿀 수 있도록 [수정] 기능을 탑재했습니다. 3) 전역 닉네임 조회 유틸(getUserDisplayName) 구축으로 comments, entry-card, notice, notify, report 전반의 중복 코드를 리팩토링했습니다.",
  },
  {
    version: "v3.7.1",
    date: "2026.10.14",
    type: "patch",
    tag: "리팩토링 & 안정화",
    title: "전역 공통 유틸 통합 & 코드 중복 제거 & 기념일 당일 알림 버그 픽스",
    desc: "1) 아바타 렌더링(renderAvatar, createAvatarElement) 및 메시지 시간 포맷(formatChatTime) 공통 모듈화로 컴포넌트 간 중복 코드 제거. 2) 지난 문답 최신순 정렬 로직 단일화(sortCompletedQuestionsDescending). 3) 기념일 및 생일 당일 알림(checkTodayMilestoneNotifications) 변수 참조 버그 수정 및 안정화.",
  },
  {
    version: "v3.7.0",
    date: "2026.10.13",
    type: "major",
    tag: "문답 UX & 캘린더 일정",
    title: "지난 문답 보관함 UX 대개편 & 달력 날짜별 원클릭 일정 추가 & 콕 찌르기 스마트 자동 충전",
    desc: "1) 지난 문답 보관함을 최신 질문 내림차순으로 재정렬하고 카드 전체 터치로 즉시 열람하도록 개선했습니다. 2) 과거 문답 열람 중에도 '최신 질문으로 돌아가기' 버튼 및 콕찌르기 수신 시 즉시 최신 질문으로 이동하는 스마트 내비게이션을 적용했습니다. 3) 콕 찌르기를 1~2회만 사용하더라도 60분 후 자동으로 5회 풀충전되는 유연한 쿨타임 시스템과 96종의 꿀잼 멘트를 추가했습니다. 4) 캘린더에서 날짜를 누르면 해당 날짜로 바로 새 여행/데이트/일정을 등록할 수 있는 일정 추가 기능을 탑재했습니다.",
  },
  {
    version: "v3.6.0",
    date: "2026.10.12",
    type: "major",
    tag: "콕 찌르기",
    title: "듀오링고 감성 원클릭 '콕 찌르기(Nudge)' 시스템 도입",
    desc: "서로에게 일기 쓰기, 오늘의 질문 답변 남기기, 또는 평소 생각날 때 가볍게 신호를 보낼 수 있는 원클릭 콕 찌르기를 추가했습니다. 쫀득한 3D 버튼 바운스, 상대방 화면 실시간 지진(Screen Shake) 효과, 대형 팝업 모달 및 원클릭 맞찌르기를 지원합니다.",
  },
  {
    version: "v3.5.0",
    date: "2026.10.11",
    type: "major",
    tag: "블라인드 문답 3.0",
    title: "독립형 블라인드 커플 문답 3.0 공식 오픈",
    desc: "일기장과 완전히 분리된 전용 1:1 문답 카드를 신설했습니다. 내가 답변을 등록하기 전까지 상대방 답변이 숨겨지는 블라인드 잠금(🔒), 작성 시 실시간 동시 공개(🔓), D-Day 연애 단계별 질문 자동 배정, 100일/생일/크리스마스 등 기념일 전용 스페셜 문답, 그리고 문답별 실시간 댓글 소통 기능을 제공합니다.",
  },
  {
    version: "v3.4.0",
    date: "2026.09.09",
    type: "major",
    tag: "월간 레포트",
    title: "감성 월간 레포트 및 매월 1일 알림",
    desc: "지난 한 달간의 소중한 일기 통계(일기 수, 기분 분석, 베스트 하트 일기, 함께 그린 추억, 감성 AI 코멘트)를 인스타 스토리 감성 카드 뉴스로 한눈에 돌아볼 수 있는 월간 레포트 기능을 추가했습니다.",
  },
  {
    version: "v3.3.0",
    date: "2026.09.09",
    type: "major",
    tag: "D-Day 2099",
    title: "2099년까지 D-Day 100일 단위 자동 연산 및 첫 1년 50일 단위 기념일 지원",
    desc: "첫 1년은 50일 단위(50일, 100일... 350일)로 더 세심하게 챙기고, 이후에는 2099년까지 100일 단위 기념일 및 N주년을 자동으로 계산하여 캘린더와 알림에 연동했습니다.",
  },
  {
    version: "v3.2.1",
    date: "2026.08.27",
    type: "patch",
    tag: "IndexedDB 안정화",
    title: "Firestore 멀티탭 매니저 적용 및 IndexedDB closing 예외 격리",
    desc: "아이폰 PWA/사파리 탭 전환 시 발생하는 IndexedDB closing 일시적 충돌을 방지하기 위해 persistentMultipleTabManager를 적용하고 프로필 동기화 예외를 격리했습니다.",
  },
  {
    version: "v3.2.0",
    date: "2026.08.27",
    type: "major",
    tag: "UI/UX 피드 개편",
    title: "인스타그램형 통합 타임라인 피드 및 스마트 더보기(페이징) 개편",
    desc: "기존의 길었던 상대방/내 일기 2단 세로 구조를 하나의 시간순 통합 피드로 개편하고, 6개씩 끊어보는 스마트 더보기 버튼과 작성자 구분 뱃지(내 일기/상대방 일기)를 적용하여 화면 쾌적성을 극대화했습니다.",
  },
  {
    version: "v3.1.0",
    date: "2026.08.27",
    type: "major",
    tag: "Firebase Hosting 이전",
    title: "Firebase Hosting 단일 Origin 이전 및 리다이렉트 로그인 완전 안정화",
    desc: "앱 호스팅과 인증 도메인(authDomain)을 ryuwithagree.firebaseapp.com으로 1:1 일치시키고 서비스워커와 PWA 스코프를 루트(/)로 표준화하여 iOS 사파리 및 홈 화면 PWA에서 로그인 세션 유실 없이 완벽히 동작하도록 개편했습니다.",
  },
  {
    version: "v3.0.5",
    date: "2026.08.27",
    type: "patch",
    tag: "PWA 인앱 로그인",
    title: "아이폰 홈 화면(PWA) 인앱 팝업 인증 및 0초 즉시 트리거 최적화",
    desc: "외부 사파리 이탈로 인한 세션 유실을 방지하기 위해 홈 화면 앱 내부에서 직접 완결되는 인앱 팝업 인증을 적용하고 0초 동기 트리거로 팝업 차단을 우회했습니다.",
  },
  {
    version: "v3.0.4",
    date: "2026.08.27",
    type: "patch",
    tag: "iOS PWA 세션 복구",
    title: "아이폰 홈 화면(PWA) 리다이렉트 즉시 세션 복원 및 영구 저장소 활성화",
    desc: "아이폰 홈 화면 앱에서 리다이렉트 로그인 후 돌아왔을 때 비동기 지연 없이 즉시 2차 암호 모달 또는 다이어리로 화면을 전환하고 IndexedDB 영구 세션 스토리지를 활성화했습니다.",
  },
  {
    version: "v3.0.3",
    date: "2026.08.27",
    type: "patch",
    tag: "iOS/사파리 최적화",
    title: "아이폰 Safari 및 홈 화면(PWA) 전용 리다이렉트 로그인 개편",
    desc: "iOS 사파리의 팝업 차단 및 PWA 팝업 무한 대기 현상을 해결하기 위해 모바일/iOS 환경에서 자동으로 전체 화면 리다이렉트(signInWithRedirect) 로그인을 수행하도록 개선했습니다.",
  },
  {
    version: "v3.0.1",
    date: "2026.08.27",
    type: "patch",
    tag: "기능/알림 최적화",
    title: "캘린더 D-Day/기념일 실시간 복구 및 알림 정밀 필터링",
    desc: "로그인 세션 기반 D-Day/기념일 데이터 구독을 완벽 복구하고, 내가 작성한 글과 댓글은 알림 센터 및 실시간 알림에서 자동 제외하여 알림의 정확도를 대폭 향상했습니다.",
  },
  {
    version: "v3.0.0",
    date: "2026.08.27",
    type: "major",
    tag: "대규모 업데이트",
    title: "FCM HTTP v1 네이티브 푸시 엔진 전환 및 클린 리팩토링",
    desc: "서드파티(OneSignal) 의존성을 완전 제거하고 Firebase Cloud Messaging (FCM v1) + Cloudflare Worker 자체 푸시 파이프라인으로 전면 개편하여 푸시 속도와 iOS 사파리/PWA 안정성을 극대화했습니다.",
  },
  {
    version: "v2.8.0",
    date: "2026.08.27",
    type: "patch",
    tag: "보안/로그인",
    title: "사파리(iOS) ITP 교차 도메인 대응 및 구글 로그인 안정화",
    desc: "애플 사파리의 지능형 추적 방지(ITP) 및 홈 화면(PWA) 환경에 최적화하여 팝업 차단 및 무한 루프 없이 매끄럽게 로그인되도록 인증 시스템을 안정화했습니다.",
  },
  {
    version: "v2.7.0",
    date: "2026.08.27",
    type: "feature",
    tag: "안정성 개선",
    title: "모듈 격리 부트스트랩 및 페일세이프(Fail-safe) 구조 도입",
    desc: "각 모듈을 독립적으로 안전하게 초기화하는 페일세이프 아키텍처를 도입하여 네트워크 지연이나 예외 상황에서도 로그인과 다이어리 화면이 항상 쾌적하게 렌더링되도록 개선했습니다.",
  },
  {
    version: "v2.6.1",
    date: "2026.08.25",
    type: "patch",
    tag: "기능 개선",
    title: "12가지 감성 데이트 & 일정 맞춤 아이콘 선택 팔레트 추가",
    desc: "영화(🍿), 카페(☕), 맛집(🍽️), 드라이브(🚗), 호캉스(🏨), 캠핑(⛺) 등 데이트 일정에 맞춰 원하는 이모지를 캘린더와 헤더에 자유롭게 지정할 수 있습니다.",
  },
  {
    version: "v2.6.0",
    date: "2026.08.25",
    type: "major",
    tag: "대규모 업데이트",
    title: "다중 기념일 시스템, 매년 생일(반복) 및 여행 일정 캘린더 연동",
    desc: "함께한 날(D+), 매년 반복 생일(🎂 D-), 여행/일정(✈️ D-) 다중 관리 및 캘린더 달력에 기념일/여행 뱃지가 자동 표시되는 기능이 추가되었습니다.",
  },
  {
    version: "v2.5.4",
    date: "2026.08.25",
    type: "patch",
    tag: "보안/접근제어",
    title: "기념일 및 업데이트 내역 비인증 접근 차단 & 캐시 최적화",
    desc: "로그인 및 2차 암호 인증을 완료한 사용자에게만 기념일(D-Day) 뱃지와 업데이트 내역을 표시하도록 보안을 강화하고 브라우저 캐시를 무효화했습니다.",
  },
  {
    version: "v2.5.3",
    date: "2026.08.25",
    type: "patch",
    tag: "보안 강화",
    title: "SHA-256 단방향 암호화 적용 및 레거시 파일 정리",
    desc: "관리자 식별 및 2차 암호 검증을 복호화 불가능한 SHA-256 단방향 해시로 전면 교체하여 완전한 100% 익명성과 보안을 강화했습니다.",
  },
  {
    version: "v2.5.2",
    date: "2026.08.25",
    type: "patch",
    tag: "편의 기능",
    title: "상단 '류이어리' 로고 클릭 시 홈 뷰 복귀 및 새로고침",
    desc: "헤더의 '류이어리' 로고를 누르면 검색/필터를 초기화하고 홈 피드 최상단으로 즉시 복귀하는 바로가기 인터랙션이 추가되었습니다.",
  },
  {
    version: "v2.5.1",
    date: "2026.08.25",
    type: "patch",
    tag: "UI/버그 수정",
    title: "사진 원본 비율 유지(찌부 왜곡 해결) 및 하단 UI 정돈",
    desc: "가로/세로/정사각형 사진의 원본 종횡비를 100% 온전하게 렌더링하도록 수정하고 하단 불필요한 문구를 제거했습니다.",
  },
  {
    version: "v2.5.0",
    date: "2026.08.25",
    type: "major",
    tag: "대규모 업데이트",
    title: "캘린더 뷰, 검색/필터, 앨범 사진 첨부(스마트 압축), 공감 리액션(❤️) 및 D-Day 추가",
    desc: "월간 달력 모드, 실시간 검색/필터, 앨범 사진 자동 최적화 첨부, 일기 공감 리액션(❤️), 기념일 D-Day 뱃지가 추가되었습니다.",
  },
  {
    version: "v2.4.0",
    date: "2026.08.25",
    type: "feature",
    tag: "기능 추가",
    title: "상단 알림 센터(🔔) 및 알림 터치 시 해당 글 자동 스크롤 이동",
    desc: "상대방의 새 글/댓글 알림 내역을 확인하고 터치 시 해당 글로 부드럽게 스크롤되어 반짝이는 강조 효과가 적용되었습니다.",
  },
  {
    version: "v2.3.0",
    date: "2026.08.25",
    type: "feature",
    tag: "보안/푸시",
    title: "아이폰(iOS) 백그라운드 웹 푸시 및 2단계 자동 로그인",
    desc: "Cloudflare Worker 서버리스 중계를 통한 스마트폰 잠금화면 푸시 알림 및 구글 자동 세션 유지 + 2차 암호 간편 잠금 시스템이 구축되었습니다.",
  },
  {
    version: "v2.2.0",
    date: "2026.08.23",
    type: "feature",
    tag: "기능 추가",
    title: "상단 공지사항 배너 및 실시간 닉네임 동기화 관리",
    desc: "둘만의 특별한 소식을 전하는 공지사항 등록·수정·삭제 기능과 화면 및 기존 작성글 닉네임 일괄 변경 기능이 추가되었습니다.",
  },
  {
    version: "v2.1.0",
    date: "2026.08.23",
    type: "feature",
    tag: "기능 추가",
    title: "계층형 댓글 및 대댓글(답글), 수정/삭제 지원",
    desc: "일기별 실시간 댓글과 인라인 답글(대댓글) 작성, 본인 작성 댓글에 대한 수정 및 삭제 기능이 구현되었습니다.",
  },
  {
    version: "v2.0.0",
    date: "2026.08.22",
    type: "major",
    tag: "대규모 업데이트",
    title: "그림판(Canvas 드로잉), 오늘의 기분 이모지, 핑크 테마",
    desc: "모바일 터치/마우스 드로잉 그림판, 실행취소(Undo), 고압축 이미지 저장, 기분 이모지 태그 및 감성 핑크 테마가 적용되었습니다.",
  },
  {
    version: "v1.0.0",
    date: "2026.08.22",
    type: "release",
    tag: "최초 오픈",
    title: "류이어리 교환 일기장 최초 오픈 🎉",
    desc: "구글 OAuth 인증 기반 실시간 양방향 교환 일기장 서비스가 시작되었습니다.",
  },
];

const changelogBtn = document.getElementById("changelog-btn");
const changelogModal = document.getElementById("changelog-modal");
const changelogCloseBtn = document.getElementById("changelog-close-btn");
const changelogList = document.getElementById("changelog-list");

/**
 * 업데이트 내역 목록 렌더링
 */
function renderChangelogList() {
  if (!changelogList) return;
  changelogList.innerHTML = "";

  for (const item of CHANGELOG_DATA) {
    const li = document.createElement("li");
    li.className = `changelog-item ${item.type}`;

    li.innerHTML = `
      <div class="changelog-header-row">
        <span class="changelog-version">${item.version}</span>
        <span class="changelog-tag ${item.type}">${item.tag}</span>
        <span class="changelog-date">${item.date}</span>
      </div>
      <h4 class="changelog-item-title">${item.title}</h4>
      <p class="changelog-item-desc">${item.desc}</p>
    `;

    changelogList.appendChild(li);
  }
}

/**
 * 업데이트 내역 모듈 초기화
 */
export function initChangelog() {
  renderChangelogList();

  if (changelogBtn && changelogModal) {
    changelogBtn.addEventListener("click", () => {
      renderChangelogList();
      openModal(changelogModal);
    });
  }

  if (changelogCloseBtn && changelogModal) {
    changelogCloseBtn.addEventListener("click", () => {
      closeModal(changelogModal);
    });
  }
}



