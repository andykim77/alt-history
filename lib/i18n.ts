// UI language: every user-facing string, plus date and label formatting.
// The narration language is sent to the server with each request.

import type { EventType, FigureStatus, Posture, Relation } from "./types";

export type Lang = "en" | "ko";
export const LANGS: Lang[] = ["en", "ko"];
export const LANG_KEY = "alt-history:lang";

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "ko";
}

/** Persisted choice, else the browser's language, else English. */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // storage unavailable
  }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ko")) return "ko";
  return "en";
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore
  }
}

const en = {
  langName: "English",
  appTitle: "Alt History Explorer",
  // header
  scenariosMenu: "Scenarios",
  dossier: "Dossier",
  engineTitle: "Model narrating this scenario",
  // sidebar
  newScenario: "+ New scenario",
  savedHere: "Scenarios are saved in this browser.",
  branches: (n: number) => `${n} branches`,
  deleteQ: "Delete?",
  yes: "Yes",
  no: "No",
  delete: "Delete",
  untitled: "New scenario",
  branch: "Branch",
  // thread: empty state
  newScenarioLabel: "New scenario",
  headline: "Pick a moment in history. Change it. Watch the world reorganise.",
  features: [
    ["Sourced", "Real history up to the divergence is checked against Wikipedia and cited."],
    ["Timeline", "Every reply adds dated events, real and alternate, to a running timeline."],
    ["Figures & powers", "Key people and states are tracked: interests, strength, posture, fates."],
    ["Branches", "Fork at any reply, then compare how two branches diverge."],
  ] as [string, string][],
  orStart: "Or start from one of these",
  starters: [
    "What if the printing press was never invented?",
    "What if the Library of Alexandria never burned?",
    "What if the Black Death never reached Europe?",
    "What if Byzantium never fell in 1453?",
    "What if the Mongols had conquered Western Europe?",
    "What if Rome had lost the Second Punic War?",
  ],
  // thread: messages
  edit: "Edit",
  editTitle: "Edit this message and continue in a new branch",
  branchHere: "Branch here",
  branchHereTitle: "Continue from this point in a new direction",
  branchOf: (i: number, n: number) => `branch ${i}/${n}`,
  prevBranch: "Previous branch",
  nextBranch: "Next branch",
  added: (events: number, figures: number, powers: number) =>
    `+${events} timeline event${events === 1 ? "" : "s"}` +
    (figures > 0 ? `, ${figures} figure${figures === 1 ? "" : "s"}` : "") +
    (powers > 0 ? `, ${powers} power${powers === 1 ? "" : "s"}` : ""),
  thinking: "Thinking...",
  noReply: "(no reply)",
  replyFailed: "The reply failed.",
  stopped: "Stopped.",
  flashpoints: "Flashpoints",
  editingBanner: "Editing: sending creates a new branch from this point.",
  forkingBanner: "Your next message starts a new branch from the reply above.",
  cancel: "Cancel",
  backToLatest: "Back to latest",
  placeholderNew: "What if...?",
  placeholderMore: "Push the scenario further...",
  stop: "Stop",
  send: "Send",
  hint: "Enter to send, Shift+Enter for a new line. Pre-divergence facts are checked against Wikipedia; everything after is speculation.",
  // client status/errors
  preparing: "Preparing...",
  streamEnded: "The stream ended unexpectedly.",
  somethingWrong: "Something went wrong.",
  requestFailed: (status: number) => `Request failed (${status})`,
  // dossier panel
  worldBuilds: "The world state builds as you explore.",
  panelEmpty:
    "Start a scenario and its dossier builds here: timeline, key figures, powers and their interests, what changed, and the sources behind it.",
  tabs: { timeline: "Timeline", figures: "Figures", powers: "Powers", changes: "Changes", sources: "Sources", compare: "Compare" },
  // timeline
  eventType: { history: "Real history", divergence: "Divergence", alt: "Alternate" } as Record<EventType, string>,
  pointOfDivergence: "point of divergence",
  eventsCount: (n: number) => `${n} events`,
  monthUnknown: "Month not recorded",
  timelineEmpty: "Dated events from the narration will collect here as the scenario unfolds.",
  sourcesEmpty: "Wikipedia articles used to verify the history before the divergence will appear here.",
  // compare
  compareNeedsTwo: "Compare needs at least two branches.",
  compareHow: (branchHere: string, edit: string) =>
    `Use ${branchHere} on any reply, or ${edit} on one of your messages, to fork the scenario. Then come back to see the timelines side by side.`,
  sharedBeforeFork: "Shared before the fork",
  afterFork: "After the fork",
  noEventsBranch: "No events yet on this branch.",
  shown: "· shown",
  shownTitle: "Currently shown in the chat",
  showBranchTitle: "Show this branch in the chat",
  // figures
  figureStatus: {
    dominant: "dominant",
    rising: "rising",
    stable: "stable",
    declining: "declining",
    wounded: "wounded",
    ill: "ill",
    dead: "dead",
    unknown: "unknown",
  } as Record<FigureStatus, string>,
  unaffiliated: "Unaffiliated",
  ours: "Ours",
  here: "Here",
  figuresEmpty:
    "People who shape the scenario will be tracked here: who they are, what became of them in our world, and what is becoming of them in this one.",
  rename: "Rename",
  editName: "Edit name",
  setByYou: "set by you",
  backToNarrator: "Back to the narrator's choice",
  postureTitle: "Posture",
  statusTitle: "Status",
  // powers
  posture: {
    hegemon: "hegemon",
    expanding: "expanding",
    emerging: "emerging",
    consolidating: "consolidating",
    defensive: "defensive",
    fracturing: "fracturing",
    collapsing: "collapsing",
    fallen: "fallen",
  } as Record<Posture, string>,
  relation: { ally: "ally", trade: "trade", neutral: "neutral", vassal: "vassal", rival: "rival", war: "war" } as Record<Relation, string>,
  tier: { 1: "Marginal", 2: "Minor power", 3: "Regional power", 4: "Major power", 5: "Great power" } as Record<number, string>,
  strength: (n: number) => `Strength ${n}/5`,
  interests: "Strategic interests",
  powersEmpty:
    "States, dynasties, and institutions will be tracked here with their strategic interests, strength, posture, and relations to one another.",
  // ledger
  year: "Year",
  ourWorld: "Our world",
  thisWorld: "This world",
  ledgerEmpty: "A running ledger of what happened in our world versus what happens in this one, year by year.",
};

