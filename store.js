// =========================================================
// store.js - Firebase Auth 및 Firestore 데이터 관리 모듈
// 일기, 댓글, 리액션, D-Day, 커플 문답, FCM 토큰 CRUD 및 실시간 구독
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { sortCompletedQuestionsDescending } from "./questions.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  arrayUnion,
  getDoc,
  setDoc,
  getDocs,
  where,
  writeBatch,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJ_xp-Ahc4NbzPRPqdCd57E1Ai0Xjn7Ro",
  authDomain: "ryuwithagree.firebaseapp.com",
  projectId: "ryuwithagree",
  storageBucket: "ryuwithagree.firebasestorage.app",
  messagingSenderId: "843802806582",
  appId: "1:843802806582:web:fd8702bf1dd0d385d98b97",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// iOS PWA 및 사파리 탭 전환 충돌(database is closing) 방지를 위한 멀티탭 매니저 초기화
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  console.warn("[store] Firestore 기본 인스턴스로 폴백:", e);
  db = getFirestore(app);
}

export { app, auth, db };

const entriesRef = collection(db, "entries");
const profilesRef = collection(db, "profiles");
const noticesRef = collection(db, "notices");
const fcmTokensRef = collection(db, "fcm_tokens");

// 프로필 컬렉션 내 시스템 메타 문서 ID (사용자 프로필 목록에서 제외)
const SYSTEM_PROFILE_DOC_IDS = new Set(["app_meta_dday"]);

let cachedProfiles = {};
let cachedProfilePhotos = {};

/**
 * 오프라인 환경에서 Firestore 영구 로컬 캐시 쓰기가 서버 ACK를 무한 대기하지 않도록 처리합니다.
 * - 온라인: 서버 응답까지 정상 대기
 * - 오프라인: 로컬 캐시에 기록된 직후 UI가 멈추지 않도록 즉시 반환 (연결 시 자동 동기화)
 */
async function commitWrite(promise) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    promise.catch((err) => {
      console.warn("[store] 오프라인 지연 동기화 경고:", err);
    });
    await new Promise((r) => setTimeout(r, 80));
    return { queuedOffline: true };
  }
  await promise;
  return { queuedOffline: false };
}

function extractTokensFromDoc(data) {
  const result = [];
  if (!data) return result;
  if (Array.isArray(data.tokens)) {
    data.tokens.forEach((t) => {
      if (t && !result.includes(t)) result.push(t);
    });
  }
  if (data.token && !result.includes(data.token)) {
    result.push(data.token);
  }
  return result;
}

// =========================================================
// FCM 푸시 토큰 관리 (멀티 기기 지원)
// =========================================================

/**
 * 사용자의 FCM 푸시 토큰을 Firestore fcm_tokens 컬렉션에 저장합니다.
 * 기존 token 필드(하위 호환)와 tokens 배열(멀티 기기)을 함께 유지합니다.
 */
