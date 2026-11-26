// =========================================================
// entries.js - 일기 작성/수정, 자동 임시저장, 스마트 사진 압축 첨부 및 그림판 연동 모듈
// - 접이식 컴팩트 작성 트리거 & 모바일 FAB 지원
// - 기존 일기 수정(diary:edit-entry) 지원
// - 사진(최대 5장)과 그림판 동시 첨부 + Firestore 1MB 문서 안전 용량 가드
// - localStorage 자동 임시저장 및 복구 배너
// =========================================================

import { addEntry, updateEntry } from "./store.js";
import {
  initCanvas,
  setMode,
  setColor,
  setLineWidth,
  undo,
  redo,
  clearCanvas,
  resetCanvas,
  hasDrawing,
  exportImage,
  exportDrawingData,
  setOnHistoryChange,
  DEFAULT_COLOR,
  DEFAULT_LINE_WIDTH,
} from "./draw.js";
import { showError, showConfirmDialog, normalizeMood } from "./ui.js";
import { sendPushToPartner, showToastNotification } from "./notify.js";

const STORAGE_KEY_DRAFT = "diary_editor_draft_v1";
const MAX_MEDIA_ITEMS = 5;
const MAX_DOC_BYTES_BUDGET = 860000; // Firestore 1MiB 한도 대비 안전 예산

// 컴팩트 작성 트리거 / 접이식 에디터 / FAB 요소
const composerCompactBar = document.getElementById("composer-compact-bar");
const composerCompactOpenBtn = document.getElementById("composer-compact-open-btn");
const composerQuickPhotoBtn = document.getElementById("composer-quick-photo-btn");
const composerQuickDrawBtn = document.getElementById("composer-quick-draw-btn");
const editorSection = document.getElementById("editor-section");
const editorHeaderTitle = document.getElementById("editor-header-title");
const editorCollapseBtn = document.getElementById("editor-collapse-btn");
const fabWriteBtn = document.getElementById("fab-write-btn");

// 임시저장 복구 배너
const draftRestoreBanner = document.getElementById("draft-restore-banner");
const draftDiscardBtn = document.getElementById("draft-discard-btn");

// 입력 요소
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const saveButton = document.getElementById("save-button");
const cancelEditBtn = document.getElementById("cancel-edit-button");
const moodBtns = document.querySelectorAll(".mood-btn");

// 사진 첨부 화면 요소
const photoToggleBtn = document.getElementById("photo-toggle-btn");
const photoFileInput = document.getElementById("photo-file-input");
const photoPreviewWrap = document.getElementById("photo-preview-wrap");
const photoPreviewList = document.getElementById("photo-preview-list");
const photoCountBadge = document.getElementById("photo-count-badge");
const photoAddMoreBtn = document.getElementById("photo-add-more-btn");
const photoClearAllBtn = document.getElementById("photo-clear-all-btn");

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
const toolRedoBtn = document.getElementById("tool-redo");
const toolClearBtn = document.getElementById("tool-clear");

// 내부 상태
let selectedMood = null;
let attachedPhotos = []; // 첨부된 사진 Data URL 배열
let editingEntryId = null; // 수정 중인 일기 ID (null이면 새 글 작성)
let editingDrawingData = null; // 수정 시 기존 그림 타임랩스 데이터 보존
let isEditorExpanded = false;
let draftTimer = null;

function isTouchDevice() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches
  );
}

/**
 * 에디터 펼침/접힘 상태 제어
 */
function setEditorExpanded(expanded, { focusBody = false } = {}) {
  isEditorExpanded = Boolean(expanded);
  if (editorSection) editorSection.hidden = !isEditorExpanded;
  if (composerCompactBar) composerCompactBar.hidden = isEditorExpanded;
  if (fabWriteBtn) fabWriteBtn.hidden = isEditorExpanded;

  if (isEditorExpanded && focusBody && bodyInput) {
    setTimeout(() => bodyInput.focus(), 60);
  }
}

/**
 * 툴바 UI를 지정된 펜 설정(또는 기본값)과 동기화합니다.
 */
