// =========================================================
// report.js - 썸원(SumOne) 스타일 월간 레포트 모듈
// 한 달간의 일기, 감정, 댓글, 그림/사진, 기념일을 집계하여 감성 카드 뉴스로 제공
// =========================================================

import { getCurrentUser, getCurrentProfiles } from "./state.js";
import { getMilestonesForDate, getDdayItems } from "./dday.js";
import { showToastNotification, showSystemNotification, startTitleBlink } from "./notify.js";

// 내부 캐시 및 상태
let cachedEntries = [];
let currentReportYear = new Date().getFullYear();
let currentReportMonth = new Date().getMonth(); // 기본값: 지난달 (0 = 1월, 11 = 12월)
let currentSlideIndex = 0;
const TOTAL_SLIDES = 7;

// DOM 요소
let reportModal = null;
let reportBtn = null;
let reportBadge = null;
let calReportBtn = null;

/**
 * 일기 목록 캐시 갱신 (render.js에서 호출)
 */
export function updateReportEntries(entries) {
  cachedEntries = entries || [];
  checkReportBadge();
}

/**
 * 특정 연도와 월(1~12)의 레포트 데이터를 계산합니다.
 */
export function generateReportData(year, month) {
  // month: 1 ~ 12
  const startMs = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
  const endMs = new Date(year, month, 0, 23, 59, 59, 999).getTime();
  const daysInMonth = new Date(year, month, 0).getDate();

  // 1. 해당 월에 작성된 일기 필터링
  const monthEntries = cachedEntries.filter(
    (e) => e.createdAt && e.createdAt >= startMs && e.createdAt <= endMs
  );

  // 2. 작성자별 통계 (이름 기준)
  const profiles = getCurrentProfiles();
  const authorCounts = {};
  const activeDaysSet = new Set();
  const moodCounts = {};
  let totalComments = 0;
  let totalReactions = 0;
  let bestEntry = null;
  let bestScore = -1;
  const mediaEntries = [];

  monthEntries.forEach((entry) => {
    // 작성자
    const authorName = entry.author || (entry.uid && profiles[entry.uid]) || "익명";
    authorCounts[authorName] = (authorCounts[authorName] || 0) + 1;

    // 작성 일자 (활동 일수)
    const d = new Date(entry.createdAt);
    activeDaysSet.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);

    // 기분 통계
    if (entry.mood) {
      let m = entry.mood;
      if (m === "🫪") m = "🤯";
      moodCounts[m] = (moodCounts[m] || 0) + 1;
    }

    // 댓글 및 공감 통계
    const commentsCount = (entry.comments && entry.comments.length) || 0;
    totalComments += commentsCount;

    let reactionsCount = 0;
    if (entry.reactions && typeof entry.reactions === "object") {
      Object.values(entry.reactions).forEach((uids) => {
        if (Array.isArray(uids)) reactionsCount += uids.length;
      });
    }
    totalReactions += reactionsCount;

    // 베스트 일기 산정 (댓글 2점 + 리액션 1.5점 + 본문 길이 가산)
    const score = commentsCount * 2 + reactionsCount * 1.5 + ((entry.body || "").length > 30 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }

    // 사진/그림 첨부 일기
    if (entry.image) {
      mediaEntries.push(entry);
    }
  });

  // 기분 TOP 3 산출
  const moodSorted = Object.entries(moodCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji, count]) => ({
      emoji,
      count,
      percent: monthEntries.length > 0 ? Math.round((count / monthEntries.length) * 100) : 0,
    }));

  // 마음 날씨 판별
  let weatherIcon = "🌤️";
  let weatherTitle = "포근하고 다정한 날씨";
  let weatherDesc = "서로에게 든든한 온기가 되어준 소중한 한 달이었습니다.";

  if (moodSorted.length > 0) {
    const topEmoji = moodSorted[0].emoji;
    if (["🥰", "💖", "🥳", "💕", "🌸", "✨"].includes(topEmoji)) {
      weatherIcon = "☀️";
      weatherTitle = "햇살 가득 맑고 사랑 넘침";
      weatherDesc = "서로를 향한 설렘과 고마움이 가득 넘쳐났던 눈부신 달이었어요!";
    } else if (["☕", "🌿", "😌", "💤"].includes(topEmoji)) {
      weatherIcon = "🌤️";
      weatherTitle = "잔잔하고 평온한 휴식";
      weatherDesc = "바쁜 일상 속에서도 서로의 곁에서 안식과 쉼을 얻은 포근한 달이었어요.";
    } else if (["😢", "🥺", "💧", "🌧️"].includes(topEmoji)) {
      weatherIcon = "🌧️";
      weatherTitle = "토닥토닥 감성 소나기";
      weatherDesc = "힘들고 지칠 때 서로의 손을 꼭 잡아주며 더 깊어진 한 달이었어요.";
    } else {
      weatherIcon = "🌈";
      weatherTitle = "다채롭고 소중한 무지개";
      weatherDesc = "기쁨과 고민을 모두 솔직하게 나누며 함께 성장해 간 빛나는 달이었어요.";
    }
  }

  // 3. 해당 월의 기념일 및 마일스톤 집계
  const monthlyEvents = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const msList = getMilestonesForDate(dateStr);
    msList.forEach((ms) => {
      monthlyEvents.push({ ...ms, day });
    });

    // 일반 등록 일정(생일/데이트)도 검사
    const ddayItems = getDdayItems();
    ddayItems.forEach((item) => {
      if (!item.date) return;
      const [iy, im, id] = item.date.split("-").map(Number);
      const type = item.type || "count_up";
      if (type === "birthday" && im === month && id === day) {
        monthlyEvents.push({
          title: `${item.title} 생일 🎂`,
          icon: item.icon || "🎂",
          day,
        });
      } else if (type === "event" && iy === year && im === month && id === day) {
        monthlyEvents.push({
          title: `${item.title}`,
          icon: item.icon || "🌟",
          day,
        });
      }
    });
  }

  return {
    year,
    month,
    daysInMonth,
    totalCount: monthEntries.length,
    activeDays: activeDaysSet.size,
    authorCounts,
    moodSorted,
    weatherIcon,
    weatherTitle,
    weatherDesc,
    totalComments,
    totalReactions,
    bestEntry,
    mediaEntries,
    monthlyEvents,
    hasEntries: monthEntries.length > 0,
  };
}

