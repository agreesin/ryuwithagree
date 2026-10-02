// =========================================================
// daily-question.js - 독립형 블라인드 커플 문답 모듈
//
// 1. 일기장과 완전히 분리된 전용 1:1 문답 카드
// 2. 블라인드 잠금(🔒): 내가 답변을 등록하기 전까지 상대방의 답변을 숨김
// 3. 내가 답변을 등록하면 실시간으로 잠금 해제(🔓)되어 나란히 공개
// 4. D-Day 연애 단계별 질문 필터링 및 이전/다음 날짜 탐색 지원
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
import { getCurrentUser, getCurrentProfiles, getProfilePhoto, getUserInitial } from "./state.js";
import { getCoupleDays, checkSpecialDayQuestion, getQuestionByOrder } from "./questions.js";
import { getCurrentDdayItems, onDdayChange } from "./dday.js";
import { sendPushToPartner, showToastNotification } from "./notify.js";
import { showError } from "./ui.js";

// DOM 요소
let sectionEl = null;
let badgeEl = null;
let questionTextEl = null;
let historyBtn = null;
let historyCountEl = null;

let myAvatarEl = null;
let myNameEl = null;
let editBtn = null;
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
let partnerWaitingEl = null;
let partnerDisplayEl = null;
let partnerTextEl = null;

let nextQuestionWrapEl = null;
let advanceBtn = null;

// 댓글 DOM 요소
let commentsContainerEl = null;
let commentsCountEl = null;
let commentsLockedNoticeEl = null;
let commentsContentEl = null;
let commentsEmptyEl = null;
let commentsListEl = null;
let commentFormEl = null;
let commentInputEl = null;
let commentSubmitBtn = null;

// 지난 문답 모달 DOM
let historyModalEl = null;
let historyCloseBtn = null;
let historyEmptyEl = null;
let historyListEl = null;

// 내부 상태
let questionState = { currentOrder: 1, completedIds: [] };
let activeDocId = null; // 현재 화면에 렌더링 중인 질문 문서 ID
let activeQuestionData = null; // 현재 화면 질문 메타데이터
let currentQuestionDoc = null; // Firestore에서 받아온 현재 질문 데이터
let unsubscribeQuestion = null;
let unsubscribeState = null;
let isViewingHistory = false; // 과거 문답 열람 중인지 여부

/**
 * 프로필 아바타 렌더링 헬퍼
 */
function renderAvatar(container, uid, name) {
  if (!container) return;
  const photo = uid ? getProfilePhoto(uid) : null;
  if (photo) {
    container.innerHTML = `<img src="${photo}" alt="${name} 프로필" />`;
  } else {
    container.textContent = getUserInitial(name);
  }
}

/**
 * 상대방의 UID와 닉네임을 구합니다.
 */
function getPartnerInfo() {
  const user = getCurrentUser();
  const profiles = getCurrentProfiles();
  if (!user || !profiles) return { uid: null, name: "상대방" };

  const partnerUid = Object.keys(profiles).find((uid) => uid !== user.uid);
  const partnerName = partnerUid ? profiles[partnerUid] || "상대방" : "상대방";

  return { uid: partnerUid || null, name: partnerName };
}

/**
 * 현재 활성화할 질문 결정:
 * 1) 오늘이 특별한 기념일(100일/생일/크리스마스 등)이고 아직 완료되지 않았다면 스페셜 질문 우선!
 * 2) 그 외 평소에는 현재 회차(currentOrder)의 일반 질문 순차 배정
 */
function determineCurrentQuestion() {
  const ddayItems = getCurrentDdayItems();
  const today = new Date();
  const coupleDays = getCoupleDays(ddayItems, today);

  // 1. 기념일 당일 특별 질문 체크
  const specialQ = checkSpecialDayQuestion(ddayItems, today);
  const isSpecialCompleted = specialQ && questionState.completedIds.includes(specialQ.id);

  if (specialQ && !isSpecialCompleted) {
    return {
      docId: specialQ.id,
      data: specialQ,
    };
  }

  // 2. 평상시: 현재 회차(order) 일반 질문
  const order = questionState.currentOrder || 1;
  const normalQ = getQuestionByOrder(order, coupleDays);
  return {
    docId: normalQ.id,
    data: normalQ,
  };
}

