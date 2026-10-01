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
} from "./store.js";
import { getCurrentUser, getCurrentProfiles, getProfilePhoto, getUserInitial } from "./state.js";
import { getTodayQuestion, getCoupleDays } from "./questions.js";
import { getCurrentDdayItems } from "./dday.js";
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
let lockDescEl = null;
let partnerWaitingEl = null;
let partnerDisplayEl = null;
let partnerTextEl = null;

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
function renderCurrentDateQuestion() {
  const dateStr = toDateString(currentDateObj);
  const todayStr = toDateString(new Date());

  // 이전/다음 날짜 버튼 제어 (미래로는 이동 불가)
  if (nextBtn) {
    nextBtn.disabled = dateStr >= todayStr;
  }
  if (dateLabelEl) {
    dateLabelEl.textContent = getNavDateLabel(currentDateObj);
  }

  // 1. 해당 날짜에 해당하는 질문 도출
  const ddayItems = getCurrentDdayItems();
  currentQuestionData = getTodayQuestion(ddayItems, currentDateObj);

  // Firestore 문서에 기존 저장된 질문이 있으면 그것을 존중
  const displayBadge = currentQuestionDoc?.question?.badge || currentQuestionData.badge;
  const displayText = currentQuestionDoc?.question?.text || currentQuestionData.text;

  if (badgeEl) badgeEl.textContent = displayBadge;
  if (questionTextEl) questionTextEl.textContent = displayText;

  // 2. 사용자 프로필 및 아바타 세팅
  const user = getCurrentUser();
  const profiles = getCurrentProfiles();
  const myName = (user && profiles[user.uid]) ? profiles[user.uid] : (user?.displayName || "나");
  const partnerInfo = getPartnerInfo();

  if (myNameEl) myNameEl.textContent = myName;
  if (myAvatarEl) renderAvatar(myAvatarEl, user?.uid, myName);

  if (partnerNameEl) partnerNameEl.textContent = partnerInfo.name;
  if (partnerAvatarEl) renderAvatar(partnerAvatarEl, partnerInfo.uid, partnerInfo.name);

  // 3. 답변 및 블라인드 상태 계산
  const answers = currentQuestionDoc?.answers || {};
  const myAnswer = user ? answers[user.uid] : null;

  // 상대방 답변 찾기 (파트너 UID 또는 내 UID가 아닌 다른 첫 번째 답변)
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
    if (myInputEl) myInputEl.value = "";
    if (editBtn) editBtn.hidden = true;
  }

  // 상대방 답변 뷰 (★ 핵심 블라인드 잠금 로직 ★)
  if (!myAnswer) {
    // [상황 1] 내가 아직 답변을 안 씀 -> 무조건 블라인드 락(🔒)
    if (partnerDisplayEl) partnerDisplayEl.hidden = true;
    if (partnerWaitingEl) partnerWaitingEl.hidden = true;
    if (partnerLockedEl) partnerLockedEl.hidden = false;

    if (lockDescEl) {
      if (partnerAnswer) {
        lockDescEl.innerHTML = `<strong style="color: #e66d7b;">상대방이 이미 답변을 남겼어요! 💌</strong><br>내 답변을 먼저 남기면 즉시 잠금이 풀려요!`;
        partnerLockedEl.classList.add("partner-ready");
      } else {
        lockDescEl.textContent = "내 답변을 먼저 남기면 상대방의 답변이 열려요!";
        partnerLockedEl.classList.remove("partner-ready");
      }
    }
  } else {
    // [상황 2] 내가 답변을 씀 -> 🔓 잠금 해제
    if (partnerLockedEl) partnerLockedEl.hidden = true;

    if (partnerAnswer && partnerAnswer.text) {
      // 상대방도 작성 완료 -> 답변 내용 공개!
      if (partnerWaitingEl) partnerWaitingEl.hidden = true;
      if (partnerDisplayEl) partnerDisplayEl.hidden = false;
      if (partnerTextEl) partnerTextEl.textContent = partnerAnswer.text;
    } else {
      // 상대방은 아직 안 씀 -> 대기 상태
      if (partnerDisplayEl) partnerDisplayEl.hidden = true;
      if (partnerWaitingEl) partnerWaitingEl.hidden = false;
    }
  }
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
  lockDescEl = document.getElementById("dq-lock-desc");
  partnerWaitingEl = document.getElementById("dq-partner-waiting");
  partnerDisplayEl = document.getElementById("dq-partner-display");
  partnerTextEl = document.getElementById("dq-partner-text");

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

  // 오늘 날짜로 최초 구독 시작
  currentDateObj = new Date();
  listenToDate(toDateString(currentDateObj));
}
