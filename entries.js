// =========================================================
// entries.js - 일기 작성, 스마트 사진 압축 첨부 및 그림판 연동 모듈
// 일기 저장, 유효성 검사, 오늘의 기분 선택, 앨범 사진 자동 압축 및 그림판 툴바 이벤트 배선을 담당합니다.
// =========================================================

import { addEntry } from "./store.js?v=3.0.4";
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
} from "./draw.js?v=3.0.4";
import { showError } from "./ui.js?v=3.0.4";
import { sendPushToPartner, showToastNotification } from "./notify.js?v=3.0.4";
import { getCurrentUser, getCurrentProfiles } from "./state.js?v=3.0.4";

// 입력 요소
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const saveButton = document.getElementById("save-button");
const moodBtns = document.querySelectorAll(".mood-btn");

// 사진 첨부 화면 요소
const photoToggleBtn = document.getElementById("photo-toggle-btn");
const photoFileInput = document.getElementById("photo-file-input");
const photoPreviewWrap = document.getElementById("photo-preview-wrap");
const photoPreviewImg = document.getElementById("photo-preview-img");
const photoRemoveBtn = document.getElementById("photo-remove-btn");

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

// 내부 상태
let selectedMood = null;
let attachedPhotoData = null; // 압축된 사진 Data URL

/**
 * 이미지 파일을 브라우저 캔버스를 이용해 고압축(WebP/JPEG 0.75, 최대 960px)으로 변환합니다.
 */
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 960;
        const MAX_HEIGHT = 960;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // WebP 우선 지원, 미지원 시 JPEG 0.75 압축
        let dataUrl = canvas.toDataURL("image/webp", 0.75);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        }

        const origSizeKb = Math.round(file.size / 1024);
        const compSizeKb = Math.round(dataUrl.length * 0.75 / 1024);
        console.log(`[Photo] 스마트 압축 완료: ${origSizeKb}KB ➔ ${compSizeKb}KB (${width}x${height})`);

        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 일기 저장 핸들러
 */
async function onSave() {
  let title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  const isDrawn = hasDrawing();
  const hasPhoto = Boolean(attachedPhotoData);

  // 제목, 본문, 그림, 사진이 전부 비어 있을 때만 저장을 차단
  if (title === "" && body === "" && !isDrawn && !hasPhoto) {
    alert("본문, 사진 또는 그림을 입력하세요.");
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
    } else if (hasPhoto) {
      image = attachedPhotoData;
    }

    await addEntry({ title, body, image, mood: selectedMood });

    // 상대방에게 백그라운드 웹 푸시 발송 시도
    sendPushToPartner({
      title: "📖 류이어리 새 일기",
      message: "당신의 반쪽이 새 일기를 남겼습니다.",
    });

    // 입력 필드, 기분 선택, 사진 및 그림판 초기화
    titleInput.value = "";
    bodyInput.value = "";
    selectedMood = null;
    moodBtns.forEach((btn) => btn.classList.remove("active"));
    
    // 사진 초기화
    clearAttachedPhoto();

    // 그림판 초기화
    resetCanvas();
    if (drawingContainer) {
      drawingContainer.hidden = true;
    }
    if (drawToggleBtn) {
      drawToggleBtn.textContent = "🎨 그림 그리기";
    }

    titleInput.focus();
    showToastNotification("일기가 등록되었습니다! 💌", "📖");
  } catch (error) {
    console.error(error);
    showError("저장하지 못했습니다: " + error.message);
  } finally {
    saveButton.disabled = false;
  }
}

/**
 * 첨부된 사진 제거
 */
function clearAttachedPhoto() {
  attachedPhotoData = null;
  if (photoFileInput) photoFileInput.value = "";
  if (photoPreviewWrap) photoPreviewWrap.hidden = true;
  if (photoPreviewImg) photoPreviewImg.src = "";
}

/**
 * 에디터 및 그림판/사진 이벤트 리스너를 초기화합니다.
 */
export function initEditor() {
  // 오늘의 기분 선택 버튼 이벤트 배선
  moodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mood = btn.dataset.mood;
      if (selectedMood === mood) {
        selectedMood = null;
        btn.classList.remove("active");
      } else {
        selectedMood = mood;
        moodBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      }
    });
  });

  // 사진 첨부 버튼 클릭 시 파일 선택창 열기
  if (photoToggleBtn && photoFileInput) {
    photoToggleBtn.addEventListener("click", () => {
      photoFileInput.click();
    });

    photoFileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const compressed = await compressImageFile(file);
        attachedPhotoData = compressed;

        if (photoPreviewImg && photoPreviewWrap) {
          photoPreviewImg.src = compressed;
          photoPreviewWrap.hidden = false;
        }

        // 사진을 올리면 그림판은 닫음
        if (drawingContainer && !drawingContainer.hidden) {
          drawingContainer.hidden = true;
          if (drawToggleBtn) drawToggleBtn.textContent = "🎨 그림 그리기";
          resetCanvas();
        }
      } catch (err) {
        console.error("사진 압축 오류:", err);
        alert("사진을 불러오지 못했습니다.");
      }
    });
  }

  // 첨부 사진 삭제 버튼
  if (photoRemoveBtn) {
    photoRemoveBtn.addEventListener("click", () => {
      clearAttachedPhoto();
    });
  }

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

      // 그림판을 열면 첨부된 사진은 제거
      if (isHidden && attachedPhotoData) {
        clearAttachedPhoto();
      }
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


