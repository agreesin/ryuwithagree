// =========================================================
// questions.js - 사귄 일 수(D-Day) 맞춤형 커플 질문 엔진
//
// 1. 커플 D-Day / 생일 당일 질문 최우선 배정
// 2. 캘린더 특정 시즌 (크리스마스, 발렌타인 등) 질문 배정
// 3. 사귄 일 수(D-Day)를 분석하여 단계별로 엄격히 필터링:
//    - Phase 1 (1~50일): 풋풋한 시작/탐색기 (첫인상, 취향, 사소한 설렘)
//    - Phase 2 (51~150일): 알콩달콩 적응기 (사소한 습관, 데이트 추억, 삐쳤을 때)
//    - Phase 3 (151~365일): 애정 심화기 (가치관, 사계절 추억, 갈등 극복)
//    - Phase 4 (366일 이상): 단단한 동반자 (연애 초반 비교, 10년 뒤 미래, 집)
// 4. 오늘 날짜(YYYY-MM-DD) 기반 결정론적 해시로 두 사람 동기화
// =========================================================

// 1. 특정 캘린더 시즌 / 기념일 질문 (월-일 기준)
const CALENDAR_SEASON_QUESTIONS = [
  {
    month: 12,
    date: [24, 25],
    badge: "🎄 크리스마스 특별 질문",
    text: "우리의 크리스마스에 산타 할아버지가 우리 둘만을 위해 소원을 하나 들어준다면?",
  },
  {
    month: 12,
    date: [31],
    badge: "🎆 연말 특별 질문",
    text: "올 한 해 동안 상대방에게 가장 고마웠던 순간과, 함께해서 가장 행복했던 기억은?",
  },
  {
    month: 1,
    date: [1],
    badge: "🌅 새해 특별 질문",
    text: "새해를 맞아 우리 둘이 올해 꼭 함께 달성하고 싶은 커플 버킷리스트는?",
  },
  {
    month: 2,
    date: [14],
    badge: "🍫 발렌타인데이 질문",
    text: "상대방을 떠올리면 생각나는 가장 달콤하고 설렜던 순간은 언제인가요?",
  },
  {
    month: 3,
    date: [14],
    badge: "🍭 화이트데이 질문",
    text: "상대방에게 줄 수 있는 세상에서 가장 달콤하고 특별한 선물은 무엇일까요?",
  },
  {
    month: 5,
    date: [14],
    badge: "🌹 로즈데이 질문",
    text: "상대방을 꽃에 비유한다면 어떤 꽃이고, 그 이유는 무엇인가요?",
  },
  {
    month: 11,
    date: [11],
    badge: "🥢 빼빼로데이 질문",
    text: "평소 상대방에게 꼭 전하고 싶었지만 쑥스러워 아껴두었던 사랑의 한마디는?",
  },
  {
    month: 10,
    date: [31],
    badge: "🎃 할로윈 특별 질문",
    text: "만약 우리 둘이 커플 코스튬을 입고 파티에 간다면 어떤 캐릭터를 해보고 싶나요?",
  },
  {
    month: 4,
    date: [1],
    badge: "🃏 만우절 특별 질문",
    text: "진짜인 척 상대방에게 쳤던 장난 중 가장 기억에 남는 것이나, 해보고 싶은 귀여운 장난은?",
  },
];

// 2. 계절 감성 질문 (봄: 3~5월, 여름: 6~8월, 가을: 9~11월, 겨울: 12~2월)
const SEASONAL_QUESTIONS = {
  spring: [
    "따스한 봄바람이 부는 날, 상대방의 손을 잡고 꼭 걷고 싶은 장소는 어디인가요?",
    "봄날의 벚꽃 아래에서 상대방과 함께 찍고 싶은 인생 사진 포즈는?",
    "상대방과 함께 떠나고 싶은 봄날의 피크닉 도시락 메뉴 1위는?",
    "봄바람처럼 나를 설레게 만드는 상대방의 사소한 행동은?",
  ],
  summer: [
    "더운 여름날, 우리 둘만의 가장 시원하고 완벽한 데이트 코스는? (바다 vs 계곡 vs 시원한 카페)",
    "무더운 여름밤, 상대방과 함께 시원한 야식을 먹으며 보고 싶은 영화는?",
    "여름휴가로 단둘이 조용한 휴양지에 간다면 꼭 챙겨갈 3가지는?",
    "상대방과 함께 먹었던 여름 디저트 중 가장 맛있었던 것은?",
  ],
  autumn: [
    "선선한 가을밤, 손잡고 밤산책을 하면서 상대방과 함께 듣고 싶은 노래는?",
    "알록달록 단풍이 물든 계절, 상대방과 꼭 같이 가보고 싶은 가을 여행지는?",
    "쌀쌀해진 날씨에 상대방의 주머니 속에 쏙 손을 넣었을 때의 기분은?",
    "가을을 타는 나를 1초 만에 웃게 만들어주는 상대방만의 마법 같은 행동은?",
  ],
  winter: [
    "눈이 펑펑 내리는 날, 창밖을 보며 상대방과 함께 마시고 싶은 따뜻한 음료는?",
    "추운 겨울날 길거리에서 파는 겨울 간식 중 상대방과 나눠 먹고 싶은 것은?",
    "추운 날씨에 서로의 꽁꽁 언 손과 볼을 녹여주는 우리만의 가장 다정한 방법은?",
    "첫눈이 오는 순간 가장 먼저 생각나는 상대방의 표정이나 모습은?",
  ],
};