/**
 * 특정 질문 문서(docId)에 대한 실시간 구독 연결
 */
function listenToQuestionDoc(docId) {
  if (unsubscribeQuestion) {
    unsubscribeQuestion();
    unsubscribeQuestion = null;
  }

  unsubscribeQuestion = subscribeDailyQuestion(docId, (docData) => {
    currentQuestionDoc = docData;
    renderCurrentQuestionView();
  });
}

/**
 * 현재 활성화된 질문 화면 렌더링
 */
export function renderCurrentQuestionView() {
  try {
    if (!activeQuestionData) {
      const initQ = determineCurrentQuestion();
      activeDocId = initQ.docId;
      activeQuestionData = initQ.data;
    }

    // 1. 배지 및 질문 본문 렌더링
    const displayBadge = currentQuestionDoc?.question?.badge || activeQuestionData?.badge || "💌 오늘의 질문";
    const displayText = currentQuestionDoc?.question?.text || activeQuestionData?.text || "질문을 불러왔습니다.";
    const isSpecial = activeQuestionData?.isSpecial || currentQuestionDoc?.question?.isSpecial;

    if (badgeEl) {
      badgeEl.textContent = displayBadge;
      if (isSpecial) badgeEl.classList.add("special");
      else badgeEl.classList.remove("special");
    }
    if (questionTextEl) questionTextEl.textContent = displayText;

    // 히스토리 개수 배지
    if (historyCountEl) {
      historyCountEl.textContent = String(questionState.completedIds.length);
    }

    // 2. 프로필 및 아바타
    const user = getCurrentUser();
    const profiles = getCurrentProfiles() || {};
    const myName = (user && profiles[user.uid]) ? profiles[user.uid] : (user?.displayName || "나");
    const partnerInfo = getPartnerInfo();

    if (myNameEl) myNameEl.textContent = myName;
    if (myAvatarEl) renderAvatar(myAvatarEl, user?.uid, myName);

    if (partnerNameEl) partnerNameEl.textContent = partnerInfo.name;
    if (partnerAvatarEl) renderAvatar(partnerAvatarEl, partnerInfo.uid, partnerInfo.name);

    // 3. 답변 및 블라인드 상태 계산
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

    // 내 답변 뷰
    if (myAnswer && myAnswer.text) {
      if (myFormEl) myFormEl.hidden = true;
      if (myDisplayEl) myDisplayEl.hidden = false;
      if (myTextEl) myTextEl.textContent = myAnswer.text;
      if (editBtn) editBtn.hidden = false;
    } else {
      if (myFormEl) myFormEl.hidden = false;
      if (myDisplayEl) myDisplayEl.hidden = true;
      if (myInputEl && !myInputEl.value) myInputEl.value = "";
      if (editBtn) editBtn.hidden = true;
    }

    // 상대방 답변 뷰 (블라인드 락 🔒)
    const isPartnerAnswered = Boolean(partnerAnswer && partnerAnswer.text);
    const isBothAnswered = Boolean(myAnswer && partnerAnswer && myAnswer.text && partnerAnswer.text);

    if (isPartnerAnswered) {
      if (!myAnswer) {
        if (partnerDisplayEl) partnerDisplayEl.hidden = true;
        if (partnerWaitingEl) partnerWaitingEl.hidden = true;
        if (partnerLockedEl) {
          partnerLockedEl.hidden = false;
          partnerLockedEl.classList.add("partner-ready");
        }
        if (lockIconEl) lockIconEl.textContent = "🔒";
        if (lockTitleEl) lockTitleEl.innerHTML = `<span style="color: #e66d7b;">상대방이 답변을 남겼어요! 💌</span>`;
        if (lockDescEl) lockDescEl.textContent = "내 답변을 작성하면 상대방의 답변이 열려요!";
      } else {
        if (partnerLockedEl) partnerLockedEl.hidden = true;
        if (partnerWaitingEl) partnerWaitingEl.hidden = true;
        if (partnerDisplayEl) {
          partnerDisplayEl.hidden = false;
          if (partnerTextEl) partnerTextEl.textContent = partnerAnswer.text;
        }
      }
    } else {
      if (partnerDisplayEl) partnerDisplayEl.hidden = true;
      if (partnerWaitingEl) partnerWaitingEl.hidden = true;
      if (partnerLockedEl) {
        partnerLockedEl.hidden = false;
        partnerLockedEl.classList.remove("partner-ready");
      }
      if (lockIconEl) lockIconEl.textContent = "⏳";
      if (lockTitleEl) lockTitleEl.textContent = "상대방이 아직 작성하지 않았어요";
      if (lockDescEl) {
        if (!myAnswer) {
          lockDescEl.textContent = "내 답변을 먼저 남겨두면, 상대방이 작성했을 때 바로 확인할 수 있어요!";
        } else {
          lockDescEl.textContent = "상대방이 답변을 남기길 기다리는 중이에요...";
        }
      }
    }

    // 4. 두 사람 모두 작성 완료 시: 다음 질문 열기 바 노출 (과거 조회 중이 아닐 때)
    if (nextQuestionWrapEl) {
      nextQuestionWrapEl.hidden = !isBothAnswered || isViewingHistory;
    }

    // 5. 실시간 댓글 영역 렌더링
    renderComments(myAnswer, partnerAnswer);
  } catch (err) {
    console.error("[daily-question] 문답 렌더링 오류:", err);
  }
}

