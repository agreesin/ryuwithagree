// =========================================================
// comments.js - 일기 댓글 및 대댓글(답글) 컴포넌트 모듈
// 댓글/답글 목록 렌더링, 인라인 답글 등록, 댓글 수정 및 삭제를 담당합니다.
// ★ 목록 갱신은 Firestore onSnapshot이 담당하므로 수동 render 호출은 불필요하며 render.js를 import하지 않습니다.
// =========================================================

import { addComment, updateComment, removeComment } from "./store.js";
import { getCurrentProfiles, isMyContent } from "./state.js";
import { showError, formatDateTime } from "./ui.js";
import { sendPushToPartner } from "./notify.js";

/**
 * 개별 댓글 또는 답글(대댓글) DOM 요소를 생성합니다.
 */
function createCommentItem(comment, entry, { isReply = false, idPrefix = "", onReplyToggle = null } = {}) {
  const currentProfiles = getCurrentProfiles();

  const item = document.createElement("li");
  item.className = isReply ? "comment-reply-item" : "comment-item";
  item.id = `${idPrefix}comment-${comment.id}`;

  const commentMeta = document.createElement("div");
  commentMeta.className = "comment-meta";

  const authorWrapper = document.createElement("span");
  authorWrapper.className = "comment-author-wrapper";

  if (isReply) {
    const replyPrefix = document.createElement("span");
    replyPrefix.className = "comment-reply-prefix";
    replyPrefix.textContent = "↳ ";
    authorWrapper.appendChild(replyPrefix);
  }

  const authorDisplayName = (comment.uid && currentProfiles[comment.uid]) ? currentProfiles[comment.uid] : comment.author;

  const authorSpan = document.createElement("span");
  authorSpan.className = "comment-author";
  authorSpan.textContent = authorDisplayName;
  authorWrapper.appendChild(authorSpan);

  const dateSpan = document.createElement("span");
  dateSpan.className = "comment-date";
  if (comment.createdAt) {
    dateSpan.textContent = formatDateTime(comment.createdAt);
  }

  commentMeta.appendChild(authorWrapper);
  commentMeta.appendChild(dateSpan);

  const commentText = document.createElement("p");
  commentText.className = "comment-text";
  commentText.textContent = comment.text;

  item.appendChild(commentMeta);
  item.appendChild(commentText);

  // 하단 액션 영역 (답글 달기, 본인 작성 시 수정/삭제)
  const isMyComment = isMyContent(comment);

  const commentActions = document.createElement("div");
  commentActions.className = "comment-actions";

  // 답글 달기 버튼 (루트 댓글에만 제공)
  if (!isReply && onReplyToggle) {
    const replyToggleBtn = document.createElement("button");
    replyToggleBtn.type = "button";
    replyToggleBtn.className = "comment-action-btn reply";
    replyToggleBtn.textContent = "💬 답글";
    replyToggleBtn.addEventListener("click", onReplyToggle);
    commentActions.appendChild(replyToggleBtn);
  }

  if (isMyComment) {
    // 수정 버튼
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "comment-action-btn edit";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", async () => {
      const promptTitle = isReply ? "답글 내용을 수정하세요:" : "댓글 내용을 수정하세요:";
      const newText = prompt(promptTitle, comment.text);
      if (newText === null) return;
      const trimmed = newText.trim();
      if (!trimmed) {
        alert(isReply ? "답글 내용을 입력해주세요." : "댓글 내용을 입력해주세요.");
        return;
      }
      try {
        await updateComment(entry.id, comment.id, trimmed);
      } catch (err) {
        console.error(err);
        showError((isReply ? "답글 수정에 실패했습니다: " : "댓글 수정에 실패했습니다: ") + err.message);
      }
    });
    commentActions.appendChild(editBtn);

    // 삭제 버튼
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "comment-action-btn delete";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", async () => {
      const confirmMsg = isReply ? "정말 이 답글을 삭제하시겠습니까?" : "정말 이 댓글을 삭제하시겠습니까?";
      if (confirm(confirmMsg)) {
        try {
          await removeComment(entry.id, comment.id);
        } catch (err) {
          console.error(err);
          showError((isReply ? "답글 삭제에 실패했습니다: " : "댓글 삭제에 실패했습니다: ") + err.message);
        }
      }
    });
    commentActions.appendChild(deleteBtn);
  }

  if (commentActions.children.length > 0) {
    item.appendChild(commentActions);
  }

  return item;
}

/**
 * 개별 일기 카드의 댓글/답글 영역 DOM 요소를 생성하여 반환합니다.
 * @param {Object} entry - 일기 문서 객체
 * @param {string} [idPrefix=""] - DOM ID 접두어 (충돌 방지)
 * @returns {HTMLElement} 댓글 섹션 div 요소
 */
