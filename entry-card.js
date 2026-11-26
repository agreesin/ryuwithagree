// =========================================================
// entry-card.js - 일기 카드 단일 컴포넌트 모듈
// 개별 일기 카드의 헤더, 수정/삭제 버튼, 본문, 그림/사진(라이트박스/타임랩스/캐러셀),
// 공감 리액션(낙관적 UI·중복 탭 방지·공감자 안내) 및 댓글을 조립합니다.
// ★ render.js를 import하지 않아 단방향 의존성 유지
// =========================================================

import { removeEntry, toggleReaction } from "./store.js";
import {
  getCurrentUser,
  isMyContent,
  createAvatarElement,
  getUserDisplayName,
} from "./state.js";
import {
  showError,
  formatDateTime,
  showConfirmDialog,
  openLightbox,
  normalizeMood,
} from "./ui.js";
import { createCommentsSection } from "./comments.js";
import { sendPushToPartner, showToastNotification } from "./notify.js";
import { attachTimelapse } from "./timelapse.js";

const REACTION_EMOJIS = ["❤️", "🥰", "🥺", "👏", "🔥"];

function formatReactionTooltip(emoji, uids, isMyReaction) {
  const names = uids.map((uid) => getUserDisplayName(uid, "참여자"));
  const baseAction = isMyReaction ? `${emoji} 공감 취소` : `${emoji} 공감하기`;
  if (names.length === 0) return baseAction;
  return `${names.join(", ")}님이 공감함 (${baseAction})`;
}

/**
 * 리액션 바 DOM 요소를 생성합니다.
 */
function createReactionBar(entry) {
  const currentUser = getCurrentUser();
  const reactionWrap = document.createElement("div");
  reactionWrap.className = "reaction-bar";

  const reactions = entry.reactions || {};

  REACTION_EMOJIS.forEach((emoji) => {
    const uids = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    const count = uids.length;
    const isMyReaction = Boolean(currentUser && uids.includes(currentUser.uid));

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `reaction-btn ${isMyReaction ? "active" : ""}`;
    btn.setAttribute("aria-pressed", String(isMyReaction));
    btn.title = formatReactionTooltip(emoji, uids, isMyReaction);

    const emojiSpan = document.createElement("span");
    emojiSpan.className = "reaction-emoji";
    emojiSpan.textContent = emoji;

    const countSpan = document.createElement("span");
    countSpan.className = "reaction-count";
    countSpan.textContent = count > 0 ? String(count) : "";

    btn.appendChild(emojiSpan);
    btn.appendChild(countSpan);

    let inFlight = false;
    btn.addEventListener("click", async () => {
      if (inFlight) return;
      inFlight = true;
      btn.disabled = true;

      // 즉각적 시각 피드백 (낙관적 UI)
      const nextActive = !btn.classList.contains("active");
      const prevCount = Number(countSpan.textContent) || 0;
      const nextCount = Math.max(0, prevCount + (nextActive ? 1 : -1));
      btn.classList.toggle("active", nextActive);
      btn.setAttribute("aria-pressed", String(nextActive));
      countSpan.textContent = nextCount > 0 ? String(nextCount) : "";

      try {
        const res = await toggleReaction(entry.id, emoji);
        if (res && res.isAdded && !isMyContent(entry)) {
          sendPushToPartner({
            title: "💌 류이어리 새 반응",
            message: `일기에 ${emoji} 공감이 도착했습니다.`,
          }).catch(() => {});
        }
      } catch (err) {
        // 실패 시 원복
        btn.classList.toggle("active", !nextActive);
        btn.setAttribute("aria-pressed", String(!nextActive));
        countSpan.textContent = prevCount > 0 ? String(prevCount) : "";
        console.error("[entry-card] 리액션 실패:", err);
        showError("공감을 반영하지 못했습니다. 연결을 확인하세요.");
      } finally {
        inFlight = false;
        btn.disabled = false;
      }
    });

    reactionWrap.appendChild(btn);
  });

  return reactionWrap;
}

/**
 * 다중 사진/그림 첨부 시 가로 스와이프/슬라이드 캐러셀 DOM을 생성합니다.
 */