function syncDrawingToolbarUI({
  mode = "pen",
  color = DEFAULT_COLOR,
  width = DEFAULT_LINE_WIDTH,
} = {}) {
  if (toolPenBtn) toolPenBtn.classList.toggle("active", mode === "pen");
  if (toolEraserBtn) toolEraserBtn.classList.toggle("active", mode === "eraser");
  if (toolColorPicker) toolColorPicker.value = color;

  colorChips.forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.color?.toLowerCase() === color.toLowerCase());
  });

  sizeBtns.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.size) === Number(width));
  });
}

function syncMoodUI() {
  moodBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mood === selectedMood);
    btn.setAttribute("aria-pressed", String(btn.dataset.mood === selectedMood));
  });
}

// =========================================================
// 자동 임시저장 (Draft Auto-Save)
// =========================================================

function scheduleDraftSave() {
  if (editingEntryId) return; // 기존 일기 수정 중에는 신규 임시저장 덮어쓰기 방지
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const title = titleInput ? titleInput.value : "";
    const body = bodyInput ? bodyInput.value : "";
    try {
      if (!title.trim() && !body.trim() && !selectedMood) {
        localStorage.removeItem(STORAGE_KEY_DRAFT);
      } else {
        localStorage.setItem(
          STORAGE_KEY_DRAFT,
          JSON.stringify({
            title,
            body,
            mood: selectedMood,
            savedAt: Date.now(),
          })
        );
      }
    } catch {
      // 스토리지 용량/권한 오류 무시
    }
  }, 350);
}

function clearSavedDraft() {
  if (draftTimer) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
  try {
    localStorage.removeItem(STORAGE_KEY_DRAFT);
  } catch {
    // 무시
  }
  if (draftRestoreBanner) draftRestoreBanner.hidden = true;
}

function restoreSavedDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DRAFT);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft || (!draft.title?.trim() && !draft.body?.trim() && !draft.mood)) return;

    if (titleInput && draft.title) titleInput.value = draft.title;
    if (bodyInput && draft.body) bodyInput.value = draft.body;
    if (draft.mood) {
      selectedMood = normalizeMood(draft.mood);
      syncMoodUI();
    }
    if (draftRestoreBanner) draftRestoreBanner.hidden = false;
    setEditorExpanded(true);
  } catch {
    // 손상된 임시저장 데이터 무시
  }
}

// =========================================================
// 이미지 압축 및 용량 최적화
// =========================================================

