// =========================================================
// draw.js - 그림판 모듈
//
// 논리 크기 800x500, Pointer Events 기반 마우스/터치 동시 지원,
// 스트로크 히스토리 기반 Undo, WebP/JPEG 고압축 내보내기 담당.
// =========================================================

const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 500;

// 내부 상태 관리
let canvas = null;
let ctx = null;
let strokes = []; // 스트로크 히스토리: [{ mode, color, width, points: [{x, y}] }]
let currentStroke = null;
let isDrawing = false;

// 기본 드로잉 설정
let currentMode = "pen"; // "pen" | "eraser"
let currentColor = "#333333";
let currentWidth = 4; // 3단계: 얇게(3), 보통(8), 굵게(16)

/**
 * 캔버스 초기화 및 이벤트 등록
 * @param {HTMLCanvasElement} canvasElement
 */
export function initCanvas(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext("2d");

  // 고해상도 backing store 스케일링 설정
  setupHiDPICanvas();

  // 리사이즈 시 스케일 유지
  window.addEventListener("resize", () => {
    setupHiDPICanvas();
    redrawAll();
  });

  // Pointer Events 등록 (마우스 + 터치 동시 지원)
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);

  // 초기 흰 배경 채우기
  redrawAll();
}

/**
 * 디바이스 픽셀 비율(devicePixelRatio)을 반영한 고해상도 캔버스 설정
 */
function setupHiDPICanvas() {
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = LOGICAL_WIDTH * dpr;
  canvas.height = LOGICAL_HEIGHT * dpr;

  // 컨텍스트 좌표계를 논리 크기(800x500)에 맞춤
  ctx.resetTransform();
  ctx.scale(dpr, dpr);
}

/**
 * 이벤트 좌표를 논리 좌표(800x500)로 변환
 */
function getLogicalCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = LOGICAL_WIDTH / rect.width;
  const scaleY = LOGICAL_HEIGHT / rect.height;

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

/**
 * 포인터 누름 시작
 */
function handlePointerDown(e) {
  // 메인 버튼(마우스 좌클릭 또는 터치)만 반응
  if (e.button !== 0 && e.buttons !== 1) return;

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

  // 시작점 점 그리기
  drawPoint(pos.x, pos.y, currentStroke);
}

/**
 * 포인터 이동 중 선 그리기 (2px 미만 이동 최적화)
 */
function handlePointerMove(e) {
  if (!isDrawing || !currentStroke) return;

  const pos = getLogicalCoordinates(e);
  const points = currentStroke.points;
  const lastPoint = points[points.length - 1];

  // 이전 점과의 거리가 2px 미만이면 좌표를 저장하지 않아 성능 최적화
  const dist = Math.hypot(pos.x - lastPoint.x, pos.y - lastPoint.y);
  if (dist < 2) return;

  points.push(pos);
  drawLineSegment(lastPoint, pos, currentStroke);
}

/**
 * 포인터 뗌
 */
function handlePointerUp(e) {
  if (!isDrawing) return;
  isDrawing = false;
  currentStroke = null;
  if (canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
}

/**
 * 포인터 캔슬
 */
function handlePointerCancel(e) {
  handlePointerUp(e);
}

/**
 * 단일 점 그리기 (클릭만 했을 때)
 */
function drawPoint(x, y, stroke) {
  ctx.save();
  ctx.fillStyle = stroke.color;
  ctx.beginPath();
  ctx.arc(x, y, stroke.width / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 두 점을 잇는 선분 그리기
 */
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

/**
 * 전체 스트로크 히스토리 재생 (Undo 및 캔버스 갱신 시 사용)
 */
function redrawAll() {
  if (!ctx) return;

  ctx.save();
  // 1. 전체 흰색 배경 채우기
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  // 2. 기록된 스트로크 순서대로 다시 그리기
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

/**
 * 도구 모드 설정 ("pen" | "eraser")
 */
export function setMode(mode) {
  currentMode = mode;
}

/**
 * 펜 색상 설정
 */
export function setColor(color) {
  currentColor = color;
  currentMode = "pen";
}

/**
 * 펜 굵기 설정 (숫자 px)
 */
export function setLineWidth(width) {
  currentWidth = width;
}

/**
 * 실행취소(Undo): 마지막 스트로크 제거 후 전체 재생
 */
export function undo() {
  if (strokes.length > 0) {
    strokes.pop();
    redrawAll();
  }
}

/**
 * 캔버스 전체 지우기
 */
export function clearCanvas() {
  strokes = [];
  redrawAll();
}

/**
 * 캔버스 초기화 (저장 완료 후 호출)
 */
export function resetCanvas() {
  strokes = [];
  currentMode = "pen";
  currentColor = "#333333";
  currentWidth = 4;
  redrawAll();
}

/**
 * 그림이 그려져 있는지 여부 확인
 * @returns {boolean}
 */
export function hasDrawing() {
  return strokes.length > 0;
}

/**
 * Firestore 저장을 위한 최적화된 DataURL 이미지 내보내기
 * - WebP 0.8 우선, WebP 미지원 시 JPEG 0.8 폴백
 * - 500,000자 초과 시 단계적 압축 (0.6 -> 0.4)
 * @returns {string|null}
 */
export function exportImage() {
  if (!hasDrawing() || !canvas) return null;

  // 1. 임시 800x500 오프스크린 캔버스에 흰색 배경과 현재 그림 합성
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = LOGICAL_WIDTH;
  exportCanvas.height = LOGICAL_HEIGHT;
  const exportCtx = exportCanvas.getContext("2d");

  // 흰색 배경 채우기
  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  // 현재 캔버스를 800x500 크기로 복사
  exportCtx.drawImage(canvas, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  // 2. WebP 인코딩 시도 및 미지원 시 JPEG 폴백 감지
  let quality = 0.8;
  let dataUrl = exportCanvas.toDataURL("image/webp", quality);

  // 브라우저가 WebP를 지원하지 않으면 PNG(data:image/png)를 반환하므로 접두사 검사
  let format = "image/webp";
  if (!dataUrl.startsWith("data:image/webp")) {
    format = "image/jpeg";
    dataUrl = exportCanvas.toDataURL(format, quality);
  }

  // 3. 문자열 길이 500,000자 초과 시 품질 점진적 압축
  if (dataUrl.length > 500000) {
    quality = 0.6;
    dataUrl = exportCanvas.toDataURL(format, quality);

    if (dataUrl.length > 500000) {
      quality = 0.4;
      dataUrl = exportCanvas.toDataURL(format, quality);

      if (dataUrl.length > 500000) {
        throw new Error("그림이 너무 큽니다. 선을 조금 지우거나 다시 그려주세요.");
      }
    }
  }

  console.log(`[draw] 저장된 그림 데이터 길이: ${dataUrl.length}자 (포맷: ${format}, 품질: ${quality})`);
  return dataUrl;
}


