// =========================================================
// report.js - 감성 월간 레포트 모듈
// - 동적 프로필 기반 익명/중립 표기 및 XSS 이스케이프 적용
// - 실제 기분 이모지(😁🥰😭🤬🤯😴) 맞춤 마음 날씨 판별 & 다중 사진 전체 집계
// - 베스트 일기 클릭 시 피드 전환 + 자동 페이징 탐색, 미래 월 탐색 차단
// =========================================================

import { getCurrentUser, getCurrentProfiles, getUserDisplayName, isUserProfileId } from "./state.js";
import { getMilestonesForDate, getDdayItems } from "./dday.js";
import { showToastNotification, showSystemNotification, startTitleBlink } from "./notify.js";
import { openModal, closeModal, escapeHtml, sanitizeImageUrl, normalizeMood, openLightbox } from "./ui.js";

let cachedEntries = [];
let currentReportYear = new Date().getFullYear();
let currentReportMonth = new Date().getMonth(); // 0-based
let currentSlideIndex = 0;
const TOTAL_SLIDES = 7;

let reportModal = null;
let reportBtn = null;
let reportBadge = null;
let calReportBtn = null;

function getPreviousYearMonth() {
  const now = new Date();
  let prevY = now.getFullYear();
  let prevM = now.getMonth(); // 0=1월 -> 지난달은 작년 12월
  if (prevM === 0) {
    prevM = 12;
    prevY--;
  }
  return { year: prevY, month: prevM };
}

function getParticipantNames(authorCounts) {
  const profiles = getCurrentProfiles();
  const profileNames = Object.entries(profiles)
    .filter(([uid, name]) => isUserProfileId(uid) && name)
    .map(([, name]) => name);

  const countAuthors = Object.keys(authorCounts || {});
  const merged = [...new Set([...countAuthors, ...profileNames])];
  return [merged[0] || "참여자 A", merged[1] || "참여자 B"];
}

export function updateReportEntries(entries) {
  cachedEntries = Array.isArray(entries) ? entries : [];
  checkReportBadge();
}