/**
 * 슬라이드 뷰 렌더링
 */
function renderSlides(data) {
  const container = document.getElementById("report-slides-wrapper");
  const dotsContainer = document.getElementById("report-dots");
  if (!container) return;

  const {
    year,
    month,
    daysInMonth,
    totalCount,
    activeDays,
    authorCounts,
    moodSorted,
    weatherIcon,
    weatherTitle,
    weatherDesc,
    totalComments,
    totalReactions,
    bestEntry,
    mediaEntries,
    monthlyEvents,
    hasEntries,
  } = data;

  const authors = Object.keys(authorCounts);
  const authorA = authors[0] || "류";
  const authorB = authors[1] || "어그리";
  const countA = authorCounts[authorA] || 0;
  const countB = authorCounts[authorB] || 0;
  const percentA = totalCount > 0 ? Math.round((countA / totalCount) * 100) : 50;
  const percentB = totalCount > 0 ? 100 - percentA : 50;

  // 슬라이드 HTML 목록
  const slides = [];

  // ==========================
  // 슬라이드 1: 표지 (Cover)
  // ==========================
  slides.push(`
    <div class="report-slide report-slide-cover">
      <div class="report-badge-pill">MONTHLY MEMORY REPORT</div>
      <div class="report-cover-deco">💌</div>
      <h3 class="report-cover-title">${year}년 ${month}월</h3>
      <p class="report-cover-subtitle">류와 어그리가 함께 쓴 이야기</p>
      <div class="report-cover-summary-box">
        ${
          hasEntries
            ? `<span class="report-highlight-num">${totalCount}편</span>의 일기와 <span class="report-highlight-num">${activeDays}일</span>의 소중한 순간들 ✨`
            : "아직 작성된 일기가 없는 달이에요 🍃"
        }
      </div>
      <p class="report-swipe-hint">오른쪽으로 넘겨 이번 달 추억을 확인해 보세요 ➔</p>
    </div>
  `);

  // ==========================
  // 슬라이드 2: 기록 결산 (일기 통계)
  // ==========================
  slides.push(`
    <div class="report-slide">
      <div class="report-card-tag">📊 01. 기록 결산</div>
      <h4 class="report-slide-title">우리의 기록 습관</h4>
      <div class="report-stat-grid">
        <div class="report-stat-item">
          <span class="report-stat-val">${totalCount}</span>
          <span class="report-stat-lbl">총 일기 수</span>
        </div>
        <div class="report-stat-item">
          <span class="report-stat-val">${activeDays}/${daysInMonth}</span>
          <span class="report-stat-lbl">기록한 날수</span>
        </div>
      </div>

      <div class="report-ratio-container">
        <div class="report-ratio-header">
          <span>${authorA} (${countA}편)</span>
          <span>${authorB} (${countB}편)</span>
        </div>
        <div class="report-ratio-bar">
          <div class="report-ratio-fill a" style="width: ${percentA}%"></div>
          <div class="report-ratio-fill b" style="width: ${percentB}%"></div>
        </div>
        <p class="report-ratio-comment">
          ${
            totalCount === 0
              ? "다음 달엔 우리만의 이야기를 기록해 볼까요?"
              : Math.abs(percentA - percentB) <= 15
              ? "서로 꼭 닮은 마음으로 다정하게 채워나갔어요! ⚖️"
              : countA > countB
              ? `${authorA} 님이 사랑과 정성을 듬뿍 담아 남겨주었어요! ✍️`
              : `${authorB} 님이 사랑과 정성을 듬뿍 담아 남겨주었어요! ✍️`
          }
        </p>
      </div>
    </div>
  `);

  // ==========================
  // 슬라이드 3: 마음 날씨 (감정 결산)
  // ==========================
  const moodChipsHtml =
    moodSorted.length > 0
      ? moodSorted
          .slice(0, 3)
          .map(
            (m, i) => `
          <div class="report-mood-row">
            <span class="report-mood-rank">${i + 1}위</span>
            <span class="report-mood-icon">${m.emoji}</span>
            <div class="report-mood-bar-wrap">
              <div class="report-mood-bar-fill" style="width: ${m.percent}%"></div>
            </div>
            <span class="report-mood-pct">${m.percent}% (${m.count}회)</span>
          </div>
        `
          )
          .join("")
      : '<p class="report-empty-sub">선택된 감정 기록이 없습니다.</p>';

  slides.push(`
    <div class="report-slide">
      <div class="report-card-tag">🌤️ 02. 마음 날씨</div>
      <h4 class="report-slide-title">이달의 우리 감정</h4>
      <div class="report-weather-box">
        <span class="report-weather-icon">${weatherIcon}</span>
        <div class="report-weather-text-wrap">
          <h5 class="report-weather-title">${weatherTitle}</h5>
          <p class="report-weather-desc">${weatherDesc}</p>
        </div>
      </div>
      <div class="report-mood-list">
        <h5 class="report-sub-title">가장 많이 느낀 감정 TOP 3</h5>
        ${moodChipsHtml}
      </div>
    </div>
  `);

  // ==========================
  // 슬라이드 4: 사랑의 대화 (댓글 & 베스트 일기)
  // ==========================
  let bestEntryHtml = '<p class="report-empty-sub">작성된 일기가 없습니다.</p>';
  if (bestEntry) {
    const bDate = new Date(bestEntry.createdAt);
    const bDateStr = `${bDate.getMonth() + 1}월 ${bDate.getDate()}일`;
    bestEntryHtml = `
      <div class="report-best-card" data-id="${bestEntry.id}">
        <div class="report-best-header">
          <span class="report-best-badge">🏆 이달의 베스트 일기</span>
          <span class="report-best-date">${bDateStr}</span>
        </div>
        <h5 class="report-best-title">${bestEntry.title || "제목 없음"}</h5>
        <p class="report-best-snippet">${(bestEntry.body || "").slice(0, 75)}${(bestEntry.body || "").length > 75 ? "..." : ""}</p>
        <div class="report-best-footer">
          <span>작성자: ${bestEntry.author || "익명"}</span>
          <span>💬 댓글 ${(bestEntry.comments && bestEntry.comments.length) || 0}개</span>
        </div>
      </div>
    `;
  }

  slides.push(`
    <div class="report-slide">
      <div class="report-card-tag">💬 03. 교감과 대화</div>
      <h4 class="report-slide-title">서로 주고받은 마음</h4>
      <div class="report-stat-grid">
        <div class="report-stat-item">
          <span class="report-stat-val">${totalComments}</span>
          <span class="report-stat-lbl">나눈 댓글 수</span>
        </div>
        <div class="report-stat-item">
          <span class="report-stat-val">${totalReactions}</span>
          <span class="report-stat-lbl">누른 하트 공감</span>
        </div>
      </div>
      <div class="report-best-wrap">
        ${bestEntryHtml}
      </div>
    </div>
  `);

  // ==========================
  // 슬라이드 5: 추억 갤러리 (그림 & 사진)
  // ==========================
  let galleryHtml = "";
  if (mediaEntries.length > 0) {
    galleryHtml = `
      <div class="report-gallery-grid">
        ${mediaEntries
          .slice(0, 6)
          .map(
            (e) => `
          <div class="report-gallery-item" title="${e.title || '추억'}">
            <img src="${e.image}" alt="추억 사진" loading="lazy" />
          </div>
        `
          )
          .join("")}
      </div>
      <p class="report-gallery-caption">이번 달에 남긴 ${mediaEntries.length}장의 소중한 순간들 📷</p>
    `;
  } else {
    galleryHtml = `
      <div class="report-gallery-empty">
        <span class="report-empty-icon">🎨</span>
        <p>이번 달에는 사진이나 그림이 없었어요.</p>
        <p class="report-empty-sub">다음 달엔 캔버스에 예쁜 그림이나 사진을 남겨보세요!</p>
      </div>
    `;
  }

  slides.push(`
    <div class="report-slide">
      <div class="report-card-tag">🎨 04. 추억 갤러리</div>
      <h4 class="report-slide-title">이달의 사진 & 그림</h4>
      ${galleryHtml}
    </div>
  `);

  // ==========================
  // 슬라이드 6: 기념일 회고
  // ==========================
  let eventsHtml = "";
  if (monthlyEvents.length > 0) {
    eventsHtml = `
      <ul class="report-event-list">
        ${monthlyEvents
          .map(
            (ev) => `
          <li class="report-event-item">
            <span class="report-event-day">${month}월 ${ev.day}일</span>
            <span class="report-event-icon">${ev.icon || "💖"}</span>
            <span class="report-event-title">${ev.title}</span>
          </li>
        `
          )
          .join("")}
      </ul>
    `;
  } else {
    eventsHtml = `
      <div class="report-event-empty">
        <span class="report-empty-icon">🌿</span>
        <p>평범한 하루하루가 모여 소중했던 한 달</p>
        <p class="report-empty-sub">둘이 함께하는 모든 날이 특별한 기념일이에요.</p>
      </div>
    `;
  }

  slides.push(`
    <div class="report-slide">
      <div class="report-card-tag">🗓️ 05. 기념일 회고</div>
      <h4 class="report-slide-title">함께 기념한 순간들</h4>
      ${eventsHtml}
    </div>
  `);

  // ==========================
  // 슬라이드 7: 마무리 편지
  // ==========================
  slides.push(`
    <div class="report-slide report-slide-closing">
      <div class="report-closing-icon">🌸</div>
      <h4 class="report-closing-title">${month}월을 마무리하며</h4>
      <div class="report-closing-card">
        <p class="report-closing-text">
          서로를 아끼고 배려하며<br />
          예쁜 추억을 가득 채워준 <strong>류</strong>와 <strong>어그리</strong> 💕
        </p>
        <p class="report-closing-sub">
          다가오는 다음 달에도<br />
          더 행복하고 따뜻한 이야기들로<br />
          우리의 일기장을 가득 채워가요 ✨
        </p>
      </div>
      <button type="button" class="report-confirm-btn" id="report-confirm-btn">
        💖 예쁜 추억 간직하기
      </button>
    </div>
  `);

  container.innerHTML = slides.join("");

  // 도트 인디케이터 생성
  dotsContainer.innerHTML = "";
  for (let i = 0; i < slides.length; i++) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `report-dot ${i === currentSlideIndex ? "active" : ""}`;
    dot.title = `${i + 1}번째 카드`;
    dot.addEventListener("click", () => goToSlide(i));
    dotsContainer.appendChild(dot);
  }

  // 베스트 일기 클릭 이벤트
  const bestCard = container.querySelector(".report-best-card");
  if (bestCard && bestEntry) {
    bestCard.addEventListener("click", () => {
      closeReportModal();
      const targetCard = document.querySelector(`[data-entry-id="${bestEntry.id}"]`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
        targetCard.classList.add("highlight-pulse");
        setTimeout(() => targetCard.classList.remove("highlight-pulse"), 2500);
      }
    });
  }

  // 마무리 확인 버튼
  const confirmBtn = document.getElementById("report-confirm-btn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", closeReportModal);
  }

  updateSlidePosition();
}

