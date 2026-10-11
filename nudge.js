// =========================================================
// nudge.js - 듀오링고 감성 원클릭 "콕 찌르기(Nudge)" 모듈
//
// 1. 원클릭 즉시 발송: 멘트 선택 창 없이 클릭 즉시 랜덤 멘트 발송!
// 2. 최대 5회 연속 찌르기 + 5회 소진 시 1시간 쿨타임 시스템
// 3. 듀오링고식 킹받고 재치 있는 찰진 한국어 멘트 풀
// 4. 발신자: 쫀득한 3D 버튼 바운스 & 실시간 쿼터(5/5) 차감 & 발송 멘트 토스트
// 5. 수신자: 실시간 화면 지진(Screen Shake) 효과 & 대형 팝업 모달 & 즉각 맞찌르기
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
const STORAGE_KEY_QUOTA = "diary_nudge_quota_v3";
const STORAGE_KEY_LAST_SEEN = "diary_nudge_last_seen_ts_v3";

// 듀오링고 감성 100% 위트 넘치는 현실 커플 멘트 풀 (반말+재치+이모지 꿀조합)
export const NUDGE_PRESETS = {
  // 1. 오늘의 질문 재촉 (내가 썼는데 상대방이 안 썼을 때)
  question: [
    "나 다 썼는데? 딴짓하지 말고 얼른 써라 👀",
    "답변 쓰는데 30초도 안 걸리는데 튕기는 거야? 🤨",
    "비밀 답변 잠궈놨지롱 🔒 궁금하면 빨리 써!",
    "폰 쥐고 있는 거 다 아는데? 얼른 쓰고 와라 📱⚡",
    "지금 안 쓰면 내 답변 안 보여줌 퉤 😛",
    "문답 안 쓰고 도망가면 꿀밤 3대 예약 🌰",
    "답변 쓸 사람? 손 들어 🙋‍♂️ (너 지목 중)",
    "내 답변 진짜 궁금할 텐데? 안 써? 진짜 안 써? 🧐",
    "답변 작성 쿨타임 돌았음! 얼른 출석해라 💌",
    "답변 안 쓰면 오늘 저녁 치킨 다리 2개 다 내 거 🍗",
    "읽씹 금지 🚫 오늘의 질문 창으로 당장 복귀하시죠",
    "궁금해서 현기증 나니까 1분 안에 써줘라 제발! 😵‍💫",
  ],

  // 2. 오늘 일기 재촉 (상대방이 오늘 일기 안 썼을 때)
  diary: [
    "설마 오늘 일기 안 쓰고 잘 생각은 아니지? 🛌 딱 걸림",
    "오늘 하루를 그냥 날려먹겠다고? 용납 못 함 🙅",
    "일기 스트릭 끊기면 진짜 큰일 난다? 🔥 당장 써!",
    "인스타 볼 시간은 있고 일기 쓸 1분은 없나 보네? 🧐",
    "오늘 일기 안 쓰면 내일 하루 종일 잔소리 폭격 간다 📢",
    "점 하나라도 찍고 자라 ✏️ 일기장 우는 소리 들린다",
    "기억력 믿지 마라 🧠 내일 되면 오늘 일 다 까먹음",
    "일기 안 쓰면 벌금 500원 💸 지금 바로 입금해",
    "오늘 하루 정리 안 하고 자면 꿈에 쫓아간다 👻",
    "나 일기 다 썼는데! 너만 쓰면 오늘 완벽한데! 📖✨",
    "침대에서 뒹굴거리지 말고 딱 3줄만 쓰고 자자 😴",
    "일기장 앞에서 고민하지 말고 아무 말이나 써봐 💬",
  ],

  // 3. 그냥 생각나서 콕! (평소 자유 찌르기)
  free: [
    "그냥 찔러봤어 ㅋㅋㅋ 딴 생각 말고 내 생각해라 👉",
    "심심해서 찔렀는데 불만 있냐! 😜",
    "지금 뭐 해? 딴짓하다가 찔려서 깜짝 놀랐지? 📱👀",
    "생존 확인 완료 🩺 살아있으면 반응해라 오바!",
    "답장 안 하면 5번 다 찌를 때까지 연타 갈긴다? 👉👉",
    "이 찌르기는 무료지만 리액션은 필수임 ⚡",
    "멍때리지 말고 나한테 집중해라 집중 🧘",
    "아무 이유 없이 찌르는 게 제일 꿀잼이지롱 ㅋㅋㅋ 👻",
    "할 일 없어서 찌른 거 맞음 🤷‍♀️ 놀아줘!",
    "나 지금 심심해 죽는 중 🫠 얼른 와서 놀아줘라",
    "찌르기 1스택 적립 완료! 5스택 차면 소원 들어주기 🎫",
    "툭 👈 보고 싶어서 찔렀다 왜!",
  ],
};

