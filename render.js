// =========================================================
// render.js - 일기 목록 전체 렌더링 모듈
// Firestore 일기 목록을 받아 목록 컨테이너를 비우고 카드들을 추가합니다.
// =========================================================

import { hideError } from "./ui.js";
import { createEntryCard } from "./entry-card.js";

const listElement = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");

/**
 * 일기 목록 전체를 화면에 렌더링합니다.
 * @param {Array<Object>} entries - Firestore 일기 문서 목록
 */
export function render(entries) {
  hideError();
  if (listElement) listElement.innerHTML = "";
  if (emptyMessage) emptyMessage.hidden = entries.length > 0;

  for (const entry of entries) {
    const card = createEntryCard(entry);
    if (listElement) listElement.appendChild(card);
  }
}