function compressImageFile(file, maxSide = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSide) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          }
        } else {
          if (height > maxSide) {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }

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
 * DataURL 이미지를 더 작은 크기/품질로 재압축합니다 (문서 1MB 초과 방지용).
 */
function recompressDataUrl(dataUrl, maxSide = 640, quality = 0.52) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      let out = canvas.toDataURL("image/webp", quality);
      if (!out.startsWith("data:image/webp")) {
        out = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(out.length < dataUrl.length ? out : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function getMaxPhotoSlots() {
  return hasDrawing() ? MAX_MEDIA_ITEMS - 1 : MAX_MEDIA_ITEMS;
}

function renderPhotoPreviews() {
  if (!photoPreviewWrap || !photoPreviewList) return;
  if (attachedPhotos.length === 0) {
    photoPreviewWrap.hidden = true;
    photoPreviewList.innerHTML = "";
    if (photoFileInput) photoFileInput.value = "";
    return;
  }

  const maxSlots = getMaxPhotoSlots();
  photoPreviewWrap.hidden = false;
  if (photoCountBadge) {
    photoCountBadge.textContent = `📷 사진 (${attachedPhotos.length}/${maxSlots})`;
  }
  if (photoAddMoreBtn) {
    const isFull = attachedPhotos.length >= maxSlots;
    photoAddMoreBtn.disabled = isFull;
    photoAddMoreBtn.style.opacity = isFull ? "0.4" : "1";
    photoAddMoreBtn.style.pointerEvents = isFull ? "none" : "auto";
  }

  photoPreviewList.innerHTML = "";
  attachedPhotos.forEach((dataUrl, idx) => {
    const item = document.createElement("div");
    item.className = "photo-preview-item";

    const img = document.createElement("img");
    img.className = "photo-preview-thumb";
    img.src = dataUrl;
    img.alt = `첨부 사진 ${idx + 1}`;

    const orderBadge = document.createElement("span");
    orderBadge.className = "photo-item-badge";
    orderBadge.textContent = `${idx + 1}`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "photo-item-remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.title = `사진 ${idx + 1} 삭제`;
    removeBtn.setAttribute("aria-label", `첨부 사진 ${idx + 1} 삭제`);
    removeBtn.addEventListener("click", () => {
      attachedPhotos.splice(idx, 1);
      // 0번 이미지가 기존 그림이었다면 삭제 시 타임랩스 데이터도 해제
      if (idx === 0 && editingDrawingData) {
        editingDrawingData = null;
      }
      renderPhotoPreviews();
    });

    item.appendChild(img);
    item.appendChild(orderBadge);
    item.appendChild(removeBtn);
    photoPreviewList.appendChild(item);
  });
}

function clearAttachedPhotos() {
  attachedPhotos = [];
  editingDrawingData = null;
  renderPhotoPreviews();
}

function resetEditorForm({ collapse = true } = {}) {
  editingEntryId = null;
  editingDrawingData = null;

  if (titleInput) titleInput.value = "";
  if (bodyInput) bodyInput.value = "";
  selectedMood = null;
  syncMoodUI();

  clearAttachedPhotos();

  const defaults = resetCanvas();
  syncDrawingToolbarUI(defaults);
  if (drawingContainer) drawingContainer.hidden = true;
  if (drawToggleBtn) drawToggleBtn.textContent = "🎨 그림 그리기";

  if (editorHeaderTitle) editorHeaderTitle.textContent = "✏️ 오늘의 일기 쓰기";
  if (saveButton) saveButton.textContent = "저장";
  if (cancelEditBtn) cancelEditBtn.hidden = true;
  if (editorSection) editorSection.classList.remove("is-editing");

  if (collapse) {
    setEditorExpanded(false);
  }
}

/**
 * 기존 일기를 에디터에 불러와 수정 모드로 전환합니다.
 */
function openEntryForEdit(entry) {
  if (!entry || !entry.id) return;

  // 피드 탭으로 전환 요청
  const feedTab = document.getElementById("view-tab-feed");
  if (feedTab && !feedTab.classList.contains("active")) {
    feedTab.click();
  }

  editingEntryId = entry.id;
  editingDrawingData =
    Array.isArray(entry.drawingData) && entry.drawingData.length > 0 ? entry.drawingData : null;

  if (draftRestoreBanner) draftRestoreBanner.hidden = true;
  if (titleInput) titleInput.value = entry.title || "";
  if (bodyInput) bodyInput.value = entry.body || "";

  selectedMood = entry.mood ? normalizeMood(entry.mood) : null;
  syncMoodUI();

  const existingImages =
    Array.isArray(entry.images) && entry.images.length > 0
      ? [...entry.images]
      : entry.image
      ? [entry.image]
      : [];
  attachedPhotos = existingImages;
  renderPhotoPreviews();

  const defaults = resetCanvas();
  syncDrawingToolbarUI(defaults);
  if (drawingContainer) drawingContainer.hidden = true;
  if (drawToggleBtn) drawToggleBtn.textContent = "🎨 새 그림 추가";

  if (editorHeaderTitle) editorHeaderTitle.textContent = "✏️ 일기 수정 중";
  if (saveButton) saveButton.textContent = "수정 완료";
  if (cancelEditBtn) cancelEditBtn.hidden = false;
  if (editorSection) editorSection.classList.add("is-editing");

  setEditorExpanded(true);

  if (editorSection) {
    editorSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  setTimeout(() => bodyInput?.focus(), 200);
}

/**
 * 일기 저장 / 수정 핸들러 (사진+그림 동시 첨부 & 용량 가드 & 오프라인 안전 처리)
 */
async function onSave() {
  let title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  const isDrawn = hasDrawing();
  const hasPhotos = attachedPhotos.length > 0;

  if (title === "" && body === "" && !isDrawn && !hasPhotos) {
    showToastNotification("본문, 사진 또는 그림을 입력해 주세요.", "✏️");
    bodyInput.focus();
    return;
  }

  if (!title) {
    const now = new Date();
    title = `${now.getMonth() + 1}/${now.getDate()} 오늘의 일기`;
  }

  saveButton.disabled = true;
  const originalBtnLabel = saveButton.textContent;
  saveButton.textContent = editingEntryId ? "수정 중..." : "저장 중...";

  try {
    let finalImages = [];
    let drawingData = null;

    if (isDrawn) {
      const drawnImg = exportImage();
      if (drawnImg) finalImages.push(drawnImg);
      drawingData = exportDrawingData();
    }

    if (hasPhotos) {
      const photoLimit = MAX_MEDIA_ITEMS - finalImages.length;
      finalImages.push(...attachedPhotos.slice(0, photoLimit));
      if (!isDrawn && editingDrawingData) {
        drawingData = editingDrawingData;
      }
    }

    // Firestore 1MB 문서 상한 방어: 총 용량 초과 시 첨부 사진 자동 재압축
    const estimateBytes = () =>
      JSON.stringify({ title, body, images: finalImages, drawingData }).length;

    if (estimateBytes() > MAX_DOC_BYTES_BUDGET && finalImages.length > 0) {
      const startIdx = isDrawn ? 1 : 0;
      for (let i = startIdx; i < finalImages.length; i++) {
        finalImages[i] = await recompressDataUrl(finalImages[i], 640, 0.52);
      }
      if (estimateBytes() > MAX_DOC_BYTES_BUDGET) {
        for (let i = startIdx; i < finalImages.length; i++) {
          finalImages[i] = await recompressDataUrl(finalImages[i], 480, 0.42);
        }
      }
      if (estimateBytes() > MAX_DOC_BYTES_BUDGET) {
        throw new Error("사진·그림 총 용량이 너무 큽니다. 사진 장수를 1~2장 줄여주세요.");
      }
    }

    const primaryImage = finalImages.length > 0 ? finalImages[0] : null;
    const isEditing = Boolean(editingEntryId);

    let writeResult;
    if (isEditing) {
      writeResult = await updateEntry(editingEntryId, {
        title,
        body,
        image: primaryImage,
        images: finalImages,
        mood: selectedMood,
        drawingData,
      });
    } else {
      writeResult = await addEntry({
        title,
        body,
        image: primaryImage,
        images: finalImages,
        mood: selectedMood,
        drawingData,
      });

      if (!writeResult?.queuedOffline) {
        sendPushToPartner({
          title: "📖 류이어리 새 일기",
          message: "새 일기가 등록되었습니다.",
        }).catch(() => {});
      }
    }

    if (!isEditing) {
      clearSavedDraft();
    }
    resetEditorForm({ collapse: true });

    // 데스크톱이 아닌 터치/모바일에서는 저장 후 키보드가 다시 뜨지 않도록 포커스 해제
    if (isTouchDevice() && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (writeResult?.queuedOffline) {
      showToastNotification("오프라인 보관 완료! 연결 시 자동 동기화됩니다.", "☁️");
    } else {
      showToastNotification(
        isEditing ? "일기가 수정되었습니다! ✨" : "일기가 등록되었습니다! 💌",
        "📖"
      );
    }
  } catch (error) {
    console.error(error);
    showError("저장하지 못했습니다: " + error.message);
  } finally {
    saveButton.disabled = false;
    if (saveButton.textContent === "저장 중..." || saveButton.textContent === "수정 중...") {
      saveButton.textContent = originalBtnLabel;
    }
  }
}

export function initEditor() {
  // 1. 컴팩트 작성 바 / 접기 / FAB 이벤트
  if (composerCompactOpenBtn) {
    composerCompactOpenBtn.addEventListener("click", () => {
      setEditorExpanded(true, { focusBody: true });
    });
  }

  if (composerQuickPhotoBtn && photoFileInput) {
    composerQuickPhotoBtn.addEventListener("click", () => {
      setEditorExpanded(true);
      photoFileInput.click();
    });
  }

  if (composerQuickDrawBtn) {
    composerQuickDrawBtn.addEventListener("click", () => {
      setEditorExpanded(true);
      if (drawingContainer && drawingContainer.hidden) {
        drawingContainer.hidden = false;
        if (drawToggleBtn) drawToggleBtn.textContent = "🎨 그림 접기";
      }
    });
  }

  if (fabWriteBtn) {
    fabWriteBtn.addEventListener("click", () => {
      const feedTab = document.getElementById("view-tab-feed");
      if (feedTab && !feedTab.classList.contains("active")) {
        feedTab.click();
      }
      setEditorExpanded(true, { focusBody: true });
      editorSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (editorCollapseBtn) {
    editorCollapseBtn.addEventListener("click", async () => {
      if (editingEntryId) {
        const ok = await showConfirmDialog({
          title: "수정 취소",
          message: "수정 중인 내용을 취소하고 닫으시겠습니까?",
          confirmText: "수정 취소",
        });
        if (!ok) return;
        resetEditorForm({ collapse: true });
        return;
      }
      setEditorExpanded(false);
    });
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", async () => {
      const ok = await showConfirmDialog({
        title: "수정 취소",
        message: "수정 중인 내용을 취소하시겠습니까?",
        confirmText: "취소하기",
      });
      if (!ok) return;
      resetEditorForm({ collapse: true });
    });
  }

  // 일기 카드의 [수정] 버튼 이벤트 수신
  window.addEventListener("diary:edit-entry", (e) => {
    openEntryForEdit(e.detail);
  });

  // 2. 임시저장 복구/삭제
  if (draftDiscardBtn) {
    draftDiscardBtn.addEventListener("click", () => {
      clearSavedDraft();
      resetEditorForm({ collapse: false });
      showToastNotification("임시저장 내용을 비웠습니다.", "🗑️");
    });
  }

  if (titleInput) titleInput.addEventListener("input", scheduleDraftSave);
  if (bodyInput) bodyInput.addEventListener("input", scheduleDraftSave);

  // 3. 오늘의 기분 선택
  moodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mood = btn.dataset.mood;
      selectedMood = selectedMood === mood ? null : mood;
      syncMoodUI();
      scheduleDraftSave();
    });
  });

  // 4. 사진 첨부
  if (photoToggleBtn && photoFileInput) {
    photoToggleBtn.addEventListener("click", () => {
      const maxSlots = getMaxPhotoSlots();
      if (attachedPhotos.length >= maxSlots) {
        showToastNotification(`사진은 최대 ${maxSlots}장까지 첨부할 수 있습니다.`, "📷");
        return;
      }
      photoFileInput.click();
    });

    photoFileInput.addEventListener("change", async (e) => {
      const rawFiles = Array.from(e.target.files || []);
      if (rawFiles.length === 0) return;

      const maxSlots = getMaxPhotoSlots();
      const remainingSlots = maxSlots - attachedPhotos.length;
      if (remainingSlots <= 0) {
        showToastNotification(`사진은 최대 ${maxSlots}장까지 첨부할 수 있습니다.`, "📷");
        photoFileInput.value = "";
        return;
      }

      let filesToProcess = rawFiles;
      if (rawFiles.length > remainingSlots) {
        showToastNotification(
          `최대 ${maxSlots}장까지 가능해 앞선 ${remainingSlots}장만 추가됩니다.`,
          "📷"
        );
        filesToProcess = rawFiles.slice(0, remainingSlots);
      }

      try {
        const compressedList = await Promise.all(
          filesToProcess.map((f) => compressImageFile(f))
        );
        attachedPhotos.push(...compressedList);
        renderPhotoPreviews();
      } catch (err) {
        console.error("[entries] 사진 압축 오류:", err);
        showError("사진을 불러오지 못했습니다.");
      } finally {
        photoFileInput.value = "";
      }
    });
  }

  if (photoAddMoreBtn && photoFileInput) {
    photoAddMoreBtn.addEventListener("click", () => {
      const maxSlots = getMaxPhotoSlots();
      if (attachedPhotos.length >= maxSlots) {
        showToastNotification(`사진은 최대 ${maxSlots}장까지 첨부할 수 있습니다.`, "📷");
        return;
      }
      photoFileInput.click();
    });
  }

  if (photoClearAllBtn) {
    photoClearAllBtn.addEventListener("click", async () => {
      const ok = await showConfirmDialog({
        title: "첨부 사진 전체 삭제",
        message: "첨부된 사진을 모두 삭제하시겠습니까?",
        confirmText: "전체 삭제",
        danger: true,
      });
      if (ok) {
        clearAttachedPhotos();
      }
    });
  }

  // 5. 그림판 초기화 및 토글 (P0 ReferenceError 수정 + 사진과 공존 지원)
  if (drawingCanvas) {
    initCanvas(drawingCanvas);
    setOnHistoryChange(({ canUndo, canRedo }) => {
      if (toolUndoBtn) toolUndoBtn.disabled = !canUndo;
      if (toolRedoBtn) toolRedoBtn.disabled = !canRedo;
      renderPhotoPreviews();
    });
  }

  if (drawToggleBtn && drawingContainer) {
    drawToggleBtn.addEventListener("click", () => {
      const willOpen = drawingContainer.hidden;
      if (willOpen && attachedPhotos.length >= MAX_MEDIA_ITEMS) {
        showToastNotification(
          "사진 5장이 모두 첨부되어 있어요. 그림을 함께 넣으려면 사진 1장을 빼주세요!",
          "🎨"
        );
        return;
      }
      drawingContainer.hidden = !willOpen;
      drawToggleBtn.textContent = willOpen ? "🎨 그림 접기" : "🎨 그림 그리기";
    });
  }

  if (toolPenBtn) {
    toolPenBtn.addEventListener("click", () => {
      setMode("pen");
      toolPenBtn.classList.add("active");
      if (toolEraserBtn) toolEraserBtn.classList.remove("active");
    });
  }

  if (toolEraserBtn) {
    toolEraserBtn.addEventListener("click", () => {
      setMode("eraser");
      toolEraserBtn.classList.add("active");
      if (toolPenBtn) toolPenBtn.classList.remove("active");
    });
  }

  if (toolColorPicker) {
    toolColorPicker.addEventListener("input", (e) => {
      setColor(e.target.value);
      if (toolPenBtn) toolPenBtn.classList.add("active");
      if (toolEraserBtn) toolEraserBtn.classList.remove("active");
      colorChips.forEach((chip) => chip.classList.remove("active"));
    });
  }

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

  sizeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const size = Number(btn.dataset.size);
      setLineWidth(size);
      sizeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  if (toolUndoBtn) {
    toolUndoBtn.addEventListener("click", () => undo());
  }

  if (toolRedoBtn) {
    toolRedoBtn.addEventListener("click", () => redo());
  }

  if (toolClearBtn) {
    toolClearBtn.addEventListener("click", async () => {
      if (!hasDrawing()) return;
      const ok = await showConfirmDialog({
        title: "그림 전체 지우기",
        message: "그림을 모두 지우시겠습니까? (실수한 경우 취소 버튼으로 복구할 수 있어요)",
        confirmText: "지우기",
        danger: true,
      });
      if (ok) {
        clearCanvas();
      }
    });
  }

  if (saveButton) {
    saveButton.addEventListener("click", onSave);
  }

  // 초기 상태: 접힌 컴팩트 바 (임시저장 초안이 있으면 자동 복원 및 펼침)
  setEditorExpanded(false);
  syncDrawingToolbarUI();
  restoreSavedDraft();
}
