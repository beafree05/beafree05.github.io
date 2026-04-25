import { db, APPLE_CALENDAR_FEED_URL } from "./firebase.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const WEEKDAY_LABELS = [
  "\u5468\u65E5",
  "\u5468\u4E00",
  "\u5468\u4E8C",
  "\u5468\u4E09",
  "\u5468\u56DB",
  "\u5468\u4E94",
  "\u5468\u516D"
];

const REPEAT_LABELS = {
  none: "\u4E0D\u91CD\u590D",
  daily: "\u6BCF\u5929",
  weekly: "\u6BCF\u5468",
  monthly: "\u6BCF\u6708",
  yearly: "\u6BCF\u5E74"
};

const menuButtons = document.querySelectorAll(".menu-btn");
const pages = document.querySelectorAll(".page");

const bookInput = document.getElementById("bookInput");
const addBtn = document.getElementById("addBtn");
const bookList = document.getElementById("bookList");

const jpWordInput = document.getElementById("jpWordInput");
const contextNoteInput = document.getElementById("contextNoteInput");
const analyzeWordBtn = document.getElementById("analyzeWordBtn");
const copyPromptBtn = document.getElementById("copyPromptBtn");
const fillSampleBtn = document.getElementById("fillSampleBtn");
const vocabResult = document.getElementById("vocabResult");
const readingChip = document.getElementById("readingChip");
const usageChip = document.getElementById("usageChip");

const calendarGrid = document.getElementById("calendarGrid");
const weekdayRow = document.getElementById("weekdayRow");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const syncStatusBadge = document.getElementById("syncStatusBadge");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const todayBtn = document.getElementById("todayBtn");
const newEventBtn = document.getElementById("newEventBtn");
const downloadIcsBtn = document.getElementById("downloadIcsBtn");
const appleSubscribeBtn = document.getElementById("appleSubscribeBtn");
const appleSyncHint = document.getElementById("appleSyncHint");