export function generateReportData(year, month) {
  const startMs = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
  const endMs = new Date(year, month, 0, 23, 59, 59, 999).getTime();
  const daysInMonth = new Date(year, month, 0).getDate();

  const monthEntries = cachedEntries.filter(
    (e) => e.createdAt && e.createdAt >= startMs && e.createdAt <= endMs
  );

  const authorCounts = {};
  const activeDaysSet = new Set();
  const moodCounts = {};
  let moodedEntriesCount = 0;
  let totalComments = 0;
  let totalReactions = 0;
  let bestEntry = null;
  let bestScore = -1;
  const mediaPhotos = []; // { src, title }

  monthEntries.forEach((entry) => {
    const authorName = getUserDisplayName(entry.uid, entry.author || "참여자");
    authorCounts[authorName] = (authorCounts[authorName] || 0) + 1;

    const d = new Date(entry.createdAt);
    activeDaysSet.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);

    if (entry.mood) {
      const m = normalizeMood(entry.mood);
      moodCounts[m] = (moodCounts[m] || 0) + 1;
      moodedEntriesCount += 1;
    }

    const commentsCount = (entry.comments && entry.comments.length) || 0;
    totalComments += commentsCount;

    let reactionsCount = 0;
    if (entry.reactions && typeof entry.reactions === "object") {
      Object.values(entry.reactions).forEach((uids) => {
        if (Array.isArray(uids)) reactionsCount += uids.length;
      });
    }
    totalReactions += reactionsCount;

    const score =
      commentsCount * 2 + reactionsCount * 1.5 + ((entry.body || "").length > 30 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }

    const imgs =
      Array.isArray(entry.images) && entry.images.length > 0
        ? entry.images
        : entry.image
        ? [entry.image]
        : [];
    imgs.forEach((src) => {
      const safe = sanitizeImageUrl(src);
      if (safe) {
        mediaPhotos.push({ src: safe, title: entry.title || "추억" });
      }
    });
  });

  // 기분이 기록된 일기 수를 분모로 계산하여 비율 합계가 자연스럽게 100%에 가깝게 표기
  const moodSorted = Object.entries(moodCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji, count]) => ({
      emoji,
      count,
      percent: moodedEntriesCount > 0 ? Math.round((count / moodedEntriesCount) * 100) : 0,
    }));

  // 실제 기분 선택기 이모지(😁🥰😭🤬🤯😴)와 정확히 매핑된 마음 날씨 판별
  let weatherIcon = "🌤️";
  let weatherTitle = "포근하고 다정한 날씨";
  let weatherDesc = "서로에게 든든한 온기가 되어준 소중한 한 달이었습니다.";

  if (moodSorted.length > 0) {
    const topEmoji = moodSorted[0].emoji;
    if (["🥰", "😁", "💖", "🥳", "💕", "🌸", "✨"].includes(topEmoji)) {
      weatherIcon = "☀️";
      weatherTitle = "햇살 가득 맑고 사랑 넘침";
      weatherDesc = "서로를 향한 웃음과 설렘이 가득 넘쳐났던 눈부신 달이었어요!";
    } else if (["😴", "☕", "🌿", "😌", "💤"].includes(topEmoji)) {
      weatherIcon = "🌙";
      weatherTitle = "포근한 휴식과 충전의 달";
      weatherDesc = "바쁘고 피곤한 일상 속에서도 서로의 곁에서 안식을 얻은 달이었어요.";
    } else if (["😭", "😢", "🥺", "💧", "🌧️"].includes(topEmoji)) {
      weatherIcon = "🌧️";
      weatherTitle = "토닥토닥 감성 소나기";
      weatherDesc = "마음이 흔들릴 때 서로의 손을 꼭 잡아주며 더 단단해진 한 달이었어요.";
    } else if (["🤬", "🤯"].includes(topEmoji)) {
      weatherIcon = "⚡";
      weatherTitle = "시원하게 털어낸 에너지의 달";
      weatherDesc = "지치고 복잡했던 하루를 솔직히 나누며 함께 극복해 낸 달이었어요!";
    } else {
      weatherIcon = "🌈";
      weatherTitle = "다채롭고 소중한 무지개";
      weatherDesc = "기쁨과 고민을 모두 솔직하게 나누며 함께 성장해 간 빛나는 달이었어요.";
    }
  }

  const monthlyEvents = [];
  const ddayItems = getDdayItems();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const msList = getMilestonesForDate(dateStr);
    msList.forEach((ms) => {
      monthlyEvents.push({ ...ms, day });
    });

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
          title: item.title,
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
    mediaPhotos,
    monthlyEvents,
    hasEntries: monthEntries.length > 0,
  };
}

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
    mediaPhotos,
    monthlyEvents,
    hasEntries,
  } = data;

  const [authorA, authorB] = getParticipantNames(authorCounts);
  const safeAuthorA = escapeHtml(authorA);
  const safeAuthorB = escapeHtml(authorB);
  const countA = authorCounts[authorA] || 0;
  const countB = authorCounts[authorB] || 0;
  const percentA = totalCount > 0 ? Math.round((countA / totalCount) * 100) : 50;
  const percentB = totalCount > 0 ? 100 - percentA : 50;

  const slides = [];

  // 슬라이드 1: 표지
  slides.push(`
    <div class="report-slide report-slide-cover">
      <div class="report-badge-pill">MONTHLY MEMORY REPORT</div>
      <div class="report-cover-deco">💌</div>
      <h3 class="report-cover-title">${year}년 ${month}월</h3>
      <p class="report-cover-subtitle">우리 둘이 함께 쓴 이야기</p>
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

  // 슬라이드 2: 기록 결산
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
          <span>${safeAuthorA} (${countA}편)</span>
          <span>${safeAuthorB} (${countB}편)</span>
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
              ? `${safeAuthorA} 님이 사랑과 정성을 듬뿍 담아 남겨주었어요! ✍️`
              : `${safeAuthorB} 님이 사랑과 정성을 듬뿍 담아 남겨주었어요! ✍️`
          }
        </p>
      </div>
    </div>
  `);

  // 슬라이드 3: 마음 날씨
  const moodChipsHtml =
    moodSorted.length > 0
      ? moodSorted
          .slice(0, 3)
          .map(
            (m, i) => `
          <div class="report-mood-row">
            <span class="report-mood-rank">${i + 1}위</span>
            <span class="report-mood-icon">${escapeHtml(m.emoji)}</span>
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

  // 슬라이드 4: 교감과 대화 & 베스트 일기
  let bestEntryHtml = '<p class="report-empty-sub">작성된 일기가 없습니다.</p>';
  if (bestEntry) {
    const bDate = new Date(bestEntry.createdAt);
    const bDateStr = `${bDate.getMonth() + 1}월 ${bDate.getDate()}일`;
    const bestAuthor = escapeHtml(getUserDisplayName(bestEntry.uid, bestEntry.author || "참여자"));
    const safeBestTitle = escapeHtml(bestEntry.title || "제목 없음");
    const rawBody = String(bestEntry.body || "");
    const safeSnippet = escapeHtml(rawBody.slice(0, 75) + (rawBody.length > 75 ? "..." : ""));

    bestEntryHtml = `
      <button type="button" class="report-best-card" data-id="${escapeHtml(bestEntry.id)}">
        <div class="report-best-header">
          <span class="report-best-badge">🏆 이달의 베스트 일기</span>
          <span class="report-best-date">${bDateStr}</span>
        </div>
        <h5 class="report-best-title">${safeBestTitle}</h5>
        <p class="report-best-snippet">${safeSnippet}</p>
        <div class="report-best-footer">
          <span>작성자: ${bestAuthor}</span>
          <span>💬 댓글 ${(bestEntry.comments && bestEntry.comments.length) || 0}개 · 보기 ➔</span>
        </div>
      </button>
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

  // 슬라이드 5: 추억 갤러리 (다중 사진 전체 집계 + 클릭 시 라이트박스)
  let galleryHtml = "";
  if (mediaPhotos.length > 0) {
    galleryHtml = `
      <div class="report-gallery-grid">
        ${mediaPhotos
          .slice(0, 6)
          .map(
            (p, idx) => `
          <button type="button" class="report-gallery-item" data-photo-idx="${idx}" title="${escapeHtml(p.title)}">
            <img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async" />
          </button>
        `
          )
          .join("")}
      </div>
      <p class="report-gallery-caption">이번 달에 남긴 ${mediaPhotos.length}장의 소중한 순간들 📷</p>
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

  // 슬라이드 6: 기념일 회고
  let eventsHtml = "";
  if (monthlyEvents.length > 0) {
    eventsHtml = `
      <ul class="report-event-list">
        ${monthlyEvents
          .map(
            (ev) => `
          <li class="report-event-item">
            <span class="report-event-day">${month}월 ${ev.day}일</span>
            <span class="report-event-icon">${escapeHtml(ev.icon || "💖")}</span>
            <span class="report-event-title">${escapeHtml(ev.title)}</span>
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

  // 슬라이드 7: 마무리 편지 (동적 닉네임 반영)
  slides.push(`
    <div class="report-slide report-slide-closing">
      <div class="report-closing-icon">🌸</div>
      <h4 class="report-closing-title">${month}월을 마무리하며</h4>
      <div class="report-closing-card">
        <p class="report-closing-text">
          서로를 아끼고 배려하며<br />
          예쁜 추억을 가득 채워준 <strong>${safeAuthorA}</strong>님과 <strong>${safeAuthorB}</strong>님 💕
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

  if (dotsContainer) {
    dotsContainer.innerHTML = "";
    for (let i = 0; i < slides.length; i++) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `report-dot ${i === currentSlideIndex ? "active" : ""}`;
      dot.title = `${i + 1}번째 카드`;
      dot.setAttribute("aria-label", `${i + 1}번째 레포트 카드`);
      dot.addEventListener("click", () => goToSlide(i));
      dotsContainer.appendChild(dot);
    }
  }

  // 베스트 일기 클릭 시 피드 탭 전환 + 페이징 자동 확장 + 하이라이트 이동
  const bestCard = container.querySelector(".report-best-card");
  if (bestCard && bestEntry) {
    bestCard.addEventListener("click", () => {
      closeReportModal();
      window.dispatchEvent(new CustomEvent("diary:switch-tab", { detail: { mode: "feed" } }));
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("diary:reveal-entry", {
            detail: { entryId: bestEntry.id },
          })
        );
      }, 150);
    });
  }

  // 갤러리 썸네일 클릭 시 라이트박스 열기
  if (mediaPhotos.length > 0) {
    const allSrcs = mediaPhotos.map((p) => p.src);
    container.querySelectorAll(".report-gallery-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.photoIdx) || 0;
        openLightbox(allSrcs, idx, `${year}년 ${month}월 추억 갤러리`);
      });
    });
  }

  const confirmBtn = document.getElementById("report-confirm-btn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", closeReportModal);
  }

  updateSlidePosition();
}

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
    d.classList.toggle("active", i === currentSlideIndex);
  });

  if (prevBtn) prevBtn.disabled = currentSlideIndex === 0;
  if (nextBtn) nextBtn.disabled = currentSlideIndex === TOTAL_SLIDES - 1;
}

