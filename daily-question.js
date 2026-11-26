// =========================================================
// daily-question.js - 독립형 블라인드 커플 문답 모듈
//
// - 로그인 인증 완료 후 구독 시작, 로그아웃 시 구독 정리
// - 내 답변 수정 중 실시간 스냅샷 보호 및 수정 취소 버튼 지원
// - 과거 문답 직접 열람(diary:open-question) 및 XSS 방어
// =========================================================

import {
  subscribeDailyQuestion,
  saveDailyQuestionAnswer,
  addDailyQuestionComment,
  removeDailyQuestionComment,
  subscribeQuestionState,
  advanceToNextQuestion,
  loadCompletedQuestions,
} from "./store.js";
import {
  getCurrentUser,
  renderAvatar,
  getAvatarHtml,
  getPartnerInfo,
  getUserDisplayName,
} from "./state.js";
import {
  getCoupleDays,
  checkSpecialDayQuestion,
  getQuestionByOrder,
  sortCompletedQuestionsDescending,
} from "./questions.js";
import { getCurrentDdayItems, onDdayChange } from "./dday.js";
import { sendPushToPartner, showToastNotification } from "./notify.js";
import {
  showError,
  formatChatTime,
  escapeHtml,
  openModal,
  closeModal,
  showConfirmDialog,
} from "./ui.js";

// DOM 요소
let sectionEl = null;
let badgeEl = null;
let questionTextEl = null;
let historyBtn = null;
let historyCountEl = null;
let dqLatestBtn = null;
let dqHistoryBannerEl = null;
let dqHistoryBannerLatestBtn = null;
let partnerNudgeWrapEl = null;

let myAvatarEl = null;
let myNameEl = null;
let editBtn = null;
let editCancelBtn = null;
let myFormEl = null;
let myInputEl = null;
let submitBtn = null;
let myDisplayEl = null;
let myTextEl = null;

let partnerAvatarEl = null;
let partnerNameEl = null;
let partnerLockedEl = null;
let lockIconEl = null;
let lockTitleEl = null;
let lockDescEl = null;
let partnerDisplayEl = null;
let partnerTextEl = null;

let nextQuestionWrapEl = null;
let advanceBtn = null;

let commentsContainerEl = null;
let commentsCountEl = null;
let commentsLockedNoticeEl = null;
let commentsContentEl = null;
let commentsEmptyEl = null;
let commentsListEl = null;
let commentFormEl = null;
let commentInputEl = null;
let commentSubmitBtn = null;

let historyModalEl = null;
let historyCloseBtn = null;
let historyEmptyEl = null;
let historyListEl = null;

// 내부 상태
let questionState = { currentOrder: 1, completedIds: [] };
let activeDocId = null;
let activeQuestionData = null;
let currentQuestionDoc = null;
let unsubscribeQuestion = null;
let unsubscribeState = null;
let isViewingHistory = false;
let isEditingMyAnswer = false;

function determineCurrentQuestion() {
  const ddayItems = getCurrentDdayItems();
  const today = new Date();
  const coupleDays = getCoupleDays(ddayItems, today);

  const specialQ = checkSpecialDayQuestion(ddayItems, today);
  const isSpecialCompleted = specialQ && questionState.completedIds.includes(specialQ.id);

  if (specialQ && !isSpecialCompleted) {
    return {
      docId: specialQ.id,
      data: specialQ,
    };
  }

  const order = questionState.currentOrder || 1;
  const normalQ = getQuestionByOrder(order, coupleDays, today);
  return {
    docId: normalQ.id,
    data: normalQ,
  };
}

function listenToQuestionDoc(docId, { onLoaded = null } = {}) {
  if (unsubscribeQuestion) {
    unsubscribeQuestion();
    unsubscribeQuestion = null;
  }

  let handledOnce = false;
  unsubscribeQuestion = subscribeDailyQuestion(docId, (docData) => {
    currentQuestionDoc = docData;
    renderCurrentQuestionView();
    if (!handledOnce && typeof onLoaded === "function") {
      handledOnce = true;
      onLoaded(docData);
    }
  });
}

export function resetToLatestQuestion() {
  isViewingHistory = false;
  isEditingMyAnswer = false;
  const q = determineCurrentQuestion();
  activeDocId = q.docId;
  activeQuestionData = q.data;
  if (getCurrentUser()) {
    listenToQuestionDoc(activeDocId);
  }
  renderCurrentQuestionView();
}