const eventModal = document.getElementById("eventModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalTitle = document.getElementById("modalTitle");
const eventForm = document.getElementById("eventForm");
const deleteEventBtn = document.getElementById("deleteEventBtn");

const eventIdInput = document.getElementById("eventId");
const eventTitleInput = document.getElementById("eventTitle");
const eventDateInput = document.getElementById("eventDate");
const eventRepeatInput = document.getElementById("eventRepeat");
const eventStartTimeInput = document.getElementById("eventStartTime");
const eventEndTimeInput = document.getElementById("eventEndTime");
const eventNoteInput = document.getElementById("eventNote");

const booksRef = collection(db, "books");
const booksQuery = query(booksRef, orderBy("createdAt", "desc"));

const calendarEventsRef = collection(db, "calendarEvents");
const calendarEventsQuery = query(calendarEventsRef, orderBy("date", "asc"));

let calendarEvents = [];
let currentMonth = startOfMonth(new Date());

const VOCAB_PROMPT_TEMPLATE = `\u4f60\u662f\u4e00\u4e2a\u9762\u5411\u9ad8\u7ea7\u65e5\u8bed\u5b66\u4e60\u8005\u7684\u65e5\u8bed\u8bcd\u6c47\u5206\u6790\u52a9\u624b\u3002

\u7528\u6237\u4f1a\u8f93\u5165\u4e00\u4e2a\u65e5\u8bed\u5355\u8bcd\u3001\u77ed\u8bed\u6216\u8868\u8fbe\u3002\u4f60\u7684\u4efb\u52a1\u662f\u57fa\u4e8e\u65e5\u672c\u672c\u571f\u8f9e\u4e66\u98ce\u683c\u548c\u771f\u5b9e\u8bed\u5883\uff0c\u5e2e\u52a9\u7528\u6237\u5224\u65ad\u8fd9\u4e2a\u8bcd\u7684\u8bfb\u97f3\u3001\u610f\u4e49\u3001\u4f7f\u7528\u573a\u666f\u3001\u4f8b\u53e5\u96be\u5ea6\u4ee5\u53ca\u662f\u5426\u9002\u5408\u5b66\u4e60\u8005\u4e3b\u52a8\u4f7f\u7528\u3002

\u8bf7\u4e25\u683c\u6309\u7167\u4ee5\u4e0b\u7ed3\u6784\u8f93\u51fa\uff1a
\u30101. \u57fa\u672c\u4fe1\u606f\u3011
\u30102. \u8f9e\u4e66\u5f0f\u89e3\u91ca\u3011
\u30103. \u4e2d\u6587\u89e3\u91ca\u3011
\u30104. \u8bed\u611f\u4e0e\u4f7f\u7528\u573a\u666f\u3011
\u30105. \u65e5\u672c\u672c\u571f\u81ea\u7136\u4f8b\u53e5\u3011
\u30106. \u4f8b\u53e5\u96be\u5ea6\u5206\u6790\u3011
\u30107. \u8fd1\u4e49\u8bcd\u6bd4\u8f83\u3011
\u30108. \u5b66\u4e60\u8005\u4f7f\u7528\u5efa\u8bae\u3011

\u6ce8\u610f\uff1a
- \u4e0d\u8981\u7f16\u9020\u5177\u4f53\u8f9e\u4e66\u51fa\u5904
- \u5982\u679c\u65e0\u6cd5\u786e\u8ba4\u8bfb\u97f3\u3001\u30a2\u30af\u30bb\u30f3\u30c8\u6216\u7528\u6cd5\uff0c\u8bf7\u660e\u786e\u5199\u300c\u9700\u8981\u786e\u8ba4\u300d
- \u4f8b\u53e5\u5fc5\u987b\u81ea\u7136\uff0c\u7b26\u5408\u65e5\u672c\u4eba\u5b9e\u9645\u8868\u8fbe\u4e60\u60ef
- \u8f93\u51fa\u8bed\u8a00\u4ee5\u4e2d\u6587\u8bf4\u660e\u4e3a\u4e3b\uff0c\u65e5\u8bed\u4f8b\u53e5\u548c\u8f9e\u4e66\u89e3\u91ca\u4fdd\u7559\u65e5\u8bed`;

const VOCAB_LIBRARY = {
  "\u5fd6\u5ea6": {
    writing: "\u5fd6\u5ea6",
    reading: "\u305d\u3093\u305f\u304f",
    partOfSpeech: "\u540d\u8a5e\u30fb\u30b5\u5909\u53ef\u80fd",
    accent: "\u8981\u78ba\u8a8d",
    frequency: "\u4e2d",
    dictExplanation: [
      "\u4ed6\u4eba\u306e\u610f\u5411\u3092\u63a8\u3057\u91cf\u308a\u3001\u305d\u306e\u610f\u306b\u6cbf\u3046\u3088\u3046\u306b\u53d6\u308a\u8a08\u3089\u3046\u3053\u3068\u3002",
      "\u7279\u306b\u3001\u76f4\u63a5\u306e\u6307\u793a\u304c\u306a\u3044\u307e\u307e\u76f8\u624b\u306e\u771f\u610f\u3092\u8aad\u307f\u3001\u81ea\u767a\u7684\u306b\u5bfe\u5fdc\u3092\u5909\u3048\u308b\u3053\u3068\u3002"
    ],
    cnExplanation: "\u6838\u5fc3\u662f\u201c\u63e3\u6469\u4e0a\u610f\u201d\u3001\u201c\u63a8\u6d4b\u5bf9\u65b9\u771f\u610f\u5e76\u9884\u5148\u914d\u5408\u201d\u3002\u5b83\u4e0d\u7b49\u4e8e\u4e2d\u6587\u91cc\u5355\u7eaf\u7684\u201c\u4f53\u8c05\u201d\u6216\u201c\u731c\u6d4b\u201d\uff0c\u66f4\u5f3a\u8c03\u5bf9\u6743\u529b\u5173\u7cfb\u3001\u7ec4\u7ec7\u7a7a\u6c14\u6216\u9690\u542b\u610f\u56fe\u7684\u63d0\u524d\u53cd\u5e94\u3002",
    usage: {
      daily: "\u6709\uff0c\u4f46\u5e26\u6709\u8bc4\u4ef7\u8272\u5f69",
      sns: "\u9ad8",
      news: "\u9ad8",
      business: "\u9700\u8c28\u614e",
      academic: "\u53ef\u7528\uff0c\u4f46\u8981\u754c\u5b9a\u8bed\u4e49",
      interview: "\u4e0d\u5efa\u8bae\u968f\u4fbf\u7528"
    },
    activeUse: "\u9700\u8b66\u614e",
    notFitScenes: "\u9762\u8bd5\u3001ES\u3001\u6b63\u5f0f\u81ea\u6211PR\u91cc\u4e0d\u5efa\u8bae\u8f7b\u6613\u7528\u6765\u5f62\u5bb9\u81ea\u5df1\u6216\u4ed6\u4eba\uff0c\u5bb9\u6613\u5e26\u51fa\u653f\u6cbb\u6216\u8d1f\u9762\u8bed\u611f\u3002",
    examples: [
      {
        label: "1. \u65e5\u5e38 / SNS \u98ce\u683c",
        ja: "\u3042\u306e\u767a\u8a00\u3001\u8ab0\u304b\u306e\u610f\u5411\u3092\u5fd6\u5ea6\u3057\u3059\u304e\u3066\u3044\u308b\u3088\u3046\u306b\u898b\u3048\u305f\u3002",
        zh: "\u90a3\u53e5\u53d1\u8a00\u542c\u8d77\u6765\u50cf\u662f\u8fc7\u5ea6\u5730\u63e3\u6469\u67d0\u4e9b\u4eba\u7684\u610f\u56fe\u4e86\u3002",
        difficulty: "\u2605\u2605\u2606",
        why: "\u8bcd\u672c\u8eab\u4e0d\u7b97\u96be\uff0c\u4f46\u9700\u8981\u7406\u89e3\u8fd9\u4e2a\u8bcd\u5e38\u5e26\u8bc4\u4ef7\u611f\u3002",
        mimic: "\u9700\u8c28\u614e",
        alternative: "\u5982\u679c\u53ea\u60f3\u8868\u8fbe\u201c\u8fc7\u5ea6\u63e3\u6469\u201d\uff0c\u66f4\u5b89\u5168\u7684\u8bf4\u6cd5\u662f\u300c\u6c17\u306b\u3057\u3059\u304e\u3066\u3044\u308b\u300d\u3002"
      },
      {
        label: "2. \u65b0\u95fb / \u8bc4\u8bba\u98ce\u683c",
        ja: "\u7d44\u7e54\u5185\u3067\u306f\u3001\u660e\u793a\u7684\u306a\u6307\u793a\u304c\u306a\u304f\u3066\u3082\u4e0a\u5c64\u90e8\u306e\u610f\u5411\u3092\u5fd6\u5ea6\u3059\u308b\u52d5\u304d\u304c\u751f\u3058\u3084\u3059\u3044\u3002",
        zh: "\u5728\u7ec4\u7ec7\u5185\u90e8\uff0c\u5373\u4f7f\u6ca1\u6709\u660e\u786e\u6307\u793a\uff0c\u4e5f\u5f88\u5bb9\u6613\u51fa\u73b0\u4e3b\u52a8\u63e3\u6469\u4e0a\u610f\u7684\u503e\u5411\u3002",
        difficulty: "\u2605\u2605\u2606",
        why: "\u53e5\u5f0f\u89c4\u6574\uff0c\u8bed\u57df\u7565\u504f\u65b0\u95fb\u8bc4\u8bba\uff0c\u9002\u5408\u7406\u89e3\u4f46\u4e0d\u4e00\u5b9a\u9002\u5408\u53e3\u8bed\u5957\u7528\u3002",
        mimic: "\u662f",
        alternative: ""
      },
      {
        label: "3. \u7a0d\u6b63\u5f0f / \u5b66\u672f\u98ce\u683c",
        ja: "\u672c\u7814\u7a76\u3067\u306f\u3001\u610f\u601d\u6c7a\u5b9a\u904e\u7a0b\u306b\u304a\u3051\u308b\u300c\u5fd6\u5ea6\u300d\u306e\u6a5f\u80fd\u3092\u3001\u7d44\u7e54\u6587\u5316\u3068\u306e\u95a2\u9023\u304b\u3089\u691c\u8a0e\u3059\u308b\u3002",
        zh: "\u672c\u7814\u7a76\u5c06\u4ece\u7ec4\u7ec7\u6587\u5316\u7684\u5173\u8054\u89d2\u5ea6\uff0c\u8003\u5bdf\u201c\u5fd6\u5ea6\u201d\u5728\u51b3\u7b56\u8fc7\u7a0b\u4e2d\u7684\u4f5c\u7528\u3002",
        difficulty: "\u2605\u2605\u2605",
        why: "\u62bd\u8c61\u5ea6\u9ad8\uff0c\u4e14\u9700\u8981\u5bf9\u201c\u7814\u7a76\u7528\u8bed\u201d\u7684\u53e5\u578b\u8db3\u591f\u719f\u6089\u3002",
        mimic: "\u9700\u8c28\u614e",
        alternative: "\u5982\u679c\u8fd8\u4e0d\u4e60\u60ef\u5b66\u672f\u53e5\u5f0f\uff0c\u53ef\u5148\u6539\u4e3a\u300c\u7d44\u7e54\u3067\u306f\u306a\u305c\u5fd6\u5ea6\u304c\u8d77\u3053\u308b\u306e\u304b\u3092\u8003\u3048\u308b\u300d\u3002"
      }
    ],
    synonyms: [
      {
        word: "\u914d\u616e",
        note: "\u300c\u914d\u616e\u300d\u504f\u5411\u7167\u987e\u5bf9\u65b9\u3001\u907f\u514d\u5931\u793c\uff0c\u8bed\u611f\u6bd4\u300c\u5fd6\u5ea6\u300d\u4e2d\u6027\u5f97\u591a\u3002"
      },
      {
        word: "\u304a\u3082\u3093\u3071\u304b\u308b",
        note: "\u8868\u793a\u63a8\u6d4b\u4ed6\u4eba\u5fc3\u60c5\u6216\u60c5\u51b5\uff0c\u4e0d\u4e00\u5b9a\u5e26\u6709\u6743\u529b\u5173\u7cfb\u6216\u9884\u5148\u914d\u5408\u7684\u542b\u4e49\u3002"
      },
      {
        word: "\u7a7a\u6c17\u3092\u8aad\u3080",
        note: "\u66f4\u53e3\u8bed\uff0c\u504f\u91cd\u8bfb\u73b0\u573a\u6c14\u6c1b\uff1b\u300c\u5fd6\u5ea6\u300d\u5219\u66f4\u5e38\u7528\u6765\u8bb2\u4e0a\u610f\u6216\u9690\u542b\u610f\u56fe\u3002"
      }
    ],
    advice: "\u8fd9\u4e2a\u8bcd\u53ef\u4ee5\u5148\u4f5c\u4e3a\u201c\u7406\u89e3\u578b\u8bcd\u6c47\u201d\u6765\u5b66\uff0c\u5728\u8bfb\u65b0\u95fb\u3001\u793e\u4f1a\u8bc4\u8bba\u6216\u7ec4\u7ec7\u8bba\u8ff0\u65f6\u4f1a\u5f88\u6709\u7528\uff1b\u4f46\u8981\u4e3b\u52a8\u8bf4\u51fa\u53e3\u65f6\uff0c\u6700\u597d\u5148\u786e\u8ba4\u8bed\u5883\u548c\u7acb\u573a\uff0c\u5426\u5219\u5bb9\u6613\u663e\u5f97\u5e26\u6709\u6279\u5224\u611f\u3002"
  },
  "\u30d0\u30ba\u308b": {
    writing: "\u30d0\u30ba\u308b",
    reading: "\u30d0\u30ba\u308b",
    partOfSpeech: "\u52d5\u8a5e\u30fb\u4e94\u6bb5",
    accent: "\u8981\u78ba\u8a8d",
    frequency: "\u9ad8",
    dictExplanation: [
      "\u6295\u7a3f\u3084\u8a71\u984c\u304c\u30a4\u30f3\u30bf\u30fc\u30cd\u30c3\u30c8\u4e0a\u3067\u6025\u901f\u306b\u62e1\u6563\u3057\u3001\u591a\u304f\u306e\u6ce8\u76ee\u3092\u96c6\u3081\u308b\u3002"
    ],
    cnExplanation: "\u6307\u5185\u5bb9\u5728\u7f51\u7edc\u4e0a\u7a81\u7136\u706b\u8d77\u6765\u3001\u88ab\u5927\u91cf\u8f6c\u53d1\u6216\u8ba8\u8bba\u3002\u4e0d\u53ea\u662f\u201c\u7206\u7ea2\u201d\uff0c\u8fd8\u5e26\u6709 SNS \u4f20\u64ad\u8def\u5f84\u7684\u8bed\u611f\u3002",
    usage: {
      daily: "\u9ad8",
      sns: "\u9ad8",
      news: "\u4e2d",
      business: "\u9700\u8c28\u614e",
      academic: "\u4f4e",
      interview: "\u4e0d\u5efa\u8bae"
    },
    activeUse: "\u662f",
    notFitScenes: "\u8bba\u6587\u3001\u6b63\u5f0f\u62a5\u544a\u3001\u9762\u8bd5\u548c ES \u91cc\u4e0d\u5efa\u8bae\u76f4\u63a5\u4f7f\u7528\uff0c\u53ef\u6539\u6210\u300c\u8a71\u984c\u3068\u306a\u308b\u300d\u6216\u300c\u62e1\u6563\u3059\u308b\u300d\u3002",
    examples: [
      {
        label: "1. \u65e5\u5e38 / SNS \u98ce\u683c",
        ja: "\u305d\u306e\u52d5\u753b\u3001\u6628\u65e5\u306e\u591c\u304b\u3089\u6025\u306b\u30d0\u30ba\u3063\u3066\u308b\u3088\u306d\u3002",
        zh: "\u90a3\u4e2a\u89c6\u9891\u4ece\u6628\u5929\u665a\u4e0a\u5f00\u59cb\u7a81\u7136\u5c31\u706b\u4e86\u554a\u3002",
        difficulty: "\u2605\u2606\u2606",
        why: "\u662f\u5f88\u9ad8\u9891\u7684\u53e3\u8bed\u7528\u6cd5\uff0c\u53e5\u5b50\u77ed\uff0c\u8bed\u5883\u4e5f\u5f88\u76f4\u89c2\u3002",
        mimic: "\u662f",
        alternative: ""
      },
      {
        label: "2. \u65b0\u95fb / \u8bc4\u8bba\u98ce\u683c",
        ja: "\u8a72\u5f53\u6295\u7a3f\u306f\u3001\u82e5\u5e74\u5c64\u3092\u4e2d\u5fc3\u306bSNS\u4e0a\u3067\u30d0\u30ba\u308a\u3001\u95a2\u9023\u5546\u54c1\u306e\u58f2\u308a\u4e0a\u3052\u306b\u3082\u5f71\u97ff\u3092\u4e0e\u3048\u305f\u3002",
        zh: "\u8be5\u5e16\u6587\u4ee5\u5e74\u8f7b\u7fa4\u4f53\u4e3a\u4e2d\u5fc3\u5728 SNS \u4e0a\u5f15\u53d1\u7206\u70ed\uff0c\u4e5f\u5f71\u54cd\u4e86\u76f8\u5173\u5546\u54c1\u7684\u9500\u552e\u989d\u3002",
        difficulty: "\u2605\u2605\u2606",
        why: "\u9002\u5408\u89c2\u5bdf\u8fd9\u4e2a\u8bcd\u5982\u4f55\u4ece\u53e3\u8bed\u8fdb\u5165\u5a92\u4f53\u6587\u4f53\uff0c\u4f46\u4ecd\u7136\u6709\u4e00\u5b9a\u65b0\u8bcd\u611f\u3002",
        mimic: "\u9700\u8c28\u614e",
        alternative: "\u66f4\u4e2d\u6027\u7684\u8bf4\u6cd5\u662f\u300cSNS\u4e0a\u3067\u5927\u304d\u306a\u53cd\u97ff\u3092\u547c\u3093\u3060\u300d\u3002"
      },
      {
        label: "3. \u7a0d\u6b63\u5f0f / \u5b66\u672f\u98ce\u683c",
        ja: "\u300c\u30d0\u30ba\u308b\u300d\u3068\u3044\u3046\u901a\u4fd7\u7684\u8868\u73fe\u306f\u3001\u60c5\u5831\u62e1\u6563\u306e\u901f\u5ea6\u3068\u6ce8\u76ee\u96c6\u4e2d\u3092\u7c21\u6f54\u306b\u793a\u3059\u8a9e\u3068\u3057\u3066\u5b9a\u7740\u3057\u3064\u3064\u3042\u308b\u3002",
        zh: "\u201c\u30d0\u30ba\u308b\u201d\u8fd9\u4e2a\u901a\u4fd7\u8868\u8fbe\uff0c\u6b63\u9010\u6e10\u88ab\u5f53\u4f5c\u80fd\u7b80\u6d01\u6307\u79f0\u4fe1\u606f\u6269\u6563\u901f\u5ea6\u4e0e\u5173\u6ce8\u96c6\u4e2d\u7684\u8bcd\u8bed\u3002",
        difficulty: "\u2605\u2605\u2605",
        why: "\u53e5\u5f0f\u504f\u8bba\u8ff0\u578b\uff0c\u9700\u8981\u533a\u5206\u5bf9\u8bcd\u672c\u8eab\u7684\u63cf\u5199\u548c\u5bf9\u73b0\u8c61\u7684\u8bc4\u8ff0\u3002",
        mimic: "\u9700\u8c28\u614e",
        alternative: "\u5982\u679c\u60f3\u66f4\u5b89\u5168\u5730\u5199\u6b63\u5f0f\u6587\uff0c\u53ef\u76f4\u63a5\u7528\u300c\u62e1\u6563\u3059\u308b\u300d\u6216\u300c\u6ce8\u76ee\u3092\u96c6\u3081\u308b\u300d\u3002"
      }
    ],
    synonyms: [
      { word: "\u8a71\u984c\u306b\u306a\u308b", note: "\u8f83\u4e2d\u6027\uff0c\u4e0d\u4e00\u5b9a\u542b SNS \u4f20\u64ad\u611f\u3002" },
      { word: "\u62e1\u6563\u3059\u308b", note: "\u66f4\u5ba2\u89c2\uff0c\u504f\u63cf\u8ff0\u884c\u4e3a\u6216\u72b6\u6001\uff0c\u4e0d\u50cf\u300c\u30d0\u30ba\u308b\u300d\u90a3\u6837\u5e26\u6709\u70ed\u95e8\u5316\u7684\u611f\u89c9\u3002" },
      { word: "\u708e\u4e0a\u3059\u308b", note: "\u4e13\u6307\u8d1f\u9762\u8bba\u6218\u6216\u6279\u8bc4\u6269\u6563\uff0c\u4e0d\u80fd\u76f4\u63a5\u4e0e\u300c\u30d0\u30ba\u308b\u300d\u7b49\u540c\u3002" }
    ],
    advice: "\u8fd9\u4e2a\u8bcd\u5f88\u503c\u5f97\u5b66\uff0c\u800c\u4e14\u5728 SNS \u3001\u8f7b\u677e\u4f1a\u8bdd\u3001\u5a92\u4f53\u89c2\u5bdf\u91cc\u90fd\u5f88\u5e38\u7528\uff1b\u4f46\u53ea\u8981\u8fdb\u5165\u6b63\u5f0f\u5199\u4f5c\uff0c\u5c31\u5c3d\u91cf\u6362\u6210\u66f4\u4e2d\u6027\u7684\u8868\u8fbe\u3002"
  },
  "\u30a8\u30e2\u3044": {
    writing: "\u30a8\u30e2\u3044",
    reading: "\u30a8\u30e2\u3044",
    partOfSpeech: "\u5f62\u5bb9\u8a5e\u7684\u8868\u73fe",
    accent: "\u8981\u78ba\u8a8d",
    frequency: "\u9ad8",
    dictExplanation: [
      "\u5f37\u3044\u611f\u60c5\u3092\u55da\u8d77\u3057\u3001\u307e\u305f\u306f\u61d0\u304b\u3057\u3055\u30fb\u5207\u306a\u3055\u306a\u3069\u3092\u611f\u3058\u3055\u305b\u308b\u69d8\u5b50\u3002"
    ],
    cnExplanation: "\u6307\u201c\u5f88\u80fd\u52fe\u8d77\u60c5\u7eea\u201d\u3001\u201c\u5f88\u6709\u6c1b\u56f4\u611f\u201d\u3001\u201c\u5f88\u89e6\u52a8\u201d\u3002\u4e0d\u7b49\u4e8e\u4e2d\u6587\u91cc\u6b7b\u677f\u7684\u201c\u611f\u6027\u201d\uff0c\u66f4\u50cf\u4e00\u79cd\u5bf9\u60c5\u7eea\u6c1b\u56f4\u7684\u5373\u65f6\u53cd\u5e94\u3002",
    usage: {
      daily: "\u9ad8",
      sns: "\u9ad8",
      news: "\u4f4e",
      business: "\u4f4e",
      academic: "\u4f4e",
      interview: "\u4e0d\u5efa\u8bae"
    },
    activeUse: "\u662f",
    notFitScenes: "\u4e0d\u9002\u5408\u8bba\u6587\u3001\u5546\u52a1\u6587\u4ef6\u3001ES \u6216\u6b63\u5f0f\u9762\u8bd5\u3002",
    examples: [
      {
        label: "1. \u65e5\u5e38 / SNS \u98ce\u683c",
        ja: "\u3053\u306e\u5199\u771f\u3001\u8272\u5473\u304c\u3061\u3087\u3063\u3068\u30a8\u30e2\u3044\u306d\u3002",
        zh: "\u8fd9\u5f20\u7167\u7247\u7684\u8272\u8c03\u6709\u70b9\u5f88\u6233\u60c5\u7eea\u5462\u3002",
        difficulty: "\u2605\u2606\u2606",
        why: "\u65e5\u5e38 SNS \u91cc\u5f88\u5e38\u89c1\uff0c\u6982\u5ff5\u867d\u7136\u62bd\u8c61\uff0c\u4f46\u4f7f\u7528\u65b9\u5f0f\u5f88\u56fa\u5b9a\u3002",
        mimic: "\u662f",
        alternative: ""
      },
      {
        label: "2. \u65b0\u95fb / \u8bc4\u8bba\u98ce\u683c",
        ja: "\u61d0\u65e7\u6027\u3092\u524d\u9762\u306b\u6253\u3061\u51fa\u3057\u305f\u6620\u50cf\u6f14\u51fa\u304c\u3001\u82e5\u5e74\u5c64\u306e\u9593\u3067\u300c\u30a8\u30e2\u3044\u300d\u3068\u53cd\u97ff\u3092\u547c\u3093\u3067\u3044\u308b\u3002",
        zh: "\u4ee5\u6000\u65e7\u611f\u4e3a\u4e3b\u7684\u5f71\u50cf\u8868\u73b0\uff0c\u5728\u5e74\u8f7b\u7fa4\u4f53\u4e2d\u4ee5\u201c\u5f88\u30a8\u30e2\u3044\u201d\u7684\u8bc4\u4ef7\u5f15\u53d1\u4e86\u53cd\u54cd\u3002",
        difficulty: "\u2605\u2605\u2606",
        why: "\u9700\u8981\u7406\u89e3\u5a92\u4f53\u5982\u4f55\u628a\u53e3\u8bed\u8bcd\u5f15\u53f7\u5316\u5730\u653e\u8fdb\u62a5\u9053\u8bed\u5883\u3002",
        mimic: "\u9700\u8c28\u614e",
        alternative: "\u66f4\u7a33\u7684\u5a92\u4f53\u8bed\u98ce\u53ef\u5199\u6210\u300c\u5f37\u3044\u5171\u611f\u3092\u547c\u3093\u3067\u3044\u308b\u300d\u3002"
      },
      {
        label: "3. \u7a0d\u6b63\u5f0f / \u5b66\u672f\u98ce\u683c",
        ja: "\u300c\u30a8\u30e2\u3044\u300d\u3068\u3044\u3046\u8868\u73fe\u306f\u3001\u8fd1\u5e74\u306e\u611f\u60c5\u8a55\u4fa1\u8a9e\u5f59\u306e\u4e00\u4f8b\u3068\u3057\u3066\u53c2\u7167\u3055\u308c\u308b\u3002",
        zh: "\u201c\u30a8\u30e2\u3044\u201d\u8fd9\u4e2a\u8868\u8fbe\uff0c\u53ef\u88ab\u89c6\u4e3a\u8fd1\u5e74\u60c5\u611f\u8bc4\u4ef7\u8bcd\u6c47\u7684\u4e00\u4e2a\u4f8b\u5b50\u3002",
        difficulty: "\u2605\u2605\u2605",
        why: "\u8fd9\u79cd\u5199\u6cd5\u4e0d\u662f\u7528\u8fd9\u4e2a\u8bcd\u505a\u201c\u81ea\u7136\u4f8b\u53e5\u201d\uff0c\u800c\u662f\u62bf\u5b83\u5f53\u5206\u6790\u5bf9\u8c61\u8ba8\u8bba\u3002",
        mimic: "\u5426",
        alternative: "\u5b66\u672f\u5199\u4f5c\u91cc\u5c3d\u91cf\u522b\u628a\u5b83\u5f53\u5b9a\u6027\u5bb9\u8bcd\u76f4\u63a5\u4f7f\u7528\uff0c\u800c\u662f\u8f6c\u6210\u300c\u611f\u60c5\u7684\u53cd\u5fdc\u3092\u5f15\u304d\u8d77\u3053\u3059\u300d\u3002"
      }
    ],
    synonyms: [
      { word: "\u611f\u52d5\u7684", note: "\u66f4\u76f4\u63a5\u8868\u793a\u201c\u4ee4\u4eba\u611f\u52a8\u201d\uff0c\u6ca1\u6709\u300c\u30a8\u30e2\u3044\u300d\u90a3\u79cd\u8f7b\u5fae\u7684\u6d41\u884c\u611f\u3002" },
      { word: "\u5207\u306a\u3044", note: "\u66f4\u504f\u201c\u5fc3\u91cc\u53d1\u9178\u3001\u96be\u8fc7\u201d\uff0c\u4e0d\u50cf\u300c\u30a8\u30e2\u3044\u300d\u90a3\u6837\u53ef\u4ee5\u5305\u62ec\u6e29\u67d4\u3001\u6000\u65e7\u3001\u6572\u5fc3\u7b49\u591a\u79cd\u60c5\u7eea\u3002" },
      { word: "\u61d0\u304b\u3057\u3044", note: "\u504f\u91cd\u201c\u6000\u65e7\u201d\uff0c\u7bc4\u570d\u6bd4\u300c\u30a8\u30e2\u3044\u300d\u66f4\u7a84\u3002" }
    ],
    advice: "\u8fd9\u4e2a\u8bcd\u5b8c\u5168\u503c\u5f97\u5b66\uff0c\u800c\u4e14\u4e5f\u53ef\u4ee5\u5728\u65e5\u5e38\u804a\u5929\u548c SNS \u91cc\u4e3b\u52a8\u7528\uff1b\u4f46\u53ea\u8981\u8bed\u5883\u53d8\u5f97\u6b63\u5f0f\uff0c\u5c31\u5c3d\u91cf\u6362\u6210\u66f4\u5ba2\u89c2\u3001\u66f4\u53ef\u89e3\u91ca\u7684\u8bcd\u3002"
  }
};

initNavigation();
initReadingList();
initVocabJudge();
initCalendar();
window.addEventListener("online", () => refreshSyncStatus());
window.addEventListener("offline", () => refreshSyncStatus());

function initNavigation() {
  menuButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetPage = button.dataset.page;

      menuButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      pages.forEach((page) => page.classList.remove("active"));

      const target = document.getElementById(targetPage);
      if (target) {
        target.classList.add("active");
      }
    });
  });
}

