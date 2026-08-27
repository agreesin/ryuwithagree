// =========================================================
// notice.js - 상단 공지사항 모듈
// 다중 공지 목록 렌더링, 사용자 간 공동 편집/추가/삭제를 담당합니다.
// =========================================================

import {
  subscribeNotices,
  addNotice,
  updateNotice,
  removeNotice,
} from "./store.js?v=3.0.4";
import { getCurrentUser, getCurrentProfiles } from "./state.js?v=3.0.4";
import { showError } from "./ui.js?v=3.0.4";
import { sendPushToPartner } from "./notify.js?v=3.0.4";

// 화면 요소
const noticeArea = document.getElementById("notice-area");
const noticeCount = document.getElementById("notice-count");
const noticeList = document.getElementById("notice-list");
const addNoticeBtn = document.getElementById("add-notice-btn");
const toggleNoticesBtn = document.getElementById("toggle-notices-btn");

const noticeFormWrapper = document.getElementById("notice-form-wrapper");
const noticeInput = document.getElementById("notice-input");
const noticeSubmitBtn = document.getElementById("notice-submit-btn");
const noticeCancelBtn = document.getElementById("notice-cancel-btn");

// 내부 상태
let editingNoticeId = null;
let isFolded = false;

/**
 * 로그인 상태에 따라 공지 작성 및 수정/삭제 권한 UI를 업데이트합니다.
 * (로그인한 사용자 누구나 공지 편집 가능)
 * @param {Object|null} user - Firebase User 객체
 */
export function updateNoticeAuth(user) {
  const isLoggedIn = Boolean(user);

  // [+ 공지 추가] 버튼 표시/숨김
  if (addNoticeBtn) {
    addNoticeBtn.hidden = !isLoggedIn;
  }

  // 각 공지 항목 내 수정/삭제 버튼 표시/숨김
  const controlButtons = document.querySelectorAll(".notice-item-controls");
  controlButtons.forEach((el) => {
    el.hidden = !isLoggedIn;
  });
}

/**
 * 공지사항 목록을 화면에 렌더링합니다.
 * @param {Array<Object>} notices - 공지사항 목록
 */
function renderNotices(notices) {
  if (!noticeList) return;

  // 카운트 갱신
  if (noticeCount) {
    noticeCount.textContent = `(${notices.length})`;
  }

  noticeList.innerHTML = "";

  const currentUser = getCurrentUser();
  const isLoggedIn = Boolean(currentUser);

  for (const notice of notices) {
    const item = document.createElement("li");
    item.className = "notice-item";

    const contentDiv = document.createElement("div");
    contentDiv.className = "notice-item-content";

    const textP = document.createElement("p");
    textP.className = "notice-item-text";
    textP.textContent = notice.text;
    contentDiv.appendChild(textP);

    const metaDiv = document.createElement("div");
    metaDiv.className = "notice-item-meta";

    const authorSpan = document.createElement("span");
    authorSpan.className = "notice-item-author";
    authorSpan.textContent = `작성: ${notice.author || "다이어리"}`;

    const dateSpan = document.createElement("span");
    dateSpan.className = "notice-item-date";
    if (notice.createdAt) {
      const d = new Date(notice.createdAt);
      dateSpan.textContent = d.toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
      });
    }

    metaDiv.appendChild(authorSpan);
    metaDiv.appendChild(dateSpan);
    contentDiv.appendChild(metaDiv);

    // 로그인한 사용자에게만 수정/삭제 버튼 제공
    const controlsDiv = document.createElement("div");
    controlsDiv.className = "notice-item-controls";
    controlsDiv.hidden = !isLoggedIn;

    // 수정 버튼
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "notice-ctrl-btn edit";
    editBtn.textContent = "✏️ 수정";
    editBtn.addEventListener("click", () => {
      editingNoticeId = notice.id;
      if (noticeInput) noticeInput.value = notice.text;
      if (noticeSubmitBtn) noticeSubmitBtn.textContent = "수정 완료";
      if (noticeFormWrapper) {
        noticeFormWrapper.hidden = false;
        noticeInput.focus();
      }
    });

    // 삭제 버튼
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "notice-ctrl-btn delete";
    deleteBtn.textContent = "🗑️ 삭제";
    deleteBtn.addEventListener("click", async () => {
      if (confirm("이 공지사항을 삭제하시겠습니까?")) {
        try {
          await removeNotice(notice.id);
        } catch (err) {
          console.error(err);
          showError("공지사항 삭제에 실패했습니다: " + err.message);
        }
      }
    });

    controlsDiv.appendChild(editBtn);
    controlsDiv.appendChild(deleteBtn);

    item.appendChild(contentDiv);
    item.appendChild(controlsDiv);
    noticeList.appendChild(item);
  }
}

/**
 * 공지사항 모듈 초기화 및 이벤트 리스너를 등록합니다.
 */
export function initNotices() {
  // 1. 공지사항 실시간 구독 시작
  subscribeNotices(
    (notices) => {
      renderNotices(notices);
    },
    (err) => {
      console.warn("[notice] 공지사항 로드 경고:", err);
    }
  );

  // 2. [+ 공지 추가] 버튼
  if (addNoticeBtn) {
    addNoticeBtn.addEventListener("click", () => {
      editingNoticeId = null;
      if (noticeInput) noticeInput.value = "";
      if (noticeSubmitBtn) noticeSubmitBtn.textContent = "등록";
      if (noticeFormWrapper) {
        noticeFormWrapper.hidden = !noticeFormWrapper.hidden;
        if (!noticeFormWrapper.hidden && noticeInput) {
          noticeInput.focus();
        }
      }
    });
  }

  // 3. 접기/펼치기 토글 버튼
  if (toggleNoticesBtn && noticeList) {
    toggleNoticesBtn.addEventListener("click", () => {
      isFolded = !isFolded;
      noticeList.hidden = isFolded;
      if (noticeFormWrapper && isFolded) {
        noticeFormWrapper.hidden = true;
      }
      toggleNoticesBtn.textContent = isFolded ? "▼" : "▲";
      toggleNoticesBtn.title = isFolded ? "펼치기" : "접기";
    });
  }

  // 4. 작성 폼 취소 버튼
  if (noticeCancelBtn && noticeFormWrapper) {
    noticeCancelBtn.addEventListener("click", () => {
      noticeFormWrapper.hidden = true;
      editingNoticeId = null;
      if (noticeInput) noticeInput.value = "";
    });
  }

  // 5. 작성 폼 등록/수정 버튼
  if (noticeSubmitBtn) {
    noticeSubmitBtn.addEventListener("click", async () => {
      const text = noticeInput.value.trim();
      if (!text) {
        alert("공지사항 내용을 입력해주세요.");
        noticeInput.focus();
        return;
      }

      noticeSubmitBtn.disabled = true;
      try {
        if (editingNoticeId) {
          await updateNotice(editingNoticeId, text);
        } else {
          await addNotice(text);
          sendPushToPartner({
            title: "📢 류이어리 새 공지",
            message: "당신의 반쪽이 새 공지를 남겼습니다.",
          });
        }

        noticeFormWrapper.hidden = true;
        editingNoticeId = null;
        noticeInput.value = "";
      } catch (err) {
        console.error(err);
        showError("공지사항 저장에 실패했습니다: " + err.message);
      } finally {
        noticeSubmitBtn.disabled = false;
      }
    });
  }
}


