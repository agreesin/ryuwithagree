// =========================================================
// comments.js - 일기 댓글 및 대댓글(답글) 컴포넌트 모듈
// 댓글/답글 목록 렌더링, 인라인 답글 등록, 인라인 댓글 수정 및 삭제 담당
// ★ render.js를 import하지 않아 단방향 의존성 유지
// =========================================================

import { addComment, updateComment, removeComment } from "./store.js";
import {
  isMyContent,
  createAvatarElement,
  getUserDisplayName,
} from "./state.js";
import { showError, formatDateTime, showConfirmDialog } from "./ui.js";
import { sendPushToPartner, showToastNotification } from "./notify.js";

/**
 * 개별 댓글 또는 답글(대댓글) DOM 요소를 생성합니다.
 */
function createCommentItem(
  comment,
  entry,
  { isReply = false, idPrefix = "", onReplyToggle = null } = {}
) {
  const item = document.createElement("li");
  item.className = isReply ? "comment-reply-item" : "comment-item";
  item.id = `${idPrefix}comment-${comment.id}`;
  item.dataset.commentId = comment.id;

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

  const authorDisplayName = getUserDisplayName(comment.uid, comment.author || "이름 없음");
  const commentAvatar = createAvatarElement(comment.uid, authorDisplayName, "comment-author-avatar");
  authorWrapper.appendChild(commentAvatar);

  const authorSpan = document.createElement("span");
  authorSpan.className = "comment-author";
  authorSpan.textContent = authorDisplayName;
  authorWrapper.appendChild(authorSpan);

  const dateSpan = document.createElement("span");
  dateSpan.className = "comment-date";
  if (comment.createdAt) {
    dateSpan.textContent = formatDateTime(comment.createdAt);
  }
  if (comment.updatedAt) {
    const editedTag = document.createElement("span");
    editedTag.className = "edited-badge";
    editedTag.textContent = " (수정됨)";
    dateSpan.appendChild(editedTag);
  }

  commentMeta.appendChild(authorWrapper);
  commentMeta.appendChild(dateSpan);

  const commentText = document.createElement("p");
  commentText.className = "comment-text";
  commentText.textContent = comment.text;

  // 인라인 수정 폼 (prompt() 대신 앱 내부에서 바로 수정)
  const editForm = document.createElement("form");
  editForm.className = "comment-inline-edit-form";
  editForm.hidden = true;

  const editTextarea = document.createElement("textarea");
  editTextarea.className = "comment-inline-edit-input";
  editTextarea.rows = 2;
  editTextarea.value = comment.text || "";
  editTextarea.setAttribute("aria-label", isReply ? "답글 수정 내용" : "댓글 수정 내용");
  editTextarea.dataset.draftKey = `edit:${entry.id}:${comment.id}`;

  const editFormActions = document.createElement("div");
  editFormActions.className = "comment-inline-edit-actions";

  const editCancelBtn = document.createElement("button");
  editCancelBtn.type = "button";
  editCancelBtn.className = "comment-inline-btn cancel";
  editCancelBtn.textContent = "취소";

  const editSaveBtn = document.createElement("button");
  editSaveBtn.type = "submit";
  editSaveBtn.className = "comment-inline-btn save";
  editSaveBtn.textContent = "저장";

  editFormActions.appendChild(editCancelBtn);
  editFormActions.appendChild(editSaveBtn);
  editForm.appendChild(editTextarea);
  editForm.appendChild(editFormActions);

  item.appendChild(commentMeta);
  item.appendChild(commentText);
  item.appendChild(editForm);

  const isMyComment = isMyContent(comment);
  const commentActions = document.createElement("div");
  commentActions.className = "comment-actions";

  if (!isReply && onReplyToggle) {
    const replyToggleBtn = document.createElement("button");
    replyToggleBtn.type = "button";
    replyToggleBtn.className = "comment-action-btn reply";
    replyToggleBtn.textContent = "💬 답글";
    replyToggleBtn.addEventListener("click", onReplyToggle);
    commentActions.appendChild(replyToggleBtn);
  }

  if (isMyComment) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "comment-action-btn edit";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", () => {
      editTextarea.value = comment.text || "";
      commentText.hidden = true;
      editForm.hidden = false;
      editTextarea.focus();
      editTextarea.setSelectionRange(editTextarea.value.length, editTextarea.value.length);
    });
    commentActions.appendChild(editBtn);

    editCancelBtn.addEventListener("click", () => {
      editForm.hidden = true;
      commentText.hidden = false;
    });

    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const trimmed = editTextarea.value.trim();
      if (!trimmed) {
        showToastNotification(
          isReply ? "답글 내용을 입력해 주세요." : "댓글 내용을 입력해 주세요.",
          "✏️"
        );
        editTextarea.focus();
        return;
      }
      if (trimmed === comment.text) {
        editForm.hidden = true;
        commentText.hidden = false;
        return;
      }

      editSaveBtn.disabled = true;
      try {
        await updateComment(entry.id, comment.id, trimmed);
        editForm.hidden = true;
        commentText.hidden = false;
        showToastNotification(
          isReply ? "답글이 수정되었습니다." : "댓글이 수정되었습니다.",
          "✏️"
        );
      } catch (err) {
        console.error(err);
        showError(
          (isReply ? "답글 수정에 실패했습니다: " : "댓글 수정에 실패했습니다: ") + err.message
        );
      } finally {
        editSaveBtn.disabled = false;
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "comment-action-btn delete";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", async () => {
      const ok = await showConfirmDialog({
        title: isReply ? "답글 삭제" : "댓글 삭제",
        message: isReply
          ? "정말 이 답글을 삭제하시겠습니까?"
          : "정말 이 댓글을 삭제하시겠습니까? 연결된 답글도 함께 삭제됩니다.",
        confirmText: "삭제",
        danger: true,
      });
      if (!ok) return;
      try {
        await removeComment(entry.id, comment.id);
        showToastNotification(isReply ? "답글이 삭제되었습니다." : "댓글이 삭제되었습니다.", "🗑️");
      } catch (err) {
        console.error(err);
        showError(
          (isReply ? "답글 삭제에 실패했습니다: " : "댓글 삭제에 실패했습니다: ") + err.message
        );
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
 */
export function createCommentsSection(entry, idPrefix = "") {
  const commentsSection = document.createElement("div");
  commentsSection.className = "comments-section";

  const allComments = [...(entry.comments || [])].sort(
    (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
  );

  const commentsHeader = document.createElement("div");
  commentsHeader.className = "comments-header";
  commentsHeader.textContent = `댓글 ${allComments.length > 0 ? `(${allComments.length})` : ""}`;
  commentsSection.appendChild(commentsHeader);

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

  if (rootComments.length > 0) {
    const commentsList = document.createElement("ul");
    commentsList.className = "comments-list";

    for (const comment of rootComments) {
      const commentAuthorDisplayName = getUserDisplayName(comment.uid, comment.author || "상대방");

      const replyForm = document.createElement("form");
      replyForm.className = "reply-form";
      replyForm.hidden = true;
      replyForm.dataset.replyFormKey = `${entry.id}:${comment.id}`;

      const replyInput = document.createElement("input");
      replyInput.className = "reply-input";
      replyInput.type = "text";
      replyInput.placeholder = `${commentAuthorDisplayName}님에게 답글 작성...`;
      replyInput.setAttribute("aria-label", `${commentAuthorDisplayName}님에게 답글 작성`);
      replyInput.dataset.draftKey = `reply:${entry.id}:${comment.id}`;
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
          const res = await addComment(entry.id, text, comment.id);
          replyInput.value = "";
          replyForm.hidden = true;
          if (res?.queuedOffline) {
            showToastNotification("오프라인 보관 완료! 연결 시 자동 전송됩니다.", "☁️");
          } else {
            sendPushToPartner({
              title: "💬 류이어리 새 답글",
              message: "새 답글이 등록되었습니다.",
            }).catch(() => {});
          }
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

  const commentForm = document.createElement("form");
  commentForm.className = "comment-form";

  const commentInput = document.createElement("input");
  commentInput.className = "comment-input";
  commentInput.type = "text";
  commentInput.placeholder = "따뜻한 댓글을 남겨보세요...";
  commentInput.setAttribute("aria-label", "댓글 작성");
  commentInput.dataset.draftKey = `comment:${entry.id}`;
  commentInput.required = true;

  const commentSubmitBtn = document.createElement("button");
  commentSubmitBtn.className = "comment-submit-btn";
  commentSubmitBtn.type = "submit";
  commentSubmitBtn.textContent = "등록";

  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = commentInput.value.trim();
    if (!text) return;

    commentSubmitBtn.disabled = true;
    try {
      const res = await addComment(entry.id, text);
      commentInput.value = "";
      if (res?.queuedOffline) {
        showToastNotification("오프라인 보관 완료! 연결 시 자동 전송됩니다.", "☁️");
      } else {
        sendPushToPartner({
          title: "💬 류이어리 새 댓글",
          message: "새 댓글이 등록되었습니다.",
        }).catch(() => {});
      }
    } catch (error) {
      console.error(error);
      showError("댓글을 저장하지 못했습니다. 연결을 확인하세요.");
    } finally {
      commentSubmitBtn.disabled = false;
    }
  });

  commentForm.appendChild(commentInput);
  commentForm.appendChild(commentSubmitBtn);
  commentsSection.appendChild(commentForm);

  return commentsSection;
}
