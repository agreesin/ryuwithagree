// =========================================================
// 다이어리 - 바이브 코딩 실습
//
// 담당: [본인 이름]
//
// 지금 되는 것 : 구글 로그인 / 글 저장 / 상대 화면에 즉시 반영
// 지금 안 되는 것 : 지울 수 없다 / 날짜가 안 보인다 / 못생겼다
//
// 안 되는 것들을 오늘 채웁니다. 맨 아래 TODO 참고.
// =========================================================

import {
  watchLogin,
  login,
  logout,
  subscribeEntries,
  addEntry,
  removeEntry,
  addComment,
} from "./store.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

// 화면 요소 가져오기
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const loginArea = document.getElementById("login-area");
const appArea = document.getElementById("app-area");
const whoAmI = document.getElementById("who-am-i");
const changeNameButton = document.getElementById("change-name-button");

const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const saveButton = document.getElementById("save-button");
const listElement = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const errorBanner = document.getElementById("error-banner");

// 로그인한 사용자 정보 및 목록 지켜보기를 멈출 때 쓰는 손잡이
let currentUser = null;
let stopWatching = null;

// ---------------------------------------------------------
// 이름 변경 버튼 (본인 계정 이름 변경)
// ---------------------------------------------------------
if (changeNameButton) {
  changeNameButton.addEventListener("click", async () => {
    if (!currentUser) return;

    const currentName = currentUser.displayName || "";
    const newName = prompt("변경할 닉네임(이름)을 입력하세요:", currentName);

    if (newName === null) return; // 취소한 경우
    const trimmed = newName.trim();
    if (trimmed === "") {
      alert("이름은 빈 칸으로 둘 수 없습니다.");
      return;
    }

    try {
      await updateProfile(currentUser, { displayName: trimmed });
      whoAmI.textContent = trimmed;
      alert(`이름이 '${trimmed}'(으)로 변경되었습니다! 앞으로 작성하는 글에 적용됩니다.`);
    } catch (error) {
      console.error(error);
      showError("이름을 변경하지 못했습니다: " + error.message);
    }
  });
}

// ---------------------------------------------------------
// 로그인 버튼
// ---------------------------------------------------------
loginButton.addEventListener("click", async () => {
  try {
    await login();
  } catch (error) {
    console.error(error);
    showError("로그인하지 못했습니다. 팝업이 차단되지 않았는지 확인하세요.");
  }
});

logoutButton.addEventListener("click", () => logout());

// ---------------------------------------------------------
// 로그인 상태가 바뀔 때마다 실행됨
// ---------------------------------------------------------
watchLogin((user) => {
  currentUser = user;
  if (user) {
    // 로그인됨
    loginArea.hidden = true;
    appArea.hidden = false;
    whoAmI.textContent = user.displayName || "이름 없음";

    stopWatching = subscribeEntries(render, () => {
      showError("목록을 불러오지 못했습니다. 접근 권한을 확인하세요.");
    });
  } else {
    // 로그아웃됨
    if (stopWatching) {
      stopWatching();
      stopWatching = null;
    }
    loginArea.hidden = false;
    appArea.hidden = true;
    listElement.innerHTML = "";
    hideError();
  }
});

// ---------------------------------------------------------
// 저장 버튼
// ---------------------------------------------------------
saveButton.addEventListener("click", onSave);

async function onSave() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (title === "") {
    alert("제목을 입력하세요.");
    titleInput.focus();
    return;
  }

  saveButton.disabled = true;

  try {
    await addEntry({ title: title, body: body });

    titleInput.value = "";
    bodyInput.value = "";
    titleInput.focus();
  } catch (error) {
    console.error(error);
    showError("저장하지 못했습니다. 인터넷 연결과 권한을 확인하세요.");
  } finally {
    saveButton.disabled = false;
  }
}

// ---------------------------------------------------------
// 화면 그리기
// ---------------------------------------------------------
function render(entries) {
  hideError();
  listElement.innerHTML = "";
  emptyMessage.hidden = entries.length > 0;

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = "entry";

    const headerDiv = document.createElement("div");
    headerDiv.className = "entry-header";

    const entryTitle = document.createElement("h2");
    entryTitle.className = "entry-title";
    entryTitle.textContent = entry.title;

    headerDiv.appendChild(entryTitle);

    // 내가 쓴 글인지 확인 (uid 일치 또는 작성자 이름 일치)
    const isMyEntry = currentUser && (
      (entry.uid && entry.uid === currentUser.uid) ||
      (entry.author && currentUser.displayName && entry.author === currentUser.displayName)
    );

    if (isMyEntry) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-button";
      deleteButton.type = "button";
      deleteButton.textContent = "삭제";
      deleteButton.addEventListener("click", async () => {
        if (confirm("정말 이 일기를 삭제하시겠습니까?")) {
          try {
            await removeEntry(entry.id);
          } catch (error) {
            console.error(error);
            showError("삭제하지 못했습니다. 인터넷 연결과 권한을 확인하세요.");
          }
        }
      });
      headerDiv.appendChild(deleteButton);
    }

    const metaDiv = document.createElement("div");
    metaDiv.className = "entry-meta";

    const entryAuthor = document.createElement("span");
    entryAuthor.className = "entry-author";
    entryAuthor.textContent = `작성자: ${entry.author}`;

    // TODO(2): 작성 날짜 보여주기
    const entryDate = document.createElement("span");
    entryDate.className = "entry-date";
    if (entry.createdAt) {
      const d = new Date(entry.createdAt);
      entryDate.textContent = d.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    metaDiv.appendChild(entryAuthor);
    metaDiv.appendChild(entryDate);

    const entryBody = document.createElement("p");
    entryBody.className = "entry-body";
    entryBody.textContent = entry.body;

    item.appendChild(headerDiv);
    item.appendChild(metaDiv);
    item.appendChild(entryBody);

    // 댓글 영역
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

        const commentAuthor = document.createElement("span");
        commentAuthor.className = "comment-author";
        commentAuthor.textContent = comment.author;

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

        commentMeta.appendChild(commentAuthor);
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

    item.appendChild(commentsSection);
    listElement.appendChild(item);
  }
}

// ---------------------------------------------------------
// 오류 표시
// ---------------------------------------------------------
function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function hideError() {
  errorBanner.hidden = true;
}

// =========================================================
// 오늘 만들 것 (하나씩, 순서대로)
//
// [x] TODO(1) 삭제 버튼
// [x] TODO(2) 작성 날짜 표시
// [x] 화면 꾸미기 (style.css - 친구 담당)
//
// AI에게 요청할 때는 파일을 못 박는다.
//   예) "app.js 만 수정해. store.js 와 index.html 은 건드리지 마."
//       "TODO(1)만 해줘. TODO(2)는 아직 하지 마."
//
// ★ store.js 는 절대 수정하지 않는다. 앱 전체가 죽는다.
// =========================================================