function initReadingList() {
  if (!bookInput || !addBtn || !bookList) {
    return;
  }

  addBtn.addEventListener("click", addBook);
  bookInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      addBook();
    }
  });

  onSnapshot(
    booksQuery,
    (snapshot) => {
      renderBooks(snapshot.docs);
    },
    (error) => {
      console.error("Reading list load failed:", error);
      bookList.innerHTML = '<li class="empty-text">\u9605\u8BFB\u6E05\u5355\u8BFB\u53D6\u5931\u8D25\u3002</li>';
    }
  );
}

function initVocabJudge() {
  if (
    !jpWordInput ||
    !contextNoteInput ||
    !analyzeWordBtn ||
    !copyPromptBtn ||
    !fillSampleBtn ||
    !vocabResult ||
    !readingChip ||
    !usageChip
  ) {
    return;
  }

  renderVocabularyReport(createEmptyVocabularyReport());

  analyzeWordBtn.addEventListener("click", () => {
    const report = buildVocabularyReport({
      word: jpWordInput.value,
      contextNote: contextNoteInput.value
    });

    renderVocabularyReport(report);
  });

  copyPromptBtn.addEventListener("click", async () => {
    const prompt = [
      VOCAB_PROMPT_TEMPLATE,
      "",
      `\u3010\u8f93\u5165\u3011\uff1a${jpWordInput.value.trim() || ""}`,
      `\u3010\u8865\u5145\u8bed\u5883\u3011\uff1a${contextNoteInput.value.trim() || ""}`
    ].join("\n");

    try {
      await navigator.clipboard.writeText(prompt);
      copyPromptBtn.textContent = "\u5df2\u590d\u5236\u63d0\u793a\u8bcd";
      setTimeout(() => {
        copyPromptBtn.textContent = "\u590d\u5236 AI \u63d0\u793a\u8bcd";
      }, 1600);
    } catch (error) {
      console.error("Copy prompt failed:", error);
      alert("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6d4f\u89c8\u5668\u526a\u8d34\u677f\u6743\u9650\u3002");
    }
  });

  fillSampleBtn.addEventListener("click", () => {
    jpWordInput.value = "\u5fd6\u5ea6";
    contextNoteInput.value = "\u60f3\u77e5\u9053\u8fd9\u4e2a\u8bcd\u80fd\u4e0d\u80fd\u7528\u5728\u9762\u8bd5\u3001ES \u548c\u65b0\u95fb\u8bc4\u8bba\u91cc\uff0c\u4e5f\u60f3\u533a\u5206\u5b83\u548c\u300c\u914d\u616e\u300d\u3001\u300c\u7a7a\u6c17\u3092\u8aad\u3080\u300d\u7684\u5dee\u522b\u3002";

    const report = buildVocabularyReport({
      word: jpWordInput.value,
      contextNote: contextNoteInput.value
    });

    renderVocabularyReport(report);
  });
}