/**
 * 탭 전환 등에서 호출하는 진입 함수
 */
export function renderCurrentDateQuestion() {
  renderCurrentQuestionView();
}

/**
 * 댓글 작성 시간 포맷 (방금 전, n분 전, HH:mm, M/D HH:mm)
 */
function formatCommentTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;

  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  const isSameDay = d.toDateString() === now.toDateString();
  if (isSameDay) {
    return `${hours}:${minutes}`;
  }
  return `${m}/${day} ${hours}:${minutes}`;
}

/**
 * 문답 댓글 목록 렌더링
 */
function renderComments(myAnswer, partnerAnswer) {
  if (!commentsContainerEl) return;

  const isUnlocked = Boolean(myAnswer?.text && partnerAnswer?.text);
  const comments = currentQuestionDoc?.comments || [];

  if (commentsCountEl) {
    commentsCountEl.textContent = String(comments.length);
  }

  // 두 사람 모두 답변을 작성해야 댓글창이 활성화됨
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
  const profiles = getCurrentProfiles() || {};

  comments.forEach((c) => {
    const isMe = currentUser && c.uid === currentUser.uid;
    const li = document.createElement("li");
    li.className = `dq-comment-item ${isMe ? "is-me" : "is-partner"}`;

    const authorName = (c.uid && profiles[c.uid]) ? profiles[c.uid] : (c.author || "이름 없음");
    const photo = c.uid ? getProfilePhoto(c.uid) : null;
    const avatarHtml = photo
      ? `<img src="${photo}" alt="${authorName}" class="dq-comment-avatar-img" />`
      : `<span class="dq-comment-avatar-initial">${getUserInitial(authorName)}</span>`;

    li.innerHTML = `
      <div class="dq-comment-avatar">${avatarHtml}</div>
      <div class="dq-comment-body">
        <div class="dq-comment-meta">
          <strong class="dq-comment-author">${authorName}</strong>
          <span class="dq-comment-time">${formatCommentTime(c.createdAt)}</span>
          ${isMe ? `<button type="button" class="dq-comment-del-btn" title="댓글 삭제">✕</button>` : ""}
        </div>
        <p class="dq-comment-text"></p>
      </div>
    `;

    const textP = li.querySelector(".dq-comment-text");
    if (textP) textP.textContent = c.text;

    if (isMe) {
      const delBtn = li.querySelector(".dq-comment-del-btn");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!confirm("이 댓글을 삭제하시겠습니까?")) return;
          try {
            await removeDailyQuestionComment(activeDocId, c.id);
            showToastNotification("댓글이 삭제되었습니다.", "🗑️");
          } catch (err) {
            console.error(err);
            showError("댓글 삭제에 실패했습니다: " + err.message);
          }
        });
      }
    }

    commentsListEl.appendChild(li);
  });
}

/**
 * 지난 문답 모달 열기 및 목록 렌더링
 */