// 상황별 수신 모달 메타
const SITUATION_META = {
  question: {
    actionLabel: "얼른 답변 쓰러 가기 🏃💨",
  },
  diary: {
    actionLabel: "후다닥 일기 쓰러 가기 ✏️",
  },
  free: {
    actionLabel: "나도 맞찌르기! 👉💥",
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

// 수신 팝업 모달
let rxModalEl = null;
let rxSenderNameEl = null;
let rxPokeIndexEl = null;
let rxMessageTextEl = null;
let rxActionBtn = null;
let rxDismissBtn = null;

// 내부 상태
let timerInterval = null;
let unsubscribeNudges = null;
let cachedEntries = [];
let lastSentQuotes = { question: "", diary: "", free: "" };

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

  // 1. 쿨타임 만료 시 리셋
  if (state.cooldownUntil && now >= state.cooldownUntil) {
    state.count = 0;
    state.cooldownUntil = null;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {}
  }

  // 2. 쿨타임 중
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

  // 3. 정상 상태
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
 * 콕 찌르기 1회 차감 및 쿨타임 전환
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

  if (state.cooldownUntil && now >= state.cooldownUntil) {
    state.count = 0;
    state.cooldownUntil = null;
  }

  if (state.cooldownUntil && now < state.cooldownUntil) {
    const mins = Math.max(1, Math.ceil((state.cooldownUntil - now) / 60000));
    throw new Error(`5번 다 찔렀다! ${mins}분 뒤에 쿨타임 충전됨 ⏳⚡`);
  }

  state.count = (state.count || 0) + 1;
  state.lastPokeTime = now;

  // 5회 소진 시 1시간 쿨타임 시작
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
    cooldownMinutes: state.cooldownUntil ? Math.max(1, Math.ceil((state.cooldownUntil - now) / 60000)) : 0,
  };
}

/**
 * 화면의 모든 콕 찌르기 버튼 배지 갱신
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
}

/**
 * 상황별 랜덤 멘트 추출 (연속 중복 방지)
 */
function getRandomQuote(type) {
  const list = NUDGE_PRESETS[type] || NUDGE_PRESETS.free;
  if (!list || list.length === 0) return "콕!";

  const last = lastSentQuotes[type] || "";
  let available = list.filter((q) => q !== last);
  if (available.length === 0) available = list;

  const picked = available[Math.floor(Math.random() * available.length)];
  lastSentQuotes[type] = picked;
  return picked;
}

/**
 * 원클릭 즉시 콕 찌르기 발송!
 * (모달 없이 클릭 순간 랜덤 멘트가 콕! 날아감)
 * @param {"question" | "diary" | "free"} type
 * @param {HTMLElement} triggerBtn
 */
