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
} from "./store.js";
import { getCurrentUser, getCurrentProfiles, getProfilePhoto, getUserInitial } from "./state.js";
import { getTodayQuestion, getCoupleDays } from "./questions.js";
import { getCurrentDdayItems, onDdayChange } from "./dday.js";
import { sendPushToPartner, showToastNotification } from "./notify.js";
import { showError } from "./ui.js";

// DOM 요소
let sectionEl = null;
let badgeEl = null;
let prevBtn = null;
let nextBtn = null;
let dateLabelEl = null;
let questionTextEl = null;

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

// 내부 상태
let currentDateObj = new Date();
let currentQuestionData = null;
let unsubscribeQuestion = null;
let currentQuestionDoc = null; // Firestore에서 받아온 현재 날짜 데이터

/**
 * 날짜 객체를 YYYY-MM-DD 문자열로 변환
 */
function toDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 날짜 네비게이션 라벨 텍스트 생성
 */
function getNavDateLabel(d) {
  const today = new Date();
  const todayStr = toDateString(today);
  const targetStr = toDateString(d);

  if (targetStr === todayStr) {
    return "오늘";
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (targetStr === toDateString(yesterday)) {
    return "어제";
  }

  return `${d.getMonth() + 1}/${d.getDate()}`;
}

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

  return { uid: partnerUid, name: partnerName };
}

/**
 * 현재 선택된 날짜의 문답 화면을 갱신합니다.
 */
export function renderCurrentDateQuestion() {
  try {
    const dateStr = toDateString(currentDateObj);
    const todayStr = toDateString(new Date());

    // 이전/다음 날짜 버튼 제어 (미래로는 이동 불가)
    if (nextBtn) {
      nextBtn.disabled = dateStr >= todayStr;
    }
    if (dateLabelEl) {
      dateLabelEl.textContent = getNavDateLabel(currentDateObj);
    }

    // 1. 해당 날짜에 해당하는 질문 도출 (즉시 계산)
    const ddayItems = getCurrentDdayItems();
    currentQuestionData = getTodayQuestion(ddayItems, currentDateObj);

    // Firestore 문서에 기존 저장된 질문이 있으면 그것을 우선 존중
    const displayBadge = currentQuestionDoc?.question?.badge || currentQuestionData?.badge || "💌 오늘의 질문";
    const displayText = currentQuestionDoc?.question?.text || currentQuestionData?.text || "오늘의 질문을 불러왔습니다.";

    if (badgeEl) badgeEl.textContent = displayBadge;
    if (questionTextEl) questionTextEl.textContent = displayText;

    // 2. 사용자 프로필 및 아바타 세팅
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

    // 나의 답변 뷰
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

    // 상대방 답변 뷰 (★ 명확한 상태 분기: 상대방 작성 여부 + 블라인드 잠금 ★)
    const isPartnerAnswered = Boolean(partnerAnswer && partnerAnswer.text);

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

    // 4. 문답 댓글(한마디) 영역 렌더링
    renderComments(myAnswer, partnerAnswer);
  } catch (err) {
    console.error("[daily-question] 문답 렌더링 오류:", err);
  }
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
            const dateStr = toDateString(currentDateObj);
            await removeDailyQuestionComment(dateStr, c.id);
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
 * 특정 날짜에 대한 Firestore 실시간 문답 구독을 시작합니다.
 */
function listenToDate(dateStr) {
  if (unsubscribeQuestion) {
    unsubscribeQuestion();
    unsubscribeQuestion = null;
  }

  unsubscribeQuestion = subscribeDailyQuestion(dateStr, (docData) => {
    currentQuestionDoc = docData;
    renderCurrentDateQuestion();
  });
}

/**
 * 독립형 커플 문답 모듈 초기화
 */
export function initDailyQuestion() {
  sectionEl = document.getElementById("daily-question-section");
  if (!sectionEl) return;

  badgeEl = document.getElementById("dq-badge");
  prevBtn = document.getElementById("dq-prev-btn");
  nextBtn = document.getElementById("dq-next-btn");
  dateLabelEl = document.getElementById("dq-date-label");
  questionTextEl = document.getElementById("dq-question-text");

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

  // 댓글 등록 폼 이벤트
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
        const dateStr = toDateString(currentDateObj);
        await addDailyQuestionComment(dateStr, text);

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

  // 이전 날짜 보기 (◀)
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      const prevDate = new Date(currentDateObj);
      prevDate.setDate(prevDate.getDate() - 1);
      currentDateObj = prevDate;
      listenToDate(toDateString(currentDateObj));
    });
  }

  // 다음 날짜 보기 (▶)
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const nextDate = new Date(currentDateObj);
      nextDate.setDate(nextDate.getDate() + 1);
      const todayStr = toDateString(new Date());
      if (toDateString(nextDate) <= todayStr) {
        currentDateObj = nextDate;
        listenToDate(toDateString(currentDateObj));
      }
    });
  }

  // 내 답변 수정 버튼
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

  // 답변 등록/수정 버튼
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
        const dateStr = toDateString(currentDateObj);
        await saveDailyQuestionAnswer(dateStr, currentQuestionData, text);

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

  // 1. 오늘 날짜로 즉시 동기적 1회 렌더링 (질문을 즉각 화면에 노출)
  currentDateObj = new Date();
  renderCurrentDateQuestion();

  // 2. D-Day 로드 시 질문 재계산 연동
  try {
    onDdayChange(() => {
      renderCurrentDateQuestion();
    });
  } catch (e) {
    console.warn("[daily-question] onDdayChange 바인딩 경고:", e);
  }

  // 3. 오늘 날짜로 Firestore 실시간 구독 시작
  listenToDate(toDateString(currentDateObj));
}
