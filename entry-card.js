// =========================================================
// entry-card.js - 일기 카드 단일 컴포넌트 모듈
// 개별 일기 카드의 헤더, 삭제 버튼, 본문, 그림/사진, 공감 리액션 및 댓글을 조립합니다.
// ★ 목록 갱신은 Firestore onSnapshot이 담당하므로 수동 render 호출은 불필요하며 render.js를 import하지 않습니다.
// =========================================================

import { removeEntry, toggleReaction } from "./store.js";
import {
  getCurrentUser,
  isMyContent,
  createAvatarElement,
  getUserDisplayName,
} from "./state.js";
import { showError, formatDateTime } from "./ui.js";
import { createCommentsSection } from "./comments.js";
import { sendPushToPartner } from "./notify.js";
import { attachTimelapse } from "./timelapse.js";

const REACTION_EMOJIS = ["❤️", "🥰", "🥺", "👏", "🔥"];

/**
 * 리액션 바 DOM 요소를 생성합니다.
 */
function createReactionBar(entry) {
  const currentUser = getCurrentUser();
  const reactionWrap = document.createElement("div");
  reactionWrap.className = "reaction-bar";

  const reactions = entry.reactions || {};

  REACTION_EMOJIS.forEach((emoji) => {
    const uids = reactions[emoji] || [];
    const count = uids.length;
    const isMyReaction = currentUser && uids.includes(currentUser.uid);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `reaction-btn ${isMyReaction ? "active" : ""}`;
    btn.innerHTML = `<span class="reaction-emoji">${emoji}</span><span class="reaction-count">${count > 0 ? count : ""}</span>`;
    btn.title = isMyReaction ? `${emoji} 공감 취소` : `${emoji} 공감하기`;

    btn.addEventListener("click", async () => {
      try {
        const res = await toggleReaction(entry.id, emoji);
        if (res && res.isAdded) {
          // 내가 쓴 글이 아닌 상대방 글에 리액션을 남겼을 때 푸시 발송
          if (!isMyContent(entry)) {
            sendPushToPartner({
              title: "💌 류이어리 새 반응",
              message: `당신의 반쪽이 일기에 ${emoji} 리액션을 남겼습니다.`,
            });
          }
        }
      } catch (err) {
        console.error("[entry-card] 리액션 실패:", err);
      }
    });

    reactionWrap.appendChild(btn);
  });

  return reactionWrap;
}

/**
 * 일기 1건에 대한 카드 DOM 요소를 생성하여 반환합니다.
 * @param {Object} entry - 일기 문서 객체
 * @param {string} [idPrefix="entry-"] - 카드 DOM ID 접두어
 * @returns {HTMLLIElement} 일기 카드 li 요소
 */
export function createEntryCard(entry, idPrefix = "entry-") {
  const currentProfiles = getCurrentProfiles();

  const item = document.createElement("li");
  const isMyEntry = isMyContent(entry);

  item.className = `entry ${isMyEntry ? "my-card" : "other-card"}`;
  item.id = `${idPrefix}${entry.id}`;

  const headerDiv = document.createElement("div");
  headerDiv.className = "entry-header";

  const titleWrapper = document.createElement("div");
  titleWrapper.className = "entry-title-wrapper";

  // 작성자 구분 미니 뱃지 (내 글 / 상대방 글)
  const authorTag = document.createElement("span");
  authorTag.className = `entry-author-tag ${isMyEntry ? "my-tag" : "other-tag"}`;
  authorTag.textContent = isMyEntry ? "내 일기 📝" : "상대방 일기 💖";
  titleWrapper.appendChild(authorTag);

  const entryTitle = document.createElement("h2");
  entryTitle.className = "entry-title";
  entryTitle.textContent = entry.title || "(제목 없음)";
  titleWrapper.appendChild(entryTitle);

  // 오늘의 기분 이모지가 있을 때 뱃지로 렌더링
  if (entry.mood) {
    const moodBadge = document.createElement("span");
    moodBadge.className = "entry-mood-badge";
    const cardMood = entry.mood === "🫪" ? "🤯" : entry.mood;
    moodBadge.textContent = cardMood;
    moodBadge.title = `오늘의 기분: ${cardMood}`;
    titleWrapper.appendChild(moodBadge);
  }

  headerDiv.appendChild(titleWrapper);

  if (isMyEntry) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", async () => {
      if (confirm("정말 이 일기를 삭제하시겠습니까?")) {
        try {
          await removeEntry(entry.id);
        } catch (error) {
          console.error(error);
          showError("삭제하지 못했습니다. 인터넷 연결과 권한을 확인하세요.");
        }
      }
    });
    headerDiv.appendChild(deleteButton);
  }

  const metaDiv = document.createElement("div");
  metaDiv.className = "entry-meta";

  const authorWrapper = document.createElement("span");
  authorWrapper.className = "entry-author-wrapper";

  const authorDisplayName = getUserDisplayName(entry.uid, entry.author || "이름 없음");
  const authorAvatar = createAvatarElement(entry.uid, authorDisplayName, "entry-author-avatar");
  authorWrapper.appendChild(authorAvatar);

  const entryAuthor = document.createElement("span");
  entryAuthor.className = "entry-author";
  entryAuthor.textContent = `작성자: ${authorDisplayName}`;
  authorWrapper.appendChild(entryAuthor);

  // 작성 날짜 보여주기
  const entryDate = document.createElement("span");
  entryDate.className = "entry-date";
  if (entry.createdAt) {
    entryDate.textContent = formatDateTime(entry.createdAt);
  }

  metaDiv.appendChild(authorWrapper);
  metaDiv.appendChild(entryDate);

  item.appendChild(headerDiv);
  item.appendChild(metaDiv);

  // 본문 표시 (본문이 있을 때만 추가)
  if (entry.body && entry.body.trim() !== "") {
    const entryBody = document.createElement("p");
    entryBody.className = "entry-body";
    entryBody.textContent = entry.body;
    item.appendChild(entryBody);
  }