function createPhotoCarousel(images, title = "", drawingData = null) {
  const container = document.createElement("div");
  container.className = "entry-carousel";

  const track = document.createElement("div");
  track.className = "entry-carousel-track";

  const hasTimelapse = Array.isArray(drawingData) && drawingData.length > 0;

  images.forEach((src, idx) => {
    const slide = document.createElement("div");
    slide.className = "entry-carousel-slide";

    const img = document.createElement("img");
    img.className = "entry-carousel-img";
    img.src = src;
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = title ? `${title} 사진 ${idx + 1}` : `일기 사진 ${idx + 1}`;

    if (idx === 0 && hasTimelapse) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "entry-image-container has-timelapse carousel-timelapse-wrap";
      imgWrap.appendChild(img);

      const zoomBtn = document.createElement("button");
      zoomBtn.type = "button";
      zoomBtn.className = "entry-image-zoom-btn";
      zoomBtn.title = "크게 보기";
      zoomBtn.setAttribute("aria-label", "그림 크게 보기");
      zoomBtn.textContent = "🔍";
      zoomBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openLightbox(images, idx, title);
      });
      imgWrap.appendChild(zoomBtn);

      attachTimelapse(imgWrap, img, drawingData);
      slide.appendChild(imgWrap);
    } else {
      img.title = "클릭하여 크게 보기";
      img.style.cursor = "zoom-in";
      img.addEventListener("click", () => {
        openLightbox(images, idx, title);
      });
      slide.appendChild(img);
    }

    track.appendChild(slide);
  });

  const badge = document.createElement("span");
  badge.className = "entry-carousel-badge";
  badge.textContent = `1 / ${images.length}`;

  const dotsWrap = document.createElement("div");
  dotsWrap.className = "entry-carousel-dots";

  const dots = images.map((_, idx) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `entry-carousel-dot ${idx === 0 ? "active" : ""}`;
    dot.title = `${idx + 1}번째 사진 보기`;
    dot.setAttribute("aria-label", `${idx + 1}번째 사진 보기`);
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      const slideWidth = track.clientWidth;
      track.scrollTo({ left: slideWidth * idx, behavior: "smooth" });
    });
    dotsWrap.appendChild(dot);
    return dot;
  });

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "entry-carousel-btn prev";
  prevBtn.setAttribute("aria-label", "이전 사진");
  prevBtn.textContent = "‹";
  prevBtn.disabled = true;

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "entry-carousel-btn next";
  nextBtn.setAttribute("aria-label", "다음 사진");
  nextBtn.textContent = "›";
  nextBtn.disabled = images.length <= 1;

  const syncSlideState = () => {
    const slideWidth = track.clientWidth || 1;
    const currentIdx = Math.max(
      0,
      Math.min(images.length - 1, Math.round(track.scrollLeft / slideWidth))
    );
    badge.textContent = `${currentIdx + 1} / ${images.length}`;
    prevBtn.disabled = currentIdx === 0;
    nextBtn.disabled = currentIdx >= images.length - 1;
    dots.forEach((d, i) => {
      d.classList.toggle("active", i === currentIdx);
    });
  };

  track.addEventListener("scroll", syncSlideState, { passive: true });

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    track.scrollBy({ left: -track.clientWidth, behavior: "smooth" });
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    track.scrollBy({ left: track.clientWidth, behavior: "smooth" });
  });

  container.appendChild(track);
  container.appendChild(badge);
  container.appendChild(prevBtn);
  container.appendChild(nextBtn);
  container.appendChild(dotsWrap);

  return container;
}

/**
 * 일기 1건에 대한 카드 DOM 요소를 생성하여 반환합니다.
 * @param {Object} entry - 일기 문서 객체
 * @param {string} [idPrefix="entry-"] - 카드 DOM ID 접두어
 * @returns {HTMLLIElement} 일기 카드 li 요소
 */
