// =========================================================
// store.js - 저장·공유 담당 (배관)
//
// ★ 실습 당일 이 파일은 아무도 건드리지 않습니다.
// ★ AI에게 이 파일을 수정하라고 시키지 마십시오.
//
// 하는 일: 일기를 Firestore에 저장하고, 바뀌면 즉시 알려줌
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
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
const db = getFirestore(app);

// 일기가 쌓이는 곳의 이름
const entriesRef = collection(db, "entries");

// ---------------------------------------------------------
// 일기 목록을 계속 지켜본다.
// 누가 어디서 쓰든, 바뀌는 즉시 onChange가 실행된다.
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 일기 한 개를 저장한다.
// ---------------------------------------------------------
export async function addEntry({ title, body, author }) {
  await addDoc(entriesRef, {
    title: title,
    body: body,
    author: author,
    createdAt: Date.now(),
  });
}

// ---------------------------------------------------------
// 일기 한 개를 지운다.
// (지금은 app.js에서 아직 쓰이지 않음 - 실습 때 연결)
// ---------------------------------------------------------
export async function removeEntry(id) {
  await deleteDoc(doc(db, "entries", id));
}