export type Strings = typeof en;

const ko: Strings = {
  langName: "한국어",
  appTitle: "대체역사 탐험",
  scenariosMenu: "시나리오",
  dossier: "기록부",
  engineTitle: "이 시나리오를 서술하는 모델",
  newScenario: "+ 새 시나리오",
  savedHere: "시나리오는 이 브라우저에 저장됩니다.",
  branches: (n) => `분기 ${n}개`,
  deleteQ: "삭제할까요?",
  yes: "예",
  no: "아니요",
  delete: "삭제",
  untitled: "새 시나리오",
  branch: "분기",
  newScenarioLabel: "새 시나리오",
  headline: "역사의 한 순간을 고르세요. 바꾸세요. 세계가 재편되는 것을 지켜보세요.",
  features: [
    ["출처 검증", "분기점까지의 실제 역사는 위키백과로 확인하고 인용합니다."],
    ["연표", "모든 응답이 실제와 대체 사건을 날짜와 함께 연표에 더합니다."],
    ["인물과 세력", "주요 인물과 국가를 추적합니다: 이해관계, 국력, 태세, 운명."],
    ["분기", "어느 응답에서든 갈라져 나가고, 두 분기가 어떻게 달라지는지 비교합니다."],
  ],
  orStart: "또는 여기서 시작하기",
  starters: [
    "만약 인쇄술이 발명되지 않았다면?",
    "만약 알렉산드리아 도서관이 불타지 않았다면?",
    "만약 흑사병이 유럽에 닿지 않았다면?",
    "만약 1453년에 비잔티움이 함락되지 않았다면?",
    "만약 몽골이 서유럽을 정복했다면?",
    "만약 로마가 제2차 포에니 전쟁에서 졌다면?",
  ],
  edit: "편집",
  editTitle: "이 메시지를 편집하여 새 분기에서 이어가기",
  branchHere: "여기서 분기",
  branchHereTitle: "이 지점에서 새로운 방향으로 이어가기",
  branchOf: (i, n) => `분기 ${i}/${n}`,
  prevBranch: "이전 분기",
  nextBranch: "다음 분기",
  added: (events, figures, powers) =>
    `연표 사건 +${events}` + (figures > 0 ? `, 인물 ${figures}` : "") + (powers > 0 ? `, 세력 ${powers}` : ""),
  thinking: "생각하는 중...",
  noReply: "(응답 없음)",
  replyFailed: "응답에 실패했습니다.",
  stopped: "중단됨.",
  flashpoints: "쟁점",
  editingBanner: "편집 중: 보내면 이 지점에서 새 분기가 만들어집니다.",
  forkingBanner: "다음 메시지는 위 응답에서 새 분기를 시작합니다.",
  cancel: "취소",
  backToLatest: "최신으로 돌아가기",
  placeholderNew: "만약에...?",
  placeholderMore: "시나리오를 더 밀어붙여 보세요...",
  stop: "중지",
  send: "보내기",
  hint: "Enter로 보내기, Shift+Enter로 줄바꿈. 분기점 이전의 사실은 위키백과로 검증하며, 이후는 모두 추정입니다.",
  preparing: "준비하는 중...",
  streamEnded: "응답이 예기치 않게 끊겼습니다.",
  somethingWrong: "문제가 발생했습니다.",
  requestFailed: (status) => `요청 실패 (${status})`,
  worldBuilds: "탐험하는 동안 세계의 상태가 쌓여 갑니다.",
  panelEmpty: "시나리오를 시작하면 여기에 기록부가 쌓입니다: 연표, 주요 인물, 세력과 그 이해관계, 달라진 점, 그리고 근거가 된 출처.",
  tabs: { timeline: "연표", figures: "인물", powers: "세력", changes: "변화", sources: "출처", compare: "비교" },
  eventType: { history: "실제 역사", divergence: "분기점", alt: "대체 역사" },
  pointOfDivergence: "분기점",
  eventsCount: (n) => `사건 ${n}건`,
  monthUnknown: "월 미상",
  timelineEmpty: "시나리오가 전개되면서 서술 속 날짜가 있는 사건들이 여기에 모입니다.",
  sourcesEmpty: "분기점 이전의 역사를 검증하는 데 쓰인 위키백과 문서가 여기에 표시됩니다.",
  compareNeedsTwo: "비교하려면 분기가 둘 이상 필요합니다.",
  compareHow: (branchHere, edit) =>
    `아무 응답에서 ${branchHere}를 누르거나, 내 메시지에서 ${edit}을 눌러 시나리오를 나누세요. 그런 다음 돌아와서 두 연표를 나란히 보세요.`,
  sharedBeforeFork: "분기 전 공통",
  afterFork: "분기 후",
  noEventsBranch: "이 분기에는 아직 사건이 없습니다.",
  shown: "· 표시 중",
  shownTitle: "지금 대화에 표시된 분기",
  showBranchTitle: "이 분기를 대화에 표시",
  figureStatus: {
    dominant: "독보적",
    rising: "상승",
    stable: "안정",
    declining: "쇠퇴",
    wounded: "부상",
    ill: "병중",
    dead: "사망",
    unknown: "불명",
  },
  unaffiliated: "무소속",
  ours: "실제",
  here: "여기",
  figuresEmpty: "시나리오를 움직이는 인물들을 여기서 추적합니다: 누구인지, 실제 세계에서 어떻게 되었는지, 이 세계에서는 어떻게 되어 가는지.",
  rename: "이름 바꾸기",
  editName: "이름 편집",
  setByYou: "직접 설정함",
  backToNarrator: "서술자의 선택으로 되돌리기",
  postureTitle: "태세",
  statusTitle: "상태",
  posture: {
    hegemon: "패권",
    expanding: "팽창",
    emerging: "부상",
    consolidating: "공고화",
    defensive: "수세",
    fracturing: "분열",
    collapsing: "붕괴",
    fallen: "멸망",
  },
  relation: { ally: "동맹", trade: "교역", neutral: "중립", vassal: "속국", rival: "경쟁", war: "전쟁" },
  tier: { 1: "미미한 세력", 2: "약소 세력", 3: "지역 강국", 4: "강대국", 5: "초강대국" },
  strength: (n) => `국력 ${n}/5`,
  interests: "전략적 이해관계",
  powersEmpty: "국가, 왕조, 기관을 전략적 이해관계, 국력, 태세, 상호 관계와 함께 여기서 추적합니다.",
  year: "연도",
  ourWorld: "실제 세계",
  thisWorld: "이 세계",
  ledgerEmpty: "실제 세계에서 일어난 일과 이 세계에서 일어나는 일을 해마다 대조한 장부입니다.",
};