export async function saveUserFcmToken(uid, token, email = "") {
  if (!uid || !token) return;
  try {
    const tokenDocRef = doc(db, "fcm_tokens", uid);
    await setDoc(
      tokenDocRef,
      {
        token,
        tokens: arrayUnion(token),
        email: email || "",
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("[store] FCM 토큰 저장 오류:", err);
  }
}

/**
 * 상대방의 FCM 푸시 토큰 목록을 조회합니다 (내 UID 제외, 멀티 기기 중복 제거).
 */
export async function getPartnerFcmTokens(myUid) {
  try {
    const snapshot = await getDocs(fcmTokensRef);
    const tokens = [];
    snapshot.forEach((docSnap) => {
      if (docSnap.id !== myUid) {
        extractTokensFromDoc(docSnap.data()).forEach((t) => {
          if (!tokens.includes(t)) tokens.push(t);
        });
      }
    });
    return tokens;
  } catch (err) {
    console.warn("[store] 상대방 FCM 토큰 조회 오류:", err);
    return [];
  }
}

/**
 * 현재 로그인한 본인 기기들의 FCM 푸시 토큰 목록만 조회합니다 (자가 진단 테스트용).
 */
export async function getMyFcmTokens(myUid) {
  if (!myUid) return [];
  try {
    const snap = await getDoc(doc(db, "fcm_tokens", myUid));
    if (!snap.exists()) return [];
    return extractTokensFromDoc(snap.data());
  } catch (err) {
    console.warn("[store] 내 FCM 토큰 조회 오류:", err);
    return [];
  }
}

/**
 * 모든 등록된 사용자의 FCM 푸시 토큰 목록을 조회합니다.
 */
export async function getAllFcmTokens() {
  try {
    const snapshot = await getDocs(fcmTokensRef);
    const tokens = [];
    snapshot.forEach((docSnap) => {
      extractTokensFromDoc(docSnap.data()).forEach((t) => {
        if (!tokens.includes(t)) tokens.push(t);
      });
    });
    return tokens;
  } catch (err) {
    console.warn("[store] 전체 FCM 토큰 조회 오류:", err);
    return [];
  }
}

// =========================================================
// 프로필 관리 (모든 사용자 이름 실시간 동기화)
// =========================================================

export function subscribeProfiles(onChange) {
  return onSnapshot(profilesRef, (snapshot) => {
    const profiles = {};
    const profilePhotos = {};
    snapshot.forEach((d) => {
      // D-Day 메타데이터 문서 등 시스템 문서는 사용자 프로필에서 제외
      if (SYSTEM_PROFILE_DOC_IDS.has(d.id)) return;
      const data = d.data();
      profiles[d.id] = data.displayName || "";
      profilePhotos[d.id] = data.photoURL || null;
    });
    cachedProfiles = profiles;
    cachedProfilePhotos = profilePhotos;
    if (onChange) onChange(profiles, profilePhotos);
  });
}

export async function syncUserProfile(user) {
  if (!user) return;
  try {
    const userDoc = doc(db, "profiles", user.uid);
    const snap = await getDoc(userDoc);
    if (!snap.exists()) {
      const initialName = user.displayName || "이름 없음";
      const initialPhoto = user.photoURL || null;
      await setDoc(userDoc, {
        displayName: initialName,
        email: user.email || "",
        photoURL: initialPhoto,
        updatedAt: Date.now(),
      });
      cachedProfiles[user.uid] = initialName;
      cachedProfilePhotos[user.uid] = initialPhoto;
    } else {
      const data = snap.data();
      cachedProfiles[user.uid] = data.displayName || user.displayName || "이름 없음";
      cachedProfilePhotos[user.uid] = data.photoURL || null;
    }
  } catch (err) {
    console.warn("[store] syncUserProfile 안전 처리:", err);
    if (user.displayName) {
      cachedProfiles[user.uid] = user.displayName;
    }
    if (user.photoURL) {
      cachedProfilePhotos[user.uid] = user.photoURL;
    }
  }
}

// 특정 사용자(본인 또는 상대방)의 이름 변경 (500건 배치 한도 대응 청크 분할)
export async function setUserDisplayName(targetUid, newName) {
  if (!targetUid || !newName || SYSTEM_PROFILE_DOC_IDS.has(targetUid)) return;

  try {
    const userDoc = doc(db, "profiles", targetUid);
    await setDoc(
      userDoc,
      {
        displayName: newName,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    cachedProfiles[targetUid] = newName;
  } catch (err) {
    console.error("[store] 프로필 업데이트 오류:", err);
    throw err;
  }

  try {
    const q = query(entriesRef, where("uid", "==", targetUid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const CHUNK_SIZE = 450;
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        docs.slice(i, i + CHUNK_SIZE).forEach((d) => {
          batch.update(d.ref, { author: newName });
        });
        await batch.commit();
      }
    }
  } catch (err) {
    console.error("[store] 글 일괄 업데이트 오류:", err);
  }
}

export async function setUserProfilePhoto(targetUid, photoURL) {
  if (!targetUid || SYSTEM_PROFILE_DOC_IDS.has(targetUid)) return;

  try {
    const userDoc = doc(db, "profiles", targetUid);
    await setDoc(
      userDoc,
      {
        photoURL: photoURL || null,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    cachedProfilePhotos[targetUid] = photoURL || null;
  } catch (err) {
    console.error("[store] 프로필 사진 업데이트 오류:", err);
    throw err;
  }
}

// =========================================================
// 로그인
// =========================================================

export function watchLogin(onChange) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await syncUserProfile(user);
      } catch (e) {
        console.warn("[store] watchLogin 프로필 동기화 경고:", e);
      }
    }
    onChange(user);
  });
}

export async function consumeRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      await syncUserProfile(result.user);
    }
    return { ok: true, user: result?.user ?? null, error: null };
  } catch (err) {
    console.warn("[store] Redirect 로그인 결과 확인:", err);
    return { ok: false, user: null, error: err };
  }
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function login() {
  return loginWithGoogle();
}

export function logout() {
  return signOut(auth);
}

// =========================================================
// 일기 CRUD
// =========================================================

export function subscribeEntries(onChange, onError) {
  const q = query(entriesRef, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const entries = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      onChange(entries);
    },
    (error) => {
      console.error("[store] 목록을 읽지 못했습니다:", error);
      if (onError) onError(error);
    }
  );
}