// 3. 연애 일수(D-Day) 단계별 질문 풀
const ROMANCE_QUESTIONS_POOL = [
  // ==========================================
  // [Phase 1: 1~50일 - 풋풋한 시작/탐색기]
  // ※ 연애 초반 비교, 10년 뒤 미래, 권태기 질문 절대 금지
  // ==========================================
  { minDays: 1, maxDays: 70, text: "우리가 처음 만났던 날, 상대방의 첫인상은 어땠나요?" },
  { minDays: 1, maxDays: 70, text: "상대방에게 '이 사람이다!' 하고 호감이 확 커졌던 결정적인 순간은?" },
  { minDays: 1, maxDays: 70, text: "우리 처음 사귀기로 한 날의 공기와 그때의 속마음은 어땠나요?" },
  { minDays: 1, maxDays: 70, text: "처음 손을 잡거나 포옹했을 때 심장이 얼마나 뛰었나요?" },
  { minDays: 1, maxDays: 90, text: "상대방이 나를 부를 때 가장 듣기 좋은 호칭이나 말투는?" },
  { minDays: 1, maxDays: 90, text: "상대방의 얼굴이나 신체 부위 중 내가 가장 좋아하는 곳은?" },
  { minDays: 1, maxDays: 90, text: "상대방을 동물에 비유한다면 어떤 동물일까요? 그 이유는?" },
  { minDays: 1, maxDays: 90, text: "상대방의 냄새나 향기 중 나를 기분 좋게 해주는 향은?" },
  { minDays: 1, maxDays: 90, text: "상대방의 카톡이나 연락을 기다릴 때 내 모습은 어떤가요?" },
  { minDays: 1, maxDays: 120, text: "내가 생각하는 상대방의 가장 큰 매력 포인트 3가지는?" },
  { minDays: 1, maxDays: 120, text: "아무것도 안 하고 누워서 뒹굴거리는 집 데이트 vs 하루 종일 밖에서 노는 데이트?" },
  { minDays: 1, maxDays: 120, text: "상대방과 함께 먹었던 음식 중 가장 맛있고 기억에 남는 메뉴는?" },
  { minDays: 1, maxDays: 120, text: "상대방과 함께 해본 것 중 '이건 진짜 우리 둘 다 잘 맞는다' 싶었던 취향은?" },
  { minDays: 1, maxDays: 120, text: "상대방과 단둘이 드라이브하거나 산책할 때 듣고 싶은 노래는?" },
  { minDays: 1, maxDays: 120, text: "최근에 상대방을 보며 '진짜 귀엽다' 혹은 '사랑스럽다'고 느낀 순간은?" },
  { minDays: 1, maxDays: 120, text: "상대방이 지어주는 표정 중 내가 제일 좋아하는 표정은?" },
  { minDays: 1, maxDays: 120, text: "상대방이 입었을 때 가장 예쁘거나 멋져 보이는 옷 스타일은?" },
  { minDays: 1, maxDays: 120, text: "비 오는 날, 빗소리를 들으며 상대방과 함께 하고 싶은 것은?" },
  { minDays: 1, maxDays: 120, text: "서로에게 지어준 별명이나 애칭 중 가장 마음에 드는 것은?" },
  { minDays: 1, maxDays: 120, text: "요즘 나를 가장 설레게 만드는 상대방의 사소한 행동은?" },

  // ==========================================
  // [Phase 2: 40~180일 - 알콩달콩 적응기]
  // ==========================================
  { minDays: 40, maxDays: 200, text: "지금까지 우리가 함께했던 데이트 중 내 마음속 1위 레전드 데이트는?" },
  { minDays: 40, maxDays: 250, text: "나만 알고 있는 상대방의 사소하고 귀여운 버릇이나 습관은?" },
  { minDays: 40, maxDays: 250, text: "상대방이 피곤하거나 졸릴 때 나오는 특유의 귀여운 행동은?" },
  { minDays: 40, maxDays: 250, text: "내가 삐쳤거나 서운할 때, 상대방이 어떻게 해주면 사르르 풀리나요?" },
  { minDays: 40, maxDays: 300, text: "내가 상대방에게 가장 고맙게 느끼는 평소의 배려는 무엇인가요?" },
  { minDays: 40, maxDays: 300, text: "상대방이 해준 칭찬 중 지금까지도 마음에 남아있는 가장 뿌듯한 말은?" },
  { minDays: 50, maxDays: 300, text: "언젠가 꼭 상대방에게 직접 만들어주고 싶은 정성 가득한 요리는?" },
  { minDays: 50, maxDays: 300, text: "상대방과 함께 여행 갔을 때 발견한 상대방의 의외의 매력은?" },
  { minDays: 50, maxDays: 300, text: "상대방에게 최근 가장 심쿵했던 스킨십이나 순간은 언제였나요?" },
  { minDays: 50, maxDays: 300, text: "만약 하루 동안 서로의 몸이 바뀐다면 가장 먼저 해보고 싶은 일은?" },
  { minDays: 50, maxDays: 300, text: "최근에 상대방 때문에 빵 터져서 배꼽 잡고 웃었던 일은?" },
  { minDays: 50, maxDays: 300, text: "상대방의 작은 변화(헤어, 옷, 기분 등)를 나는 얼마나 빨리 눈치채나요?" },
  { minDays: 50, maxDays: 300, text: "지친 날 나를 충전해 주는 상대방의 특효약 같은 말이나 행동은?" },
  { minDays: 50, maxDays: 300, text: "상대방과 함께 장을 보고 요리를 해 먹는 일상에 대해 어떻게 생각하나요?" },
  { minDays: 50, maxDays: 300, text: "상대방에게 매일매일 해줘도 절대 질리지 않을 말은 무엇인가요?" },
  { minDays: 50, maxDays: 300, text: "상대방이 나를 얼마나 사랑하는지 온몸으로 느껴졌던 순간은 언제인가요?" },
  { minDays: 50, maxDays: 300, text: "상대방에게 받은 선물이나 편지 중 가장 아끼는 보물 1호는?" },
  { minDays: 50, maxDays: 300, text: "상대방과 나의 성격 중 '이건 정반대인데 그래서 오히려 좋다'고 느끼는 점은?" },

  // ==========================================
  // [Phase 3: 120~400일 - 애정 심화기]
  // ==========================================
  { minDays: 120, maxDays: 500, text: "연인 사이에 이것만은 꼭 서로 지켜줬으면 하는 가장 중요한 약속 한 가지는?" },
  { minDays: 120, maxDays: 600, text: "서로 의견이 다를 때 우리 둘이 가장 지혜롭게 풀어가는 방법은?" },
  { minDays: 120, maxDays: 600, text: "상대방과 함께 있으면서 내 자신이 더 좋은 사람이 되어간다고 느끼는 순간은?" },
  { minDays: 120, maxDays: 600, text: "상대방의 성격 중 내가 가장 닮고 싶거나 존경하는 부분은?" },
  { minDays: 120, maxDays: 600, text: "상대방이 기분이 안 좋아 보일 때 내가 해줄 수 있는 최고의 위로는?" },
  { minDays: 120, maxDays: 600, text: "상대방이 나에게 의지해주었을 때 가장 뿌듯했던 기억은?" },
  { minDays: 120, maxDays: 600, text: "힘든 하루 끝에 상대방의 목소리를 듣거나 얼굴을 볼 때 드는 생각은?" },
  { minDays: 120, maxDays: 600, text: "상대방과 나누었던 수많은 대화 중 마음속에 가장 깊이 박힌 한마디는?" },
  { minDays: 120, maxDays: 600, text: "상대방에게 배운 것 중 내 삶을 더 긍정적으로 바꿔준 것이 있다면?" },
  { minDays: 120, maxDays: 600, text: "내가 아플 때 상대방이 챙겨주었던 것 중 가장 감동이었던 것은?" },
  { minDays: 150, maxDays: 600, text: "상대방과 함께 보낸 계절들 중 가장 애틋했던 계절은 언제인가요?" },
  { minDays: 150, maxDays: 600, text: "우리가 처음 손잡고 찍었던 사진을 지금 다시 보면 어떤 기분이 드나요?" },
  { minDays: 150, maxDays: 600, text: "우리가 함께 만든 수많은 추억들 중 사진으로 남기지 못해 아쉬운 순간은?" },
  { minDays: 150, maxDays: 600, text: "만약 로또 1등에 당첨된다면 상대방을 위해 제일 먼저 해주고 싶은 선물은?" },
  { minDays: 150, maxDays: 600, text: "서로가 서로의 인생에 나타나지 않았다면 지금 내 모습은 어땠을까요?" },
  { minDays: 150, maxDays: 600, text: "우리의 연애를 색깔로 표현한다면 어떤 색깔에 가까울까요?" },

  // ==========================================
  // [Phase 4: 250일 이상 - 단단한 동반자 / 장기 연애]
  // ==========================================
  { minDays: 250, maxDays: 99999, text: "연애 초반과 비교했을 때, 지금 가장 편안해지고 좋아진 점은?" },
  { minDays: 250, maxDays: 99999, text: "10년 뒤의 우리 둘은 어떤 모습으로 어디에서 살고 있을까요?" },
  { minDays: 250, maxDays: 99999, text: "먼 훗날 둘이서 함께 꼭 살아보고 싶은 이상적인 집의 모습은?" },
  { minDays: 250, maxDays: 99999, text: "우리가 나이가 지긋이 들어서도 꼭 함께 손잡고 하고 싶은 취미는?" },
  { minDays: 250, maxDays: 99999, text: "둘이서 꼭 한 달 살기를 해보고 싶은 국내 또는 해외 도시는?" },
  { minDays: 250, maxDays: 99999, text: "살면서 상대방과 꼭 함께 해보고 싶은 가장 큰 도전이나 버킷리스트는?" },
  { minDays: 250, maxDays: 99999, text: "미래의 우리에게 지금의 이 예쁜 순간을 기억하도록 남기고 싶은 한마디는?" },
  { minDays: 300, maxDays: 99999, text: "시간이 흐를수록 상대방이 더 소중하고 애틋해지는 순간은?" },
  { minDays: 300, maxDays: 99999, text: "지금 이 순간, 상대방에게 가장 꼭 안기며 해주고 싶은 말은?" },
  { minDays: 300, maxDays: 99999, text: "세상이 끝나는 날 단 하나의 기억만 남길 수 있다면, 상대방과의 어떤 기억을 남기고 싶나요?" },
];