async function addBook() {
  const title = bookInput.value.trim();
  if (!title) {
    alert("\u8BF7\u8F93\u5165\u4E66\u540D\u3002");
    return;
  }

  try {
    await addDoc(booksRef, {
      title,
      note: "",
      completed: false,
      createdAt: Date.now()
    });

    bookInput.value = "";
    bookInput.focus();
  } catch (error) {
    console.error("Add book failed:", error);
    alert("\u6DFB\u52A0\u4E66\u7C4D\u5931\u8D25\u3002");
  }
}

function renderBooks(docs) {
  bookList.innerHTML = "";

  if (!docs.length) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "empty-text";
    emptyLi.textContent = "\u8FD8\u6CA1\u6709\u6DFB\u52A0\u4E66\u7C4D\u3002";
    bookList.appendChild(emptyLi);
    return;
  }

  docs.forEach((docSnap) => {
    const book = docSnap.data();
    const bookId = docSnap.id;

    const li = document.createElement("li");
    li.className = "book-item";
    if (book.completed) {
      li.classList.add("completed");
    }

    const headerDiv = document.createElement("div");
    headerDiv.className = "book-header";

    const titleDiv = document.createElement("div");
    titleDiv.className = "book-title";
    titleDiv.textContent = book.title;
    titleDiv.addEventListener("click", async () => {
      try {
        await updateDoc(doc(db, "books", bookId), {
          completed: !book.completed
        });
      } catch (error) {
        console.error("Toggle book failed:", error);
        alert("\u66F4\u65B0\u4E66\u7C4D\u72B6\u6001\u5931\u8D25\u3002");
      }
    });

    const notePreview = document.createElement("div");
    notePreview.className = "book-note-preview";
    notePreview.textContent = book.note || "\u8FD8\u6CA1\u6709\u5907\u6CE8";

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "book-actions";

    const noteBtn = document.createElement("button");
    noteBtn.className = "action-btn note-btn";
    noteBtn.type = "button";
    noteBtn.textContent = "\u5907\u6CE8";
    noteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openNoteEditor(li, bookId, book.note || "");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-btn delete-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "\u5220\u9664";
    deleteBtn.addEventListener("click", async () => {
      try {
        await deleteDoc(doc(db, "books", bookId));
      } catch (error) {
        console.error("Delete book failed:", error);
        alert("\u5220\u9664\u4E66\u7C4D\u5931\u8D25\u3002");
      }
    });

    headerDiv.appendChild(titleDiv);
    headerDiv.appendChild(notePreview);
    actionsDiv.appendChild(noteBtn);
    actionsDiv.appendChild(deleteBtn);
    li.appendChild(headerDiv);
    li.appendChild(actionsDiv);
    bookList.appendChild(li);
  });
}

function buildVocabularyReport({ word, contextNote }) {
  const rawWord = (word || "").trim();
  const note = (contextNote || "").trim();

  if (!rawWord) {
    return createEmptyVocabularyReport();
  }

  const normalized = normalizeJapaneseLemma(rawWord);
  const entry = VOCAB_LIBRARY[rawWord] || VOCAB_LIBRARY[normalized];

  if (entry) {
    return {
      ...entry,
      input: rawWord,
      contextNote: note
    };
  }

  return createFallbackVocabularyReport(rawWord, note, normalized);
}

function renderVocabularyReport(report) {
  readingChip.textContent = `\u8bfb\u97f3\uff1a${report.reading || "\u8981\u78ba\u8a8d"}`;
  usageChip.textContent = `\u4e3b\u52a8\u4f7f\u7528\uff1a${report.activeUse || "\u8981\u78ba\u8a8d"}`;
  const dictionaryLinksMarkup = buildExternalDictionaryLinks(report.input || report.writing || "");

  const dictMarkup = report.dictExplanation
    .map((item, index) => `<div class="analysis-list-item"><strong>${index + 1}.</strong><span>${escapeHtml(item)}</span></div>`)
    .join("");

  const scenesMarkup = [
    `- \u65e5\u5e38\u4f1a\u8bdd\uff1a${report.usage.daily}`,
    `- SNS / \u7f51\u7edc\uff1a${report.usage.sns}`,
    `- \u65b0\u95fb\u8bc4\u8bba\uff1a${report.usage.news}`,
    `- \u5546\u52a1\uff1a${report.usage.business}`,
    `- \u5b66\u672f / \u8bba\u6587\uff1a${report.usage.academic}`,
    `- \u9762\u8bd5 / ES\uff1a${report.usage.interview}`,
    `- \u9002\u5408\u4e3b\u52a8\u4f7f\u7528\uff1a${report.activeUse}`,
    `- \u4e0d\u9002\u5408\u7684\u573a\u666f\uff1a${report.notFitScenes}`
  ].map((item) => `<div class="analysis-list-item"><span>${escapeHtml(item)}</span></div>`).join("");

  const examplesMarkup = report.examples
    .map(
      (example) => `
        <div class="example-item">
          <strong>${escapeHtml(example.label)}</strong>
          <span>${escapeHtml(example.ja)}</span>
          <span>${escapeHtml(example.zh)}</span>
        </div>
      `
    )
    .join("");

  const difficultyMarkup = report.examples
    .map(
      (example, index) => `
        <div class="analysis-list-item">
          <strong>${index + 1}. ${escapeHtml(example.label)}</strong>
          <span>\u96be\u5ea6\uff1a${escapeHtml(example.difficulty)}</span>
          <span>\u4e3a\u4ec0\u4e48\uff1a${escapeHtml(example.why)}</span>
          <span>\u5bf9 N1 \u5b66\u4e60\u8005\u662f\u5426\u9002\u5408\u6a21\u4eff\uff1a${escapeHtml(example.mimic)}</span>
          <span>\u66ff\u4ee3\u8868\u8fbe\uff1a${escapeHtml(example.alternative || "\u65e0\u9700\u66ff\u6362")}</span>
        </div>
      `
    )
    .join("");

  const synonymMarkup = report.synonyms
    .map(
      (item) => `
        <div class="analysis-list-item">
          <strong>${escapeHtml(item.word)}</strong>
          <span>${escapeHtml(item.note)}</span>
        </div>
      `
    )
    .join("");

  vocabResult.innerHTML = `
    <div class="analysis-block">
      <div class="analysis-title">\u30101. \u57fa\u672c\u4fe1\u606f\u3011</div>
      <div class="analysis-text">- \u8868\u8a18\uff1a${escapeHtml(report.writing)}\n- \u8aad\u307f\u65b9\uff1a${escapeHtml(report.reading)}\n- \u54c1\u8a5e\uff1a${escapeHtml(report.partOfSpeech)}\n- \u30a2\u30af\u30bb\u30f3\u30c8\uff1a${escapeHtml(report.accent)}\n- \u5e38\u7528\u7a0b\u5ea6\uff1a${escapeHtml(report.frequency)}</div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">\u30102. \u8f9e\u4e66\u5f0f\u89e3\u91ca\u3011</div>
      <div class="analysis-list">${dictMarkup}</div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">\u30103. \u4e2d\u6587\u89e3\u91ca\u3011</div>
      <div class="analysis-text">${escapeHtml(report.cnExplanation)}</div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">\u30104. \u8bed\u611f\u4e0e\u4f7f\u7528\u573a\u666f\u3011</div>
      <div class="analysis-list">${scenesMarkup}</div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">\u30105. \u65e5\u672c\u672c\u571f\u81ea\u7136\u4f8b\u53e5\u3011</div>
      <div class="example-list">${examplesMarkup}</div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">\u30106. \u4f8b\u53e5\u96be\u5ea6\u5206\u6790\u3011</div>
      <div class="analysis-list">${difficultyMarkup}</div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">\u30107. \u8fd1\u4e49\u8bcd\u6bd4\u8f83\u3011</div>
      <div class="analysis-list">${synonymMarkup}</div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">\u30108. \u5b66\u4e60\u8005\u4f7f\u7528\u5efa\u8bae\u3011</div>
      <div class="analysis-text">${escapeHtml(report.advice)}</div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">\u5916\u90e8\u8f9e\u4e66\u68c0\u7d22</div>
      <div class="analysis-text">\u7531\u4e8e\u5f53\u524d\u4e0d\u4f7f\u7528 Firebase Functions\uff0c\u9875\u9762\u4e0d\u4f1a\u81ea\u52a8\u6293\u53d6\u5916\u90e8\u8f9e\u4e66\uff0c\u4f46\u4f60\u53ef\u4ee5\u76f4\u63a5\u70b9\u51fb\u4e0b\u9762\u7684\u771f\u5b9e\u8f9e\u4e66\u94fe\u63a5\u3002</div>
      <div class="analysis-list">${dictionaryLinksMarkup}</div>
    </div>
    ${report.contextNote ? `
      <div class="analysis-block">
        <div class="analysis-title">\u8865\u5145\u8bed\u5883</div>
        <div class="analysis-text">${escapeHtml(report.contextNote)}</div>
      </div>
    ` : ""}
  `;
}

