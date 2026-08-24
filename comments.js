// =========================================================
// comments.js - 일기 댓글 컴포넌트 모듈
// 댓글 목록 렌더링, 댓글 작성자 이름 변경, 댓글 작성 폼 배선을 담당합니다.
// ★ 목록 갱신은 Firestore onSnapshot이 담당하므로 수동 render 호출은 불필요하며 render.js를 import하지 않습니다.
// =========================================================

import {
  addComment,
  updateCommentAuthor,
  setUserDisplayName,
} from "./store.js";
import { getCurrentUser, getCurrentProfiles, isAdmin } from "./state.js";
import { showError } from "./ui.js";

/**
 * 개별 일기 카드의 댓글 영역 DOM 요소를 생성하여 반환합니다.
 * @param {Object} entry - 일기 문서 객체
 * @returns {HTMLElement} 댓글 섹션 div 요소
 */
export function createCommentsSection(entry) {
  const currentUser = getCurrentUser();
  const currentProfiles = getCurrentProfiles();

  const commentsSection = document.createElement("div");
  commentsSection.className = "comments-section";

  const comments = entry.comments || [];

  const commentsHeader = document.createElement("div");
  commentsHeader.className = "comments-header";
  commentsHeader.textContent = `댓글 ${comments.length > 0 ? `(${comments.length})` : ""}`;
  commentsSection.appendChild(commentsHeader);

  // 댓글 목록
  if (comments.length > 0) {
    const commentsList = document.createElement("ul");
    commentsList.className = "comments-list";

    for (const comment of comments) {
      const commentItem = document.createElement("li");
      commentItem.className = "comment-item";

      const commentMeta = document.createElement("div");
      commentMeta.className = "comment-meta";

      const commentAuthorWrapper = document.createElement("span");
      commentAuthorWrapper.className = "comment-author-wrapper";

      const commentAuthorDisplayName = (comment.uid && currentProfiles[comment.uid]) ? currentProfiles[comment.uid] : comment.author;

      const commentAuthor = document.createElement("span");
      commentAuthor.className = "comment-author";
      commentAuthor.textContent = commentAuthorDisplayName;
      commentAuthorWrapper.appendChild(commentAuthor);

      // 관리자에게만 댓글 작성자 이름 강제 변경 버튼 노출
      if (isAdmin(currentUser)) {
        const editCommentAuthorBtn = document.createElement("button");
        editCommentAuthorBtn.className = "edit-author-btn";
        editCommentAuthorBtn.type = "button";
        editCommentAuthorBtn.textContent = "✏️";
        editCommentAuthorBtn.title = "댓글 작성자 이름 자체를 변경 (관리자 전용)";
        editCommentAuthorBtn.addEventListener("click", async () => {
          const currentAuthorName = (comment.uid && currentProfiles[comment.uid]) ? currentProfiles[comment.uid] : comment.author;
          const newName = prompt(
            `댓글 작성자 '${currentAuthorName}'님의 이름 자체를 무엇으로 변경할까요?\n(해당 사용자의 프로필 및 모든 글/댓글에 적용됩니다)`,
            currentAuthorName
          );
          if (newName === null) return;
          const trimmed = newName.trim();
          if (!trimmed) {
            alert("이름을 입력해주세요.");
            return;
          }
          try {
            if (comment.uid) {
              await setUserDisplayName(comment.uid, trimmed);
            } else {
              await updateCommentAuthor(entry.id, comment.id, trimmed);
            }
            alert(`'${currentAuthorName}'님의 이름이 '${trimmed}'(으)로 변경되었습니다!`);
          } catch (err) {
            console.error(err);
            showError("댓글 작성자 이름 변경에 실패했습니다: " + err.message);
          }
        });
        commentAuthorWrapper.appendChild(editCommentAuthorBtn);
      }

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

      commentItem.appendChild(commentMeta);
      commentItem.appendChild(commentText);
      commentsList.appendChild(commentItem);
    }

    commentsSection.appendChild(commentsList);
  }

  // 댓글 작성 폼
  const commentForm = document.createElement("form");
  commentForm.className = "comment-form";
  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = commentInput.value.trim();
    if (!text) return;

    commentSubmitBtn.disabled = true;
    try {
      await addComment(entry.id, text);
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