/**
 * 슬라이드 이동
 */
function goToSlide(index) {
  if (index < 0) index = 0;
  if (index >= TOTAL_SLIDES) index = TOTAL_SLIDES - 1;
  currentSlideIndex = index;
  updateSlidePosition();
}

function nextSlide() {
  if (currentSlideIndex < TOTAL_SLIDES - 1) {
    currentSlideIndex++;
    updateSlidePosition();
  }
}

function prevSlide() {
  if (currentSlideIndex > 0) {
    currentSlideIndex--;
    updateSlidePosition();
  }
}

function updateSlidePosition() {
  const container = document.getElementById("report-slides-wrapper");
  const dots = document.querySelectorAll(".report-dot");
  const prevBtn = document.getElementById("report-prev-slide");
  const nextBtn = document.getElementById("report-next-slide");

  if (container) {
    container.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  }

  dots.forEach((d, i) => {
    if (i === currentSlideIndex) d.classList.add("active");
    else d.classList.remove("active");
  });

  if (prevBtn) prevBtn.disabled = currentSlideIndex === 0;
  if (nextBtn) nextBtn.disabled = currentSlideIndex === TOTAL_SLIDES - 1;
}

/**
 * 월간 레포트 모달 열기
 * @param {number} year - 연도 (기본: currentReportYear)
 * @param {number} month - 월 (1~12, 기본: currentReportMonth + 1)
 */
