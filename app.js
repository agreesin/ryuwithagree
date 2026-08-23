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
  updateEntryAuthor,
  updateCommentAuthor,
  subscribeProfiles,
  setUserDisplayName,
} from "./store.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

// 화면 요소 가져오기
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const loginArea = document.getElementById("login-area");
const appArea = document.getElementById("app-area");
const whoAmI = document.getElementById("who-am-i");
const changeNameButton = document.getElementById("change-name-button");
const manageUsersButton = document.getElementById("manage-users-button");

const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const saveButton = document.getElementById("save-button");
const listElement = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const errorBanner = document.getElementById("error-banner");

// 로그인한 사용자 정보 및 프로필/목록 지켜보기를 멈출 때 쓰는 손잡이
let currentUser = null;
let currentProfiles = {};
let stopWatchingEntries = null;
let stopWatchingProfiles = null;

// 관리자 이메일 목록 (이 계정만 모든 이름 변경 권한을 가짐)
const ADMIN_EMAILS = ["ehd8109@gmail.com"];

function isAdmin(user) {
  if (!user) return false;
  if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) return true;
  return false;
}

// ---------------------------------------------------------
// 내 이름 변경 버튼 (관리자 전용)
// ---------------------------------------------------------
if (changeNameButton) {
  changeNameButton.addEventListener("click", async () => {
    if (!currentUser || !isAdmin(currentUser)) {
      alert("이름 변경 권한이 없습니다. (관리자 전용 기능)");
      return;
    }

    const currentName = currentProfiles[currentUser.uid] || currentUser.displayName || "";
    const newName = prompt("변경할 내 닉네임(이름)을 입력하세요:", currentName);

    if (newName === null) return; // 취소한 경우
    const trimmed = newName.trim();
    if (trimmed === "") {
      alert("이름은 빈 칸으로 둘 수 없습니다.");
      return;
    }

    try {
      await setUserDisplayName(currentUser.uid, trimmed);
      try {
        await updateProfile(currentUser, { displayName: trimmed });
      } catch (e) {
        // updateProfile 실패 시에도 Firestore 프로필 우선 적용
      }
      whoAmI.textContent = trimmed;
      alert(`내 이름이 '${trimmed}'(으)로 변경되었습니다! 모든 글과 화면에 적용됩니다.`);
    } catch (error) {
      console.error(error);
      showError("이름을 변경하지 못했습니다: " + error.message);
    }
  });
}

