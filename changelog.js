// =========================================================
// changelog.js - 류이어리 업데이트 내역(Changelog) 관리 모듈
// 중요도에 따른 체계적인 시맨틱 버전(Semantic Versioning) 기록
// =========================================================

// 업데이트 히스토리 데이터 (최신순)
export const CHANGELOG_DATA = [
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
      changelogModal.hidden = false;
    });
  }

  if (changelogCloseBtn && changelogModal) {
    changelogCloseBtn.addEventListener("click", () => {
      changelogModal.hidden = true;
    });
  }

  // 모달 바깥 배경 클릭 시 닫기
  if (changelogModal) {
    changelogModal.addEventListener("click", (e) => {
      if (e.target === changelogModal) {
        changelogModal.hidden = true;
      }
    });
  }
}



