// =========================================================
// draw.js - 그림판 모듈
//
// 논리 크기 800x500, Pointer Events 기반 마우스/터치 동시 지원(멀티터치 격리),
// Undo/Redo 히스토리(전체 지우기 복구 포함), WebP/JPEG 고압축 내보내기 담당.
// =========================================================

export const LOGICAL_WIDTH = 800;
export const LOGICAL_HEIGHT = 500;
export const DEFAULT_COLOR = "#333333";
export const DEFAULT_LINE_WIDTH = 8; // HTML 툴바 기본 '보통(8)'과 일치

// 내부 상태 관리
let canvas = null;
let ctx = null;
let strokes = []; // 스트로크 히스토리: [{ mode, color, width, points: [{x, y}] }]
let redoStack = []; // 다시 실행(Redo) 스택: [{ type: 'stroke', stroke } | { type: 'clear', prevStrokes }]
let clearedSnapshots = []; // 전체 지우기 Undo 복원용 스택
let currentStroke = null;
let isDrawing = false;
let activePointerId = null;
let historyChangeListener = null;

// 기본 드로잉 설정
let currentMode = "pen"; // "pen" | "eraser"
let currentColor = DEFAULT_COLOR;
let currentWidth = DEFAULT_LINE_WIDTH;

function notifyHistoryChange() {
  if (typeof historyChangeListener === "function") {
    try {
      historyChangeListener({
        canUndo: canUndo(),
        canRedo: canRedo(),
        hasDrawing: hasDrawing(),
      });
    } catch {
      // 리스너 오류 격리
    }
  }
}

export function setOnHistoryChange(fn) {
  historyChangeListener = fn;
  notifyHistoryChange();
}

export function canUndo() {
  return strokes.length > 0 || clearedSnapshots.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

/**
 * 캔버스 초기화 및 이벤트 등록
 * @param {HTMLCanvasElement} canvasElement
 */
export function initCanvas(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext("2d");

  setupHiDPICanvas();

  window.addEventListener("resize", () => {
    setupHiDPICanvas();
    redrawAll();
  });

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);

  redrawAll();
  notifyHistoryChange();
}

function setupHiDPICanvas() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = LOGICAL_WIDTH * dpr;
  canvas.height = LOGICAL_HEIGHT * dpr;

  ctx.resetTransform();
  ctx.scale(dpr, dpr);
}

function getLogicalCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width ? LOGICAL_WIDTH / rect.width : 1;
  const scaleY = rect.height ? LOGICAL_HEIGHT / rect.height : 1;

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function handlePointerDown(e) {
  if (e.button !== 0 && e.buttons !== 1) return;
  // 멀티터치 간섭 방지: 이미 그리는 중인 포인터가 있으면 두 번째 손가락 무시
  if (isDrawing && activePointerId !== null && activePointerId !== e.pointerId) return;

  activePointerId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  isDrawing = true;

  const pos = getLogicalCoordinates(e);
  const strokeColor = currentMode === "eraser" ? "#ffffff" : currentColor;

  currentStroke = {
    mode: currentMode,
    color: strokeColor,
    width: currentWidth,
    points: [pos],
  };

  strokes.push(currentStroke);
  redoStack = [];

  drawPoint(pos.x, pos.y, currentStroke);
  notifyHistoryChange();
}

function handlePointerMove(e) {
  if (!isDrawing || !currentStroke || e.pointerId !== activePointerId) return;

  const pos = getLogicalCoordinates(e);
  const points = currentStroke.points;
  const lastPoint = points[points.length - 1];

  const dist = Math.hypot(pos.x - lastPoint.x, pos.y - lastPoint.y);
  if (dist < 2) return;

  points.push(pos);
  drawLineSegment(lastPoint, pos, currentStroke);
}