// ---------------------------------------------------------
// 👥 친구 이름 변경 버튼 (관리자 전용)
// ---------------------------------------------------------
if (manageUsersButton) {
  manageUsersButton.addEventListener("click", async () => {
    if (!currentUser || !isAdmin(currentUser)) {
      alert("상대방 이름 변경 권한이 없습니다. (관리자 전용 기능)");
      return;
    }

    const otherUids = Object.keys(currentProfiles).filter((uid) => uid !== currentUser.uid);
    if (otherUids.length === 0) {
      alert("아직 등록된 다른 참여자가 없습니다. 글이나 댓글의 ✏️ 버튼을 눌러 변경할 수도 있습니다.");
      return;
    }

    let menu = "이름을 변경할 대상을 선택하세요:\n";
    otherUids.forEach((uid, idx) => {
      menu += `${idx + 1}. ${currentProfiles[uid]}\n`;
    });

    const choice = prompt(menu + "\n번호를 입력하세요:");
    if (choice === null) return;

    const index = parseInt(choice, 10) - 1;
    if (isNaN(index) || index < 0 || index >= otherUids.length) {
      alert("올바른 번호를 입력해주세요.");
      return;
    }

    const targetUid = otherUids[index];
    const oldName = currentProfiles[targetUid];
    const newName = prompt(`'${oldName}'님의 새 이름을 입력하세요:\n(상대방의 화면과 모든 글에 즉시 적용됩니다)`, oldName);
    if (newName === null) return;

    const trimmed = newName.trim();
    if (!trimmed) {
      alert("이름을 입력해주세요.");
      return;
    }

    try {
      await setUserDisplayName(targetUid, trimmed);
      alert(`'${oldName}'님의 이름이 '${trimmed}'(으)로 성공적으로 변경되었습니다!`);
    } catch (err) {
      console.error(err);
      showError("상대방 이름 변경 실패: " + err.message);
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
    whoAmI.textContent = currentProfiles[user.uid] || user.displayName || "이름 없음";

    // 관리자(ehd8109@gmail.com)에게만 이름 변경 버튼 노출
    const adminUser = isAdmin(user);
    if (changeNameButton) changeNameButton.hidden = !adminUser;
    if (manageUsersButton) manageUsersButton.hidden = !adminUser;

    stopWatchingProfiles = subscribeProfiles((profiles) => {
      currentProfiles = profiles;
      if (currentUser) {
        whoAmI.textContent = profiles[currentUser.uid] || currentUser.displayName || "이름 없음";
      }
    });

    stopWatchingEntries = subscribeEntries(render, () => {
      showError("목록을 불러오지 못했습니다. 접근 권한을 확인하세요.");
    });
  } else {
    // 로그아웃됨
    if (stopWatchingEntries) {
      stopWatchingEntries();
      stopWatchingEntries = null;
    }
    if (stopWatchingProfiles) {
      stopWatchingProfiles();
      stopWatchingProfiles = null;
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

    const authorWrapper = document.createElement("span");
    authorWrapper.className = "entry-author-wrapper";

    const authorDisplayName = (entry.uid && currentProfiles[entry.uid]) ? currentProfiles[entry.uid] : entry.author;

    const entryAuthor = document.createElement("span");
    entryAuthor.className = "entry-author";
    entryAuthor.textContent = `작성자: ${authorDisplayName}`;
    authorWrapper.appendChild(entryAuthor);

    // 관리자(ehd8109@gmail.com)에게만 작성자 이름 강제 변경 버튼 노출
    if (isAdmin(currentUser)) {
      const editAuthorBtn = document.createElement("button");
      editAuthorBtn.className = "edit-author-btn";
      editAuthorBtn.type = "button";
      editAuthorBtn.textContent = "✏️";
      editAuthorBtn.title = "작성자 이름 자체를 변경 (관리자 전용)";
      editAuthorBtn.addEventListener("click", async () => {
        const currentAuthorName = (entry.uid && currentProfiles[entry.uid]) ? currentProfiles[entry.uid] : entry.author;
        const newName = prompt(
          `'${currentAuthorName}'님의 이름 자체를 무엇으로 변경할까요?\n(해당 사용자의 프로필, 모든 글과 앞으로 작성할 글의 이름이 변경됩니다)`,
          currentAuthorName
        );
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed) {
          alert("이름을 입력해주세요.");
          return;
        }
        try {
          if (entry.uid) {
            await setUserDisplayName(entry.uid, trimmed);
          } else {
            await updateEntryAuthor(entry.id, trimmed);
          }
          alert(`'${currentAuthorName}'님의 이름이 '${trimmed}'(으)로 변경되었습니다!`);
        } catch (err) {
          console.error(err);
          showError("작성자 이름을 변경하지 못했습니다: " + err.message);
        }
      });
      authorWrapper.appendChild(editAuthorBtn);
    }

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

    metaDiv.appendChild(authorWrapper);
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

        const commentAuthorWrapper = document.createElement("span");
        commentAuthorWrapper.className = "comment-author-wrapper";

        const commentAuthorDisplayName = (comment.uid && currentProfiles[comment.uid]) ? currentProfiles[comment.uid] : comment.author;

        const commentAuthor = document.createElement("span");
        commentAuthor.className = "comment-author";
        commentAuthor.textContent = commentAuthorDisplayName;
        commentAuthorWrapper.appendChild(commentAuthor);

        // 관리자(ehd8109@gmail.com)에게만 댓글 작성자 이름 강제 변경 버튼 노출
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