/**
 * 현재 열람 중인 질문 화면을 강제 리셋 없이 갱신합니다 (프로필 갱신 등).
 */
export function refreshQuestionView() {
  renderCurrentQuestionView();
}

export function renderCurrentQuestionView() {
  try {
    if (!activeQuestionData) {
      const initQ = determineCurrentQuestion();
      activeDocId = initQ.docId;
      activeQuestionData = initQ.data;
    }

    if (dqLatestBtn) dqLatestBtn.hidden = !isViewingHistory;
    if (dqHistoryBannerEl) dqHistoryBannerEl.hidden = !isViewingHistory;

    const displayBadge =
      currentQuestionDoc?.question?.badge || activeQuestionData?.badge || "💌 오늘의 질문";
    const displayText =
      currentQuestionDoc?.question?.text || activeQuestionData?.text || "질문을 불러왔습니다.";
    const isSpecial = activeQuestionData?.isSpecial || currentQuestionDoc?.question?.isSpecial;

    if (badgeEl) {
      badgeEl.textContent = displayBadge;
      badgeEl.classList.toggle("special", Boolean(isSpecial));
    }
    if (questionTextEl) questionTextEl.textContent = displayText;

    if (historyCountEl) {
      historyCountEl.textContent = String(questionState.completedIds.length);
    }

    const user = getCurrentUser();
    const myName = getUserDisplayName(user?.uid, user?.displayName || "나");
    const partnerInfo = getPartnerInfo();

    if (myNameEl) myNameEl.textContent = myName;
    if (myAvatarEl) renderAvatar(myAvatarEl, user?.uid, myName);

    if (partnerNameEl) partnerNameEl.textContent = partnerInfo.name;
    if (partnerAvatarEl) renderAvatar(partnerAvatarEl, partnerInfo.uid, partnerInfo.name);

    const answers = currentQuestionDoc?.answers || {};
    const myAnswer = user ? answers[user.uid] : null;

    let partnerAnswer = null;
    if (user) {
      for (const [ansUid, ansData] of Object.entries(answers)) {
        if (ansUid !== user.uid) {
          partnerAnswer = ansData;
          break;
        }
      }
    }

    // 내 답변 뷰 (수정 중일 때는 스냅샷 갱신으로 입력 폼을 덮어쓰지 않음)
    if (myAnswer && myAnswer.text) {
      if (isEditingMyAnswer) {
        if (myFormEl) myFormEl.hidden = false;
        if (myDisplayEl) myDisplayEl.hidden = true;
        if (editBtn) editBtn.hidden = true;
        if (editCancelBtn) editCancelBtn.hidden = false;
      } else {
        if (myFormEl) myFormEl.hidden = true;
        if (myDisplayEl) myDisplayEl.hidden = false;
        if (myTextEl) myTextEl.textContent = myAnswer.text;
        if (editBtn) editBtn.hidden = false;
        if (editCancelBtn) editCancelBtn.hidden = true;
      }
    } else {
      isEditingMyAnswer = false;
      if (myFormEl) myFormEl.hidden = false;
      if (myDisplayEl) myDisplayEl.hidden = true;
      if (myInputEl && !myInputEl.value) myInputEl.value = "";
      if (editBtn) editBtn.hidden = true;
      if (editCancelBtn) editCancelBtn.hidden = true;
    }

    const isPartnerAnswered = Boolean(partnerAnswer && partnerAnswer.text);
    const isBothAnswered = Boolean(myAnswer && partnerAnswer && myAnswer.text && partnerAnswer.text);

    if (isPartnerAnswered) {
      if (!myAnswer) {
        if (partnerDisplayEl) partnerDisplayEl.hidden = true;
        if (partnerLockedEl) {
          partnerLockedEl.hidden = false;
          partnerLockedEl.classList.add("partner-ready");
        }
        if (lockIconEl) lockIconEl.textContent = "🔒";
        if (lockTitleEl) {
          lockTitleEl.innerHTML = `<span class="dq-lock-ready-text">상대방이 답변을 남겼어요! 💌</span>`;
        }
        if (lockDescEl) lockDescEl.textContent = "내 답변을 작성하면 상대방의 답변이 열려요!";
      } else {
        if (partnerLockedEl) partnerLockedEl.hidden = true;
        if (partnerDisplayEl) {
          partnerDisplayEl.hidden = false;
          if (partnerTextEl) partnerTextEl.textContent = partnerAnswer.text;
        }
      }
    } else {
      if (partnerDisplayEl) partnerDisplayEl.hidden = true;
      if (partnerLockedEl) {
        partnerLockedEl.hidden = false;
        partnerLockedEl.classList.remove("partner-ready");
      }
      if (lockIconEl) lockIconEl.textContent = "⏳";
      if (lockTitleEl) lockTitleEl.textContent = "상대방이 아직 작성하지 않았어요";
      if (lockDescEl) {
        lockDescEl.textContent = !myAnswer
          ? "내 답변을 먼저 남겨두면, 상대방이 작성했을 때 바로 확인할 수 있어요!"
          : "상대방이 답변을 남기길 기다리는 중이에요...";
      }
    }

    if (nextQuestionWrapEl) {
      nextQuestionWrapEl.hidden = !isBothAnswered || isViewingHistory;
    }

    if (partnerNudgeWrapEl) {
      const showNudge = Boolean(myAnswer && myAnswer.text && !isPartnerAnswered && !isViewingHistory);
      partnerNudgeWrapEl.hidden = !showNudge;
    }

    renderComments(myAnswer, partnerAnswer);
  } catch (err) {
    console.error("[daily-question] 문답 렌더링 오류:", err);
  }
}

