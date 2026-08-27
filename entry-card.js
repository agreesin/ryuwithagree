// =========================================================
// entry-card.js - 일기 카드 단일 컴포넌트 모듈
// 개별 일기 카드의 헤더, 삭제 버튼, 본문, 그림/사진, 공감 리액션 및 댓글을 조립합니다.
// ★ 목록 갱신은 Firestore onSnapshot이 담당하므로 수동 render 호출은 불필요하며 render.js를 import하지 않습니다.
// =========================================================

import { removeEntry, toggleReaction } from "./store.js?v=3.0.0";
import { getCurrentUser, getCurrentProfiles } from "./state.js?v=3.0.0";
import { showError } from "./ui.js?v=3.0.0";
import { createCommentsSection } from "./comments.js?v=3.0.0";
import { sendPushToPartner } from "./notify.js?v=3.0.0";

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
          const isMyEntry = currentUser && (
            (entry.uid && entry.uid === currentUser.uid) ||
            (entry.author && currentUser.displayName && entry.author === currentUser.displayName)
          );
          if (!isMyEntry) {
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
 * @returns {HTMLLIElement} 일기 카드 li 요소
 */
export function createEntryCard(entry) {
  const currentUser = getCurrentUser();
  const currentProfiles = getCurrentProfiles();

  const item = document.createElement("li");
  item.className = "entry";
  item.id = `entry-${entry.id}`;

  const headerDiv = document.createElement("div");
  headerDiv.className = "entry-header";

  const titleWrapper = document.createElement("div");
  titleWrapper.className = "entry-title-wrapper";

  const entryTitle = document.createElement("h2");
  entryTitle.className = "entry-title";
  entryTitle.textContent = entry.title || "(제목 없음)";
  titleWrapper.appendChild(entryTitle);

  // 오늘의 기분 이모지가 있을 때 뱃지로 렌더링
  if (entry.mood) {
    const moodBadge = document.createElement("span");
    moodBadge.className = "entry-mood-badge";
    moodBadge.textContent = entry.mood;
    moodBadge.title = `오늘의 기분: ${entry.mood}`;
    titleWrapper.appendChild(moodBadge);
  }

  headerDiv.appendChild(titleWrapper);

  // 내가 쓴 글인지 확인 (uid 일치 또는 작성자 이름 일치)
  const isMyEntry = currentUser && (
    (entry.uid && entry.uid === currentUser.uid) ||
    (entry.author && currentUser.displayName && entry.author === currentUser.displayName)
  );

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

  const authorDisplayName = (entry.uid && currentProfiles[entry.uid]) ? currentProfiles[entry.uid] : entry.author;

  const entryAuthor = document.createElement("span");
  entryAuthor.className = "entry-author";
  entryAuthor.textContent = `작성자: ${authorDisplayName}`;
  authorWrapper.appendChild(entryAuthor);

  // 작성 날짜 보여주기
  const entryDate = document.createElement("span");
  entryDate.className = "entry-date";
  if (entry.createdAt) {
    const d = new Date(entry.createdAt);
    entryDate.textContent = d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
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

  // 그림/사진 렌더링 (하위 호환: image 필드가 존재할 때만 렌더링)
  if (entry.image) {
    const entryImg = document.createElement("img");
    entryImg.className = "entry-image";
    entryImg.src = entry.image;
    entryImg.alt = entry.title ? `${entry.title} 이미지` : "일기 이미지";
    item.appendChild(entryImg);
  }

  // 공감 리액션 바 추가
  const reactionSection = createReactionBar(entry);
  item.appendChild(reactionSection);

  // 댓글 영역 생성 및 추가
  const commentsSection = createCommentsSection(entry);
  item.appendChild(commentsSection);

  return item;
}