/**
 * 다중 사진 첨부 시 가로 스와이프/슬라이드 캐러셀 DOM을 생성합니다.
 */
function createPhotoCarousel(images, title = "") {
  const container = document.createElement("div");
  container.className = "entry-carousel";

  const track = document.createElement("div");
  track.className = "entry-carousel-track";

  images.forEach((src, idx) => {
    const slide = document.createElement("div");
    slide.className = "entry-carousel-slide";

    const img = document.createElement("img");
    img.className = "entry-carousel-img";
    img.src = src;
    img.loading = "lazy";
    img.alt = title ? `${title} 사진 ${idx + 1}` : `일기 사진 ${idx + 1}`;

    slide.appendChild(img);
    track.appendChild(slide);
  });

  // 우측 상단 카운터 배지: "1 / 4"
  const badge = document.createElement("span");
  badge.className = "entry-carousel-badge";
  badge.textContent = `1 / ${images.length}`;

  // 하단 인디케이터 도트 컨테이너
  const dotsWrap = document.createElement("div");
  dotsWrap.className = "entry-carousel-dots";

  const dots = images.map((_, idx) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `entry-carousel-dot ${idx === 0 ? "active" : ""}`;
    dot.title = `${idx + 1}번째 사진 보기`;
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      const slideWidth = track.clientWidth;
      track.scrollTo({ left: slideWidth * idx, behavior: "smooth" });
    });
    dotsWrap.appendChild(dot);
    return dot;
  });

  // 좌/우 이동 내비게이션 화살표 버튼
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "entry-carousel-btn prev";
  prevBtn.setAttribute("aria-label", "이전 사진");
  prevBtn.innerHTML = "‹";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "entry-carousel-btn next";
  nextBtn.setAttribute("aria-label", "다음 사진");
  nextBtn.innerHTML = "›";

  // 스크롤 시 활성 도트 및 배지 실시간 동기화
  track.addEventListener("scroll", () => {
    const slideWidth = track.clientWidth || 1;
    const currentIdx = Math.round(track.scrollLeft / slideWidth);
    badge.textContent = `${currentIdx + 1} / ${images.length}`;
    dots.forEach((d, i) => {
      if (i === currentIdx) d.classList.add("active");
      else d.classList.remove("active");
    });
  }, { passive: true });

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const slideWidth = track.clientWidth;
    track.scrollBy({ left: -slideWidth, behavior: "smooth" });
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const slideWidth = track.clientWidth;
    track.scrollBy({ left: slideWidth, behavior: "smooth" });
  });

  container.appendChild(track);
  container.appendChild(badge);
  container.appendChild(prevBtn);
  container.appendChild(nextBtn);
  container.appendChild(dotsWrap);

  return container;
}

  // 그림/사진 렌더링 (다중 사진 캐러셀 및 단일 사진/손그림 하위 호환)
  const images = (entry.images && Array.isArray(entry.images) && entry.images.length > 0)
    ? entry.images
    : (entry.image ? [entry.image] : []);

  if (images.length > 1) {
    const carousel = createPhotoCarousel(images, entry.title);
    item.appendChild(carousel);
  } else if (images.length === 1) {
    const hasTimelapse = entry.drawingData && Array.isArray(entry.drawingData) && entry.drawingData.length > 0;

    const entryImg = document.createElement("img");
    entryImg.className = "entry-image";
    entryImg.src = images[0];
    entryImg.alt = entry.title ? `${entry.title} 이미지` : "일기 이미지";

    if (hasTimelapse) {
      const imgContainer = document.createElement("div");
      imgContainer.className = "entry-image-container has-timelapse";
      imgContainer.appendChild(entryImg);
      attachTimelapse(imgContainer, entryImg, entry.drawingData);
      item.appendChild(imgContainer);
    } else {
      item.appendChild(entryImg);
    }
  }

  // 공감 리액션 바 추가
  const reactionSection = createReactionBar(entry);
  item.appendChild(reactionSection);

  // 댓글 영역 생성 및 추가
  const commentsSection = createCommentsSection(entry, idPrefix);
  item.appendChild(commentsSection);

  return item;
}