export function openReportModal(year = currentReportYear, month = currentReportMonth + 1) {
  currentReportYear = year;
  currentReportMonth = month - 1; // 0-based
  currentSlideIndex = 0;

  const titleEl = document.getElementById("report-modal-month-title");
  if (titleEl) {
    titleEl.textContent = `${year}년 ${month}월`;
  }

  const data = generateReportData(year, month);
  renderSlides(data);

  if (reportModal) {
    reportModal.hidden = false;
  }

  // 이번 달 확인 완료로 기록 (NEW 뱃지 제거)
  const key = `report_viewed_${year}_${month}`;
  localStorage.setItem(key, "true");
  checkReportBadge();
}

/**
 * 월간 레포트 모달 닫기
 */
export function closeReportModal() {
  if (reportModal) {
    reportModal.hidden = true;
  }
}

/**
 * 헤더 NEW 뱃지 노출 여부 검사
 */
function checkReportBadge() {
  if (!reportBadge) return;
  const now = new Date();
  // 지난달 연도와 월 (1~12)
  let prevY = now.getFullYear();
  let prevM = now.getMonth(); // 0-11
  if (prevM === 0) {
    prevM = 12;
    prevY--;
  }
  const key = `report_viewed_${prevY}_${prevM}`;
  if (!localStorage.getItem(key)) {
    reportBadge.hidden = false;
  } else {
    reportBadge.hidden = true;
  }
}

