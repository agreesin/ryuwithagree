// =========================================================
// profile.js - 사용자 프로필 및 닉네임 관리 모듈
// 관리자 전용 내 이름 변경 및 친구 이름 변경 기능을 담당합니다.
// =========================================================

import { setUserDisplayName } from "./store.js?v=2.7.7";
import { getCurrentUser, getCurrentProfiles, isAdmin } from "./state.js?v=2.7.7";
import { showError } from "./ui.js?v=2.7.7";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const changeNameButton = document.getElementById("change-name-button");
const manageUsersButton = document.getElementById("manage-users-button");
const whoAmI = document.getElementById("who-am-i");

/**
 * 관리자 권한에 따라 이름 변경 버튼들의 표시 여부를 갱신합니다.
 */
export function updateProfileButtonsVisibility(user) {
  const adminUser = isAdmin(user);
  if (changeNameButton) changeNameButton.hidden = !adminUser;
  if (manageUsersButton) manageUsersButton.hidden = !adminUser;
}

/**
 * 프로필 변경 버튼들의 이벤트 리스너를 등록합니다.
 */
export function initProfileHandlers() {
  // ---------------------------------------------------------
  // 내 이름 변경 버튼 (관리자 전용)
  // ---------------------------------------------------------
  if (changeNameButton) {
    changeNameButton.addEventListener("click", async () => {
      const currentUser = getCurrentUser();
      if (!currentUser || !isAdmin(currentUser)) {
        alert("이름 변경 권한이 없습니다. (관리자 전용 기능)");
        return;
      }

      const currentProfiles = getCurrentProfiles();
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
        if (whoAmI) whoAmI.textContent = trimmed;
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
      const currentUser = getCurrentUser();
      if (!currentUser || !isAdmin(currentUser)) {
        alert("상대방 이름 변경 권한이 없습니다. (관리자 전용 기능)");
        return;
      }

      const currentProfiles = getCurrentProfiles();
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
}