export async function addEntry({ title, body, image, images, mood, drawingData }) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const authorName = cachedProfiles[user.uid] || user.displayName || "이름 없음";

  const entryData = {
    title: title,
    body: body,
    author: authorName,
    uid: user.uid,
    createdAt: Date.now(),
  };

  if (mood) {
    entryData.mood = mood;
  }

  const entryImages = Array.isArray(images) && images.length > 0
    ? images
    : (image ? [image] : []);

  if (entryImages.length > 0) {
    entryData.images = entryImages;
    entryData.image = entryImages[0];
  }

  if (drawingData && Array.isArray(drawingData) && drawingData.length > 0) {
    entryData.drawingData = drawingData;
  }

  return commitWrite(addDoc(entriesRef, entryData));
}

/**
 * 기존 일기의 제목, 본문, 기분, 사진/그림을 수정합니다. (기존 스키마 필드 불변성 유지)
 */
export async function updateEntry(id, { title, body, image, images, mood, drawingData }) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!id) throw new Error("수정할 일기 ID가 없습니다.");

  const entryImages = Array.isArray(images) && images.length > 0
    ? images
    : (image ? [image] : []);

  const payload = {
    title,
    body,
    mood: mood || null,
    images: entryImages,
    image: entryImages.length > 0 ? entryImages[0] : null,
    drawingData: Array.isArray(drawingData) && drawingData.length > 0 ? drawingData : null,
    updatedAt: Date.now(),
  };

  return commitWrite(updateDoc(doc(db, "entries", id), payload));
}

export async function removeEntry(id) {
  return commitWrite(deleteDoc(doc(db, "entries", id)));
}

// =========================================================
// 댓글 및 답글 (트랜잭션 기반 동시성 보호)
// =========================================================

export async function addComment(entryId, text, parentId = null) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const authorName = cachedProfiles[user.uid] || user.displayName || "이름 없음";

  const comment = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    text: text,
    author: authorName,
    uid: user.uid,
    createdAt: Date.now(),
  };

  if (parentId) {
    comment.parentId = parentId;
  }

  const entryRef = doc(db, "entries", entryId);
  return commitWrite(
    updateDoc(entryRef, {
      comments: arrayUnion(comment),
    })
  );
}

export async function updateComment(entryId, commentId, newText) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const entryRef = doc(db, "entries", entryId);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const snap = await getDoc(entryRef);
    if (!snap.exists()) return { queuedOffline: true };
    const updatedComments = (snap.data().comments || []).map((c) =>
      c.id === commentId ? { ...c, text: newText, updatedAt: Date.now() } : c
    );
    return commitWrite(updateDoc(entryRef, { comments: updatedComments }));
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(entryRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const updatedComments = (data.comments || []).map((c) => {
      if (c.id === commentId) {
        return { ...c, text: newText, updatedAt: Date.now() };
      }
      return c;
    });
    tx.update(entryRef, { comments: updatedComments });
  });
  return { queuedOffline: false };
}

export async function removeComment(entryId, commentId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const entryRef = doc(db, "entries", entryId);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const snap = await getDoc(entryRef);
    if (!snap.exists()) return { queuedOffline: true };
    const updatedComments = (snap.data().comments || []).filter(
      (c) => c.id !== commentId && c.parentId !== commentId
    );
    return commitWrite(updateDoc(entryRef, { comments: updatedComments }));
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(entryRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const updatedComments = (data.comments || []).filter(
      (c) => c.id !== commentId && c.parentId !== commentId
    );
    tx.update(entryRef, { comments: updatedComments });
  });
  return { queuedOffline: false };
}

// =========================================================
// 공지사항 (Notices)
// =========================================================

export function subscribeNotices(onChange, onError) {
  const q = query(noticesRef, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    async (snapshot) => {
      if (snapshot.empty) {
        try {
          await addDoc(noticesRef, {
            text: "만약 여기까지 들어왔더라도\n제발 비밀로 해주시고 조용히 나가주세요",
            author: "다이어리",
            uid: "system",
            createdAt: Date.now(),
          });
          return;
        } catch (e) {
          console.warn("[store] 기본 공지 자동 생성 건너뜀:", e.message);
        }
      }

      const notices = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      onChange(notices);
    },
    (error) => {
      console.error("[store] 공지사항을 읽지 못했습니다:", error);
      if (onError) onError(error);
    }
  );
}

export async function addNotice(text) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const authorName = cachedProfiles[user.uid] || user.displayName || "이름 없음";

  return commitWrite(
    addDoc(noticesRef, {
      text: text,
      author: authorName,
      uid: user.uid,
      createdAt: Date.now(),
    })
  );
}

