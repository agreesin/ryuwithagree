// =========================================================
// nudge.js - 듀오링고 감성 커플 "콕 찌르기(Nudge)" 모듈
//
// 1. 최대 5회 연속 찌르기 + 5회 소진 시 1시간 쿨타임 시스템
// 2. 3가지 상황별 찌르기 (오늘의 질문 / 오늘 일기 / 생각나서 자유 콕)
// 3. 재치 있는 상황별 프리셋 멘트 & 랜덤 선택 & 직접 입력 지원
// 4. 듀오링고 스타일 핵심 디테일:
//    - 발신자: 손가락 바운스 애니메이션 & 실시간 쿼터/쿨타임 카운터 & FCM 웹 푸시
//    - 수신자: 실시간 감지 시 듀오 화면 지진 효과(Screen Shake) & 대형 팝업 모달 & 맞춤형 액션 바로가기
// =========================================================

import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { db } from "./store.js";
import { getCurrentUser, getCurrentProfiles, getPartnerInfo } from "./state.js";
import { sendPushToPartner, showToastNotification } from "./notify.js";
import { showError } from "./ui.js";
import { switchViewTab } from "./calendar.js";

// 상수 설정
export const MAX_NUDGES = 5;
export const COOLDOWN_MS = 60 * 60 * 1000; // 1시간
const STORAGE_KEY_QUOTA = "diary_nudge_quota_v2";
const STORAGE_KEY_LAST_SEEN = "diary_nudge_last_seen_ts_v2";

// 상황별 재치 있는 프리셋 멘트 목록
export const NUDGE_PRESETS = {
  question: [
    "나 답변 썼는데 너는 언제 써줄 거야? 궁금해 죽겠어! 🥺",
    "얼른 쓰고 내 비밀 답변 확인해봐! 뭐가 써있게? 🔓",
    "오늘 질문 진짜 재밌는데! 빨리 와서 써줘 💌",
    "빨리 안 쓰면 볼 꼬집는다! 🤏 볼 대기해~",
    "기다리다 목 빠지겠어~ 나 기린 되는 중 🦒",
    "우리 커플 질문에 얼른 도장 쾅 찍어줘 🐾",
  ],
  diary: [
    "오늘 하루 어땠어? 자기 일기 기다리고 있어 📖",
    "오늘 일기 안 쓰고 잘 생각은 아니겠지? 🧐 딱 걸림!",
    "너의 하루가 궁금해! 짧게 한 줄이라도 써줘 ✏️",
    "오늘 하루도 수고 많았어, 일기장에서 만나자 🌙",
    "일기 스트릭 끊기면 큰일나! 얼른 기록 남기자 🔥",
    "자기 생각하며 일기 다 썼지롱! 얼른 써줘 🥰",
  ],
  free: [
    "그냥 자기 생각나서 찔러봤어 💕 보고 싶다!",
    "지금 뭐해? 딴 생각하지 말고 내 생각해 👉",
    "나 심심해~ 나랑 놀아줘 🐾 힝...",
    "사랑해! 뜬금없는 사랑 고백 투척 💘",
    "답장 안 하면 계속 찌른다? 콕콕콕콕 👉👉",
    "자기한테 보낼 하트 충전 완료! 받아라 뿅 💌",
  ],
};

// 상황별 모달 타이틀 & 아이콘
const SITUATION_META = {
  question: {
    icon: "💌",
    title: "오늘의 질문 콕 찌르기",
    actionLabel: "답변 작성하러 가기 💌",
    defaultMessage: NUDGE_PRESETS.question[0],
  },
  diary: {
    icon: "📖",
    title: "오늘 일기 콕 찌르기",
    actionLabel: "일기 쓰러 가기 📖",
    defaultMessage: NUDGE_PRESETS.diary[0],
  },
  free: {
    icon: "👉",
    title: "생각나서 콕 찌르기",
    actionLabel: "나도 맞찌르기! 👉",
    defaultMessage: NUDGE_PRESETS.free[0],
  },
};

