// =========================================================
// store.js - 로그인 · 저장 · 공유 담당 (배관)
//
// ★ 실습 당일 이 파일은 아무도 건드리지 않습니다.
// ★ AI에게 이 파일을 수정하라고 시키지 마십시오.
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore,
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
const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
});
const db = getFirestore(app);

// app, auth, db 내보내기
export { app, auth, db };

// 일기가 쌓이는 곳의 이름
const entriesRef = collection(db, "entries");
// 사용자 프로필(이름)이 쌓이는 곳의 이름
const profilesRef = collection(db, "profiles");
// 공지사항이 쌓이는 곳의 이름
const noticesRef = collection(db, "notices");
// FCM 기기 푸시 토큰이 쌓이는 곳의 이름
const fcmTokensRef = collection(db, "fcm_tokens");

// 캐시된 프로필 목록 { uid: displayName }
let cachedProfiles = {};

// =========================================================
// FCM 푸시 토큰 관리
// =========================================================

/**
 * 사용자의 FCM 푸시 토큰을 Firestore fcm_tokens 컬렉션에 저장합니다.
 */
export async function saveUserFcmToken(uid, token, email = "") {
  if (!uid || !token) return;
  try {
    const tokenDocRef = doc(db, "fcm_tokens", uid);
    await setDoc(
      tokenDocRef,
      {
        token,
        email: email || "",
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    console.log("[store] FCM 토큰 Firestore 저장 완료:", uid);
  } catch (err) {
    console.warn("[store] FCM 토큰 저장 오류:", err);
  }
}

/**
 * 상대방의 FCM 푸시 토큰 목록을 조회합니다 (내 UID 제외).
 */
export async function getPartnerFcmTokens(myUid) {
  try {
    const snapshot = await getDocs(fcmTokensRef);
    const tokens = [];
    snapshot.forEach((docSnap) => {
      if (docSnap.id !== myUid) {
        const data = docSnap.data();
        if (data.token) {
          tokens.push(data.token);
        }
      }
    });
    return tokens;
  } catch (err) {
    console.warn("[store] 상대방 FCM 토큰 조회 오류:", err);
    return [];
  }
}

/**
 * 모든 등록된 사용자의 FCM 푸시 토큰 목록을 조회합니다 (테스트용).
 */
export async function getAllFcmTokens() {
  try {
    const snapshot = await getDocs(fcmTokensRef);
    const tokens = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.token && !tokens.includes(data.token)) {
        tokens.push(data.token);
      }
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

// 모든 사용자 프로필을 실시간으로 감시한다.
export function subscribeProfiles(onChange) {
  return onSnapshot(profilesRef, (snapshot) => {
    const profiles = {};
    snapshot.forEach((d) => {
      profiles[d.id] = d.data().displayName;
    });
    cachedProfiles = profiles;
    if (onChange) onChange(profiles);
  });
}

// 로그인 시 프로필 생성 및 동기화
export async function syncUserProfile(user) {
  if (!user) return;
  const userDoc = doc(db, "profiles", user.uid);
  const snap = await getDoc(userDoc);
  if (!snap.exists()) {
    const initialName = user.displayName || "이름 없음";
    await setDoc(userDoc, {
      displayName: initialName,
      email: user.email || "",
      updatedAt: Date.now(),
    });
    cachedProfiles[user.uid] = initialName;
  } else {
    cachedProfiles[user.uid] = snap.data().displayName || user.displayName || "이름 없음";
  }
}

// 특정 사용자(본인 또는 상대방)의 이름 자체를 변경한다.
export async function setUserDisplayName(targetUid, newName) {
  if (!targetUid || !newName) return;

  // 1. 프로필 컬렉션에 새 이름 저장
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

  // 2. 해당 사용자가 작성한 모든 글(entries)의 작성자명을 일괄 변경
  try {
    const q = query(entriesRef, where("uid", "==", targetUid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.forEach((d) => {
        batch.update(d.ref, { author: newName });
      });
      await batch.commit();
    }
  } catch (err) {
    console.error("[store] 글 일괄 업데이트 오류:", err);
  }
}

// =========================================================
// 로그인
// =========================================================

// 로그인 상태가 바뀔 때마다 onChange(user)가 실행된다.
// 로그인 상태면 user 객체, 아니면 null 이 들어온다.
export function watchLogin(onChange) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      await syncUserProfile(user);
    }
    onChange(user);
  });
}

/**
 * 리다이렉트 로그인 결과 확인 (PWA 환경)
 */
export async function checkRedirectLogin() {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      await syncUserProfile(result.user);
    }
    return result?.user || null;
  } catch (err) {
    console.warn("[store] Redirect 로그인 결과 확인:", err);
    return null;
  }
}

export async function login() {
  const provider = new GoogleAuthProvider();
  // 모바일(iOS/Android) 또는 홈 화면(PWA standalone) 앱은 팝업 창이 차단되므로 100% redirect 사용
  const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined" && (
    window.navigator.standalone ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
  );

  if (isMobile || isStandalone) {
    return signInWithRedirect(auth, provider);
  }

  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    console.warn("[store] 팝업 실패 -> signInWithRedirect 로 자동 전환:", err);
    return signInWithRedirect(auth, provider);
  }
}

export function logout() {
  return signOut(auth);
}

// =========================================================
// 일기
// =========================================================

// 목록을 계속 지켜본다.
// 누가 어디서 쓰든, 바뀌는 즉시 onChange가 실행된다.
// 반환값을 나중에 함수로 실행하면 지켜보기를 멈춘다.
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