function buildExternalDictionaryLinks(word) {
  const term = String(word || "").trim();
  if (!term) {
    return '<div class="analysis-list-item"><span>\u8f93\u5165\u76ee\u6807\u8bcd\u540e\uff0c\u8fd9\u91cc\u4f1a\u7ed9\u51fa\u53ef\u76f4\u63a5\u68c0\u7d22\u7684\u8f9e\u4e66\u94fe\u63a5\u3002</span></div>';
  }

  const links = [
    {
      label: "Kotobank",
      url: `https://kotobank.jp/word/${encodeURIComponent(term)}`,
      note: "\u9002\u5408\u67e5\u8bfb\u97f3\u3001\u57fa\u7840\u4e49\u9879\u548c\u591a\u672c\u8f9e\u5178\u6574\u5408\u7ed3\u679c"
    },
    {
      label: "Weblio\u56fd\u8a9e\u8f9e\u5178",
      url: `https://www.weblio.jp/content/${encodeURIComponent(term)}`,
      note: "\u9002\u5408\u8865\u5145\u5173\u8054\u8f9e\u5178\u9875\u9762\u548c\u7528\u4f8b"
    },
    {
      label: "Wiktionary \u65e5\u672c\u8a9e\u7248",
      url: `https://ja.wiktionary.org/wiki/${encodeURIComponent(term)}`,
      note: "\u9002\u5408\u8865\u8bfb\u8bfb\u97f3\u3001\u8a9e\u6e90\u3001\u30a2\u30af\u30bb\u30f3\u30c8\u7b49\u4fe1\u606f"
    }
  ];

  return links
    .map(
      (item) => `
        <div class="analysis-list-item">
          <strong><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a></strong>
          <span>${escapeHtml(item.note)}</span>
        </div>
      `
    )
    .join("");
}

function openNoteEditor(bookItem, bookId, oldNote) {
  closeAllEditors();

  const editorDiv = document.createElement("div");
  editorDiv.className = "book-note-editor";

  const textarea = document.createElement("textarea");
  textarea.className = "book-note-input";
  textarea.placeholder = "\u5728\u8FD9\u91CC\u5199\u4E0B\u5907\u6CE8...";
  textarea.value = oldNote;

  editorDiv.appendChild(textarea);
  bookItem.appendChild(editorDiv);

  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, 0);

  async function saveAndClose(event) {
    if (editorDiv.contains(event.target)) {
      return;
    }

    try {
      await updateDoc(doc(db, "books", bookId), {
        note: textarea.value.trim()
      });
    } catch (error) {
      console.error("Save note failed:", error);
      alert("\u4FDD\u5B58\u5907\u6CE8\u5931\u8D25\u3002");
    }

    editorDiv.remove();
    document.removeEventListener("mousedown", saveAndClose);
  }

  setTimeout(() => {
    document.addEventListener("mousedown", saveAndClose);
  }, 0);
}

function closeAllEditors() {
  document.querySelectorAll(".book-note-editor").forEach((editor) => editor.remove());
}

function initCalendar() {
  renderWeekdays();
  renderCalendar();
  refreshAppleSubscribeState();
  refreshSyncStatus();

  prevMonthBtn.addEventListener("click", () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  nextMonthBtn.addEventListener("click", () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  todayBtn.addEventListener("click", () => {
    currentMonth = startOfMonth(new Date());
    renderCalendar();
  });

  newEventBtn.addEventListener("click", () => {
    openEventModal({
      date: formatDateForInput(new Date()),
      repeat: "none"
    });
  });

  downloadIcsBtn.addEventListener("click", downloadCalendarIcs);
  appleSubscribeBtn.addEventListener("click", handleAppleSubscribe);
  eventForm.addEventListener("submit", handleEventSubmit);
  deleteEventBtn.addEventListener("click", handleDeleteEvent);
  closeModalBtn.addEventListener("click", closeEventModal);

  document.querySelectorAll("[data-close-modal='true']").forEach((element) => {
    element.addEventListener("click", closeEventModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !eventModal.classList.contains("hidden")) {
      closeEventModal();
    }
  });

  onSnapshot(
    calendarEventsQuery,
    (snapshot) => {
      calendarEvents = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      refreshSyncStatus(snapshot);
      renderCalendar();
    },
    (error) => {
      console.error("Calendar load failed:", error);
      setSyncStatus("error", "\u65E5\u5386\u8FDE\u63A5\u5931\u8D25");
      calendarGrid.innerHTML = '<div class="empty-text">\u65E5\u5386\u8BFB\u53D6\u5931\u8D25\u3002</div>';
    }
  );
}

function renderWeekdays() {
  weekdayRow.innerHTML = "";

  WEEKDAY_LABELS.forEach((label) => {
    const cell = document.createElement("div");
    cell.className = "weekday-cell";
    cell.textContent = label;
    weekdayRow.appendChild(cell);
  });
}

function renderCalendar() {
  calendarMonthLabel.textContent = `${currentMonth.getFullYear()}\u5E74 ${currentMonth.getMonth() + 1}\u6708`;
  calendarGrid.innerHTML = "";

  const firstDay = startOfMonth(currentMonth);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  for (let index = 0; index < 42; index += 1) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + index);
    calendarGrid.appendChild(createDayCell(cellDate));
  }
}

function createDayCell(date) {
  const cell = document.createElement("div");
  cell.className = "day-cell";

  const dateKey = formatDateForInput(date);
  const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
  const todayKey = formatDateForInput(new Date());

  if (!isCurrentMonth) {
    cell.classList.add("is-other-month");
  }

  if (dateKey === todayKey) {
    cell.classList.add("is-today");
  }

  const header = document.createElement("div");
  header.className = "day-header";

  const dayNumber = document.createElement("div");
  dayNumber.className = "day-number";
  dayNumber.textContent = String(date.getDate());

  const addButton = document.createElement("button");
  addButton.className = "day-add-btn";
  addButton.type = "button";
  addButton.textContent = "+";
  addButton.addEventListener("click", () => {
    openEventModal({
      date: dateKey,
      repeat: "none"
    });
  });

  const eventsContainer = document.createElement("div");
  eventsContainer.className = "day-events";

  const dayEvents = getEventsForDate(dateKey);
  if (!dayEvents.length) {
    const emptyState = document.createElement("span");
    emptyState.className = "empty-text";
    emptyState.textContent = "\u6682\u65E0\u4E8B\u9879";
    eventsContainer.appendChild(emptyState);
  } else {
    dayEvents.forEach((eventItem) => {
      const pill = document.createElement("button");
      pill.className = "event-pill";
      pill.type = "button";

      const title = document.createElement("strong");
      title.textContent = eventItem.title;

      const meta = document.createElement("span");
      meta.textContent = formatTimeRange(eventItem);

      pill.appendChild(title);
      pill.appendChild(meta);
      pill.addEventListener("click", () => openEventModal(eventItem));
      eventsContainer.appendChild(pill);
    });
  }

  header.appendChild(dayNumber);
  header.appendChild(addButton);
  cell.appendChild(header);
  cell.appendChild(eventsContainer);
  return cell;
}

function getEventsForDate(dateKey) {
  return calendarEvents
    .filter((eventItem) => occursOnDate(eventItem, dateKey))
    .sort(compareEvents)
    .slice(0, 4);
}

function compareEvents(first, second) {
  const firstKey = `${first.startTime || "99:99"}-${first.title || ""}`;
  const secondKey = `${second.startTime || "99:99"}-${second.title || ""}`;
  return firstKey.localeCompare(secondKey, "zh-CN");
}

function occursOnDate(eventItem, dateKey) {
  if (!eventItem.date || eventItem.date > dateKey) {
    return false;
  }

  if (eventItem.date === dateKey) {
    return true;
  }

  const original = parseDateOnly(eventItem.date);
  const target = parseDateOnly(dateKey);

  switch (eventItem.repeat) {
    case "daily":
      return true;
    case "weekly":
      return original.getDay() === target.getDay();
    case "monthly":
      return original.getDate() === target.getDate();
    case "yearly":
      return original.getMonth() === target.getMonth() && original.getDate() === target.getDate();
    default:
      return false;
  }
}

function openEventModal(eventData = {}) {
  const isEditing = Boolean(eventData.id);

  modalTitle.textContent = isEditing ? "\u7F16\u8F91\u4E8B\u9879" : "\u65B0\u589E\u4E8B\u9879";
  deleteEventBtn.classList.toggle("hidden", !isEditing);

  eventIdInput.value = eventData.id || "";
  eventTitleInput.value = eventData.title || "";
  eventDateInput.value = eventData.date || formatDateForInput(new Date());
  eventRepeatInput.value = eventData.repeat || "none";
  eventStartTimeInput.value = eventData.startTime || "";
  eventEndTimeInput.value = eventData.endTime || "";
  eventNoteInput.value = eventData.note || "";

  eventModal.classList.remove("hidden");
  eventModal.setAttribute("aria-hidden", "false");
  setTimeout(() => eventTitleInput.focus(), 0);
}

function closeEventModal() {
  eventModal.classList.add("hidden");
  eventModal.setAttribute("aria-hidden", "true");
  eventForm.reset();
  eventIdInput.value = "";
  deleteEventBtn.classList.add("hidden");
}