function updateMonthNavLimits() {
  const nextMonthBtn = document.getElementById("report-next-month-btn");
  if (!nextMonthBtn) return;
  const now = new Date();
  const isCurrentOrFuture =
    currentReportYear > now.getFullYear() ||
    (currentReportYear === now.getFullYear() && currentReportMonth >= now.getMonth());
  nextMonthBtn.disabled = isCurrentOrFuture;
}

export function openReportModal(year = currentReportYear, month = currentReportMonth + 1) {
  const now = new Date();
  const maxYear = now.getFullYear();
  const maxMonth = now.getMonth() + 1;
  if (year > maxYear || (year === maxYear && month > maxMonth)) {
    year = maxYear;
    month = maxMonth;
  }

  currentReportYear = year;
  currentReportMonth = month - 1;
  currentSlideIndex = 0;

  const titleEl = document.getElementById("report-modal-month-title");
  if (titleEl) {
    titleEl.textContent = `${year}년 ${month}월`;
  }

  const data = generateReportData(year, month);
  renderSlides(data);
  updateMonthNavLimits();

  if (reportModal) {
    openModal(reportModal);
  }

  try {
    localStorage.setItem(`report_viewed_${year}_${month}`, "true");
  } catch {
    // 무시
  }
  checkReportBadge();
}