export async function triggerQuickNudge(type = "free", triggerBtn = null) {
  const partner = getPartnerInfo();
  if (!partner.uid) {
    showError("상대방 프로필이 아직 등록되지 않았습니다.");
    return;
  }

  let pokeResult = null;
  try {
    pokeResult = consumePoke();
  } catch (err) {
    showError(err.message);
    return;
  }

  // 1. 손가락 튀어오름 바운스 애니메이션
  const fingerEl = triggerBtn?.querySelector(".nudge-btn-finger");
  if (fingerEl) {
    fingerEl.classList.remove("bounce");
    void fingerEl.offsetWidth; // reflow
    fingerEl.classList.add("bounce");
  }

  // 2. 듀오링고식 찰진 랜덤 멘트 즉석 추출
  const message = getRandomQuote(type);

  try {
    const user = getCurrentUser();
    const profiles = getCurrentProfiles() || {};
    const myName = (user && profiles[user.uid]) ? profiles[user.uid] : (user?.displayName || "당신의 반쪽");

    // 3. FCM 백그라운드 웹 푸시 발송
    const pushTitle = `👉 ${myName}님이 콕! 찔렀어요! (${pokeResult.usedCount}/${MAX_NUDGES})`;
    sendPushToPartner({
      title: pushTitle,
      message: message,
    }).catch((err) => {
      console.warn("[nudge] 백그라운드 푸시 전송 경고:", err);
    });

    // 4. Firestore 최신 찌르기 업데이트 (실시간 인앱 감지)
    const nudgeDocRef = doc(db, "daily_questions", "_latest_nudge");
    await setDoc(nudgeDocRef, {
      id: Date.now().toString(),
      senderUid: user.uid,
      senderName: myName,
      receiverUid: partner.uid,
      type: type,
      message: message,
      pokeIndex: pokeResult.usedCount,
      timestamp: Date.now(),
    }, { merge: true });

    // 5. 발신자 토스트 피드백 (내가 방금 보낸 멘트 노출)
    const countInfo = pokeResult.isCoolingDown
      ? `(5번 다 찔렀다! 1시간 뒤 충전 ⏳)`
      : `(남은 찌르기: ${pokeResult.remaining}회)`;

    showToastNotification(
      `👉 "${message}" ${countInfo}`,
      "👉"
    );
  } catch (err) {
    console.error("[nudge] 찌르기 전송 오류:", err);
    showError("콕 찌르기를 보내지 못했습니다: " + err.message);
  } finally {
    updateAllNudgeBadges();
  }
}

/**
 * 인앱 수신 감시: 상대방이 찌른 순간 실시간 듀오 화면 지진 효과 & 팝업 모달
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

    if (data.receiverUid !== currentUser.uid) return;

    let lastSeen = 0;
    try {
      lastSeen = Number(localStorage.getItem(STORAGE_KEY_LAST_SEEN)) || 0;
    } catch (e) {}

    const nudgeTime = Number(data.timestamp) || 0;
    const now = Date.now();
    if (nudgeTime <= lastSeen || now - nudgeTime > 60 * 1000) {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY_LAST_SEEN, String(nudgeTime));
    } catch (e) {}

    // 1. 화면 지진(Shake) 효과!
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
 * 콕 찔림 수신 팝업 띄우기
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
        // 즉시 맞찌르기! (원클릭)
        triggerQuickNudge("free", freeNudgeBtn);
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

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const partnerWroteToday = (entries || []).some(
    (e) => (e.uid === partner.uid || e.authorUid === partner.uid) && Number(e.createdAt) >= todayStart
  );

  diaryNudgeBanner.hidden = partnerWroteToday;
  updateAllNudgeBadges();
}

/**
 * 콕 찌르기 모듈 전체 초기화 및 이벤트 바인딩
 */
export function initNudge() {
  freeNudgeBtn = document.getElementById("free-nudge-btn");
  freeNudgeBadge = document.getElementById("free-nudge-quota-badge");
  dqNudgeBtn = document.getElementById("dq-nudge-btn");
  dqNudgeBadge = document.getElementById("dq-nudge-quota-badge");
  diaryNudgeBanner = document.getElementById("diary-nudge-banner");
  diaryNudgeBtn = document.getElementById("diary-nudge-btn");
  diaryNudgeBadge = document.getElementById("diary-nudge-quota-badge");
  diaryNudgePartnerName = document.getElementById("diary-nudge-partner-name");

  rxModalEl = document.getElementById("nudge-received-modal");
  rxSenderNameEl = document.getElementById("nudge-rx-sender-name");
  rxPokeIndexEl = document.getElementById("nudge-rx-poke-index");
  rxMessageTextEl = document.getElementById("nudge-rx-message-text");
  rxActionBtn = document.getElementById("nudge-rx-action-btn");
  rxDismissBtn = document.getElementById("nudge-rx-dismiss-btn");

  // 원클릭 이벤트 배선 1: 자유 콕 찌르기
  if (freeNudgeBtn) {
    freeNudgeBtn.addEventListener("click", () => triggerQuickNudge("free", freeNudgeBtn));
  }

  // 원클릭 이벤트 배선 2: 오늘의 질문 재촉
  if (dqNudgeBtn) {
    dqNudgeBtn.addEventListener("click", () => triggerQuickNudge("question", dqNudgeBtn));
  }

  // 원클릭 이벤트 배선 3: 오늘 일기 재촉
  if (diaryNudgeBtn) {
    diaryNudgeBtn.addEventListener("click", () => triggerQuickNudge("diary", diaryNudgeBtn));
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