export function createCommentsSection(entry, idPrefix = "") {
  const currentProfiles = getCurrentProfiles();

  const commentsSection = document.createElement("div");
  commentsSection.className = "comments-section";

  const allComments = entry.comments || [];

  const commentsHeader = document.createElement("div");
  commentsHeader.className = "comments-header";
  commentsHeader.textContent = `댓글 ${allComments.length > 0 ? `(${allComments.length})` : ""}`;
  commentsSection.appendChild(commentsHeader);

  // 부모 댓글(루트 댓글)과 대댓글(답글) 분류
  const rootComments = allComments.filter((c) => !c.parentId);
  const repliesByParent = {};
  allComments
    .filter((c) => c.parentId)
    .forEach((c) => {
      if (!repliesByParent[c.parentId]) {
        repliesByParent[c.parentId] = [];
      }
      repliesByParent[c.parentId].push(c);
    });

  // 댓글 목록 렌더링
  if (rootComments.length > 0) {
    const commentsList = document.createElement("ul");
    commentsList.className = "comments-list";

    for (const comment of rootComments) {
      const commentAuthorDisplayName = (comment.uid && currentProfiles[comment.uid]) ? currentProfiles[comment.uid] : comment.author;

      // 인라인 답글 작성 폼
      const replyForm = document.createElement("form");
      replyForm.className = "reply-form";
      replyForm.hidden = true;

      const replyInput = document.createElement("input");
      replyInput.className = "reply-input";
      replyInput.type = "text";
      replyInput.placeholder = `${commentAuthorDisplayName}님에게 답글 작성...`;
      replyInput.required = true;

      const replySubmitBtn = document.createElement("button");
      replySubmitBtn.className = "reply-submit-btn";
      replySubmitBtn.type = "submit";
      replySubmitBtn.textContent = "등록";

      replyForm.appendChild(replyInput);
      replyForm.appendChild(replySubmitBtn);

      const onReplyToggle = () => {
        replyForm.hidden = !replyForm.hidden;
        if (!replyForm.hidden) {
          replyInput.focus();
        }
      };

      replyForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = replyInput.value.trim();
        if (!text) return;

        replySubmitBtn.disabled = true;
        try {
          await addComment(entry.id, text, comment.id);
          sendPushToPartner({
            title: "💬 류이어리 새 답글",
            message: "당신의 반쪽이 새 답글을 남겼습니다.",
          });
          replyInput.value = "";
          replyForm.hidden = true;
        } catch (error) {
          console.error(error);
          showError("답글을 저장하지 못했습니다. 연결을 확인하세요.");
        } finally {
          replySubmitBtn.disabled = false;
        }
      });

      const commentItem = createCommentItem(comment, entry, {
        isReply: false,
        idPrefix,
        onReplyToggle,
      });

      commentItem.appendChild(replyForm);

      // 해당 댓글에 달린 대댓글 목록 렌더링
      const replies = repliesByParent[comment.id] || [];
      if (replies.length > 0) {
        const repliesList = document.createElement("ul");
        repliesList.className = "comment-replies-list";

        for (const reply of replies) {
          const replyItem = createCommentItem(reply, entry, {
            isReply: true,
            idPrefix,
          });
          repliesList.appendChild(replyItem);
        }

        commentItem.appendChild(repliesList);
      }

      commentsList.appendChild(commentItem);
    }

    commentsSection.appendChild(commentsList);
  }

  // 기본 댓글 작성 폼
  const commentForm = document.createElement("form");
  commentForm.className = "comment-form";
  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = commentInput.value.trim();
    if (!text) return;

    commentSubmitBtn.disabled = true;
    try {
      await addComment(entry.id, text);
      sendPushToPartner({
        title: "💬 류이어리 새 댓글",
        message: "당신의 반쪽이 새 댓글을 남겼습니다.",
      });
      commentInput.value = "";
    } catch (error) {
      console.error(error);
      showError("댓글을 저장하지 못했습니다. 연결을 확인하세요.");
    } finally {
      commentSubmitBtn.disabled = false;
    }
  });

  const commentInput = document.createElement("input");
  commentInput.className = "comment-input";
  commentInput.type = "text";
  commentInput.placeholder = "따뜻한 댓글을 남겨보세요...";
  commentInput.required = true;

  const commentSubmitBtn = document.createElement("button");
  commentSubmitBtn.className = "comment-submit-btn";
  commentSubmitBtn.type = "submit";
  commentSubmitBtn.textContent = "등록";

  commentForm.appendChild(commentInput);
  commentForm.appendChild(commentSubmitBtn);
  commentsSection.appendChild(commentForm);

  return commentsSection;
}



