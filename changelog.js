// =========================================================
// changelog.js - 류이어리 업데이트 내역(Changelog) 관리 모듈
// 중요도에 따른 체계적인 시맨틱 버전(Semantic Versioning) 기록
// =========================================================

// 업데이트 히스토리 데이터 (최신순)
export const CHANGELOG_DATA = [
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
