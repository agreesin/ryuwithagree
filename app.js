// =========================================================
// 다이어리 - 바이브 코딩 실습 초기 코드
//
// 담당: [본인 이름]
// 지금 되는 것 : 글을 쓰면 화면에 나타난다
// 지금 안 되는 것 : 새로고침하면 사라진다 / 지울 수 없다 / 날짜가 없다
//
// 안 되는 것들은 오늘 실습으로 채웁니다. 맨 아래 TODO 참고.
// =========================================================

// 작성한 글을 담아두는 곳 (지금은 메모리에만 있음)
const entries = [];

// 화면 요소 가져오기
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const saveButton = document.getElementById("save-button");
const listElement = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");

// 저장 버튼을 누르면 addEntry 실행
saveButton.addEventListener("click", addEntry);

// 글 하나를 추가한다
function addEntry() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (title === "") {
    alert("제목을 입력하세요.");
    titleInput.focus();
    return;
  }

  // 새 글을 목록 맨 앞에 넣는다
  entries.unshift({
    title: title,
    body: body,
  });

  // 입력창 비우기
  titleInput.value = "";
  bodyInput.value = "";
  titleInput.focus();

  render();

  // TODO(2단계): 여기서 저장하기
}

// entries 배열을 보고 화면을 다시 그린다
function render() {
  // 기존 목록 비우기
  listElement.innerHTML = "";

  // 글이 하나도 없으면 안내 문구를 보여준다
  emptyMessage.hidden = entries.length > 0;

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = "entry";

    const entryTitle = document.createElement("h2");
    entryTitle.className = "entry-title";
    entryTitle.textContent = entry.title;

    const entryBody = document.createElement("p");
    entryBody.className = "entry-body";
    entryBody.textContent = entry.body;

    item.appendChild(entryTitle);
    item.appendChild(entryBody);
    listElement.appendChild(item);

    // TODO(3단계): 삭제 버튼 만들기
  }
}

// 시작할 때 한 번 그린다
render();

// =========================================================
// 오늘 만들 것 (하나씩, 순서대로)
//
// [ ] 2단계 - 새로고침해도 글이 남게 한다 (localStorage)
// [ ] 3단계 - 글마다 삭제 버튼을 만든다
// [ ] 3단계 - 글마다 작성 날짜를 보여준다
//
// AI에게 요청할 때는 파일을 못 박는다.
//   예) "app.js 만 수정해. index.html 과 style.css 는 건드리지 마."
//       "위 3개 중 첫 번째만 해줘. 나머지는 지금 하지 마."
// =========================================================