async function handleEventSubmit(event) {
  event.preventDefault();

  const payload = {
    title: eventTitleInput.value.trim(),
    date: eventDateInput.value,
    startTime: eventStartTimeInput.value || "",
    endTime: eventEndTimeInput.value || "",
    note: eventNoteInput.value.trim(),
    repeat: eventRepeatInput.value || "none",
    updatedAt: Date.now()
  };

  if (!payload.title || !payload.date) {
    alert("\u8BF7\u81F3\u5C11\u586B\u5199\u6807\u9898\u548C\u65E5\u671F\u3002");
    return;
  }

  if (payload.startTime && payload.endTime && payload.endTime <= payload.startTime) {
    alert("\u7ED3\u675F\u65F6\u95F4\u9700\u8981\u665A\u4E8E\u5F00\u59CB\u65F6\u95F4\u3002");
    return;
  }

  try {
    if (eventIdInput.value) {
      await updateDoc(doc(db, "calendarEvents", eventIdInput.value), payload);
    } else {
      await addDoc(calendarEventsRef, {
        ...payload,
        createdAt: Date.now()
      });
    }

    currentMonth = startOfMonth(parseDateOnly(payload.date));
    closeEventModal();
  } catch (error) {
    console.error("Save event failed:", error);
    alert("\u4FDD\u5B58\u4E8B\u9879\u5931\u8D25\u3002");
  }
}

async function handleDeleteEvent() {
  const eventId = eventIdInput.value;
  if (!eventId) {
    return;
  }

  try {
    await deleteDoc(doc(db, "calendarEvents", eventId));
    closeEventModal();
  } catch (error) {
    console.error("Delete event failed:", error);
    alert("\u5220\u9664\u4E8B\u9879\u5931\u8D25\u3002");
  }
}

function downloadCalendarIcs() {
  const icsContent = buildCalendarIcs(calendarEvents);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "my-calendar.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function handleAppleSubscribe() {
  if (!APPLE_CALENDAR_FEED_URL) {
    downloadCalendarIcs();
    alert("\u5DF2\u4E3A\u4F60\u5BFC\u51FA .ics \u6587\u4EF6\u3002\u7B49\u8BA2\u9605\u5730\u5740\u914D\u7F6E\u597D\u4E4B\u540E\uFF0C\u8FD9\u91CC\u5C31\u80FD\u4E00\u952E\u6253\u5F00\u82F9\u679C\u65E5\u5386\u8BA2\u9605\u3002");
    return;
  }

  const subscribeUrl = buildWebcalUrl(APPLE_CALENDAR_FEED_URL);

  try {
    await navigator.clipboard.writeText(subscribeUrl);
  } catch (error) {
    console.warn("Copy URL failed:", error);
  }

  window.open(subscribeUrl, "_blank");
}

function refreshAppleSubscribeState() {
  if (!APPLE_CALENDAR_FEED_URL) {
    appleSyncHint.textContent = "\u76EE\u524D\u53EF\u4EE5\u5148\u5BFC\u51FA .ics \u6587\u4EF6\u3002\u90E8\u7F72\u8BA2\u9605\u94FE\u63A5\u540E\uFF0C\u8FD9\u91CC\u4F1A\u76F4\u63A5\u5524\u8D77 Apple \u65E5\u5386\u8BA2\u9605\u3002";
    return;
  }

  appleSyncHint.textContent = `Apple \u8BA2\u9605\u5730\u5740\u5DF2\u5C31\u7EEA\uFF1A${APPLE_CALENDAR_FEED_URL}`;
}

function refreshSyncStatus(snapshot) {
  if (!syncStatusBadge) {
    return;
  }

  if (window.location.protocol === "file:") {
    setSyncStatus("local", "\u5F53\u524D\u662F\u672C\u5730\u6587\u4EF6\u6A21\u5F0F\uFF0C\u5176\u4ED6\u8BBE\u5907\u65E0\u6CD5\u76F4\u63A5\u8BBF\u95EE");
    return;
  }

  if (!navigator.onLine) {
    setSyncStatus("error", "\u5F53\u524D\u79BB\u7EBF\uFF0C\u53EA\u663E\u793A\u672C\u5730\u5185\u5BB9");
    return;
  }

  if (snapshot && snapshot.metadata && snapshot.metadata.fromCache) {
    setSyncStatus("local", "\u5DF2\u8FDE\u63A5\u9875\u9762\uFF0C\u6B63\u5728\u7B49\u5F85\u4E91\u7AEF\u6570\u636E");
    return;
  }

  setSyncStatus("live", "\u5DF2\u8FDE\u63A5 Firebase\uFF0C\u652F\u6301\u5B9E\u65F6\u540C\u6B65");
}

function setSyncStatus(type, message) {
  syncStatusBadge.textContent = message;
  syncStatusBadge.classList.remove("is-live", "is-local", "is-error");

  if (type === "live") {
    syncStatusBadge.classList.add("is-live");
  }

  if (type === "local") {
    syncStatusBadge.classList.add("is-local");
  }

  if (type === "error") {
    syncStatusBadge.classList.add("is-error");
  }
}