export function closeReportModal() {
  if (reportModal) {
    closeModal(reportModal);
  }
}

function hasEntriesInMonth(year, month) {
  const startMs = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
  const endMs = new Date(year, month, 0, 23, 59, 59, 999).getTime();
  return cachedEntries.some((e) => e.createdAt && e.createdAt >= startMs && e.createdAt <= endMs);
}

function checkReportBadge() {
  if (!reportBadge) return;
  const { year: prevY, month: prevM } = getPreviousYearMonth();
  const key = `report_viewed_${prevY}_${prevM}`;
  let viewed = false;
  try {
    viewed = Boolean(localStorage.getItem(key));
  } catch {
    viewed = false;
  }
  // 지난달 일기가 1편 이상 있고 아직 열람하지 않았을 때만 NEW 배지 표시
  reportBadge.hidden = viewed || !hasEntriesInMonth(prevY, prevM);
}

export function checkMonthlyReportNotification() {
  const user = getCurrentUser();
  if (!user) return;

  const { year: prevY, month: prevM } = getPreviousYearMonth();
  const notifKey = `monthly_report_notif_${prevY}_${prevM}`;

  let alreadySent = false;
  try {
    alreadySent = Boolean(localStorage.getItem(notifKey));
  } catch {
    alreadySent = true;
  }

  if (!alreadySent) {
    try {
      localStorage.setItem(notifKey, "sent");
    } catch {
      // 무시
    }

    const title = `💌 ${prevY}년 ${prevM}월 월간 레포트 도착!`;
    const body = `지난달 추억과 감정 분석이 담긴 월간 레포트가 발행되었어요 💕`;

    showToastNotification(body, "📊");
    showSystemNotification(title, body);
    startTitleBlink(body);

    checkReportBadge();
  }
}

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
      if (!startX && !startY) return;
      const touch = e.touches[0];
      distX = touch.clientX - startX;
      distY = touch.clientY - startY;
    },
    { passive: true }
  );

  container.addEventListener("touchend", () => {
    if (Math.abs(distX) > 45 && Math.abs(distX) > Math.abs(distY)) {
      if (distX < 0) nextSlide();
      else prevSlide();
    }
    startX = 0;
    startY = 0;
  });
}

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

  if (reportBtn) {
    reportBtn.addEventListener("click", () => {
      const { year, month } = getPreviousYearMonth();
      openReportModal(year, month);
    });
  }

  if (calReportBtn) {
    calReportBtn.addEventListener("click", () => {
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

  if (closeBtn) closeBtn.addEventListener("click", closeReportModal);

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => {
      let y = currentReportYear;
      let m = currentReportMonth - 1;
      if (m < 0) {
        m = 11;
        y--;
      }
      openReportModal(y, m + 1);
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
      if (nextMonthBtn.disabled) return;
      let y = currentReportYear;
      let m = currentReportMonth + 1;
      if (m > 11) {
        m = 0;
        y++;
      }
      openReportModal(y, m + 1);
    });
  }

  if (prevSlideBtn) prevSlideBtn.addEventListener("click", prevSlide);
  if (nextSlideBtn) nextSlideBtn.addEventListener("click", nextSlide);

  initTouchSwipe();
  checkReportBadge();
}
