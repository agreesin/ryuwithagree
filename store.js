// =========================================================
// store.js - 로그인 · 저장 · 공유 담당 (배관)
//
// ★ 실습 당일 이 파일은 아무도 건드리지 않습니다.
// ★ AI에게 이 파일을 수정하라고 시키지 마십시오.
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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
const db = getFirestore(app);

// 일기가 쌓이는 곳의 이름
const entriesRef = collection(db, "entries");

// =========================================================
// 로그인
// =========================================================

// 로그인 상태가 바뀔 때마다 onChange(user)가 실행된다.
// 로그인 상태면 user 객체, 아니면 null 이 들어온다.
export function watchLogin(onChange) {
  return onAuthStateChanged(auth, onChange);
}

export function login() {
  return signInWithPopup(auth, new GoogleAuthProvider());
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

// 일기 한 개를 저장한다. 작성자는 로그인 정보에서 자동으로 붙는다.
export async function addEntry({ title, body }) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  await addDoc(entriesRef, {
    title: title,
    body: body,
    author: user.displayName || "이름 없음",
    uid: user.uid,
    createdAt: Date.now(),
  });
}

// 일기 한 개를 지운다.
// (지금은 app.js에서 아직 쓰이지 않음 - 실습 때 연결)
export async function removeEntry(id) {
  await deleteDoc(doc(db, "entries", id));
}

// 댓글 한 개를 추가한다.
export async function addComment(entryId, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");

  const comment = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    text: text,
    author: user.displayName || "이름 없음",
    uid: user.uid,
    createdAt: Date.now(),
  };

  const entryRef = doc(db, "entries", entryId);
  await updateDoc(entryRef, {
    comments: arrayUnion(comment),
  });
}

