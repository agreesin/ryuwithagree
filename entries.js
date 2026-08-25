// =========================================================
// entries.js - 일기 작성 및 그림판 연동 모듈
// 일기 저장, 유효성 검사, 오늘의 기분 선택 및 그림판 툴바 이벤트 배선을 담당합니다.
// =========================================================

import { addEntry } from "./store.js";
import {
  initCanvas,
  setMode,
  setColor,
  setLineWidth,
  undo,
  clearCanvas,
  resetCanvas,
  hasDrawing,
  exportImage,
} from "./draw.js";
import { showError } from "./ui.js";
import { sendPushToPartner } from "./notify.js";
import { getCurrentUser, getCurrentProfiles } from "./state.js";

// 입력 요소
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const saveButton = document.getElementById("save-button");
const moodBtns = document.querySelectorAll(".mood-btn");

// 그림판 화면 요소
const drawToggleBtn = document.getElementById("draw-toggle-btn");
const drawingContainer = document.getElementById("drawing-container");
const drawingCanvas = document.getElementById("drawing-canvas");

// 툴바 도구 버튼들
const toolPenBtn = document.getElementById("tool-pen");
const toolEraserBtn = document.getElementById("tool-eraser");
const toolColorPicker = document.getElementById("tool-color-picker");
const colorChips = document.querySelectorAll(".color-chip");
const sizeBtns = document.querySelectorAll(".size-btn");
const toolUndoBtn = document.getElementById("tool-undo");
const toolClearBtn = document.getElementById("tool-clear");

// 내부 상태 (선택된 오늘의 기분)
let selectedMood = null;

/**
 * 일기 저장 핸들러
 */
async function onSave() {
  let title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  const isDrawn = hasDrawing();

  // 제목, 본문, 그림이 전부 비어 있을 때만 저장을 차단
  if (title === "" && body === "" && !isDrawn) {
    alert("본문 또는 그림을 입력하세요.");
    bodyInput.focus();
    return;
  }

  // 제목이 비어있으면 "M/D 오늘의 일기"로 자동 완성
  if (!title) {
    const now = new Date();
    title = `${now.getMonth() + 1}/${now.getDate()} 오늘의 일기`;
  }

  saveButton.disabled = true;

  try {
    let image = null;
    if (isDrawn) {
      image = exportImage();
    }

    await addEntry({ title, body, image, mood: selectedMood });

    // 상대방에게 백그라운드 웹 푸시 발송 시도
    sendPushToPartner({
      title: "📖 류이어리 새 일기",
      message: `당신의 반쪽이 새 일기를 남겼습니다: "${title}"`,
    });

    // 입력 필드, 기분 선택 및 그림판 초기화
    titleInput.value = "";
    bodyInput.value = "";
    selectedMood = null;
    moodBtns.forEach((btn) => btn.classList.remove("active"));
    resetCanvas();
    if (drawingContainer) {
      drawingContainer.hidden = true;
    }
    if (drawToggleBtn) {
      drawToggleBtn.textContent = "🎨 그림 그리기";
    }
    titleInput.focus();
  } catch (error) {
    console.error(error);
    showError("저장하지 못했습니다: " + error.message);
  } finally {
    saveButton.disabled = false;
  }
}

/**
 * 에디터 및 그림판 이벤트 리스너를 초기화합니다.
 */
export function initEditor() {
  // 오늘의 기분 선택 버튼 이벤트 배선
  moodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mood = btn.dataset.mood;
      if (selectedMood === mood) {
        // 이미 선택된 기분을 다시 누르면 선택 해제
        selectedMood = null;
        btn.classList.remove("active");
      } else {
        selectedMood = mood;
        moodBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      }
    });
  });

  // 그림판 캔버스 초기화
  if (drawingCanvas) {
    initCanvas(drawingCanvas);
  }

  // 그림판 토글 버튼
  if (drawToggleBtn && drawingContainer) {
    drawToggleBtn.addEventListener("click", () => {
      const isHidden = drawingContainer.hidden;
      drawingContainer.hidden = !isHidden;
      drawToggleBtn.textContent = isHidden ? "🎨 그림 접기" : "🎨 그림 그리기";
    });
  }

  // 펜 모드 버튼
  if (toolPenBtn) {
    toolPenBtn.addEventListener("click", () => {
      setMode("pen");
      toolPenBtn.classList.add("active");
      if (toolEraserBtn) toolEraserBtn.classList.remove("active");
    });
  }

  // 지우개 모드 버튼
  if (toolEraserBtn) {
    toolEraserBtn.addEventListener("click", () => {
      setMode("eraser");
      toolEraserBtn.classList.add("active");
      if (toolPenBtn) toolPenBtn.classList.remove("active");
    });
  }

  // 컬러 피커
  if (toolColorPicker) {
    toolColorPicker.addEventListener("input", (e) => {
      setColor(e.target.value);
      if (toolPenBtn) toolPenBtn.classList.add("active");
      if (toolEraserBtn) toolEraserBtn.classList.remove("active");
      colorChips.forEach((chip) => chip.classList.remove("active"));
    });
  }

  // 프리셋 컬러 칩
  colorChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const color = chip.dataset.color;
      setColor(color);
      if (toolColorPicker) toolColorPicker.value = color;
      if (toolPenBtn) toolPenBtn.classList.add("active");
      if (toolEraserBtn) toolEraserBtn.classList.remove("active");
      colorChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  // 굵기 버튼 (3단계)
  sizeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const size = Number(btn.dataset.size);
      setLineWidth(size);
      sizeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // 실행취소(Undo)
  if (toolUndoBtn) {
    toolUndoBtn.addEventListener("click", () => {
      undo();
    });
  }

  // 전체 지우기
  if (toolClearBtn) {
    toolClearBtn.addEventListener("click", () => {
      if (confirm("그림을 모두 지우시겠습니까?")) {
        clearCanvas();
      }
    });
  }

  // 저장 버튼
  if (saveButton) {
    saveButton.addEventListener("click", onSave);
  }
}