export const STRINGS: Record<Lang, Strings> = { en, ko };

// ---------- dates ----------

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1453" / "216 BCE"  ·  "1453년" / "기원전 216년" */
export function fmtYear(y: number, lang: Lang): string {
  if (lang === "ko") return y < 0 ? `기원전 ${-y}년` : `${y}년`;
  return y < 0 ? `${-y} BCE` : String(y);
}

/** The part below the year: "6 Apr" / "Apr"  ·  "4월 6일" / "4월"; "" when only the year is known. */
export function fmtSubDate(e: { month?: number | null; day?: number | null }, lang: Lang): string {
  if (!e.month || e.month < 1 || e.month > 12) return "";
  if (lang === "ko") return e.day ? `${e.month}월 ${e.day}일` : `${e.month}월`;
  const mon = MONTHS_EN[e.month - 1];
  return e.day ? `${e.day} ${mon}` : mon;
}

/** Full date: "29 May 1453"  ·  "1453년 5월 29일". */
export function fmtEventDate(e: { year: number; month?: number | null; day?: number | null }, lang: Lang): string {
  const sub = fmtSubDate(e, lang);
  const y = fmtYear(e.year, lang);
  if (!sub) return y;
  return lang === "ko" ? `${y} ${sub}` : `${sub} ${y}`;
}

export function timeAgo(ts: number, lang: Lang): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  const m = Math.round(s / 60);
  const h = Math.round(m / 60);
  const d = Math.round(h / 24);
  if (lang === "ko") {
    if (s < 60) return "방금";
    if (m < 60) return `${m}분 전`;
    if (h < 24) return `${h}시간 전`;
    return d === 1 ? "어제" : `${d}일 전`;
  }
  if (s < 60) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return d === 1 ? "yesterday" : `${d}d ago`;
}
