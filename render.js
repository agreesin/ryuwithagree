// =========================================================
// render.js - 일기 목록 전체 렌더링 모듈 (좌우 2분할)
// Firestore 일기 목록을 받아 작성자별로 분류하여 화면에 렌더링합니다.
// =========================================================

import { hideError } from "./ui.js";
import { createEntryCard } from "./entry-card.js";
import { getCurrentUser } from "./state.js";

const emptyMessage = document.getElementById("empty-message");
const othersList = document.getElementById("others-entry-list");
const myList = document.getElementById("my-entry-list");
const othersEmpty = document.getElementById("others-empty");
const myEmpty = document.getElementById("my-empty");
const othersCount = document.getElementById("others-count");
const myCount = document.getElementById("my-count");

/**
 * 일기 목록 전체를 작성자(친구 vs 나)에 따라 좌우 2분할 렌더링합니다.
 * @param {Array<Object>} entries - Firestore 일기 문서 목록
 */
export function render(entries) {
  hideError();

  if (othersList) othersList.innerHTML = "";
  if (myList) myList.innerHTML = "";

  const currentUser = getCurrentUser();
  let othersCountNum = 0;
  let myCountNum = 0;

  for (const entry of entries) {
    // 내가 쓴 글인지 확인 (uid 일치 또는 작성자 이름 일치)
    const isMyEntry = currentUser && (
      (entry.uid && entry.uid === currentUser.uid) ||
      (entry.author && currentUser.displayName && entry.author === currentUser.displayName)
    );

    const card = createEntryCard(entry);

    if (isMyEntry) {
      if (myList) myList.appendChild(card);
      myCountNum++;
    } else {
      if (othersList) othersList.appendChild(card);
      othersCountNum++;
    }
  }

  // 전체 및 컬럼별 상태 갱신
  if (emptyMessage) emptyMessage.hidden = entries.length > 0;
  if (othersCount) othersCount.textContent = String(othersCountNum);
  if (myCount) myCount.textContent = String(myCountNum);
  if (othersEmpty) othersEmpty.hidden = othersCountNum > 0;
  if (myEmpty) myEmpty.hidden = myCountNum > 0;
}