function handlePointerUp(e) {
  if (!isDrawing || (activePointerId !== null && e.pointerId !== activePointerId)) return;
  isDrawing = false;
  currentStroke = null;
  activePointerId = null;
  if (canvas && canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
  notifyHistoryChange();
}

function handlePointerCancel(e) {
  handlePointerUp(e);
}

function drawPoint(x, y, stroke) {
  ctx.save();
  ctx.fillStyle = stroke.color;
  ctx.beginPath();
  ctx.arc(x, y, stroke.width / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLineSegment(p1, p2, stroke) {
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.restore();
}

function redrawAll() {
  if (!ctx) return;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;

    if (stroke.points.length === 1) {
      drawPoint(stroke.points[0].x, stroke.points[0].y, stroke);
    } else {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function setMode(mode) {
  currentMode = mode;
}

export function setColor(color) {
  currentColor = color;
  currentMode = "pen";
}

export function setLineWidth(width) {
  currentWidth = width;
}

/**
 * 실행취소(Undo): 마지막 획 제거 또는 직전 전체 지우기 복원
 */
export function undo() {
  if (strokes.length > 0) {
    const popped = strokes.pop();
    redoStack.push({ type: "stroke", stroke: popped });
    redrawAll();
    notifyHistoryChange();
  } else if (clearedSnapshots.length > 0) {
    const restored = clearedSnapshots.pop();
    redoStack.push({ type: "clear" });
    strokes = restored;
    redrawAll();
    notifyHistoryChange();
  }
}

/**
 * 다시 실행(Redo): 직전에 취소한 획 또는 지우기 재적용
 */
export function redo() {
  if (redoStack.length === 0) return;
  const action = redoStack.pop();
  if (action.type === "stroke" && action.stroke) {
    strokes.push(action.stroke);
  } else if (action.type === "clear") {
    clearedSnapshots.push([...strokes]);
    strokes = [];
  }
  redrawAll();
  notifyHistoryChange();
}

/**
 * 캔버스 전체 지우기 (실수 시 Undo로 복구 가능)
 */
export function clearCanvas() {
  if (strokes.length === 0) return;
  clearedSnapshots.push([...strokes]);
  strokes = [];
  redoStack = [];
  redrawAll();
  notifyHistoryChange();
}

/**
 * 캔버스 및 도구 설정 완전 초기화 (저장 완료 후 호출)
 */
export function resetCanvas() {
  strokes = [];
  redoStack = [];
  clearedSnapshots = [];
  currentStroke = null;
  isDrawing = false;
  activePointerId = null;
  currentMode = "pen";
  currentColor = DEFAULT_COLOR;
  currentWidth = DEFAULT_LINE_WIDTH;
  redrawAll();
  notifyHistoryChange();
  return {
    mode: currentMode,
    color: currentColor,
    width: currentWidth,
  };
}

export function hasDrawing() {
  return strokes.length > 0;
}

/**
 * Firestore 저장을 위한 최적화된 DataURL 이미지 내보내기
 * @returns {string|null}
 */
export function exportImage() {
  if (!hasDrawing() || !canvas) return null;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = LOGICAL_WIDTH;
  exportCanvas.height = LOGICAL_HEIGHT;
  const exportCtx = exportCanvas.getContext("2d");

  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  exportCtx.drawImage(canvas, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  let quality = 0.8;
  let dataUrl = exportCanvas.toDataURL("image/webp", quality);

  let format = "image/webp";
  if (!dataUrl.startsWith("data:image/webp")) {
    format = "image/jpeg";
    dataUrl = exportCanvas.toDataURL(format, quality);
  }

  for (const nextQuality of [0.6, 0.45, 0.32]) {
    if (dataUrl.length <= 420000) break;
    quality = nextQuality;
    dataUrl = exportCanvas.toDataURL(format, quality);
  }

  if (dataUrl.length > 480000) {
    throw new Error("그림 용량이 너무 큽니다. 선을 조금 줄여주세요.");
  }

  return dataUrl;
}

/**
 * 타임랩스 재생을 위한 경량화된 스트로크 데이터 추출 (Firestore 1MB 한도 안전 가드)
 * @returns {Array|null}
 */
export function exportDrawingData() {
  if (!hasDrawing()) return null;

  let totalPts = 0;
  for (const s of strokes) {
    totalPts += s.points ? s.points.length : 0;
  }

  const buildSampled = (step) => {
    const optimized = [];
    for (const s of strokes) {
      if (!s.points || s.points.length === 0) continue;
      const pts = [];
      pts.push(Math.round(s.points[0].x), Math.round(s.points[0].y));
      for (let i = 1; i < s.points.length - 1; i += step) {
        pts.push(Math.round(s.points[i].x), Math.round(s.points[i].y));
      }
      if (s.points.length > 1) {
        const last = s.points[s.points.length - 1];
        pts.push(Math.round(last.x), Math.round(last.y));
      }
      optimized.push({
        m: s.mode === "eraser" ? "e" : "p",
        c: s.mode === "eraser" ? "#ffffff" : s.color,
        w: s.width,
        pts,
      });
    }
    return optimized;
  };

  let step = totalPts > 5000 ? 2 : 1;
  let optimized = buildSampled(step);

  // JSON 직렬화 길이가 250KB를 초과하면 점진적 다운샘플링으로 안전 용량 유지
  while (JSON.stringify(optimized).length > 250000 && step < 8) {
    step += 1;
    optimized = buildSampled(step);
  }

  return optimized;
}