export function renderCurrentDateQuestion() {
  if (isViewingHistory) {
    renderCurrentQuestionView();
  } else {
    renderCurrentQuestionView();
  }
}

function renderComments(myAnswer, partnerAnswer) {
  if (!commentsContainerEl) return;

  const isUnlocked = Boolean(myAnswer?.text && partnerAnswer?.text);
  const comments = [...(currentQuestionDoc?.comments || [])].sort(
    (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
  );

  if (commentsCountEl) {
    commentsCountEl.textContent = String(comments.length);
  }

  if (!isUnlocked) {
    if (commentsLockedNoticeEl) commentsLockedNoticeEl.hidden = false;
    if (commentsContentEl) commentsContentEl.hidden = true;
    return;
  }

  if (commentsLockedNoticeEl) commentsLockedNoticeEl.hidden = true;
  if (commentsContentEl) commentsContentEl.hidden = false;

  if (!commentsListEl) return;
  commentsListEl.innerHTML = "";

  if (comments.length === 0) {
    if (commentsEmptyEl) commentsEmptyEl.hidden = false;
    return;
  }

  if (commentsEmptyEl) commentsEmptyEl.hidden = true;

  const currentUser = getCurrentUser();

  comments.forEach((c) => {
    const isMe = currentUser && c.uid === currentUser.uid;
    const li = document.createElement("li");
    li.className = `dq-chat-item ${isMe ? "is-me" : "is-partner"}`;
    li.id = `dq-comment-item-${c.id}`;

    const authorName = getUserDisplayName(c.uid, c.author || "이름 없음");
    const safeAuthorName = escapeHtml(authorName);
    const avatarHtml = getAvatarHtml(c.uid, authorName);
    const timeLabel = escapeHtml(formatChatTime(c.createdAt));

    if (isMe) {
      li.innerHTML = `
        <div class="dq-chat-row is-me">
          <div class="dq-chat-side is-me">
            <button type="button" class="dq-comment-del-btn" title="메시지 삭제" aria-label="메시지 삭제">✕</button>
            <span class="dq-chat-time">${timeLabel}</span>
          </div>
          <div class="dq-chat-bubble is-me">
            <p class="dq-chat-text"></p>
          </div>
        </div>
      `;
    } else {
      li.innerHTML = `
        <div class="dq-chat-row is-partner">
          <div class="dq-chat-avatar">${avatarHtml}</div>
          <div class="dq-chat-content-wrap">
            <span class="dq-chat-sender-name">${safeAuthorName}</span>
            <div class="dq-chat-bubble-row">
              <div class="dq-chat-bubble is-partner">
                <p class="dq-chat-text"></p>
              </div>
              <div class="dq-chat-side is-partner">
                <span class="dq-chat-time">${timeLabel}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const textP = li.querySelector(".dq-chat-text");
    if (textP) textP.textContent = c.text;

    if (isMe) {
      const delBtn = li.querySelector(".dq-comment-del-btn");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          const ok = await showConfirmDialog({
            title: "메시지 삭제",
            message: "이 메시지를 삭제하시겠습니까?",
            confirmText: "삭제",
            danger: true,
          });
          if (!ok) return;
          try {
            await removeDailyQuestionComment(activeDocId, c.id);
            showToastNotification("메시지가 삭제되었습니다.", "🗑️");
          } catch (err) {
            console.error(err);
            showError("메시지 삭제에 실패했습니다: " + err.message);
          }
        });
      }
    }

    commentsListEl.appendChild(li);
  });

  setTimeout(() => {
    if (commentsListEl) {
      commentsListEl.scrollTop = commentsListEl.scrollHeight;
    }
  }, 50);
}

/**
 * 특정 문답 문서 ID(과거 문답 포함)를 직접 열어 표시합니다.
 */
function openQuestionByDocId(docId, targetId = null) {
  if (!docId) return;
  const currentQ = determineCurrentQuestion();
  isViewingHistory = docId !== currentQ.docId;
  isEditingMyAnswer = false;
  activeDocId = docId;

  listenToQuestionDoc(docId, {
    onLoaded: (docData) => {
      if (docData?.question) {
        activeQuestionData = docData.question;
        renderCurrentQuestionView();
      }
      setTimeout(() => {
        const el =
          (targetId && document.getElementById(targetId)) ||
          document.getElementById("dq-answers-wrap") ||
          document.getElementById("daily-question-section");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.remove("highlight-flash");
          void el.offsetWidth;
          el.classList.add("highlight-flash");
          setTimeout(() => el.classList.remove("highlight-flash"), 1800);
        }
      }, 120);
    },
  });
}

async function openHistoryModal() {
  if (!historyModalEl) return;
  openModal(historyModalEl);

  if (historyListEl) {
    historyListEl.innerHTML = `<li class="dq-history-loading">기록을 불러오는 중입니다... 💌</li>`;
  }

  try {
    const items = await loadCompletedQuestions();
    if (!historyListEl) return;
    historyListEl.innerHTML = "";

    if (items.length === 0) {
      if (historyEmptyEl) historyEmptyEl.hidden = false;
      return;
    }

    if (historyEmptyEl) historyEmptyEl.hidden = true;

    sortCompletedQuestionsDescending(items);

    items.forEach((item) => {
      const q = item.question || {};
      const li = document.createElement("li");
      li.className = "dq-history-item";
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");

      const badgeText = q.badge || "💌 완료된 문답";
      const questionText = q.text || "질문 내용";
      const answers = item.answers || {};
      const answerCount = Object.keys(answers).length;

      li.setAttribute("aria-label", `${badgeText} 열람하기`);

      li.innerHTML = `
        <div class="dq-hitem-header">
          <span class="dq-hitem-badge ${q.isSpecial ? "special" : ""}">${escapeHtml(badgeText)}</span>
          <div class="dq-hitem-meta-right">
            <span class="dq-hitem-status">답변 ${answerCount}개 💖</span>
            <span class="dq-hitem-arrow" aria-hidden="true">›</span>
          </div>
        </div>
        <h4 class="dq-hitem-title">${escapeHtml(questionText)}</h4>
      `;

      const selectHistoryItem = () => {
        isViewingHistory = true;
        isEditingMyAnswer = false;
        activeDocId = item.id;
        activeQuestionData = q;
        currentQuestionDoc = item;
        closeModal(historyModalEl);

        listenToQuestionDoc(activeDocId);
        showToastNotification(`'${badgeText}' 문답을 불러왔습니다.`, "📖");
      };

      li.addEventListener("click", selectHistoryItem);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectHistoryItem();
        }
      });

      historyListEl.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    if (historyListEl) {
      historyListEl.innerHTML = `<li class="dq-history-loading">목록을 불러오지 못했습니다: ${escapeHtml(err.message)}</li>`;
    }
  }
}

/**
 * 로그인·2차 암호 통과 후 문답 실시간 구독을 시작합니다.
 */
export function startDailyQuestionSubscription() {
  if (unsubscribeState) return;

  unsubscribeState = subscribeQuestionState((state) => {
    questionState = state;
    if (!isViewingHistory) {
      const q = determineCurrentQuestion();
      const docChanged = activeDocId !== q.docId;
      activeDocId = q.docId;
      activeQuestionData = q.data;
      if (docChanged || !unsubscribeQuestion) {
        listenToQuestionDoc(activeDocId);
      } else {
        renderCurrentQuestionView();
      }
    } else {
      renderCurrentQuestionView();
    }
  });
}

/**
 * 로그아웃 시 문답 실시간 구독을 모두 해제합니다.
 */
export function stopDailyQuestionSubscription() {
  if (unsubscribeState) {
    unsubscribeState();
    unsubscribeState = null;
  }
  if (unsubscribeQuestion) {
    unsubscribeQuestion();
    unsubscribeQuestion = null;
  }
  currentQuestionDoc = null;
  isViewingHistory = false;
  isEditingMyAnswer = false;
}

export function initDailyQuestion() {
  sectionEl = document.getElementById("daily-question-section");
  if (!sectionEl) return;

  badgeEl = document.getElementById("dq-badge");
  questionTextEl = document.getElementById("dq-question-text");
  historyBtn = document.getElementById("dq-history-btn");
  historyCountEl = document.getElementById("dq-history-count");
  dqLatestBtn = document.getElementById("dq-latest-btn");
  dqHistoryBannerEl = document.getElementById("dq-history-banner");
  dqHistoryBannerLatestBtn = document.getElementById("dq-history-banner-latest-btn");

  if (dqLatestBtn) {
    dqLatestBtn.addEventListener("click", () => {
      resetToLatestQuestion();
      showToastNotification("최신 질문으로 돌아왔습니다! 💌", "💌");
    });
  }
  if (dqHistoryBannerLatestBtn) {
    dqHistoryBannerLatestBtn.addEventListener("click", () => {
      resetToLatestQuestion();
      showToastNotification("최신 질문으로 돌아왔습니다! 💌", "💌");
    });
  }

  myAvatarEl = document.getElementById("dq-my-avatar");
  myNameEl = document.getElementById("dq-my-name");
  editBtn = document.getElementById("dq-edit-btn");
  editCancelBtn = document.getElementById("dq-edit-cancel-btn");
  myFormEl = document.getElementById("dq-my-form");
  myInputEl = document.getElementById("dq-my-input");
  submitBtn = document.getElementById("dq-submit-btn");
  myDisplayEl = document.getElementById("dq-my-display");
  myTextEl = document.getElementById("dq-my-text");

  partnerAvatarEl = document.getElementById("dq-partner-avatar");
  partnerNameEl = document.getElementById("dq-partner-name");
  partnerLockedEl = document.getElementById("dq-partner-locked");
  lockIconEl = document.getElementById("dq-lock-icon");
  lockTitleEl = document.getElementById("dq-lock-title");
  lockDescEl = document.getElementById("dq-lock-desc");
  partnerDisplayEl = document.getElementById("dq-partner-display");
  partnerTextEl = document.getElementById("dq-partner-text");
  partnerNudgeWrapEl = document.getElementById("dq-partner-nudge-wrap");

  nextQuestionWrapEl = document.getElementById("dq-next-question-wrap");
  advanceBtn = document.getElementById("dq-advance-btn");

  commentsContainerEl = document.getElementById("dq-comments-container");
  commentsCountEl = document.getElementById("dq-comments-count");
  commentsLockedNoticeEl = document.getElementById("dq-comments-locked-notice");
  commentsContentEl = document.getElementById("dq-comments-content");
  commentsEmptyEl = document.getElementById("dq-comments-empty");
  commentsListEl = document.getElementById("dq-comments-list");
  commentFormEl = document.getElementById("dq-comment-form");
  commentInputEl = document.getElementById("dq-comment-input");
  commentSubmitBtn = document.getElementById("dq-comment-submit-btn");

  historyModalEl = document.getElementById("dq-history-modal");
  historyCloseBtn = document.getElementById("dq-history-close-btn");
  historyEmptyEl = document.getElementById("dq-history-empty");
  historyListEl = document.getElementById("dq-history-list");

  if (historyBtn) {
    historyBtn.addEventListener("click", openHistoryModal);
  }
  if (historyCloseBtn && historyModalEl) {
    historyCloseBtn.addEventListener("click", () => closeModal(historyModalEl));
  }

  // 내 답변 수정 시작
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      const answers = currentQuestionDoc?.answers || {};
      const user = getCurrentUser();
      const myAnswer = user ? answers[user.uid] : null;

      isEditingMyAnswer = true;
      if (myFormEl) myFormEl.hidden = false;
      if (myDisplayEl) myDisplayEl.hidden = true;
      if (myInputEl) {
        myInputEl.value = myAnswer?.text || "";
        myInputEl.focus();
      }
      editBtn.hidden = true;
      if (editCancelBtn) editCancelBtn.hidden = false;
    });
  }

  // 내 답변 수정 취소
  if (editCancelBtn) {
    editCancelBtn.addEventListener("click", () => {
      isEditingMyAnswer = false;
      renderCurrentQuestionView();
    });
  }

  // 답변 등록/수정 저장
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const text = myInputEl?.value?.trim();
      if (!text) {
        showToastNotification("답변 내용을 입력해 주세요! 💌", "✏️");
        myInputEl?.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "등록 중...";

      try {
        const res = await saveDailyQuestionAnswer(activeDocId, activeQuestionData, text);
        isEditingMyAnswer = false;
        renderCurrentQuestionView();

        if (res?.isBothAnswered) {
          showToastNotification("답변이 등록되었습니다! 상대방의 답변이 열렸어요 🔓", "🔓");
        } else {
          showToastNotification("답변이 등록되었습니다! 상대방이 답변하면 함께 열려요 💌", "💌");
        }

        sendPushToPartner({
          title: "💌 오늘의 질문 답변 도착",
          message: "오늘의 질문에 새 답변이 등록되었습니다! 지금 확인해보세요.",
        }).catch(() => {});
      } catch (err) {
        console.error(err);
        showError("답변을 저장하지 못했습니다: " + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "답변 남기기 💌";
      }
    });
  }

  // 다음 질문 열기
  if (advanceBtn) {
    advanceBtn.addEventListener("click", async () => {
      const ok = await showConfirmDialog({
        title: "다음 질문 열기",
        message: "다음 회차 질문을 오픈하시겠습니까? (현재 문답은 지난 문답 보관함에 안전하게 저장됩니다)",
        confirmText: "다음 질문 열기",
      });
      if (!ok) return;

      advanceBtn.disabled = true;
      advanceBtn.textContent = "다음 질문 불러오는 중...";

      try {
        const isSpecial = activeQuestionData?.isSpecial;
        const currentOrder = questionState.currentOrder || 1;
        const nextOrder = isSpecial ? currentOrder : currentOrder + 1;

        await advanceToNextQuestion(nextOrder, activeDocId);

        showToastNotification(
          isSpecial
            ? "스페셜 문답 완료! 원래 순서로 복귀합니다 💌"
            : `Q.${nextOrder} 질문이 새로 오픈되었습니다! 🎉`,
          "💌"
        );
      } catch (err) {
        console.error(err);
        showError("다음 질문으로 넘어가지 못했습니다: " + err.message);
      } finally {
        advanceBtn.disabled = false;
        advanceBtn.textContent = "다음 질문 열기 💌";
      }
    });
  }

  // 댓글 등록
  if (commentFormEl) {
    commentFormEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = commentInputEl?.value?.trim();
      if (!text) {
        showToastNotification("메시지 내용을 입력해 주세요! 💬", "💬");
        commentInputEl?.focus();
        return;
      }

      if (commentSubmitBtn) {
        commentSubmitBtn.disabled = true;
        commentSubmitBtn.textContent = "전송 중...";
      }

      try {
        await addDailyQuestionComment(activeDocId, text);
        if (commentInputEl) commentInputEl.value = "";
        showToastNotification("메시지가 전송되었습니다! 💬", "💌");

        const user = getCurrentUser();
        const myName = getUserDisplayName(user?.uid, user?.displayName || "참여자");
        const preview = text.length > 20 ? text.substring(0, 20) + "..." : text;

        sendPushToPartner({
          title: "💬 오늘의 질문 한마디",
          message: `${myName}: "${preview}"`,
        }).catch(() => {});
      } catch (err) {
        console.error(err);
        showError("메시지를 저장하지 못했습니다: " + err.message);
      } finally {
        if (commentSubmitBtn) {
          commentSubmitBtn.disabled = false;
          commentSubmitBtn.textContent = "전송";
        }
      }
    });
  }

  // 알림 클릭 시 과거 문답 직접 열람 이벤트 수신
  window.addEventListener("diary:open-question", (e) => {
    const { docId, targetId } = e.detail || {};
    if (docId) {
      openQuestionByDocId(docId, targetId);
    }
  });

  // D-Day 변경 리스너 (로그인 상태일 때만 구독 전환)
  try {
    onDdayChange(() => {
      if (!isViewingHistory && getCurrentUser()) {
        const q = determineCurrentQuestion();
        const docChanged = activeDocId !== q.docId;
        activeDocId = q.docId;
        activeQuestionData = q.data;
        if (docChanged) {
          listenToQuestionDoc(activeDocId);
        } else {
          renderCurrentQuestionView();
        }
      }
    });
  } catch (e) {
    console.warn("[daily-question] onDdayChange 바인딩 경고:", e);
  }
}
