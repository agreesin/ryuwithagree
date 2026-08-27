// =========================================================
// comments.js - 일기 댓글 및 대댓글(답글) 컴포넌트 모듈
// 댓글/답글 목록 렌더링, 인라인 답글 등록, 댓글 수정 및 삭제를 담당합니다.
// ★ 목록 갱신은 Firestore onSnapshot이 담당하므로 수동 render 호출은 불필요하며 render.js를 import하지 않습니다.
// =========================================================

import { addComment, updateComment, removeComment } from "./store.js?v=3.0.1";
import { getCurrentUser, getCurrentProfiles } from "./state.js?v=3.0.1";
import { showError } from "./ui.js?v=3.0.1";
import { sendPushToPartner } from "./notify.js?v=3.0.1";

/**
 * 개별 일기 카드의 댓글/답글 영역 DOM 요소를 생성하여 반환합니다.
 * @param {Object} entry - 일기 문서 객체
 * @returns {HTMLElement} 댓글 섹션 div 요소
 */
export function createCommentsSection(entry) {
  const currentUser = getCurrentUser();
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
      const commentItem = document.createElement("li");
      commentItem.className = "comment-item";
      commentItem.id = `comment-${comment.id}`;

      const commentMeta = document.createElement("div");
      commentMeta.className = "comment-meta";

      const commentAuthorWrapper = document.createElement("span");
      commentAuthorWrapper.className = "comment-author-wrapper";

      const commentAuthorDisplayName = (comment.uid && currentProfiles[comment.uid]) ? currentProfiles[comment.uid] : comment.author;

      const commentAuthor = document.createElement("span");
      commentAuthor.className = "comment-author";
      commentAuthor.textContent = commentAuthorDisplayName;
      commentAuthorWrapper.appendChild(commentAuthor);

      const commentDate = document.createElement("span");
      commentDate.className = "comment-date";
      if (comment.createdAt) {
        const cd = new Date(comment.createdAt);
        commentDate.textContent = cd.toLocaleString("ko-KR", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      commentMeta.appendChild(commentAuthorWrapper);
      commentMeta.appendChild(commentDate);

      const commentText = document.createElement("p");
      commentText.className = "comment-text";
      commentText.textContent = comment.text;

      // 댓글 하단 액션 영역 (답글, 수정, 삭제)
      const commentActions = document.createElement("div");
      commentActions.className = "comment-actions";

      // 내가 쓴 댓글인지 확인 (uid 일치 또는 작성자명 일치)
      const isMyComment = currentUser && (
        (comment.uid && comment.uid === currentUser.uid) ||
        (comment.author && currentUser.displayName && comment.author === currentUser.displayName)
      );

      // 답글 달기 버튼
      const replyToggleBtn = document.createElement("button");
      replyToggleBtn.type = "button";
      replyToggleBtn.className = "comment-action-btn reply";
      replyToggleBtn.textContent = "💬 답글";
      commentActions.appendChild(replyToggleBtn);

      if (isMyComment) {
        // 수정 버튼
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "comment-action-btn edit";
        editBtn.textContent = "수정";
        editBtn.addEventListener("click", async () => {
          const newText = prompt("댓글 내용을 수정하세요:", comment.text);
          if (newText === null) return;
          const trimmed = newText.trim();
          if (!trimmed) {
            alert("댓글 내용을 입력해주세요.");
            return;
          }
          try {
            await updateComment(entry.id, comment.id, trimmed);
          } catch (err) {
            console.error(err);
            showError("댓글 수정에 실패했습니다: " + err.message);
          }
        });
        commentActions.appendChild(editBtn);

        // 삭제 버튼
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "comment-action-btn delete";
        deleteBtn.textContent = "삭제";
        deleteBtn.addEventListener("click", async () => {
          if (confirm("정말 이 댓글을 삭제하시겠습니까?")) {
            try {
              await removeComment(entry.id, comment.id);
            } catch (err) {
              console.error(err);
              showError("댓글 삭제에 실패했습니다: " + err.message);
            }
          }
        });
        commentActions.appendChild(deleteBtn);
      }

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

      replyToggleBtn.addEventListener("click", () => {
        replyForm.hidden = !replyForm.hidden;
        if (!replyForm.hidden) {
          replyInput.focus();
        }
      });

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

      commentItem.appendChild(commentMeta);
      commentItem.appendChild(commentText);
      commentItem.appendChild(commentActions);
      commentItem.appendChild(replyForm);

      // 해당 댓글에 달린 대댓글 목록 렌더링
      const replies = repliesByParent[comment.id] || [];
      if (replies.length > 0) {
        const repliesList = document.createElement("ul");
        repliesList.className = "comment-replies-list";

        for (const reply of replies) {
          const replyItem = document.createElement("li");
          replyItem.className = "comment-reply-item";
          replyItem.id = `comment-${reply.id}`;

          const replyMeta = document.createElement("div");
          replyMeta.className = "comment-meta";

          const replyAuthorWrapper = document.createElement("span");
          replyAuthorWrapper.className = "comment-author-wrapper";

          const replyPrefix = document.createElement("span");
          replyPrefix.className = "comment-reply-prefix";
          replyPrefix.textContent = "↳ ";
          replyAuthorWrapper.appendChild(replyPrefix);

          const replyAuthorDisplayName = (reply.uid && currentProfiles[reply.uid]) ? currentProfiles[reply.uid] : reply.author;

          const replyAuthor = document.createElement("span");
          replyAuthor.className = "comment-author";
          replyAuthor.textContent = replyAuthorDisplayName;
          replyAuthorWrapper.appendChild(replyAuthor);

          const replyDate = document.createElement("span");
          replyDate.className = "comment-date";
          if (reply.createdAt) {
            const rd = new Date(reply.createdAt);
            replyDate.textContent = rd.toLocaleString("ko-KR", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
          }

          replyMeta.appendChild(replyAuthorWrapper);
          replyMeta.appendChild(replyDate);

          const replyText = document.createElement("p");
          replyText.className = "comment-text";
          replyText.textContent = reply.text;

          // 대댓글 액션 (수정, 삭제)
          const replyActions = document.createElement("div");
          replyActions.className = "comment-actions";

          const isMyReply = currentUser && (
            (reply.uid && reply.uid === currentUser.uid) ||
            (reply.author && currentUser.displayName && reply.author === currentUser.displayName)
          );

          if (isMyReply) {
            const replyEditBtn = document.createElement("button");
            replyEditBtn.type = "button";
            replyEditBtn.className = "comment-action-btn edit";
            replyEditBtn.textContent = "수정";
            replyEditBtn.addEventListener("click", async () => {
              const newText = prompt("답글 내용을 수정하세요:", reply.text);
              if (newText === null) return;
              const trimmed = newText.trim();
              if (!trimmed) {
                alert("답글 내용을 입력해주세요.");
                return;
              }
              try {
                await updateComment(entry.id, reply.id, trimmed);
              } catch (err) {
                console.error(err);
                showError("답글 수정에 실패했습니다: " + err.message);
              }
            });
            replyActions.appendChild(replyEditBtn);

            const replyDeleteBtn = document.createElement("button");
            replyDeleteBtn.type = "button";
            replyDeleteBtn.className = "comment-action-btn delete";
            replyDeleteBtn.textContent = "삭제";
            replyDeleteBtn.addEventListener("click", async () => {
              if (confirm("정말 이 답글을 삭제하시겠습니까?")) {
                try {
                  await removeComment(entry.id, reply.id);
                } catch (err) {
                  console.error(err);
                  showError("답글 삭제에 실패했습니다: " + err.message);
                }
              }
            });
            replyActions.appendChild(replyDeleteBtn);
          }

          replyItem.appendChild(replyMeta);
          replyItem.appendChild(replyText);
          if (isMyReply) {
            replyItem.appendChild(replyActions);
          }
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
