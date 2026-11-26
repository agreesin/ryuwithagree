// =========================================================
// timelapse.js - 그림판 5초 고정 인라인 타임랩스 재생 엔진
//
// 팝업 없이 일기 카드 이미지 영역 위에서 직접 5초 동안 스트로크를 순차 렌더링합니다.
// - 5초 고정 재생 시간 (requestAnimationFrame 보간 + DOM 이탈 시 자동 정리)
// - 클릭 시 즉시 스킵(완료) 또는 다시보기 토글
// =========================================================

import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from "./draw.js";

const TIMELAPSE_DURATION = 5000;

function parseDrawingSteps(drawingData) {
  const steps = [];
  if (!Array.isArray(drawingData)) return steps;

  for (const stroke of drawingData) {
    const pts = stroke.pts || [];
    if (pts.length < 2) continue;

    const color = stroke.c || "#333333";
    const width = stroke.w || 4;

    const firstX = pts[0];
    const firstY = pts[1];

    if (pts.length === 2) {
      steps.push({
        type: "point",
        color,
        width,
        x: firstX,
        y: firstY,
      });
    } else {
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

export function attachTimelapse(container, imgElement, drawingData) {
  const steps = parseDrawingSteps(drawingData);
  if (steps.length === 0) return;

  const canvas = document.createElement("canvas");
  canvas.className = "timelapse-canvas";
  const ctx = canvas.getContext("2d");

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = LOGICAL_WIDTH * dpr;
  canvas.height = LOGICAL_HEIGHT * dpr;
  ctx.scale(dpr, dpr);

  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "timelapse-badge";
  badge.setAttribute("aria-label", "5초 그림 타임랩스 재생");
  badge.innerHTML = `
    <span class="badge-icon">🎬</span>
    <span class="badge-text">5초 타임랩스</span>
  `;

  container.appendChild(canvas);
  container.appendChild(badge);

  let isPlaying = false;
  let animId = null;
  let lastDrawnStep = 0;
  let startTime = 0;

  function renderPoint(step) {
    ctx.save();
    ctx.fillStyle = step.color;
    ctx.beginPath();
    ctx.arc(step.x, step.y, step.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

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

  function clearToWhite() {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.restore();
  }

  function startPlayback() {
    if (isPlaying) return;
    isPlaying = true;
    lastDrawnStep = 0;

    canvas.style.display = "block";
    clearToWhite();

    badge.classList.add("playing");
    badge.setAttribute("aria-label", "타임랩스 재생 중, 누르면 완성본으로 스킵");
    badge.innerHTML = `
      <span class="badge-icon">⏸️</span>
      <span class="badge-text">재생 중... (스킵)</span>
    `;

    startTime = performance.now();

    function stepLoop(now) {
      if (!isPlaying || !canvas.isConnected) {
        isPlaying = false;
        animId = null;
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / TIMELAPSE_DURATION, 1.0);
      const targetStep = Math.min(Math.floor(progress * steps.length), steps.length);

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

  function skipToFinish() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }

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

  function finishPlayback() {
    isPlaying = false;
    animId = null;
    badge.classList.remove("playing");
    badge.classList.add("finished");
    badge.setAttribute("aria-label", "타임랩스 다시보기");
    badge.innerHTML = `
      <span class="badge-icon">↺</span>
      <span class="badge-text">다시보기</span>
    `;
  }

  container.addEventListener("click", (e) => {
    // 별도 확대 버튼 클릭 시에는 타임랩스를 트리거하지 않음
    if (e.target && e.target.closest && e.target.closest(".entry-image-zoom-btn")) {
      return;
    }
    if (isPlaying) {
      skipToFinish();
    } else {
      startPlayback();
    }
  });
}