/**
 * 사귄 일 수 (D+n) 계산
 * @param {Array} ddayItems 
 * @returns {number}
 */
export function getCoupleDays(ddayItems = []) {
  if (!Array.isArray(ddayItems)) return 1;
  const item = ddayItems.find((it) => (it.type || "count_up") === "count_up");
  if (!item || !item.date || typeof item.date !== "string") return 1;
  const parts = item.date.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return 1;
  const [y, m, d] = parts;
  const now = new Date();
  const startDate = new Date(y, m - 1, d).getTime();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.floor((todayMid - startDate) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 1;
}

/**
 * 날짜 문자열(YYYY-MM-DD)을 기반으로 고유한 숫자 해시 계산
 */
function getDayHash(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * 현재 계절 키 반환
 */
function getSeasonKey(month) {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/**
 * 기준 날짜와 커플 D-Day를 기반으로 "오늘의 질문" 1개를 도출합니다.
 * @param {Array} ddayItems - dday.js의 기념일 목록
 * @param {Date} [targetDate=new Date()] - 대상 날짜 객체
 * @returns {Object} { id, badge, text, coupleDays }
 */
export function getTodayQuestion(ddayItems = [], targetDate = new Date()) {
  const curYear = targetDate.getFullYear();
  const curMonth = targetDate.getMonth() + 1; // 1 ~ 12
  const curDate = targetDate.getDate();
  const dateStr = `${curYear}-${String(curMonth).padStart(2, "0")}-${String(curDate).padStart(2, "0")}`;

  const coupleDays = getCoupleDays(ddayItems);

  // ----------------------------------------------------
  // 1순위: 커플 기념일 / 생일 당일 매칭
  // ----------------------------------------------------
  if (Array.isArray(ddayItems) && ddayItems.length > 0) {
    for (const item of ddayItems) {
      if (!item || !item.date || typeof item.date !== "string") continue;
      const parts = item.date.split("-").map(Number);
      if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) continue;
      const [y, m, d] = parts;

      // (1) 생일 당일
      if (item.type === "birthday" && m === curMonth && d === curDate) {
        return {
          id: `bday-${item.id}`,
          badge: `🎂 ${item.title || "생일"} 특별 질문`,
          text: `오늘 생일을 맞이한 소중한 사람에게 올 한 해 동안 꼭 선물해주고 싶은 가장 따뜻한 순간은?`,
          coupleDays,
        };
      }

      // (2) 사귄 날 (함께한 날) 카운트업
      if (item.type === "count_up") {
        const startDate = new Date(y, m - 1, d).getTime();
        const targetMid = new Date(curYear, targetDate.getMonth(), curDate).getTime();
        const diffDays = Math.floor((targetMid - startDate) / (1000 * 60 * 60 * 24)) + 1;

        // 특별한 D-Day n일 (100일, 200일, 300일, 500일, 1000일...)
        const specialDays = [100, 200, 300, 500, 1000, 1500, 2000, 3000];
        if (specialDays.includes(diffDays)) {
          return {
            id: `dday-milestone-${diffDays}`,
            badge: `💖 함께한 지 ${diffDays}일 기념 질문`,
            text: `우리 함께한 지 벌써 ${diffDays}일째! 처음 만났을 때와 비교해서 지금 서로에 대해 가장 깊어진 점은?`,
            coupleDays,
          };
        }

        // 매년 n주년 당일 (월/일 일치하고 년도가 다를 때)
        if (m === curMonth && d === curDate && curYear > y) {
          const years = curYear - y;
          return {
            id: `anniversary-${years}y`,
            badge: `🎉 함께한 지 ${years}주년 기념 질문`,
            text: `우리가 연인이 된 지 벌써 ${years}주년! 지난 ${years}년 동안 가장 잊지 못할 추억과, 앞으로 함께 걸어갈 시간에 전하고 싶은 마음은?`,
            coupleDays,
          };
        }
      }

      // (3) 기타 맞춤 이벤트 당일
      if (item.type === "event" && y === curYear && m === curMonth && d === curDate) {
        return {
          id: `event-${item.id}`,
          badge: `🌟 ${item.title} 특별 질문`,
          text: `오늘 맞이한 특별한 날('${item.title}'), 서로에게 전하고 싶은 가장 솔직하고 따뜻한 속마음은?`,
          coupleDays,
        };
      }
    }
  }

  // ----------------------------------------------------
  // 2순위: 특정 캘린더 시즌 / 기념일 매칭 (크리스마스, 발렌타인 등)
  // ----------------------------------------------------
  for (const s of CALENDAR_SEASON_QUESTIONS) {
    if (s.month === curMonth && s.date.includes(curDate)) {
      return {
        id: `cal-${s.month}-${curDate}`,
        badge: s.badge,
        text: s.text,
        coupleDays,
      };
    }
  }

  // ----------------------------------------------------
  // 3순위: 계절 감성 질문 (일요일 배정, 단 풋풋한 1단계인 1~50일 커플은 연애 질문 위주로 갈 수 있게 고려)
  // ----------------------------------------------------
  const dayHash = getDayHash(dateStr);
  const dayOfWeek = targetDate.getDay(); // 0: 일요일

  if (dayOfWeek === 0 && coupleDays > 40) {
    const seasonKey = getSeasonKey(curMonth);
    const seasonList = SEASONAL_QUESTIONS[seasonKey];
    const sIndex = dayHash % seasonList.length;
    const seasonLabels = {
      spring: "🌸 봄날의 감성 질문",
      summer: "🌊 여름날의 감성 질문",
      autumn: "🍁 가을날의 감성 질문",
      winter: "❄️ 겨울날의 감성 질문",
    };

    return {
      id: `season-${seasonKey}-${sIndex}`,
      badge: seasonLabels[seasonKey],
      text: seasonList[sIndex],
      coupleDays,
    };
  }

  // ----------------------------------------------------
  // 4순위: 현재 사귄 일 수(coupleDays)에 유효한 질문들만 필터링하여 결정론적 배정
  // ----------------------------------------------------
  const validQuestions = ROMANCE_QUESTIONS_POOL.filter(
    (q) => coupleDays >= q.minDays && coupleDays <= q.maxDays
  );

  // 만약 필터링 결과가 비어있다면 전체 중 가장 근접한 질문 풀 사용
  const pool = validQuestions.length > 0 ? validQuestions : ROMANCE_QUESTIONS_POOL;
  const qIndex = dayHash % pool.length;
  const selected = pool[qIndex];

  return {
    id: `daily-q-${dayHash % 999 + 1}`,
    badge: `💌 오늘의 질문 (함께한 지 D+${coupleDays})`,
    text: selected.text,
    coupleDays,
  };
}