// DOM 요소 참조
let freeNudgeBtn = null;
let freeNudgeBadge = null;
let dqNudgeBtn = null;
let dqNudgeBadge = null;
let diaryNudgeBanner = null;
let diaryNudgeBtn = null;
let diaryNudgeBadge = null;
let diaryNudgePartnerName = null;

// 발송 모달
let selectModalEl = null;
let selectModalCloseBtn = null;
let modalIconEl = null;
let modalTitleEl = null;
let quotaCountTextEl = null;
let quotaBarEl = null;
let cooldownTextEl = null;
let randomBtn = null;
let presetListEl = null;
let customInputEl = null;
let sendSubmitBtn = null;
let submitBtnTextEl = null;

// 수신 팝업 모달
let rxModalEl = null;
let rxSenderNameEl = null;
let rxPokeIndexEl = null;
let rxMessageTextEl = null;
let rxActionBtn = null;
let rxDismissBtn = null;

// 모달 내부 상태
let currentNudgeType = "free";
let selectedMessage = "";
let timerInterval = null;
let unsubscribeNudges = null;
let cachedEntries = [];

/**
 * 현재 사용자의 쿼터 및 쿨타임 상태 계산
 */
export function getQuotaState() {
  const user = getCurrentUser();
  if (!user) {
    return {
      remaining: MAX_NUDGES,
      isCoolingDown: false,
      cooldownMinutes: 0,
      usedCount: 0,
    };
  }

  const key = `${STORAGE_KEY_QUOTA}_${user.uid}`;
  let state = null;
  try {
    const raw = localStorage.getItem(key);
    state = raw ? JSON.parse(raw) : null;
  } catch (e) {
    state = null;
  }

  if (!state) {
    state = { count: 0, cooldownUntil: null, lastPokeTime: 0 };
  }

  const now = Date.now();

  // 1. 쿨타임 종료 여부 검사
  if (state.cooldownUntil && now >= state.cooldownUntil) {
    state.count = 0;
    state.cooldownUntil = null;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {}
  }

  // 2. 쿨타임 중일 때
  if (state.cooldownUntil && now < state.cooldownUntil) {
    const msLeft = state.cooldownUntil - now;
    const cooldownMinutes = Math.max(1, Math.ceil(msLeft / 60000));
    return {
      remaining: 0,
      isCoolingDown: true,
      cooldownMinutes,
      usedCount: MAX_NUDGES,
    };
  }

  // 3. 정상 상태 (0 ~ 5회 잔여)
  const count = Math.min(MAX_NUDGES, Math.max(0, state.count || 0));
  const remaining = Math.max(0, MAX_NUDGES - count);

  return {
    remaining,
    isCoolingDown: false,
    cooldownMinutes: 0,
    usedCount: count,
  };
}

/**
 * 콕 찌르기 1회 차감 및 쿨타임 전환 처리
 */
function consumePoke() {
  const user = getCurrentUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const key = `${STORAGE_KEY_QUOTA}_${user.uid}`;
  let state = null;
  try {
    const raw = localStorage.getItem(key);
    state = raw ? JSON.parse(raw) : null;
  } catch (e) {
    state = null;
  }

  if (!state) {
    state = { count: 0, cooldownUntil: null, lastPokeTime: 0 };
  }

  const now = Date.now();

  // 쿨타임 만료 시 리셋
  if (state.cooldownUntil && now >= state.cooldownUntil) {
    state.count = 0;
    state.cooldownUntil = null;
  }

  // 쿨타임 중 발송 시도 차단
  if (state.cooldownUntil && now < state.cooldownUntil) {
    const mins = Math.max(1, Math.ceil((state.cooldownUntil - now) / 60000));
    throw new Error(`연속 찌르기 5회를 모두 사용했어요! ${mins}분 뒤에 충전됩니다 ⏳`);
  }

  // 카운트 증가
  state.count = (state.count || 0) + 1;
  state.lastPokeTime = now;

  // 5회 소진 시 즉시 1시간 쿨타임 돌입
  if (state.count >= MAX_NUDGES) {
    state.cooldownUntil = now + COOLDOWN_MS;
  }

  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {}

  updateAllNudgeBadges();

  return {
    usedCount: state.count,
    remaining: Math.max(0, MAX_NUDGES - state.count),
    isCoolingDown: Boolean(state.cooldownUntil && state.cooldownUntil > now),
  };
}