export function createEntryCard(entry, idPrefix = "entry-") {
  const item = document.createElement("li");
  const isMyEntry = isMyContent(entry);

  item.className = `entry ${isMyEntry ? "my-card" : "other-card"}`;
  item.id = `${idPrefix}${entry.id}`;
  item.dataset.entryId = entry.id;

  const headerDiv = document.createElement("div");
  headerDiv.className = "entry-header";

  const titleWrapper = document.createElement("div");
  titleWrapper.className = "entry-title-wrapper";

  const authorTag = document.createElement("span");
  authorTag.className = `entry-author-tag ${isMyEntry ? "my-tag" : "other-tag"}`;
  authorTag.textContent = isMyEntry ? "내 일기 📝" : "상대방 일기 💖";
  titleWrapper.appendChild(authorTag);

  const entryTitle = document.createElement("h2");
  entryTitle.className = "entry-title";
  entryTitle.textContent = entry.title || "(제목 없음)";
  titleWrapper.appendChild(entryTitle);

  if (entry.mood) {
    const moodBadge = document.createElement("span");
    moodBadge.className = "entry-mood-badge";
    const cardMood = normalizeMood(entry.mood);
    moodBadge.textContent = cardMood;
    moodBadge.title = `오늘의 기분: ${cardMood}`;
    titleWrapper.appendChild(moodBadge);
  }

  headerDiv.appendChild(titleWrapper);

  if (isMyEntry) {
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "entry-owner-actions";

    const editButton = document.createElement("button");
    editButton.className = "edit-entry-button";
    editButton.type = "button";
    editButton.textContent = "수정";
    editButton.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("diary:edit-entry", { detail: entry }));
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", async () => {
      const ok = await showConfirmDialog({
        title: "일기 삭제",
        message: "정말 이 일기를 삭제하시겠습니까? 삭제된 일기는 되돌릴 수 없습니다.",
        confirmText: "삭제",
        danger: true,
      });
      if (!ok) return;
      try {
        await removeEntry(entry.id);
        showToastNotification("일기가 삭제되었습니다.", "🗑️");
      } catch (error) {
        console.error(error);
        showError("삭제하지 못했습니다. 인터넷 연결과 권한을 확인하세요.");
      }
    });

    actionsWrap.appendChild(editButton);
    actionsWrap.appendChild(deleteButton);
    headerDiv.appendChild(actionsWrap);
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

  const entryDate = document.createElement("span");
  entryDate.className = "entry-date";
  if (entry.createdAt) {
    entryDate.textContent = formatDateTime(entry.createdAt);
  }
  if (entry.updatedAt) {
    const editedTag = document.createElement("span");
    editedTag.className = "edited-badge";
    editedTag.textContent = " (수정됨)";
    entryDate.appendChild(editedTag);
  }

  metaDiv.appendChild(authorWrapper);
  metaDiv.appendChild(entryDate);

  item.appendChild(headerDiv);
  item.appendChild(metaDiv);

  if (entry.body && entry.body.trim() !== "") {
    const entryBody = document.createElement("p");
    entryBody.className = "entry-body";
    entryBody.textContent = entry.body;
    item.appendChild(entryBody);
  }

  const images =
    entry.images && Array.isArray(entry.images) && entry.images.length > 0
      ? entry.images
      : entry.image
      ? [entry.image]
      : [];

  if (images.length > 1) {
    const carousel = createPhotoCarousel(images, entry.title, entry.drawingData);
    item.appendChild(carousel);
  } else if (images.length === 1) {
    const hasTimelapse =
      entry.drawingData && Array.isArray(entry.drawingData) && entry.drawingData.length > 0;

    const entryImg = document.createElement("img");
    entryImg.className = "entry-image";
    entryImg.src = images[0];
    entryImg.loading = "lazy";
    entryImg.decoding = "async";
    entryImg.alt = entry.title ? `${entry.title} 이미지` : "일기 이미지";

    if (hasTimelapse) {
      const imgContainer = document.createElement("div");
      imgContainer.className = "entry-image-container has-timelapse";
      imgContainer.appendChild(entryImg);

      const zoomBtn = document.createElement("button");
      zoomBtn.type = "button";
      zoomBtn.className = "entry-image-zoom-btn";
      zoomBtn.title = "그림 크게 보기";
      zoomBtn.setAttribute("aria-label", "그림 크게 보기");
      zoomBtn.textContent = "🔍";
      zoomBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openLightbox(images, 0, entry.title);
      });
      imgContainer.appendChild(zoomBtn);

      attachTimelapse(imgContainer, entryImg, entry.drawingData);
      item.appendChild(imgContainer);
    } else {
      entryImg.title = "클릭하여 크게 보기";
      entryImg.style.cursor = "zoom-in";
      entryImg.addEventListener("click", () => {
        openLightbox(images, 0, entry.title);
      });
      item.appendChild(entryImg);
    }
  }

  const reactionSection = createReactionBar(entry);
  item.appendChild(reactionSection);

  const commentsSection = createCommentsSection(entry, idPrefix);
  item.appendChild(commentsSection);

  return item;
}