export async function updateNotice(id, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  return commitWrite(
    updateDoc(doc(db, "notices", id), {
      text: text,
      updatedAt: Date.now(),
    })
  );
}

export async function removeNotice(id) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  return commitWrite(deleteDoc(doc(db, "notices", id)));
}

// =========================================================
// 공감 리액션 (Reactions - 트랜잭션 보호)
// =========================================================

export async function toggleReaction(entryId, emoji) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const entryRef = doc(db, "entries", entryId);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const snap = await getDoc(entryRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    const reactions = data.reactions || {};
    const currentUids = reactions[emoji] || [];
    const isAdded = !currentUids.includes(user.uid);
    const nextUids = isAdded
      ? [...currentUids, user.uid]
      : currentUids.filter((uid) => uid !== user.uid);
    await commitWrite(updateDoc(entryRef, { reactions: { ...reactions, [emoji]: nextUids } }));
    return { isAdded, emoji, author: data.author, uid: data.uid };
  }

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(entryRef);
    if (!snap.exists()) return null;

    const data = snap.data();
    const reactions = data.reactions || {};
    const currentUids = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];

    let nextUids;
    let isAdded = false;
    if (currentUids.includes(user.uid)) {
      nextUids = currentUids.filter((uid) => uid !== user.uid);
    } else {
      nextUids = [...currentUids, user.uid];
      isAdded = true;
    }

    const newReactions = { ...reactions, [emoji]: nextUids };
    tx.update(entryRef, { reactions: newReactions });
    return { isAdded, emoji, author: data.author, uid: data.uid };
  });
}

// =========================================================
// 디데이 (D-Day) 설정 관리
// =========================================================

const metaRef = doc(db, "profiles", "app_meta_dday");

export function subscribeDday(onChange) {
  return onSnapshot(metaRef, (snapshot) => {
    if (snapshot.exists()) {
      onChange(snapshot.data());
    } else {
      onChange(null);
    }
  });
}

export async function saveDdayConfig(configData) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  return commitWrite(
    setDoc(metaRef, {
      ...configData,
      updatedAt: Date.now(),
      updatedBy: user.uid,
    })
  );
}

// =========================================================
// 오늘의 커플 문답 (Daily Question) 관리
// =========================================================

export function subscribeDailyQuestion(dateStr, onChange) {
  if (!dateStr) return () => {};
  const questionDoc = doc(db, "daily_questions", dateStr);
  return onSnapshot(
    questionDoc,
    (snapshot) => {
      if (snapshot.exists()) {
        onChange(snapshot.data());
      } else {
        onChange(null);
      }
    },
    (err) => {
      console.warn("[store] 문답 구독 오류:", err);
      onChange(null);
    }
  );
}

export function subscribeAllDailyQuestions(onChange) {
  const qColl = collection(db, "daily_questions");
  return onSnapshot(
    qColl,
    (snapshot) => {
      const items = [];
      snapshot.forEach((d) => {
        if (d.id === "_question_state" || d.id === "_latest_nudge") return;
        const data = d.data();
        if (data && data.question) {
          items.push({ id: d.id, ...data });
        }
      });
      onChange(items);
    },
    (err) => {
      console.warn("[store] 전체 문답 실시간 구독 오류:", err);
    }
  );
}

export function subscribeQuestionState(onChange) {
  const stateDoc = doc(db, "daily_questions", "_question_state");
  return onSnapshot(
    stateDoc,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onChange({
          currentOrder: data.currentOrder || 1,
          completedIds: Array.isArray(data.completedIds) ? data.completedIds : [],
        });
      } else {
        const initState = { currentOrder: 1, completedIds: [], updatedAt: Date.now() };
        setDoc(stateDoc, initState, { merge: true }).catch(() => {});
        onChange(initState);
      }
    },
    (err) => {
      console.warn("[store] 문답 상태 구독 오류:", err);
      onChange({ currentOrder: 1, completedIds: [] });
    }
  );
}