/**
 * 화면의 모든 찌르기 버튼 배지 및 모달 쿼터 바 갱신
 */
export function updateAllNudgeBadges() {
  const quota = getQuotaState();
  const badgeText = quota.isCoolingDown ? `⏳ ${quota.cooldownMinutes}분` : `${quota.remaining}/${MAX_NUDGES}`;

  // 1. 헤더 프로필 바 자유 찌르기 버튼
  if (freeNudgeBadge) freeNudgeBadge.textContent = badgeText;
  if (freeNudgeBtn) {
    freeNudgeBtn.classList.toggle("cooling-down", quota.isCoolingDown);
  }

  // 2. 오늘의 질문 재촉 버튼
  if (dqNudgeBadge) dqNudgeBadge.textContent = badgeText;
  if (dqNudgeBtn) {
    dqNudgeBtn.classList.toggle("cooling-down", quota.isCoolingDown);
  }

  // 3. 일기 재촉 버튼
  if (diaryNudgeBadge) diaryNudgeBadge.textContent = badgeText;
  if (diaryNudgeBtn) {
    diaryNudgeBtn.classList.toggle("cooling-down", quota.isCoolingDown);
  }

  // 4. 모달 내부 쿼터 게이지 & 타이머
  if (quotaCountTextEl) {
    quotaCountTextEl.textContent = quota.isCoolingDown
      ? `0 / ${MAX_NUDGES}회 (쿨타임)`
      : `${quota.remaining} / ${MAX_NUDGES}회`;
  }

  if (quotaBarEl) {
    const percent = quota.isCoolingDown ? 0 : (quota.remaining / MAX_NUDGES) * 100;
    quotaBarEl.style.width = `${percent}%`;
    quotaBarEl.style.backgroundColor = quota.isCoolingDown ? "#f59e0b" : "#e66d7b";
  }

  if (cooldownTextEl) {
    if (quota.isCoolingDown) {
      cooldownTextEl.hidden = false;
      cooldownTextEl.textContent = `⏳ 1시간 쿨타임 중 (${quota.cooldownMinutes}분 뒤 충전)`;
    } else {
      cooldownTextEl.hidden = true;
    }
  }

  if (sendSubmitBtn) {
    sendSubmitBtn.disabled = quota.isCoolingDown;
    if (submitBtnTextEl) {
      const partner = getPartnerInfo();
      submitBtnTextEl.textContent = quota.isCoolingDown
        ? `1시간 대기 중입니다 ⏳`
        : `${partner.name} 콕! 찌르기 (${quota.remaining}/${MAX_NUDGES})`;
    }
  }
}

/**
 * 콕 찌르기 발송 모달 열기
 * @param {"question" | "diary" | "free"} type
 */
export function openNudgeModal(type = "free") {
  currentNudgeType = type;
  const meta = SITUATION_META[type] || SITUATION_META.free;
  const partner = getPartnerInfo();

  if (modalIconEl) modalIconEl.textContent = meta.icon;
  if (modalTitleEl) modalTitleEl.textContent = meta.title;

  if (customInputEl) customInputEl.value = "";

  // 프리셋 목록 렌더링
  renderPresetList(type);

  updateAllNudgeBadges();

  if (selectModalEl) {
    selectModalEl.hidden = false;
    document.body.classList.add("modal-open");
  }
}

/**
 * 프리셋 멘트 목록 렌더링
 */
function renderPresetList(type) {
  if (!presetListEl) return;
  presetListEl.innerHTML = "";

  const presets = NUDGE_PRESETS[type] || NUDGE_PRESETS.free;
  selectedMessage = presets[0] || "";

  presets.forEach((msg, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `nudge-preset-item ${idx === 0 ? "active" : ""}`;
    btn.textContent = msg;

    btn.addEventListener("click", () => {
      selectedMessage = msg;
      if (customInputEl) customInputEl.value = "";
      presetListEl.querySelectorAll(".nudge-preset-item").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
    });

    presetListEl.appendChild(btn);
  });
}