/**
 * 월간 알림 발송 검사
 * - 매월 1일~7일 또는 새 달 진입 시 지난달 레포트 미열람/알림 미발송 시 알림 트리거
 */
export function checkMonthlyReportNotification() {
  const now = new Date();
  let prevY = now.getFullYear();
  let prevM = now.getMonth(); // 0=1월...11=12월. now.getMonth()가 8(9월)이면 prevM은 8(8월)
  if (prevM === 0) {
    prevM = 12;
    prevY--;
  }

  const notifKey = `monthly_report_notif_${prevY}_${prevM}`;
  if (!localStorage.getItem(notifKey)) {
    localStorage.setItem(notifKey, "sent");

    const title = `💌 ${prevY}년 ${prevM}월 월간 레포트 도착!`;
    const body = `류와 어그리의 지난달 추억과 감정 분석이 담긴 월간 레포트가 발행되었어요 💕`;

    showToastNotification(body, "📊");
    showSystemNotification(title, body);
    startTitleBlink(body);

    checkReportBadge();
  }
}

/**
 * 터치 스와이프 제스처 이벤트 등록
 */
function initTouchSwipe() {
  const container = document.getElementById("report-carousel");
  if (!container) return;

  let startX = 0;
  let startY = 0;
  let distX = 0;
  let distY = 0;

  container.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      distX = 0;
      distY = 0;
    },
    { passive: true }
  );

  container.addEventListener(
    "touchmove",
    (e) => {
      if (!startX || !startY) return;
      const touch = e.touches[0];
      distX = touch.clientX - startX;
      distY = touch.clientY - startY;
    },
    { passive: true }
  );

  container.addEventListener("touchend", () => {
    // 가로 이동 거리가 45px 이상이고 세로 이동보다 클 때 스와이프 인정
    if (Math.abs(distX) > 45 && Math.abs(distX) > Math.abs(distY)) {
      if (distX < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    startX = 0;
    startY = 0;
  });
}

/**
 * 월간 레포트 모듈 초기화
 */
export function initReport() {
  reportModal = document.getElementById("monthly-report-modal");
  reportBtn = document.getElementById("monthly-report-btn");
  reportBadge = document.getElementById("monthly-report-badge");
  calReportBtn = document.getElementById("cal-report-btn");

  const closeBtn = document.getElementById("report-close-btn");
  const prevMonthBtn = document.getElementById("report-prev-month-btn");
  const nextMonthBtn = document.getElementById("report-next-month-btn");
  const prevSlideBtn = document.getElementById("report-prev-slide");
  const nextSlideBtn = document.getElementById("report-next-slide");

  // 헤더 버튼 클릭
  if (reportBtn) {
    reportBtn.addEventListener("click", () => {
      const now = new Date();
      let targetY = now.getFullYear();
      let targetM = now.getMonth(); // 기본: 직전 달
      if (targetM === 0) {
        targetM = 12;
        targetY--;
      }
      openReportModal(targetY, targetM);
    });
  }

  // 캘린더 '이 달의 레포트' 버튼 클릭
  if (calReportBtn) {
    calReportBtn.addEventListener("click", () => {
      // 캘린더 상단 타이틀 텍스트에서 년/월 파싱 (예: "2026년 8월")
      const calTitle = document.getElementById("cal-month-title");
      if (calTitle && calTitle.textContent) {
        const parts = calTitle.textContent.match(/(\d{4})년\s*(\d{1,2})월/);
        if (parts) {
          openReportModal(Number(parts[1]), Number(parts[2]));
          return;
        }
      }
      const now = new Date();
      openReportModal(now.getFullYear(), now.getMonth() + 1);
    });
  }

  // 닫기 버튼
  if (closeBtn) {
    closeBtn.addEventListener("click", closeReportModal);
  }

  // 모달 배경 클릭 시 닫기
  if (reportModal) {
    reportModal.addEventListener("click", (e) => {
      if (e.target === reportModal) closeReportModal();
    });
  }

  // 월 전환 버튼
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => {
      let y = currentReportYear;
      let m = currentReportMonth; // 0-based
      m--;
      if (m < 0) {
        m = 11;
        y--;
      }
      openReportModal(y, m + 1);
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
      let y = currentReportYear;
      let m = currentReportMonth;
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
      openReportModal(y, m + 1);
    });
  }

  // 슬라이드 전환 버튼
  if (prevSlideBtn) prevSlideBtn.addEventListener("click", prevSlide);
  if (nextSlideBtn) nextSlideBtn.addEventListener("click", nextSlide);

  // 스와이프 등록
  initTouchSwipe();

  // 초기 뱃지 및 알림 검사
  checkReportBadge();
  checkMonthlyReportNotification();
}