// 일기 한 개를 저장한다. 작성자는 프로필 또는 로그인 정보에서 자동으로 붙는다.
export async function addEntry({ title, body, image, mood }) {
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

  // 오늘의 기분이 선택되었을 때만 mood 필드 추가
  if (mood) {
    entryData.mood = mood;
  }

  // 그림이 있을 때만 image 필드 추가 (null은 저장하지 않음)
  if (image) {
    entryData.image = image;
  }

  await addDoc(entriesRef, entryData);
}

// 일기 한 개를 지운다.
export async function removeEntry(id) {
  await deleteDoc(doc(db, "entries", id));
}

// 댓글(또는 답글) 한 개를 추가한다.
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

  // 대댓글인 경우 부모 댓글 id 기록
  if (parentId) {
    comment.parentId = parentId;
  }

  const entryRef = doc(db, "entries", entryId);
  await updateDoc(entryRef, {
    comments: arrayUnion(comment),
  });
}

// 댓글(또는 답글) 내용을 수정한다.
export async function updateComment(entryId, commentId, newText) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const entryRef = doc(db, "entries", entryId);
  const snap = await getDoc(entryRef);
  if (snap.exists()) {
    const data = snap.data();
    const updatedComments = (data.comments || []).map((c) => {
      if (c.id === commentId) {
        return { ...c, text: newText, updatedAt: Date.now() };
      }
      return c;
    });
    await updateDoc(entryRef, {
      comments: updatedComments,
    });
  }
}

// 댓글(또는 답글)을 삭제한다. (부모 댓글 삭제 시 연결된 답글도 함께 삭제)
export async function removeComment(entryId, commentId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const entryRef = doc(db, "entries", entryId);
  const snap = await getDoc(entryRef);
  if (snap.exists()) {
    const data = snap.data();
    const updatedComments = (data.comments || []).filter(
      (c) => c.id !== commentId && c.parentId !== commentId
    );
    await updateDoc(entryRef, {
      comments: updatedComments,
    });
  }
}

// 일기 작성자 이름을 개별 변경한다.
export async function updateEntryAuthor(id, newAuthor) {
  await updateDoc(doc(db, "entries", id), {
    author: newAuthor,
  });
}

// 댓글 작성자 이름을 개별 변경한다.
export async function updateCommentAuthor(entryId, commentId, newAuthor) {
  const entryRef = doc(db, "entries", entryId);
  const snap = await getDoc(entryRef);
  if (snap.exists()) {
    const data = snap.data();
    const updatedComments = (data.comments || []).map((c) => {
      if (c.id === commentId) {
        return { ...c, author: newAuthor };
      }
      return c;
    });
    await updateDoc(entryRef, {
      comments: updatedComments,
    });
  }
}

// =========================================================
// 공지사항 (Notices)
// =========================================================

// 공지사항 목록을 실시간으로 감시한다.
export function subscribeNotices(onChange, onError) {
  const q = query(noticesRef, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    async (snapshot) => {
      // 공지가 하나도 없는 경우 기본 공지 자동 생성
      if (snapshot.empty) {
        try {
          await addDoc(noticesRef, {
            text: "만약 여기까지 들어왔더라도\n제발 비밀로 해주시고 조용히 나가주세요",
            author: "다이어리",
            uid: "system",
            createdAt: Date.now(),
          });
          return; // 생성 후 다음 스냅샷에서 전달
        } catch (e) {
          console.warn("[store] 기본 공지 자동 생성 건너뜀 (비로그인 상태 등):", e.message);
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

// 새 공지사항을 추가한다.
export async function addNotice(text) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const authorName = cachedProfiles[user.uid] || user.displayName || "이름 없음";

  await addDoc(noticesRef, {
    text: text,
    author: authorName,
    uid: user.uid,
    createdAt: Date.now(),
  });
}

// 공지사항을 수정한다.
export async function updateNotice(id, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const noticeRef = doc(db, "notices", id);
  await updateDoc(noticeRef, {
    text: text,
    updatedAt: Date.now(),
  });
}

// 공지사항을 삭제한다.
export async function removeNotice(id) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  await deleteDoc(doc(db, "notices", id));
}

// =========================================================
// 공감 리액션 (Reactions)
// =========================================================

// 일기에 이모지 리액션을 토글(추가/취소)한다.
export async function toggleReaction(entryId, emoji) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const entryRef = doc(db, "entries", entryId);
  const snap = await getDoc(entryRef);
  if (!snap.exists()) return null;

  const data = snap.data();
  const reactions = data.reactions || {};
  const currentUids = reactions[emoji] || [];

  let nextUids;
  let isAdded = false;
  if (currentUids.includes(user.uid)) {
    nextUids = currentUids.filter((uid) => uid !== user.uid);
  } else {
    nextUids = [...currentUids, user.uid];
    isAdded = true;
  }

  const newReactions = { ...reactions, [emoji]: nextUids };
  await updateDoc(entryRef, { reactions: newReactions });
  return { isAdded, emoji, author: data.author, uid: data.uid };
}

// =========================================================
// 디데이 (D-Day) 설정 관리
// =========================================================

const metaRef = doc(db, "profiles", "app_meta_dday");

// 디데이 설정을 실시간 구독한다.
export function subscribeDday(onChange) {
  return onSnapshot(metaRef, (snapshot) => {
    if (snapshot.exists()) {
      onChange(snapshot.data());
    } else {
      onChange(null);
    }
  });
}

// 디데이 설정을 저장한다.
export async function saveDdayConfig(configData) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  await setDoc(metaRef, {
    ...configData,
    updatedAt: Date.now(),
    updatedBy: user.uid,
  });
}