export async function advanceToNextQuestion(nextOrder, completedQuestionId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const stateDoc = doc(db, "daily_questions", "_question_state");
  const targetOrder = Math.max(1, nextOrder);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const updatePayload = {
      currentOrder: targetOrder,
      updatedAt: Date.now(),
    };
    if (completedQuestionId) updatePayload.completedIds = arrayUnion(completedQuestionId);
    return commitWrite(setDoc(stateDoc, updatePayload, { merge: true }));
  }

  // 트랜잭션으로 동시 클릭 시 회차 중복 증가(스킵) 방지
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(stateDoc);
    const curData = snap.exists() ? snap.data() : { currentOrder: 1, completedIds: [] };
    const existingCompleted = Array.isArray(curData.completedIds) ? curData.completedIds : [];
    const nextCompleted =
      completedQuestionId && !existingCompleted.includes(completedQuestionId)
        ? [...existingCompleted, completedQuestionId]
        : existingCompleted;
    const resolvedOrder = Math.max(curData.currentOrder || 1, targetOrder);

    tx.set(
      stateDoc,
      {
        currentOrder: resolvedOrder,
        completedIds: nextCompleted,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  });
}

export async function loadCompletedQuestions() {
  const qColl = collection(db, "daily_questions");
  const snap = await getDocs(qColl);
  const items = [];

  snap.forEach((d) => {
    if (d.id === "_question_state" || d.id === "_latest_nudge") return;
    const data = d.data();
    if (data && data.question) {
      items.push({
        id: d.id,
        ...data,
      });
    }
  });

  return sortCompletedQuestionsDescending(items);
}

export async function saveDailyQuestionAnswer(docId, questionData, answerText) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!answerText || !answerText.trim()) throw new Error("답변을 입력해 주세요.");

  const authorName = cachedProfiles[user.uid] || user.displayName || "이름 없음";
  const questionDoc = doc(db, "daily_questions", docId);

  const answerPayload = {
    uid: user.uid,
    author: authorName,
    text: answerText.trim(),
    updatedAt: Date.now(),
  };

  let isBothAnswered = false;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const snap = await getDoc(questionDoc);
    const existingAnswers = snap.exists() ? { ...(snap.data().answers || {}) } : {};
    existingAnswers[user.uid] = answerPayload;
    isBothAnswered = Object.keys(existingAnswers).length >= 2;
    const docPayload = {
      id: docId,
      question: questionData,
      answers: existingAnswers,
      isCompleted: isBothAnswered,
      lastUpdatedAt: Date.now(),
    };
    if (isBothAnswered && !snap.data()?.completedAt) {
      docPayload.completedAt = Date.now();
    }
    await commitWrite(setDoc(questionDoc, docPayload, { merge: true }));
  } else {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(questionDoc);
      const existingData = snap.exists() ? snap.data() : {};
      const existingAnswers = { ...(existingData.answers || {}) };
      existingAnswers[user.uid] = answerPayload;
      isBothAnswered = Object.keys(existingAnswers).length >= 2;

      const docPayload = {
        id: docId,
        question: questionData,
        answers: existingAnswers,
        isCompleted: isBothAnswered,
        lastUpdatedAt: Date.now(),
      };
      if (isBothAnswered && !existingData.completedAt) {
        docPayload.completedAt = Date.now();
      }
      tx.set(questionDoc, docPayload, { merge: true });
    });
  }

  if (isBothAnswered) {
    const stateDoc = doc(db, "daily_questions", "_question_state");
    setDoc(stateDoc, { completedIds: arrayUnion(docId) }, { merge: true }).catch(() => {});
  }

  return { ...answerPayload, isBothAnswered };
}

export async function addDailyQuestionComment(dateStr, commentText) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!commentText || !commentText.trim()) throw new Error("댓글 내용을 입력해 주세요.");

  const authorName = cachedProfiles[user.uid] || user.displayName || "이름 없음";
  const questionDoc = doc(db, "daily_questions", dateStr);

  const commentObj = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    uid: user.uid,
    author: authorName,
    text: commentText.trim(),
    createdAt: Date.now(),
  };

  await commitWrite(
    setDoc(
      questionDoc,
      {
        comments: arrayUnion(commentObj),
        lastUpdatedAt: Date.now(),
      },
      { merge: true }
    )
  );

  return commentObj;
}

export async function removeDailyQuestionComment(dateStr, commentId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const questionDoc = doc(db, "daily_questions", dateStr);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const snap = await getDoc(questionDoc);
    if (!snap.exists()) return;
    const updatedComments = (snap.data().comments || []).filter(
      (c) => !(c.id === commentId && c.uid === user.uid)
    );
    await commitWrite(
      updateDoc(questionDoc, {
        comments: updatedComments,
        lastUpdatedAt: Date.now(),
      })
    );
    return;
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(questionDoc);
    if (!snap.exists()) return;
    const data = snap.data();
    const updatedComments = (data.comments || []).filter(
      (c) => !(c.id === commentId && c.uid === user.uid)
    );
    tx.update(questionDoc, {
      comments: updatedComments,
      lastUpdatedAt: Date.now(),
    });
  });
}