async function openHistoryModal() {
  if (!historyModalEl) return;
  historyModalEl.hidden = false;
  document.body.classList.add("modal-open");

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

    items.forEach((item) => {
      const q = item.question || {};
      const li = document.createElement("li");
      li.className = "dq-history-item";

      const badgeText = q.badge || "💌 완료된 문답";
      const questionText = q.text || "질문 내용";
      const answers = item.answers || {};
      const answerCount = Object.keys(answers).length;

      li.innerHTML = `
        <div class="dq-hitem-header">
          <span class="dq-hitem-badge ${q.isSpecial ? "special" : ""}">${badgeText}</span>
          <span class="dq-hitem-status">답변 ${answerCount}개 💖</span>
        </div>
        <h4 class="dq-hitem-title">${questionText}</h4>
        <button type="button" class="dq-hitem-view-btn">열람하기 📖</button>
      `;

      li.querySelector(".dq-hitem-view-btn")?.addEventListener("click", () => {
        // 과거 문답 열람 화면으로 전환
        isViewingHistory = true;
        activeDocId = item.id;
        activeQuestionData = q;
        currentQuestionDoc = item;
        historyModalEl.hidden = true;
        document.body.classList.remove("modal-open");

        listenToQuestionDoc(activeDocId);
        showToastNotification(`'${badgeText}' 문답을 불러왔습니다.`, "📖");
      });

      historyListEl.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    if (historyListEl) {
      historyListEl.innerHTML = `<li class="dq-history-loading">목록을 불러오지 못했습니다: ${err.message}</li>`;
    }
  }
}

/**
 * 독립형 커플 문답 모듈 초기화
 */
export function initDailyQuestion() {
  sectionEl = document.getElementById("daily-question-section");
  if (!sectionEl) return;

  badgeEl = document.getElementById("dq-badge");
  questionTextEl = document.getElementById("dq-question-text");
  historyBtn = document.getElementById("dq-history-btn");
  historyCountEl = document.getElementById("dq-history-count");

  myAvatarEl = document.getElementById("dq-my-avatar");
  myNameEl = document.getElementById("dq-my-name");
  editBtn = document.getElementById("dq-edit-btn");
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
  partnerWaitingEl = document.getElementById("dq-partner-waiting");
  partnerDisplayEl = document.getElementById("dq-partner-display");
  partnerTextEl = document.getElementById("dq-partner-text");

  nextQuestionWrapEl = document.getElementById("dq-next-question-wrap");
  advanceBtn = document.getElementById("dq-advance-btn");

  // 댓글 DOM 매핑
  commentsContainerEl = document.getElementById("dq-comments-container");
  commentsCountEl = document.getElementById("dq-comments-count");
  commentsLockedNoticeEl = document.getElementById("dq-comments-locked-notice");
  commentsContentEl = document.getElementById("dq-comments-content");
  commentsEmptyEl = document.getElementById("dq-comments-empty");
  commentsListEl = document.getElementById("dq-comments-list");
  commentFormEl = document.getElementById("dq-comment-form");
  commentInputEl = document.getElementById("dq-comment-input");
  commentSubmitBtn = document.getElementById("dq-comment-submit-btn");

  // 지난 문답 모달 DOM 매핑
  historyModalEl = document.getElementById("dq-history-modal");
  historyCloseBtn = document.getElementById("dq-history-close-btn");
  historyEmptyEl = document.getElementById("dq-history-empty");
  historyListEl = document.getElementById("dq-history-list");

  // 1. 지난 문답 모달 열기/닫기
  if (historyBtn) {
    historyBtn.addEventListener("click", openHistoryModal);
  }
  if (historyCloseBtn && historyModalEl) {
    historyCloseBtn.addEventListener("click", () => {
      historyModalEl.hidden = true;
      document.body.classList.remove("modal-open");
    });
    historyModalEl.addEventListener("click", (e) => {
      if (e.target === historyModalEl) {
        historyModalEl.hidden = true;
        document.body.classList.remove("modal-open");
      }
    });
  }

  // 2. 내 답변 수정 버튼
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      const answers = currentQuestionDoc?.answers || {};
      const user = getCurrentUser();
      const myAnswer = user ? answers[user.uid] : null;

      if (myFormEl) myFormEl.hidden = false;
      if (myDisplayEl) myDisplayEl.hidden = true;
      if (myInputEl) {
        myInputEl.value = myAnswer?.text || "";
        myInputEl.focus();
      }
      editBtn.hidden = true;
    });
  }

  // 3. 답변 등록/수정 버튼
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const text = myInputEl?.value?.trim();
      if (!text) {
        showError("답변 내용을 입력해 주세요! 💌");
        myInputEl?.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "등록 중...";

      try {
        await saveDailyQuestionAnswer(activeDocId, activeQuestionData, text);

        showToastNotification("답변이 등록되었습니다! 상대방의 답변이 열립니다. 💌", "🔓");

        // 상대방에게 푸시 발송
        sendPushToPartner({
          title: "💌 오늘의 질문 답변 도착",
          message: "당신의 반쪽이 오늘의 질문에 답변을 남겼습니다! 지금 확인해보세요.",
        });
      } catch (err) {
        console.error(err);
        showError("답변을 저장하지 못했습니다: " + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "답변 남기기 💌";
      }
    });
  }

  // 4. 다음 질문 열기 버튼 ([다음 질문 열기 💌])
  if (advanceBtn) {
    advanceBtn.addEventListener("click", async () => {
      if (!confirm("다음 회차 질문을 오픈하시겠습니까? 💌")) return;

      advanceBtn.disabled = true;
      advanceBtn.textContent = "다음 질문 불러오는 중...";

      try {
        const isSpecial = activeQuestionData?.isSpecial;
        const currentOrder = questionState.currentOrder || 1;
        const nextOrder = isSpecial ? currentOrder : currentOrder + 1;

        await advanceToNextQuestion(nextOrder, activeDocId);

        showToastNotification(
          isSpecial ? "스페셜 문답 완료! 원래 순서로 복귀합니다 💌" : `Q.${nextOrder} 질문이 새로 오픈되었습니다! 🎉`,
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

  // 5. 댓글 등록 폼 이벤트
  if (commentFormEl) {
    commentFormEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = commentInputEl?.value?.trim();
      if (!text) {
        showError("댓글 내용을 입력해 주세요! 💬");
        commentInputEl?.focus();
        return;
      }

      if (commentSubmitBtn) {
        commentSubmitBtn.disabled = true;
        commentSubmitBtn.textContent = "등록 중...";
      }

      try {
        await addDailyQuestionComment(activeDocId, text);

        if (commentInputEl) {
          commentInputEl.value = "";
        }
        showToastNotification("댓글이 등록되었습니다! 💬", "💌");

        // 상대방에게 푸시 알림 발송
        const user = getCurrentUser();
        const profiles = getCurrentProfiles() || {};
        const myName = (user && profiles[user.uid]) ? profiles[user.uid] : (user?.displayName || "당신의 반쪽");
        const preview = text.length > 20 ? text.substring(0, 20) + "..." : text;

        sendPushToPartner({
          title: "💬 오늘의 질문 댓글",
          message: `${myName}: "${preview}"`,
        });
      } catch (err) {
        console.error(err);
        showError("댓글을 저장하지 못했습니다: " + err.message);
      } finally {
        if (commentSubmitBtn) {
          commentSubmitBtn.disabled = false;
          commentSubmitBtn.textContent = "등록";
        }
      }
    });
  }

  // 6. 질문 진행 상태(_question_state) 실시간 구독 시작
  unsubscribeState = subscribeQuestionState((state) => {
    questionState = state;
    if (!isViewingHistory) {
      const q = determineCurrentQuestion();
      activeDocId = q.docId;
      activeQuestionData = q.data;
      listenToQuestionDoc(activeDocId);
    } else {
      renderCurrentQuestionView();
    }
  });

  // 7. D-Day 변경 리스너
  try {
    onDdayChange(() => {
      if (!isViewingHistory) {
        const q = determineCurrentQuestion();
        activeDocId = q.docId;
        activeQuestionData = q.data;
        listenToQuestionDoc(activeDocId);
      }
    });
  } catch (e) {
    console.warn("[daily-question] onDdayChange 바인딩 경고:", e);
  }

  // 초기 1회 동기적 계산
  const initialQ = determineCurrentQuestion();
  activeDocId = initialQ.docId;
  activeQuestionData = initialQ.data;
  renderCurrentQuestionView();
}