function buildCalendarIcs(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//My Site Calendar//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:\u5F20\u823B\u6E90\u7684\u5B9E\u65F6\u65E5\u5386"
  ];

  events.forEach((eventItem) => {
    const uid = `${eventItem.id || createUid(eventItem)}@my-site`;
    const startStamp = formatEventDateTime(eventItem.date, eventItem.startTime);
    const endStamp = formatEventDateTime(
      eventItem.date,
      eventItem.endTime || (eventItem.startTime ? addHour(eventItem.startTime) : ""),
      !eventItem.startTime && !eventItem.endTime
    );

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${toIcsUtc(new Date())}`);
    lines.push(eventItem.startTime ? `DTSTART:${startStamp}` : `DTSTART;VALUE=DATE:${formatDateForIcs(eventItem.date)}`);

    if (eventItem.startTime) {
      lines.push(`DTEND:${endStamp}`);
    } else {
      lines.push(`DTEND;VALUE=DATE:${formatDateForIcs(addDays(eventItem.date, 1))}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(eventItem.title || "\u672A\u547D\u540D\u4E8B\u9879")}`);

    if (eventItem.note) {
      lines.push(`DESCRIPTION:${escapeIcsText(eventItem.note)}`);
    }

    if (eventItem.repeat && eventItem.repeat !== "none") {
      lines.push(`RRULE:${repeatToRRule(eventItem.repeat)}`);
    }

    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function repeatToRRule(repeat) {
  switch (repeat) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return "FREQ=WEEKLY";
    case "monthly":
      return "FREQ=MONTHLY";
    case "yearly":
      return "FREQ=YEARLY";
    default:
      return "";
  }
}

function formatEventDateTime(dateString, timeString, fallbackEnd = false) {
  if (!dateString) {
    return "";
  }

  const time = timeString || (fallbackEnd ? "23:59" : "00:00");
  const date = new Date(`${dateString}T${time}:00`);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    pad(date.getMinutes()),
    "00"
  ].join("");
}

function formatDateForIcs(dateString) {
  const date = parseDateOnly(dateString);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function toIcsUtc(date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z"
  ].join("");
}

function formatTimeRange(eventItem) {
  const timeLabel = eventItem.startTime
    ? `${eventItem.startTime}${eventItem.endTime ? ` - ${eventItem.endTime}` : ""}`
    : "\u5168\u5929";

  if (eventItem.repeat && eventItem.repeat !== "none") {
    return `${timeLabel} | ${REPEAT_LABELS[eventItem.repeat] || "\u91CD\u590D"}`;
  }

  return timeLabel;
}

function buildWebcalUrl(url) {
  return url.replace(/^https?:\/\//i, "webcal://");
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateForInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(dateString, days) {
  const date = parseDateOnly(dateString);
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}

function addHour(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes, 0);
  date.setHours(date.getHours() + 1);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateOnly(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeIcsText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function createUid(eventItem) {
  return btoa(unescape(encodeURIComponent(`${eventItem.title}-${eventItem.date}-${eventItem.startTime || "all-day"}`)));
}

function normalizeJapaneseLemma(word) {
  const value = (word || "").trim();
  if (!value) {
    return "";
  }

  const irregularMap = {
    "\u3057\u307e\u3057\u305f": "\u3059\u308b",
    "\u3057\u3066\u3044\u308b": "\u3059\u308b",
    "\u3057\u305f": "\u3059\u308b",
    "\u3057\u307e\u3059": "\u3059\u308b",
    "\u3060\u3063\u305f": "\u3060",
    "\u3067\u3057\u305f": "\u3067\u3059",
    "\u304b\u3063\u305f": "\u3044",
    "\u304f\u306a\u3044": "\u3044"
  };

  if (irregularMap[value]) {
    return irregularMap[value];
  }

  const patterns = [
    { test: /\u3057\u307e\u3057\u305f$/, replace: "\u3059\u308b" },
    { test: /\u3057\u3066\u3044\u308b$/, replace: "\u3059\u308b" },
    { test: /\u3057\u3066\u308b$/, replace: "\u3059\u308b" },
    { test: /\u3057\u305f$/, replace: "\u3059\u308b" },
    { test: /\u3057\u307e\u3059$/, replace: "\u3059\u308b" },
    { test: /\u3067\u3057\u305f$/, replace: "\u3067\u3059" },
    { test: /\u304b\u3063\u305f$/, replace: "\u3044" },
    { test: /\u304f\u306a\u3044$/, replace: "\u3044" },
    { test: /\u304f\u3066$/, replace: "\u3044" },
    { test: /\u307e\u3059$/, replace: "\u308b" },
    { test: /\u307e\u3057\u305f$/, replace: "\u308b" },
    { test: /\u3066\u3044\u308b$/, replace: "\u308b" },
    { test: /\u3066\u308b$/, replace: "\u308b" },
    { test: /\u306a\u3044$/, replace: "\u308b" },
    { test: /\u305f$/, replace: "\u308b" }
  ];

  for (const pattern of patterns) {
    if (pattern.test.test(value)) {
      return value.replace(pattern.test, pattern.replace);
    }
  }

  return value;
}

function createEmptyVocabularyReport() {
  return {
    input: "",
    writing: "-",
    reading: "\u8981\u78ba\u8a8d",
    partOfSpeech: "\u8981\u78ba\u8a8d",
    accent: "\u8981\u78ba\u8a8d",
    frequency: "-",
    dictExplanation: ["\u8bf7\u5148\u8f93\u5165\u4e00\u4e2a\u65e5\u8bed\u5355\u8bcd\u3001\u77ed\u8bed\u6216\u8868\u8fbe\u3002"],
    cnExplanation: "\u8f93\u5165\u540e\u8fd9\u91cc\u4f1a\u751f\u6210\u8f9e\u4e66\u98ce\u683c\u89e3\u91ca\u4e0e\u5b66\u4e60\u5efa\u8bae\u3002",
    usage: {
      daily: "-",
      sns: "-",
      news: "-",
      business: "-",
      academic: "-",
      interview: "-"
    },
    activeUse: "-",
    notFitScenes: "-",
    examples: [
      {
        label: "1. \u65e5\u5e38 / SNS \u98ce\u683c",
        ja: "-",
        zh: "-",
        difficulty: "-",
        why: "-",
        mimic: "-",
        alternative: "-"
      },
      {
        label: "2. \u65b0\u95fb / \u8bc4\u8bba\u98ce\u683c",
        ja: "-",
        zh: "-",
        difficulty: "-",
        why: "-",
        mimic: "-",
        alternative: "-"
      },
      {
        label: "3. \u7a0d\u6b63\u5f0f / \u5b66\u672f\u98ce\u683c",
        ja: "-",
        zh: "-",
        difficulty: "-",
        why: "-",
        mimic: "-",
        alternative: "-"
      }
    ],
    synonyms: [
      {
        word: "-",
        note: "\u8f93\u5165\u76ee\u6807\u8bcd\u540e\uff0c\u8fd9\u91cc\u4f1a\u8f93\u51fa\u8fd1\u4e49\u8bcd\u548c\u8bed\u611f\u5dee\u522b\u3002"
      }
    ],
    advice: "\u8bf7\u5148\u8f93\u5165\u76ee\u6807\u8868\u8fbe\u3002",
    contextNote: ""
  };
}

function createFallbackVocabularyReport(rawWord, note, normalized) {
  const inferredPart = inferPartOfSpeech(normalized);
  const formalAlternative = normalized === rawWord ? rawWord : normalized;

  return {
    input: rawWord,
    writing: rawWord,
    reading: "\u8981\u78ba\u8a8d",
    partOfSpeech: inferredPart,
    accent: "\u8981\u78ba\u8a8d",
    frequency: "\u8981\u78ba\u8a8d",
    dictExplanation: [
      `${rawWord}\u306f\u3001\u8a9e\u5f62\u30fb\u6587\u8108\u306e\u78ba\u8a8d\u3092\u8981\u3059\u308b\u8868\u73fe\u3067\u3042\u308b\u3002`,
      `\u8f9e\u66f8\u7684\u306a\u610f\u5473\u3092\u5b9a\u3081\u308b\u306b\u306f\u3001\u5177\u4f53\u7684\u306a\u4f7f\u7528\u4f8b\u3068\u51fa\u73fe\u5834\u9762\u306e\u691c\u8a0e\u304c\u5fc5\u8981\u3067\u3042\u308b\u3002`
    ],
    cnExplanation: `\u8fd9\u4e2a\u8bcd\u76ee\u524d\u6ca1\u6709\u88ab\u672c\u5730\u5185\u7f6e\u8bcd\u5e93\u8986\u76d6\uff0c\u6240\u4ee5\u6682\u65f6\u53ea\u80fd\u7ed9\u4f60\u4e00\u4e2a\u201c\u9700\u8981\u8fdb\u4e00\u6b65\u786e\u8ba4\u201d\u7684\u4fdd\u5b88\u5206\u6790\u3002\u5982\u679c\u4f60\u8981\u62ff\u5b83\u53bb\u4e3b\u52a8\u4f7f\u7528\uff0c\u6700\u597d\u5148\u7ed3\u5408\u5177\u4f53\u51fa\u5904\uff0c\u786e\u8ba4\u8bfb\u97f3\u3001\u91ca\u4e49\u548c\u8bed\u57df\u3002`,
    usage: {
      daily: "\u8981\u78ba\u8a8d",
      sns: "\u8981\u78ba\u8a8d",
      news: "\u8981\u78ba\u8a8d",
      business: "\u9700\u8b66\u614e",
      academic: "\u9700\u8b66\u614e",
      interview: "\u4e0d\u5efa\u8bae\u76f4\u63a5\u4f7f\u7528"
    },
    activeUse: "\u9700\u8b66\u614e",
    notFitScenes: "\u5728\u8bfb\u97f3\u3001\u8bcd\u4e49\u3001\u8bed\u611f\u8fd8\u4e0d\u7a33\u7684\u60c5\u51b5\u4e0b\uff0c\u4e0d\u5efa\u8bae\u653e\u8fdb\u6b63\u5f0f\u5199\u4f5c\u3001\u9762\u8bd5\u6216\u8bba\u6587\u3002",
    examples: [
      {
        label: "1. \u65e5\u5e38 / SNS \u98ce\u683c",
        ja: `\u3053\u306e\u8868\u73fe\u306f\u6c17\u306b\u306a\u308b\u3051\u308c\u3069\u3001${rawWord}\u3063\u3066\u666e\u6bb5\u3069\u3046\u3044\u3046\u5834\u9762\u3067\u4f7f\u3046\u306e\u304b\u307e\u3060\u78ba\u8a8d\u3057\u305f\u3044\u3002`,
        zh: `\u8fd9\u4e2a\u8868\u8fbe\u633a\u8ba9\u4eba\u5728\u610f\u7684\uff0c\u4f46\u6211\u8fd8\u60f3\u5148\u786e\u8ba4 ${rawWord} \u5e73\u5e38\u5230\u5e95\u662f\u5728\u4ec0\u4e48\u573a\u5408\u7528\u7684\u3002`,
        difficulty: "\u2605\u2606\u2606",
        why: "\u53e5\u5b50\u7ed3\u6784\u7b80\u5355\uff0c\u9002\u5408\u5b66\u4e60\u8005\u62ff\u6765\u8868\u8fbe\u201c\u6211\u5728\u786e\u8ba4\u8fd9\u4e2a\u8bcd\u201d\u3002",
        mimic: "\u662f",
        alternative: ""
      },
      {
        label: "2. \u65b0\u95fb / \u8bc4\u8bba\u98ce\u683c",
        ja: `\u3053\u306e\u8a9e\u306e\u7528\u6cd5\u306b\u3064\u3044\u3066\u306f\u3001${rawWord}\u3068\u3044\u3046\u8868\u73fe\u304c\u3069\u306e\u8a9e\u57df\u3067\u5b9a\u7740\u3057\u3066\u3044\u308b\u306e\u304b\u3092\u898b\u6975\u3081\u308b\u5fc5\u8981\u304c\u3042\u308b\u3002`,
        zh: `\u5173\u4e8e\u8fd9\u4e2a\u8bcd\u7684\u7528\u6cd5\uff0c\u9700\u8981\u5148\u5224\u65ad\u540d\u4e3a ${rawWord} \u7684\u8fd9\u79cd\u8868\u8fbe\u7a76\u7adf\u5728\u54ea\u79cd\u8bed\u57df\u91cc\u5df2\u7ecf\u5b9a\u7740\u4e0b\u6765\u3002`,
        difficulty: "\u2605\u2605\u2606",
        why: "\u504f\u8bba\u8ff0\u578b\uff0c\u9002\u5408\u8bad\u7ec3\u4f60\u600e\u4e48\u201c\u8c08\u8bba\u4e00\u4e2a\u8bcd\u7684\u7528\u6cd5\u201d\u3002",
        mimic: "\u662f",
        alternative: ""
      },
      {
        label: "3. \u7a0d\u6b63\u5f0f / \u5b66\u672f\u98ce\u683c",
        ja: `\u672c\u7a3f\u3067\u306f\u3001${formalAlternative}\u306e\u610f\u5473\u6a5f\u80fd\u3068\u8a9e\u7528\u8ad6\u7684\u7279\u5fb4\u306b\u3064\u3044\u3066\u306f\u3001\u4eca\u5f8c\u306e\u8cc7\u6599\u88dc\u5f37\u3092\u8981\u3059\u308b\u3082\u306e\u3068\u3059\u308b\u3002`,
        zh: `\u672c\u6587\u8ba4\u4e3a\uff0c\u5173\u4e8e ${formalAlternative} \u7684\u610f\u4e49\u529f\u80fd\u53ca\u8bed\u7528\u7279\u5f81\uff0c\u4ecd\u9700\u8981\u540e\u7eed\u6750\u6599\u8fdb\u4e00\u6b65\u8865\u5f3a\u3002`,
        difficulty: "\u2605\u2605\u2605",
        why: "\u5b66\u672f\u53e5\u6cd5\u6bd4\u8f83\u786c\uff0c\u9002\u5408\u9605\u8bfb\u53c2\u8003\uff0c\u4e0d\u662f\u6700\u4f18\u5148\u8981\u6a21\u4eff\u7684\u53e5\u578b\u3002",
        mimic: "\u9700\u8b66\u614e",
        alternative: "\u66f4\u5b89\u5168\u7684\u5199\u6cd5\u662f\u300c\u307e\u3060\u8cc7\u6599\u304c\u8db3\u308a\u306a\u3044\u305f\u3081\u3001\u7528\u6cd5\u306f\u7d99\u7d9a\u78ba\u8a8d\u3059\u308b\u300d\u3002"
      }
    ],
    synonyms: [
      {
        word: "\u985e\u4f3c\u8868\u73fe",
        note: "\u5982\u679c\u4f60\u8981\u7ee7\u7eed\u6df1\u6316\uff0c\u5efa\u8bae\u4e0b\u4e00\u6b65\u5173\u6ce8\u5b83\u7684\u8fd1\u4e49\u8bcd\u3001\u53cd\u4e49\u8bcd\u548c\u5e38\u89c1\u642d\u914d\u3002"
      },
      {
        word: "\u66f4\u5b89\u5168\u7684\u8868\u8fbe",
        note: "\u5982\u679c\u8fd8\u4e0d\u80fd\u786e\u5b9a\u8fd9\u4e2a\u8bcd\u7684\u8bed\u57df\uff0c\u5c3d\u91cf\u7528\u66f4\u4e2d\u6027\u3001\u66f4\u5b57\u9762\u7684\u8bf4\u6cd5\u66ff\u4ee3\u3002"
      }
    ],
    advice: `\u8fd9\u4e2a\u8bcd\u73b0\u5728\u5e94\u8be5\u5148\u5f53\u6210\u201c\u5f85\u786e\u8ba4\u8bcd\u201d\u6765\u5b66\uff1a\u5148\u67e5\u8bfb\u97f3\u3001\u770b\u771f\u5b9e\u4f8b\u53e5\u3001\u786e\u8ba4\u8bed\u57df\uff0c\u7b49\u4f60\u80fd\u7a33\u5b9a\u5224\u65ad\u5b83\u9002\u5408\u51fa\u73b0\u5728\u54ea\u79cd\u573a\u5408\u4e4b\u540e\uff0c\u518d\u8003\u8651\u4e3b\u52a8\u4f7f\u7528\u3002`,
    contextNote: note
  };
}

function inferPartOfSpeech(word) {
  if (/[\u3044\u30a4]$/.test(word)) {
    return "\u5f62\u5bb9\u8a5e\u53ef\u80fd / \u8981\u78ba\u8a8d";
  }

  if (/[\u308b\u3046\u304f\u3059\u3064\u306c\u3075\u3080\u3086\u3076\u3050]$/.test(word)) {
    return "\u52d5\u8a5e\u53ef\u80fd / \u8981\u78ba\u8a8d";
  }

  return "\u8981\u78ba\u8a8d";
}

function summarizeSources(text, fallback) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return fallback;
  }

  return lines.slice(0, 3).join(" / ");
}

function inspectDictionarySignals(text) {
  const sourceText = String(text || "");
  const negativeWords = ["\u672a\u6536\u5f55", "\u672a\u53ce\u9332", "\u672a\u786e\u8ba4", "\u672a\u78ba\u8a8d", "\u67e5\u4e0d\u5230", "\u306a\u3057", "\u6ca1\u6709", "\u672a\u89c1"];
  const standardSources = ["\u5927\u8f9e\u6797", "\u660e\u93e1", "\u660e\u955c", "\u5b66\u7814"];
  const secondarySources = ["Weblio", "goo"];

  const standardHits = standardSources.filter((name) => {
    if (!sourceText.includes(name)) {
      return false;
    }

    const relatedLines = sourceText
      .split(/\r?\n/)
      .filter((line) => line.includes(name));

    return relatedLines.some((line) => !negativeWords.some((word) => line.includes(word)));
  }).length;

  const otherHits = secondarySources.filter((name) => {
    const matchedLines = sourceText
      .split(/\r?\n/)
      .filter((line) => line.toLowerCase().includes(name.toLowerCase()));

    return matchedLines.some((line) => !negativeWords.some((word) => line.includes(word)));
  }).length;

  return {
    standardHits,
    otherHits
  };
}

function inspectSnsSignals(text) {
  const sourceText = String(text || "");
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const hotWords = ["\u9ad8\u9891", "\u5f88\u591a", "\u5e38\u89c1", "\u7206", "\u70ed\u8bae", "\u6d41\u884c", "\u9891\u7e41", "viral", "\u30d0\u30ba", "\u8bdd\u9898"];
  const contextWords = ["\u8bed\u5883\u4e00\u81f4", "\u610f\u601d\u4e00\u81f4", "\u540c\u4e49", "\u90fd\u8868\u793a", "\u5e38\u7528\u4e8e", "\u591a\u7528\u4e8e"];
  const mismatchWords = ["\u96f6\u661f", "\u8bed\u5883\u4e0d\u4e00\u81f4", "\u62fc\u9519", "\u8bef\u5199", "\u8bef\u62fc", "\u4e34\u65f6", "\u770b\u4e0d\u51fa"];

  let frequencyScore = lines.length >= 3 ? 2 : lines.length >= 1 ? 1 : 0;

  if (hotWords.some((word) => sourceText.includes(word))) {
    frequencyScore += 2;
  }

  if (contextWords.some((word) => sourceText.includes(word))) {
    frequencyScore += 1;
  }

  if (mismatchWords.some((word) => sourceText.includes(word))) {
    frequencyScore -= 2;
  }

  return {
    frequencyScore: Math.max(frequencyScore, 0)
  };
}

function inferMeaningText(judgement, lemma, dictionarySignals, snsSignals) {
  if (judgement === "\u89c4\u8303\u8bcd") {
    return `${lemma} \u66f4\u63a5\u8fd1\u89c4\u8303\u8bcd\u6761\uff0c\u5efa\u8bae\u4f18\u5148\u53c2\u8003\u8bcd\u5178\u4e49\u9879\uff0c\u518d\u7ed3\u5408\u4e0a\u4e0b\u6587\u8865\u5145\u8bed\u6c14\u548c\u642d\u914d\u3002`;
  }

  if (judgement === "\u6d41\u884c\u8bcd") {
    return `${lemma} \u66f4\u50cf\u73b0\u4ee3\u53e3\u8bed\u6216\u7f51\u7edc\u8868\u8fbe\uff0c\u8bcd\u4e49\u5f80\u5f80\u4f9d\u8d56\u8bed\u5883\uff0c\u5e38\u5e26\u60c5\u7eea\u8272\u5f69\u6216\u5708\u5c42\u7528\u6cd5\u3002`;
  }

  if (judgement === "\u7591\u4f3c\u4e0d\u5b58\u5728") {
    return `${lemma} \u76ee\u524d\u7f3a\u5c11\u7a33\u5b9a\u8bcd\u4e49\u4f9d\u636e\uff0c\u53ef\u80fd\u662f\u8bef\u62fc\u3001\u4e34\u65f6\u9020\u8bcd\uff0c\u6216\u9700\u8981\u8fdb\u4e00\u6b65\u786e\u8ba4\u4e0a\u4e0b\u6587\u3002`;
  }

  if (dictionarySignals.otherHits > 0 || snsSignals.frequencyScore > 0) {
    return `${lemma} \u6709\u4e00\u5b9a\u4f7f\u7528\u75d5\u8ff9\uff0c\u4f46\u8bcd\u4e49\u8fb9\u754c\u53ef\u80fd\u4e0d\u5982\u57fa\u7840\u8bcd\u6c47\u7a33\u5b9a\uff0c\u5efa\u8bae\u7ed3\u5408\u4f8b\u53e5\u7406\u89e3\u3002`;
  }

  return `${lemma} \u7684\u542b\u4e49\u6682\u4e0d\u660e\u786e\uff0c\u5efa\u8bae\u7ee7\u7eed\u8865\u5145\u68c0\u7d22\u6765\u6e90\u3002`;
}

function buildLearnerNote(judgement, lemma) {
  if (judgement === "\u89c4\u8303\u8bcd") {
    return `\u5b66\u4e60\u8005\u53ef\u4ee5\u628a\u300c${lemma}\u300d\u5f53\u4f5c\u8f83\u7a33\u5b9a\u7684\u65e5\u8bed\u8bcd\u6c47\u6765\u8bb0\u5fc6\uff0c\u4f18\u5148\u638c\u63e1\u8bcd\u5178\u4e49\u3001\u5e38\u89c1\u642d\u914d\u548c\u6d3b\u7528\u5f62\u5f0f\u3002`;
  }

  if (judgement === "\u6d41\u884c\u8bcd") {
    return `\u5b66\u4e60\u8005\u770b\u5230\u300c${lemma}\u300d\u65f6\uff0c\u53ef\u4ee5\u5148\u7406\u89e3\u5b83\u7684\u6838\u5fc3\u60c5\u7eea\u548c\u4f7f\u7528\u573a\u666f\u3002\u5b83\u66f4\u9002\u5408\u4f1a\u8bdd\u3001\u793e\u4ea4\u5a92\u4f53\u548c\u8f7b\u677e\u8bed\u5883\uff0c\u4e0d\u4e00\u5b9a\u9002\u7528\u4e8e\u6b63\u5f0f\u5199\u4f5c\u3002`;
  }

  if (judgement === "\u7591\u4f3c\u4e0d\u5b58\u5728") {
    return `\u8fd9\u6761\u8868\u8fbe\u76ee\u524d\u4e0d\u5efa\u8bae\u76f4\u63a5\u5f53\u4f5c\u6b63\u5f0f\u8bcd\u6c47\u8bb0\u5fc6\u3002\u66f4\u7a33\u59a5\u7684\u505a\u6cd5\u662f\u56de\u5230\u539f\u53e5\uff0c\u786e\u8ba4\u662f\u5426\u5b58\u5728\u62fc\u5199\u9519\u8bef\u3001\u53d8\u5f62\u9519\u8bef\u6216\u65ad\u8bcd\u95ee\u9898\u3002`;
  }

  return `\u5b66\u4e60\u8005\u53ef\u4ee5\u5148\u628a\u300c${lemma}\u300d\u4f5c\u4e3a\u5f85\u786e\u8ba4\u8bcd\u5904\u7406\uff0c\u8bb0\u5f55\u51fa\u73b0\u8bed\u5883\uff0c\u518d\u9010\u6b65\u5224\u65ad\u5b83\u662f\u666e\u901a\u8bcd\u8fd8\u662f\u5708\u5c42\u8868\u8fbe\u3002`;
}

function buildFallbackExamples(lemma, judgement) {
  if (judgement === "\u6d41\u884c\u8bcd") {
    return [
      {
        ja: `${lemma} \u3063\u3066\u6700\u8fd1\u3088\u304f\u898b\u308b\u3051\u3069\u3001\u4f7f\u3046\u5834\u9762\u3092\u77e5\u308b\u3068\u610f\u5473\u304c\u3064\u304b\u307f\u3084\u3059\u3044\u3002`,
        zh: `\u6700\u8fd1\u5f88\u5e38\u770b\u5230\u300c${lemma}\u300d\uff0c\u7406\u89e3\u5b83\u51fa\u73b0\u7684\u573a\u666f\u540e\u4f1a\u66f4\u5bb9\u6613\u628a\u63e1\u610f\u601d\u3002`
      },
      {
        ja: `SNS\u3067\u306f\u3001${lemma} \u307f\u305f\u3044\u306a\u8a00\u3044\u65b9\u304c\u77ed\u304f\u611f\u60c5\u3092\u4f1d\u3048\u308b\u306e\u306b\u4fbf\u5229\u3060\u3002`,
        zh: `\u5728 SNS \u4e0a\uff0c\u50cf\u300c${lemma}\u300d\u8fd9\u6837\u7684\u8bf4\u6cd5\u5f88\u65b9\u4fbf\u5feb\u901f\u4f20\u8fbe\u60c5\u7eea\u3002`
      }
    ];
  }

  return [
    {
      ja: `\u3053\u306e\u6587\u3067\u306f\u300c${lemma}\u300d\u304c\u3069\u3093\u306a\u610f\u5473\u3067\u4f7f\u308f\u308c\u3066\u3044\u308b\u304b\u3001\u524d\u5f8c\u306e\u6587\u8108\u3092\u78ba\u8a8d\u3057\u3088\u3046\u3002`,
      zh: `\u5728\u8fd9\u4e2a\u53e5\u5b50\u91cc\uff0c\u8981\u5148\u786e\u8ba4\u300c${lemma}\u300d\u5728\u4e0a\u4e0b\u6587\u4e2d\u662f\u4ee5\u4ec0\u4e48\u542b\u4e49\u4f7f\u7528\u7684\u3002`
    },
    {
      ja: `\u300c${lemma}\u300d\u3092\u899a\u3048\u308b\u3068\u304d\u306f\u3001\u5358\u72ec\u306e\u610f\u5473\u3060\u3051\u3067\u306a\u304f\u4f8b\u6587\u3054\u3068\u899a\u3048\u308b\u3068\u5b9a\u7740\u3057\u3084\u3059\u3044\u3002`,
      zh: `\u8bb0\u5fc6\u300c${lemma}\u300d\u65f6\uff0c\u4e0d\u53ea\u80cc\u5355\u72ec\u8bcd\u4e49\uff0c\u8fde\u4f8b\u53e5\u4e00\u8d77\u8bb0\u4f1a\u66f4\u7262\u3002`
    }
  ];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
