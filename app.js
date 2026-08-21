// =========================================================
// 다이어리 - 바이브 코딩 실습
//
// 담당: [본인 이름]
//
// 지금 되는 것 : 글을 쓰면 저장되고, 상대 화면에도 바로 나타난다
// 지금 안 되는 것 : 지울 수 없다 / 날짜가 안 보인다 / 못생겼다
//
// 안 되는 것들을 오늘 채웁니다. 맨 아래 TODO 참고.
// =========================================================

import { subscribeEntries, addEntry, removeEntry } from "./store.js";

// 화면 요소 가져오기
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const saveButton = document.getElementById("save-button");
const listElement = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const errorBanner = document.getElementById("error-banner");
const whoAmI = document.getElementById("who-am-i");

// ---------------------------------------------------------
// 내 이름 (이 컴퓨터에만 저장됨)
// ---------------------------------------------------------
function getMyName() {
  let name = localStorage.getItem("myName");

  if (!name) {
    name = prompt("이름을 입력하세요 (일기에 표시됩니다)");
    if (!name) name = "익명";
    localStorage.setItem("myName", name);
  }

  return name;
}

const myName = getMyName();
whoAmI.textContent = myName;

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
    await addEntry({ title: title, body: body, author: myName });

    titleInput.value = "";
    bodyInput.value = "";
    titleInput.focus();
  } catch (error) {
    console.error(error);
    showError("저장하지 못했습니다. 인터넷 연결을 확인하세요.");
  } finally {
    saveButton.disabled = false;
  }
}

// ---------------------------------------------------------
// 목록 지켜보기
// 내가 쓰든 상대가 쓰든, 바뀌면 render가 자동 실행된다
// ---------------------------------------------------------
subscribeEntries(render, () => {
  showError("목록을 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
});

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

    const entryTitle = document.createElement("h2");
    entryTitle.className = "entry-title";
    entryTitle.textContent = entry.title;

    const entryAuthor = document.createElement("span");
    entryAuthor.className = "entry-author";
    entryAuthor.textContent = entry.author;

    const entryBody = document.createElement("p");
    entryBody.className = "entry-body";
    entryBody.textContent = entry.body;

    item.appendChild(entryTitle);
    item.appendChild(entryAuthor);
    item.appendChild(entryBody);
    listElement.appendChild(item);

    // TODO(1): 여기에 삭제 버튼 만들기
    //          store.js의 removeEntry(entry.id) 를 부르면 지워집니다
    // TODO(2): 여기에 작성 날짜 보여주기
    //          entry.createdAt 안에 숫자로 들어 있습니다
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
// [ ] TODO(1) 삭제 버튼
// [ ] TODO(2) 작성 날짜 표시
// [ ] 화면 꾸미기 (style.css - 친구 담당)
//
// AI에게 요청할 때는 파일을 못 박는다.
//   예) "app.js 만 수정해. store.js 와 index.html 은 건드리지 마."
//       "TODO(1)만 해줘. TODO(2)는 아직 하지 마."
//
// ★ store.js 는 절대 수정하지 않는다. 앱 전체가 죽는다.
// =========================================================