/**
 * 멘트 랜덤 선택
 */
function pickRandomMessage() {
  const presets = NUDGE_PRESETS[currentNudgeType] || NUDGE_PRESETS.free;
  if (!presets || presets.length === 0) return;

  const currentIdx = presets.indexOf(selectedMessage);
  let nextIdx = Math.floor(Math.random() * presets.length);
  if (presets.length > 1 && nextIdx === currentIdx) {
    nextIdx = (nextIdx + 1) % presets.length;
  }

  selectedMessage = presets[nextIdx];
  if (customInputEl) customInputEl.value = "";

  if (presetListEl) {
    const items = presetListEl.querySelectorAll(".nudge-preset-item");
    items.forEach((item, idx) => {
      item.classList.toggle("active", idx === nextIdx);
      if (idx === nextIdx) {
        item.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }
}

/**
 * 콕 찌르기 발송 실행 (버튼 애니메이션, 쿼터 차감, 푸시 및 Firestore 기록)
 */
async function handleSendNudge() {
  const partner = getPartnerInfo();
  if (!partner.uid) {
    showError("상대방 프로필이 아직 등록되지 않았습니다.");
    return;
  }

  const customText = customInputEl?.value?.trim();
  const finalMessage = customText || selectedMessage || SITUATION_META[currentNudgeType].defaultMessage;

  let pokeResult = null;
  try {
    pokeResult = consumePoke();
  } catch (err) {
    showError(err.message);
    return;
  }

  // 발송 버튼 탄성 바운스 애니메이션
  const fingerEl = sendSubmitBtn?.querySelector(".nudge-submit-finger");
  if (fingerEl) {
    fingerEl.classList.remove("bounce");
    void fingerEl.offsetWidth; // reflow
    fingerEl.classList.add("bounce");
  }

  if (sendSubmitBtn) {
    sendSubmitBtn.disabled = true;
  }

  try {
    const user = getCurrentUser();
    const profiles = getCurrentProfiles() || {};
    const myName = (user && profiles[user.uid]) ? profiles[user.uid] : (user?.displayName || "당신의 반쪽");

    // 1. FCM 웹 푸시 발송
    const pushTitle = `👉 ${myName}님이 콕! 찔렀어요! (${pokeResult.usedCount}/${MAX_NUDGES})`;
    sendPushToPartner({
      title: pushTitle,
      message: finalMessage,
    }).catch((err) => {
      console.warn("[nudge] 백그라운드 푸시 전송 경고:", err);
    });

    // 2. Firestore 최신 찌르기 문서 업데이트 (인앱 실시간 감시용)
    const nudgeDocRef = doc(db, "daily_questions", "_latest_nudge");
    await setDoc(nudgeDocRef, {
      id: Date.now().toString(),
      senderUid: user.uid,
      senderName: myName,
      receiverUid: partner.uid,
      type: currentNudgeType,
      message: finalMessage,
      pokeIndex: pokeResult.usedCount,
      timestamp: Date.now(),
    }, { merge: true });

    // 3. 발신자 완료 피드백 토스트
    showToastNotification(
      `${partner.name}님을 콕! 찔렀어요 👉 (남은 찌르기: ${pokeResult.remaining}회)`,
      "👉"
    );

    // 모달 닫기
    if (selectModalEl) {
      selectModalEl.hidden = true;
      document.body.classList.remove("modal-open");
    }
  } catch (err) {
    console.error("[nudge] 찌르기 저장 오류:", err);
    showError("콕 찌르기를 보내지 못했습니다: " + err.message);
  } finally {
    updateAllNudgeBadges();
  }
}

/**
 * 인앱 수신 감시: 상대방이 찌른 순간 실시간 듀오 화면 지진 효과 & 팝업 띄우기
 */
function listenIncomingNudges() {
  if (unsubscribeNudges) {
    unsubscribeNudges();
    unsubscribeNudges = null;
  }

  const nudgeDocRef = doc(db, "daily_questions", "_latest_nudge");
  unsubscribeNudges = onSnapshot(nudgeDocRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const currentUser = getCurrentUser();
    if (!currentUser || !data) return;

    // 내가 받은 찌르기인지 확인
    if (data.receiverUid !== currentUser.uid) return;

    // 중복 팝업 방지 (마지막으로 본 타임스탬프와 비교)
    let lastSeen = 0;
    try {
      lastSeen = Number(localStorage.getItem(STORAGE_KEY_LAST_SEEN)) || 0;
    } catch (e) {}

    const nudgeTime = Number(data.timestamp) || 0;
    // 앱 접속 직후 과거 찌르기(1분 초과)에 무한 팝업 방지
    const now = Date.now();
    if (nudgeTime <= lastSeen || now - nudgeTime > 60 * 1000) {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY_LAST_SEEN, String(nudgeTime));
    } catch (e) {}

    // 1. 듀오링고 감성 화면 지진(Shake) 효과!
    document.body.classList.remove("duo-shake");
    void document.body.offsetWidth; // reflow
    document.body.classList.add("duo-shake");
    setTimeout(() => {
      document.body.classList.remove("duo-shake");
    }, 700);

    // 2. 콕 찔림 수신 팝업 오픈
    showReceivedNudgeModal(data);
  }, (err) => {
    console.warn("[nudge] 찌르기 리스너 경고:", err);
  });
}

/**
 * 콕 찔림 수신 모달 띄우기
 */
function showReceivedNudgeModal(data) {
  if (!rxModalEl) return;

  const senderName = data.senderName || "상대방";
  const pokeIndex = data.pokeIndex || 1;
  const message = data.message || "나를 콕! 찔렀어요!";
  const type = data.type || "free";

  if (rxSenderNameEl) rxSenderNameEl.textContent = senderName;
  if (rxPokeIndexEl) rxPokeIndexEl.textContent = `오늘 ${pokeIndex}번째 콕! ⚡`;
  if (rxMessageTextEl) rxMessageTextEl.textContent = `"${message}"`;

  const meta = SITUATION_META[type] || SITUATION_META.free;
  if (rxActionBtn) {
    rxActionBtn.textContent = meta.actionLabel;
    rxActionBtn.onclick = () => {
      rxModalEl.hidden = true;
      document.body.classList.remove("modal-open");

      if (type === "question") {
        switchViewTab("question");
        setTimeout(() => {
          document.getElementById("dq-my-input")?.focus();
        }, 300);
      } else if (type === "diary") {
        switchViewTab("feed");
        setTimeout(() => {
          document.getElementById("title-input")?.focus();
        }, 300);
      } else {
        // 맞찌르기!
        openNudgeModal("free");
      }
    };
  }

  rxModalEl.hidden = false;
  document.body.classList.add("modal-open");
}

/**
 * 일기 목록 변경 시 오늘 일기 재촉 배너 상태 갱신
 */
export function updateDiaryNudgeStatus(entries = cachedEntries) {
  cachedEntries = entries;
  if (!diaryNudgeBanner) return;

  const user = getCurrentUser();
  const partner = getPartnerInfo();
  if (!user || !partner.uid) {
    diaryNudgeBanner.hidden = true;
    return;
  }

  if (diaryNudgePartnerName) {
    diaryNudgePartnerName.textContent = partner.name;
  }

  // 오늘 00:00:00 타임스탬프
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // 상대방이 오늘 쓴 일기가 있는지 검사
  const partnerWroteToday = (entries || []).some(
    (e) => (e.uid === partner.uid || e.authorUid === partner.uid) && Number(e.createdAt) >= todayStart
  );

  // 오늘 상대방 일기가 없으면 배너 노출, 있으면 숨김
  diaryNudgeBanner.hidden = partnerWroteToday;
  updateAllNudgeBadges();
}

/**
 * 콕 찌르기 모듈 전체 초기화 및 이벤트 바인딩
 */
export function initNudge() {
  // DOM 요소 매핑
  freeNudgeBtn = document.getElementById("free-nudge-btn");
  freeNudgeBadge = document.getElementById("free-nudge-quota-badge");
  dqNudgeBtn = document.getElementById("dq-nudge-btn");
  dqNudgeBadge = document.getElementById("dq-nudge-quota-badge");
  diaryNudgeBanner = document.getElementById("diary-nudge-banner");
  diaryNudgeBtn = document.getElementById("diary-nudge-btn");
  diaryNudgeBadge = document.getElementById("diary-nudge-quota-badge");
  diaryNudgePartnerName = document.getElementById("diary-nudge-partner-name");

  // 발송 모달
  selectModalEl = document.getElementById("nudge-select-modal");
  selectModalCloseBtn = document.getElementById("nudge-modal-close-btn");
  modalIconEl = document.getElementById("nudge-modal-icon");
  modalTitleEl = document.getElementById("nudge-modal-title");
  quotaCountTextEl = document.getElementById("nudge-quota-count-text");
  quotaBarEl = document.getElementById("nudge-quota-bar");
  cooldownTextEl = document.getElementById("nudge-cooldown-text");
  randomBtn = document.getElementById("nudge-random-btn");
  presetListEl = document.getElementById("nudge-preset-list");
  customInputEl = document.getElementById("nudge-custom-input");
  sendSubmitBtn = document.getElementById("nudge-send-submit-btn");
  submitBtnTextEl = document.getElementById("nudge-submit-btn-text");

  // 수신 모달
  rxModalEl = document.getElementById("nudge-received-modal");
  rxSenderNameEl = document.getElementById("nudge-rx-sender-name");
  rxPokeIndexEl = document.getElementById("nudge-rx-poke-index");
  rxMessageTextEl = document.getElementById("nudge-rx-message-text");
  rxActionBtn = document.getElementById("nudge-rx-action-btn");
  rxDismissBtn = document.getElementById("nudge-rx-dismiss-btn");

  // 이벤트 배선 1: 자유 콕 찌르기 버튼
  if (freeNudgeBtn) {
    freeNudgeBtn.addEventListener("click", () => openNudgeModal("free"));
  }

  // 이벤트 배선 2: 질문 재촉 버튼
  if (dqNudgeBtn) {
    dqNudgeBtn.addEventListener("click", () => openNudgeModal("question"));
  }

  // 이벤트 배선 3: 일기 재촉 버튼
  if (diaryNudgeBtn) {
    diaryNudgeBtn.addEventListener("click", () => openNudgeModal("diary"));
  }

  // 발송 모달 닫기
  if (selectModalCloseBtn && selectModalEl) {
    selectModalCloseBtn.addEventListener("click", () => {
      selectModalEl.hidden = true;
      document.body.classList.remove("modal-open");
    });
    selectModalEl.addEventListener("click", (e) => {
      if (e.target === selectModalEl) {
        selectModalEl.hidden = true;
        document.body.classList.remove("modal-open");
      }
    });
  }

  // 랜덤 멘트 버튼
  if (randomBtn) {
    randomBtn.addEventListener("click", pickRandomMessage);
  }

  // 직접 입력창 활성화 시 프리셋 선택 해제
  if (customInputEl) {
    customInputEl.addEventListener("input", () => {
      if (customInputEl.value.trim() && presetListEl) {
        presetListEl.querySelectorAll(".nudge-preset-item").forEach((el) => el.classList.remove("active"));
      }
    });
  }

  // 발송 버튼 클릭
  if (sendSubmitBtn) {
    sendSubmitBtn.addEventListener("click", handleSendNudge);
  }

  // 수신 모달 닫기
  if (rxDismissBtn && rxModalEl) {
    rxDismissBtn.addEventListener("click", () => {
      rxModalEl.hidden = true;
      document.body.classList.remove("modal-open");
    });
    rxModalEl.addEventListener("click", (e) => {
      if (e.target === rxModalEl) {
        rxModalEl.hidden = true;
        document.body.classList.remove("modal-open");
      }
    });
  }

  // 10초마다 쿨타임 실시간 감소 갱신 타이머
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    updateAllNudgeBadges();
  }, 10000);

  updateAllNudgeBadges();
  listenIncomingNudges();
}
