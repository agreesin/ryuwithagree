// =========================================================
// notice.js - 상단 공지사항 모듈
// 다중 공지 목록 렌더링, 접힘 상태 기억(1줄 미리보기), 공동 편집/추가/삭제 담당
// =========================================================

import {
  subscribeNotices,
  addNotice,
  updateNotice,
  removeNotice,
} from "./store.js";
import { getCurrentUser, getUserDisplayName } from "./state.js";
import { showError, showConfirmDialog } from "./ui.js";
import { sendPushToPartner, showToastNotification } from "./notify.js";

const STORAGE_KEY_NOTICE_FOLDED = "diary_notice_folded";

const noticeArea = document.getElementById("notice-area");
const noticeCount = document.getElementById("notice-count");
const noticePreview = document.getElementById("notice-preview");
const noticeList = document.getElementById("notice-list");
const addNoticeBtn = document.getElementById("add-notice-btn");
const toggleNoticesBtn = document.getElementById("toggle-notices-btn");

const noticeFormWrapper = document.getElementById("notice-form-wrapper");
const noticeInput = document.getElementById("notice-input");
const noticeSubmitBtn = document.getElementById("notice-submit-btn");
const noticeCancelBtn = document.getElementById("notice-cancel-btn");

let editingNoticeId = null;
let latestNotices = [];
let isFolded = readInitialFoldState();
let unsubscribeNotices = null;

function readInitialFoldState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_NOTICE_FOLDED);
    if (saved === "true") return true;
    if (saved === "false") return false;
  } catch {
    // 스토리지 접근 불가 무시
  }
  // 모바일 첫 화면 스크롤 부담 완화를 위해 초기값은 600px 이하에서 접힘
  return typeof window !== "undefined" && window.innerWidth <= 600;
}

function applyFoldState() {
  if (noticeList) noticeList.hidden = isFolded;
  if (noticeFormWrapper && isFolded) noticeFormWrapper.hidden = true;
  if (noticeArea) noticeArea.classList.toggle("folded", isFolded);
  if (toggleNoticesBtn) {
    toggleNoticesBtn.textContent = isFolded ? "▼" : "▲";
    toggleNoticesBtn.title = isFolded ? "공지 펼치기" : "공지 접기";
    toggleNoticesBtn.setAttribute("aria-expanded", String(!isFolded));
  }
  updateNoticePreview();
}

function updateNoticePreview() {
  if (!noticePreview) return;
  if (isFolded && latestNotices.length > 0) {
    const firstLine = String(latestNotices[0].text || "").split("\n")[0].trim();
    noticePreview.textContent = firstLine;
    noticePreview.hidden = !firstLine;
  } else {
    noticePreview.hidden = true;
  }
}

export function updateNoticeAuth(user) {
  const isLoggedIn = Boolean(user);

  if (addNoticeBtn) {
    addNoticeBtn.hidden = !isLoggedIn;
  }

  const controlButtons = document.querySelectorAll(".notice-item-controls");
  controlButtons.forEach((el) => {
    el.hidden = !isLoggedIn;
  });
}

function renderNotices(notices) {
  latestNotices = Array.isArray(notices) ? notices : [];
  if (!noticeList) return;

  if (noticeCount) {
    noticeCount.textContent = `(${latestNotices.length})`;
  }

  updateNoticePreview();
  noticeList.innerHTML = "";

  const currentUser = getCurrentUser();
  const isLoggedIn = Boolean(currentUser);

  for (const notice of latestNotices) {
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
    const authorName = getUserDisplayName(notice.uid, notice.author || "다이어리");
    authorSpan.textContent = `작성: ${authorName}`;

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

    const controlsDiv = document.createElement("div");
    controlsDiv.className = "notice-item-controls";
    controlsDiv.hidden = !isLoggedIn;

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "notice-ctrl-btn edit";
    editBtn.textContent = "✏️ 수정";
    editBtn.addEventListener("click", () => {
      editingNoticeId = notice.id;
      if (isFolded) {
        isFolded = false;
        applyFoldState();
      }
      if (noticeInput) noticeInput.value = notice.text;
      if (noticeSubmitBtn) noticeSubmitBtn.textContent = "수정 완료";
      if (noticeFormWrapper) {
        noticeFormWrapper.hidden = false;
        noticeInput?.focus();
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "notice-ctrl-btn delete";
    deleteBtn.textContent = "🗑️ 삭제";
    deleteBtn.addEventListener("click", async () => {
      const ok = await showConfirmDialog({
        title: "공지사항 삭제",
        message: "이 공지사항을 삭제하시겠습니까?",
        confirmText: "삭제",
        danger: true,
      });
      if (!ok) return;
      try {
        await removeNotice(notice.id);
        showToastNotification("공지사항이 삭제되었습니다.", "🗑️");
      } catch (err) {
        console.error(err);
        showError("공지사항 삭제에 실패했습니다: " + err.message);
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
 * 로그인·2차 인증 완료 후 공지사항 실시간 구독을 시작합니다.
 */
export function startNoticeSubscription() {
  if (unsubscribeNotices) return;
  unsubscribeNotices = subscribeNotices(
    (notices) => {
      renderNotices(notices);
    },
    (err) => {
      console.warn("[notice] 공지사항 로드 경고:", err);
    }
  );
}

/**
 * 로그아웃 시 공지사항 실시간 구독을 해제하고 목록을 초기화합니다.
 */
export function stopNoticeSubscription() {
  if (unsubscribeNotices) {
    unsubscribeNotices();
    unsubscribeNotices = null;
  }
  latestNotices = [];
  if (noticeList) noticeList.innerHTML = "";
  if (noticeCount) noticeCount.textContent = "";
  if (noticePreview) noticePreview.hidden = true;
}

export function initNotices() {
  applyFoldState();

  if (addNoticeBtn) {
    addNoticeBtn.addEventListener("click", () => {
      editingNoticeId = null;
      if (isFolded) {
        isFolded = false;
        applyFoldState();
      }
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

  const toggleFold = () => {
    isFolded = !isFolded;
    try {
      localStorage.setItem(STORAGE_KEY_NOTICE_FOLDED, String(isFolded));
    } catch {
      // 무시
    }
    applyFoldState();
  };

  if (toggleNoticesBtn && noticeList) {
    toggleNoticesBtn.addEventListener("click", toggleFold);
  }

  if (noticePreview) {
    noticePreview.addEventListener("click", () => {
      if (isFolded) toggleFold();
    });
  }

  if (noticeCancelBtn && noticeFormWrapper) {
    noticeCancelBtn.addEventListener("click", () => {
      noticeFormWrapper.hidden = true;
      editingNoticeId = null;
      if (noticeInput) noticeInput.value = "";
    });
  }

  if (noticeSubmitBtn) {
    noticeSubmitBtn.addEventListener("click", async () => {
      const text = noticeInput.value.trim();
      if (!text) {
        showToastNotification("공지사항 내용을 입력해 주세요.", "📢");
        noticeInput.focus();
        return;
      }

      noticeSubmitBtn.disabled = true;
      try {
        if (editingNoticeId) {
          await updateNotice(editingNoticeId, text);
          showToastNotification("공지사항이 수정되었습니다.", "📢");
        } else {
          await addNotice(text);
          showToastNotification("공지사항이 등록되었습니다.", "📢");
          sendPushToPartner({
            title: "📢 류이어리 새 공지",
            message: "새 공지사항이 등록되었습니다.",
          }).catch(() => {});
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
