// =========================================================
// timelapse.js - 그림판 5초 고정 인라인 타임랩스 재생 엔진
//
// 팝업 없이 일기 카드 이미지 영역 위에서 직접 5초 동안 스트로크를 순차 렌더링합니다.
// - 5초 고정 재생 시간 (총 스텝 수 기반 requestAnimationFrame 보간)
// - 클릭 시 즉시 스킵(완료) 또는 다시보기 토글
// - HiDPI Retina 스케일링 지원
// =========================================================

import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from "./draw.js";

const TIMELAPSE_DURATION = 5000; // 5초 고정 타임랩스

/**
 * 경량화된 스트로크 데이터를 순차적 드로잉 스텝 배열로 변환
 * @param {Array} drawingData - [{ m, c, w, pts: [x1, y1, x2, y2, ...] }]
 * @returns {Array} steps - [{ type: 'point'|'line', color, width, x, y, x2, y2 }]
 */
function parseDrawingSteps(drawingData) {
  const steps = [];
  if (!Array.isArray(drawingData)) return steps;

  for (const stroke of drawingData) {
    const pts = stroke.pts || [];
    if (pts.length < 2) continue; // 최소 x, y 한 쌍 필요

    const color = stroke.c || "#333333";
    const width = stroke.w || 4;

    // 첫 점
    const firstX = pts[0];
    const firstY = pts[1];

    if (pts.length === 2) {
      // 단일 클릭 점
      steps.push({
        type: "point",
        color,
        width,
        x: firstX,
        y: firstY,
      });
    } else {
      // 연속된 선분들
      for (let i = 2; i < pts.length; i += 2) {
        steps.push({
          type: "line",
          color,
          width,
          x1: pts[i - 2],
          y1: pts[i - 1],
          x2: pts[i],
          y2: pts[i + 1],
        });
      }
    }
  }

  return steps;
}

/**
 * 일기 카드 이미지에 5초 인라인 타임랩스 플레이어를 장착합니다.
 * @param {HTMLElement} container - .entry-image-container 래퍼
 * @param {HTMLImageElement} imgElement - 일기 완성 이미지
 * @param {Array} drawingData - 경량화 스트로크 데이터
 */
export function attachTimelapse(container, imgElement, drawingData) {
  const steps = parseDrawingSteps(drawingData);
  if (steps.length === 0) return;

  // 1. 오버레이 캔버스 생성
  const canvas = document.createElement("canvas");
  canvas.className = "timelapse-canvas";
  const ctx = canvas.getContext("2d");

  // HiDPI 대응 backing store 설정
  const dpr = window.devicePixelRatio || 1;
  canvas.width = LOGICAL_WIDTH * dpr;
  canvas.height = LOGICAL_HEIGHT * dpr;
  ctx.scale(dpr, dpr);

  // 2. 타임랩스 뱃지 생성
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "timelapse-badge";
  badge.innerHTML = `
    <span class="badge-icon">🎬</span>
    <span class="badge-text">5초 타임랩스</span>
  `;

  container.appendChild(canvas);
  container.appendChild(badge);

  // 재생 상태 관리
  let isPlaying = false;
  let animId = null;
  let lastDrawnStep = 0;
  let startTime = 0;

  // 단일 점 그리기 헬퍼
  function renderPoint(step) {
    ctx.save();
    ctx.fillStyle = step.color;
    ctx.beginPath();
    ctx.arc(step.x, step.y, step.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 선분 그리기 헬퍼
  function renderLine(step) {
    ctx.save();
    ctx.strokeStyle = step.color;
    ctx.lineWidth = step.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(step.x1, step.y1);
    ctx.lineTo(step.x2, step.y2);
    ctx.stroke();
    ctx.restore();
  }

  // 흰 배경 초기화
  function clearToWhite() {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.restore();
  }

  // 타임랩스 시작
  function startPlayback() {
    if (isPlaying) return;
    isPlaying = true;
    lastDrawnStep = 0;

    // 캔버스 활성화 및 초기화
    canvas.style.display = "block";
    clearToWhite();

    badge.classList.add("playing");
    badge.innerHTML = `
      <span class="badge-icon">⏸️</span>
      <span class="badge-text">재생 중... (스킵)</span>
    `;

    startTime = performance.now();

    function stepLoop(now) {
      if (!isPlaying) return;

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / TIMELAPSE_DURATION, 1.0);
      const targetStep = Math.min(Math.floor(progress * steps.length), steps.length);

      // 이번 프레임에 그려야 할 스텝들 순차 렌더링
      for (let i = lastDrawnStep; i < targetStep; i++) {
        const s = steps[i];
        if (s.type === "point") {
          renderPoint(s);
        } else {
          renderLine(s);
        }
      }
      lastDrawnStep = targetStep;

      if (progress < 1.0) {
        animId = requestAnimationFrame(stepLoop);
      } else {
        finishPlayback();
      }
    }

    animId = requestAnimationFrame(stepLoop);
  }

  // 타임랩스 즉시 완료 (스킵)
  function skipToFinish() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }

    // 남은 모든 스텝 일괄 렌더링
    for (let i = lastDrawnStep; i < steps.length; i++) {
      const s = steps[i];
      if (s.type === "point") {
        renderPoint(s);
      } else {
        renderLine(s);
      }
    }
    lastDrawnStep = steps.length;
    finishPlayback();
  }

  // 재생 완료 처리
  function finishPlayback() {
    isPlaying = false;
    badge.classList.remove("playing");
    badge.classList.add("finished");
    badge.innerHTML = `
      <span class="badge-icon">↺</span>
      <span class="badge-text">다시보기</span>
    `;
  }

  // 클릭 이벤트 (이미지 또는 뱃지 탭)
  container.addEventListener("click", (e) => {
    // 뱃지 내부 클릭이든 이미지 클릭이든 동일 처리
    if (isPlaying) {
      // 재생 중 클릭 시 즉시 완성본으로 스킵
      skipToFinish();
    } else {
      // 대기 또는 완료 후 클릭 시 5초 재생
      startPlayback();
    }
  });
}
