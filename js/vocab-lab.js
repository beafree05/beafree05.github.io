import { db, LOCAL_VOCAB_ANALYZE_URL, VOCAB_ANALYZE_URL } from "./firebase.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ENTRY_COLLECTION = "vocabulary_entries";
const PROGRESS_COLLECTION = "user_word_progress";
const EVENT_COLLECTION = "word_learning_events";
const DEFAULT_FUNCTION_URL = "https://asia-northeast1-sairyushi-readinglist.cloudfunctions.net/vocabAnalyze";
const SAMPLE_LOOKUP = {
  word: "獲得する",
  contextNote: "我想区分它和「取得する」「得る」的差别，也想知道这个词适不适合写进论文、ES 和正式发表。"
};

const vocabLab = {
  root: null,
  dom: {},
  state: createInitialState(),
  unsubscribers: []
};

export function initVocabLab() {
  const root = document.getElementById("vocabStudio");
  if (!root) {
    return;
  }

  vocabLab.root = root;
  vocabLab.dom = {
    lookupTabBtn: document.getElementById("lookupTabBtn"),
    recordsTabBtn: document.getElementById("recordsTabBtn"),
    recordTabCount: document.getElementById("recordTabCount"),
    lookupPanel: document.getElementById("lookupPanel"),
    recordsPanel: document.getElementById("recordsPanel"),
    lookupWordInput: document.getElementById("lookupWordInput"),
    lookupContextInput: document.getElementById("lookupContextInput"),
    lookupSubmitBtn: document.getElementById("lookupSubmitBtn"),
    lookupSampleBtn: document.getElementById("lookupSampleBtn"),
    lookupClearBtn: document.getElementById("lookupClearBtn"),
    deepseekHint: document.getElementById("deepseekHint"),
    recentLookupChips: document.getElementById("recentLookupChips"),
    lookupResult: document.getElementById("lookupResult"),
    lookupStatus: document.getElementById("lookupStatus"),
    statsGrid: document.getElementById("recordStatsGrid"),
    recordSearchInput: document.getElementById("recordSearchInput"),
    recordSortSelect: document.getElementById("recordSortSelect"),
    manageRecordsBtn: document.getElementById("manageRecordsBtn"),
    recordFilters: document.getElementById("recordFilters"),
    recordList: document.getElementById("recordList"),
    recordListTitle: document.getElementById("recordListTitle"),
    recordListMeta: document.getElementById("recordListMeta"),
    bulkBar: document.getElementById("bulkBar"),
    bulkCount: document.getElementById("bulkCount"),
    detailPanel: document.getElementById("recordDetailPanel")
  };

  if (!vocabLab.dom.lookupWordInput || !vocabLab.dom.lookupResult) {
    return;
  }

  bindWanakana(vocabLab.dom.lookupWordInput);
  bindStaticEvents();
  subscribeRealtimeCollections();
  renderAll();
}

function createInitialState() {
  return {
    entries: [],
    progressMap: new Map(),
    currentReport: null,
    currentRecordId: "",
    currentEvents: [],
    detailLoading: false,
    activeTab: "lookup",
    lookupLoading: false,
    lookupError: "",
    lookupInfo: "",
    recordFilter: "due",
    recordSort: "reviewSoon",
    recordSearch: "",
    manageMode: false,
    selectedIds: new Set()
  };
}

function bindWanakana(input) {
  if (!window.wanakana || !input) {
    return;
  }

  window.wanakana.bind(input, { IMEMode: true });
}

function bindStaticEvents() {
  const {
    lookupTabBtn,
    recordsTabBtn,
    lookupWordInput,
    lookupSubmitBtn,
    lookupSampleBtn,
    lookupClearBtn,
    recordSearchInput,
    recordSortSelect,
    manageRecordsBtn,
    recordFilters,
    bulkBar
  } = vocabLab.dom;

  lookupTabBtn?.addEventListener("click", () => switchTab("lookup"));
  recordsTabBtn?.addEventListener("click", () => switchTab("records"));

  lookupSubmitBtn?.addEventListener("click", () => handleLookup());
  lookupSampleBtn?.addEventListener("click", () => {
    vocabLab.dom.lookupWordInput.value = SAMPLE_LOOKUP.word;
    vocabLab.dom.lookupContextInput.value = SAMPLE_LOOKUP.contextNote;
    handleLookup();
  });
  lookupClearBtn?.addEventListener("click", () => {
    vocabLab.dom.lookupWordInput.value = "";
    vocabLab.dom.lookupContextInput.value = "";
    vocabLab.state.currentReport = null;
    vocabLab.state.lookupError = "";
    renderAll();
  });

  lookupWordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleLookup();
    }
  });

  recordSearchInput?.addEventListener("input", (event) => {
    vocabLab.state.recordSearch = String(event.target.value || "").trim();
    ensureRecordSelection();
    renderRecordsPanel();
  });

  recordSortSelect?.addEventListener("change", (event) => {
    vocabLab.state.recordSort = event.target.value || "reviewSoon";
    ensureRecordSelection();
    renderRecordsPanel();
  });

  manageRecordsBtn?.addEventListener("click", () => {
    vocabLab.state.manageMode = !vocabLab.state.manageMode;
    if (!vocabLab.state.manageMode) {
      vocabLab.state.selectedIds.clear();
    }
    renderRecordsPanel();
  });

  recordFilters?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-record-filter]");
    if (!chip) {
      return;
    }

    vocabLab.state.recordFilter = chip.dataset.recordFilter || "due";
    vocabLab.state.selectedIds.clear();
    ensureRecordSelection();
    renderRecordsPanel();
  });

  bulkBar?.addEventListener("click", async (event) => {
    const actionBtn = event.target.closest("[data-bulk-action]");
    if (!actionBtn) {
      return;
    }

    const selectedIds = Array.from(vocabLab.state.selectedIds);
    if (!selectedIds.length) {
      return;
    }

    await runBulkAction(actionBtn.dataset.bulkAction || "", selectedIds);
  });

  vocabLab.root?.addEventListener("click", handleDelegatedClick);
}

function subscribeRealtimeCollections() {
  cleanupSubscriptions();

  const entriesQuery = query(collection(db, ENTRY_COLLECTION));
  const progressQuery = query(collection(db, PROGRESS_COLLECTION));

  vocabLab.unsubscribers.push(
    onSnapshot(entriesQuery, (snapshot) => {
      vocabLab.state.entries = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      ensureRecordSelection();
      renderAll();
    })
  );

  vocabLab.unsubscribers.push(
    onSnapshot(progressQuery, (snapshot) => {
      const nextMap = new Map();
      snapshot.docs.forEach((docSnap) => {
        nextMap.set(docSnap.id, {
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      vocabLab.state.progressMap = nextMap;
      ensureRecordSelection();
      renderAll();
    })
  );
}

function cleanupSubscriptions() {
  vocabLab.unsubscribers.forEach((unsubscribe) => unsubscribe());
  vocabLab.unsubscribers = [];
}

async function handleLookup() {
  const word = normalizeLookupWord(vocabLab.dom.lookupWordInput.value);
  const contextNote = String(vocabLab.dom.lookupContextInput.value || "").trim();

  if (!word) {
    vocabLab.state.lookupError = "先输入一个日语单词或表达，我再帮你生成完整讲解。";
    renderLookupPanel();
    return;
  }

  vocabLab.state.lookupLoading = true;
  vocabLab.state.lookupError = "";
  vocabLab.state.lookupInfo = "";
  renderLookupPanel();

  try {
    const report = await requestVocabularyReport(word, contextNote);
    vocabLab.state.currentReport = {
      ...report,
      inputWord: word,
      contextNote,
      recordId: ""
    };
    vocabLab.state.lookupLoading = false;
    renderAll();

    try {
      const recordId = await saveLookupRecord(word, contextNote, report);
      vocabLab.state.currentReport = {
        ...vocabLab.state.currentReport,
        recordId
      };
      vocabLab.state.currentRecordId = recordId;
      await loadDetailEvents(recordId);
      renderAll();
    } catch (saveError) {
      console.error("Vocabulary record save failed:", saveError);
      vocabLab.state.lookupInfo = "讲解已经生成，但学习记录暂时没有成功保存。";
      renderLookupPanel();
    }
  } catch (error) {
    console.error("Vocabulary lookup failed:", error);
    vocabLab.state.lookupError = error.message || "DeepSeek 查询失败，请稍后再试。";
    renderLookupPanel();
  } finally {
    vocabLab.state.lookupLoading = false;
    renderLookupPanel();
  }
}

async function requestVocabularyReport(word, contextNote) {
  const endpoints = buildAnalyzeEndpoints();
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          word,
          contextNote
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `词汇讲解接口不可用：${response.status}`);
      }

      return normalizeAnalysisPayload(payload.report || payload, word, contextNote);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("DeepSeek 接口暂时不可用。");
}

function buildAnalyzeEndpoints() {
  const endpoints = [];
  const protocol = window.location.protocol;
  const isLocalHttp = protocol.startsWith("http") && ["127.0.0.1", "localhost"].includes(window.location.hostname);

  if (isLocalHttp) {
    endpoints.push(`${window.location.origin}/api/vocab-analyze`);
  }

  endpoints.push(LOCAL_VOCAB_ANALYZE_URL);
  endpoints.push(VOCAB_ANALYZE_URL || DEFAULT_FUNCTION_URL);

  return [...new Set(endpoints.filter(Boolean))];
}

async function saveLookupRecord(word, contextNote, report) {
  const normalizedWord = normalizeLookupWord(report.writing || word);
  const recordId = toRecordId(normalizedWord);
  const entryRef = doc(db, ENTRY_COLLECTION, recordId);
  const entrySnap = await getDoc(entryRef);
  const currentEntry = entrySnap.exists() ? entrySnap.data() : {};
  const now = Date.now();
  const currentLookupCount = Number(currentEntry.lookupCount || 0);

  await setDoc(entryRef, {
    normalizedWord,
    surfaceWord: report.writing || word,
    reading: report.reading || "需要确认",
    partOfSpeech: report.partOfSpeech || "需要确认",
    coreMeaningCn: report.coreMeaningCn || report.meanings[0]?.body || "需要结合语境确认",
    registerLabel: report.registerLabel || "需要确认",
    lookupCount: currentLookupCount + 1,
    lastQueriedAt: now,
    lastContextNote: contextNote,
    inputForms: uniqueStrings([word, normalizedWord, ...(currentEntry.inputForms || [])]),
    isFavorite: Boolean(currentEntry.isFavorite),
    deletedAt: null,
    createdAt: currentEntry.createdAt || now,
    updatedAt: now,
    lastAnalysis: {
      ...report,
      inputWord: word,
      contextNote
    }
  }, { merge: true });

  await addLearningEvent(recordId, "lookup", {
    aiFeedback: report.teacherNote || "",
    score: null,
    userAnswer: contextNote || ""
  });

  const progressRef = doc(db, PROGRESS_COLLECTION, recordId);
  const progressSnap = await getDoc(progressRef);
  if (progressSnap.exists() && progressSnap.data().deletedAt) {
    await updateDoc(progressRef, {
      deletedAt: null,
      updatedAt: now
    });
    await addLearningEvent(recordId, "restored");
  }

  return recordId;
}

async function addWordToLearning(recordId) {
  const record = getMergedRecordById(recordId);
  if (!record) {
    return;
  }

  const now = Date.now();
  const progressRef = doc(db, PROGRESS_COLLECTION, recordId);
  const progressSnap = await getDoc(progressRef);
  const current = progressSnap.exists() ? progressSnap.data() : {};
  const weakPoints = record.report.weakPoints.length
    ? record.report.weakPoints
    : record.report.nuanceNotes.map((item) => item.value).slice(0, 2);

  await setDoc(progressRef, {
    vocabularyId: recordId,
    status: "learning",
    masteryScore: Math.max(Number(current.masteryScore || 0), 15),
    isFavorite: Boolean(current.isFavorite || record.isFavorite),
    reviewCount: Number(current.reviewCount || 0),
    correctCount: Number(current.correctCount || 0),
    wrongCount: Number(current.wrongCount || 0),
    weakPoints,
    lastStudiedAt: current.lastStudiedAt || now,
    nextReviewAt: current.nextReviewAt || addDaysToNow(1),
    deletedAt: null,
    createdAt: current.createdAt || now,
    updatedAt: now
  }, { merge: true });

  await updateDoc(doc(db, ENTRY_COLLECTION, recordId), {
    updatedAt: now,
    deletedAt: null
  });

  await addLearningEvent(recordId, "added_to_learning");
  vocabLab.state.currentRecordId = recordId;
  switchTab("records");
}

async function reviewRecord(recordId) {
  const record = getMergedRecordById(recordId);
  if (!record || !record.progress) {
    return;
  }

  const currentScore = Number(record.progress.masteryScore || 0);
  const nextScore = Math.min(currentScore + 12, 100);
  const nextStatus = nextScore >= 90 ? "mastered" : "reviewing";
  const nextReviewAt = nextStatus === "mastered" ? null : calculateNextReview(nextScore);
  const now = Date.now();

  await updateDoc(doc(db, PROGRESS_COLLECTION, recordId), {
    masteryScore: nextScore,
    reviewCount: Number(record.progress.reviewCount || 0) + 1,
    correctCount: Number(record.progress.correctCount || 0) + 1,
    status: nextStatus,
    lastStudiedAt: now,
    nextReviewAt,
    updatedAt: now,
    deletedAt: null
  });

  await addLearningEvent(recordId, "review_complete", {
    score: nextScore,
    aiFeedback: `本次复习后掌握度更新为 ${nextScore}%。`
  });

  await openDetail(recordId);
}

async function markRecordMastered(recordId) {
  const record = getMergedRecordById(recordId);
  if (!record || !record.progress) {
    return;
  }

  const now = Date.now();
  await updateDoc(doc(db, PROGRESS_COLLECTION, recordId), {
    status: "mastered",
    masteryScore: 100,
    lastStudiedAt: now,
    nextReviewAt: null,
    updatedAt: now
  });

  await addLearningEvent(recordId, "marked_mastered", {
    score: 100
  });

  await openDetail(recordId);
}

async function pauseRecord(recordId) {
  const record = getMergedRecordById(recordId);
  if (!record || !record.progress) {
    return;
  }

  await updateDoc(doc(db, PROGRESS_COLLECTION, recordId), {
    status: "paused",
    updatedAt: Date.now()
  });

  await addLearningEvent(recordId, "paused");
  await openDetail(recordId);
}

async function toggleFavorite(recordId) {
  const record = getMergedRecordById(recordId);
  if (!record) {
    return;
  }

  const nextValue = !record.isFavorite;
  const now = Date.now();
  await updateDoc(doc(db, ENTRY_COLLECTION, recordId), {
    isFavorite: nextValue,
    updatedAt: now
  });

  if (record.progress) {
    await updateDoc(doc(db, PROGRESS_COLLECTION, recordId), {
      isFavorite: nextValue,
      updatedAt: now
    });
  }

  await addLearningEvent(recordId, nextValue ? "favorited" : "unfavorited");
}

async function softDeleteRecord(recordId) {
  const record = getMergedRecordById(recordId);
  if (!record) {
    return;
  }

  const confirmed = window.confirm(`确定把「${record.displayWord}」放进回收站吗？\n30 天内你都可以恢复它。`);
  if (!confirmed) {
    return;
  }

  await applySoftDelete(recordId, record);
}

async function applySoftDelete(recordId, record = getMergedRecordById(recordId)) {
  if (!record) {
    return;
  }

  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(doc(db, ENTRY_COLLECTION, recordId), {
    deletedAt: now,
    updatedAt: now
  });

  if (record.progress) {
    batch.set(doc(db, PROGRESS_COLLECTION, recordId), {
      deletedAt: now,
      updatedAt: now
    }, { merge: true });
  }

  await batch.commit();
  await addLearningEvent(recordId, "removed");

  if (vocabLab.state.currentRecordId === recordId) {
    vocabLab.state.currentEvents = [];
  }
}

async function restoreRecord(recordId) {
  const record = getMergedRecordById(recordId);
  if (!record) {
    return;
  }

  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(db, ENTRY_COLLECTION, recordId), {
    deletedAt: null,
    updatedAt: now
  }, { merge: true });

  if (record.progress) {
    batch.set(doc(db, PROGRESS_COLLECTION, recordId), {
      deletedAt: null,
      updatedAt: now
    }, { merge: true });
  }

  await batch.commit();
  await addLearningEvent(recordId, "restored");
  await openDetail(recordId);
}

async function permanentlyDeleteRecord(recordId) {
  const record = getMergedRecordById(recordId);
  if (!record) {
    return;
  }

  const confirmed = window.confirm(
    `确定永久删除「${record.displayWord}」吗？\n删除后，讲解内容、学习状态和复习记录都无法恢复。`
  );
  if (!confirmed) {
    return;
  }

  const eventQuery = query(
    collection(db, EVENT_COLLECTION),
    where("vocabularyId", "==", recordId)
  );
  const eventSnapshot = await getDocs(eventQuery);

  const batch = writeBatch(db);
  batch.delete(doc(db, ENTRY_COLLECTION, recordId));
  batch.delete(doc(db, PROGRESS_COLLECTION, recordId));
  eventSnapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });
  await batch.commit();

  if (vocabLab.state.currentRecordId === recordId) {
    vocabLab.state.currentRecordId = "";
    vocabLab.state.currentEvents = [];
  }
}

async function addLearningEvent(recordId, eventType, payload = {}) {
  await addDoc(collection(db, EVENT_COLLECTION), {
    vocabularyId: recordId,
    eventType,
    score: payload.score ?? null,
    userAnswer: payload.userAnswer ?? "",
    aiFeedback: payload.aiFeedback ?? "",
    createdAt: Date.now()
  });
}

async function loadDetailEvents(recordId) {
  vocabLab.state.detailLoading = true;
  renderDetailPanel();

  const eventQuery = query(
    collection(db, EVENT_COLLECTION),
    where("vocabularyId", "==", recordId)
  );

  const snapshot = await getDocs(eventQuery);
  vocabLab.state.currentEvents = snapshot.docs
    .map((docSnap) => docSnap.data())
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
  vocabLab.state.detailLoading = false;
  renderDetailPanel();
}

async function openDetail(recordId) {
  vocabLab.state.currentRecordId = recordId;
  switchTab("records");
  await loadDetailEvents(recordId);
}

function switchTab(nextTab) {
  vocabLab.state.activeTab = nextTab;
  renderAll();
}

function ensureRecordSelection() {
  const visibleRecords = getVisibleRecords();
  const stillExists = visibleRecords.some((record) => record.id === vocabLab.state.currentRecordId);
  if (stillExists) {
    return;
  }

  vocabLab.state.currentRecordId = visibleRecords[0]?.id || "";
}

async function runBulkAction(action, recordIds) {
  if (!action) {
    return;
  }

  if (action === "favorite") {
    await Promise.all(recordIds.map((recordId) => forceFavorite(recordId, true)));
  }

  if (action === "mastered") {
    await Promise.all(recordIds.map((recordId) => forceMastered(recordId)));
  }

  if (action === "pause") {
    await Promise.all(recordIds.map((recordId) => forcePause(recordId)));
  }

  if (action === "delete") {
    const confirmed = window.confirm(`确定把选中的 ${recordIds.length} 条记录放进回收站吗？`);
    if (!confirmed) {
      return;
    }
    await Promise.all(recordIds.map((recordId) => applySoftDelete(recordId)));
  }

  vocabLab.state.selectedIds.clear();
  vocabLab.state.manageMode = false;
  renderRecordsPanel();
}

async function forceFavorite(recordId, nextValue) {
  const now = Date.now();
  await updateDoc(doc(db, ENTRY_COLLECTION, recordId), {
    isFavorite: nextValue,
    updatedAt: now
  });
  const progress = vocabLab.state.progressMap.get(recordId);
  if (progress) {
    await updateDoc(doc(db, PROGRESS_COLLECTION, recordId), {
      isFavorite: nextValue,
      updatedAt: now
    });
  }
  await addLearningEvent(recordId, nextValue ? "favorited" : "unfavorited");
}

async function forceMastered(recordId) {
  const progress = vocabLab.state.progressMap.get(recordId);
  if (!progress) {
    return;
  }
  await updateDoc(doc(db, PROGRESS_COLLECTION, recordId), {
    status: "mastered",
    masteryScore: 100,
    nextReviewAt: null,
    updatedAt: Date.now()
  });
  await addLearningEvent(recordId, "marked_mastered", {
    score: 100
  });
}

async function forcePause(recordId) {
  const progress = vocabLab.state.progressMap.get(recordId);
  if (!progress) {
    return;
  }
  await updateDoc(doc(db, PROGRESS_COLLECTION, recordId), {
    status: "paused",
    updatedAt: Date.now()
  });
  await addLearningEvent(recordId, "paused");
}

async function handleDelegatedClick(event) {
  const checkbox = event.target.closest("[data-select-record]");
  if (checkbox) {
    const recordId = checkbox.dataset.selectRecord;
    if (checkbox.checked) {
      vocabLab.state.selectedIds.add(recordId);
    } else {
      vocabLab.state.selectedIds.delete(recordId);
    }
    renderBulkBar();
    return;
  }

  const chip = event.target.closest("[data-recent-word]");
  if (chip) {
    const word = chip.dataset.recentWord || "";
    vocabLab.dom.lookupWordInput.value = word;
    vocabLab.dom.lookupWordInput.focus();
    return;
  }

  const detailButton = event.target.closest("[data-record-open]");
  if (detailButton) {
    await openDetail(detailButton.dataset.recordOpen || "");
    return;
  }

  const actionButton = event.target.closest("[data-record-action]");
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.recordAction || "";
  const recordId = actionButton.dataset.recordId || "";

  if (!recordId) {
    return;
  }

  switch (action) {
    case "add-learning":
      await addWordToLearning(recordId);
      break;
    case "review":
      await reviewRecord(recordId);
      break;
    case "mastered":
      await markRecordMastered(recordId);
      break;
    case "pause":
      await pauseRecord(recordId);
      break;
    case "favorite":
      await toggleFavorite(recordId);
      break;
    case "soft-delete":
      await softDeleteRecord(recordId);
      break;
    case "restore":
      await restoreRecord(recordId);
      break;
    case "permanent-delete":
      await permanentlyDeleteRecord(recordId);
      break;
    case "show-records":
      switchTab("records");
      break;
    default:
      break;
  }
}

function renderAll() {
  renderTabs();
  renderLookupPanel();
  renderRecordsPanel();
}

function renderTabs() {
  const { lookupTabBtn, recordsTabBtn, recordTabCount, lookupPanel, recordsPanel } = vocabLab.dom;
  const learningCount = getLearningRecords().length;
  recordTabCount.textContent = String(learningCount);

  lookupTabBtn?.classList.toggle("is-active", vocabLab.state.activeTab === "lookup");
  recordsTabBtn?.classList.toggle("is-active", vocabLab.state.activeTab === "records");
  lookupPanel.hidden = vocabLab.state.activeTab !== "lookup";
  recordsPanel.hidden = vocabLab.state.activeTab !== "records";
}

function renderLookupPanel() {
  renderRecentLookupChips();

  if (vocabLab.state.lookupLoading) {
    vocabLab.dom.lookupStatus.textContent = "正在向 DeepSeek 发起查询并整理成教师讲解稿...";
    vocabLab.dom.lookupResult.innerHTML = `
      <div class="vocab-placeholder-card">
        <strong>正在生成讲解</strong>
        <p>这次不会再读取本地词库，而是直接把你的词条和语境发给 DeepSeek，再整理成适合学习的结构化结果。</p>
      </div>
    `;
    return;
  }

  if (vocabLab.state.lookupError) {
    vocabLab.dom.lookupStatus.textContent = vocabLab.state.lookupError;
  } else if (vocabLab.state.lookupInfo) {
    vocabLab.dom.lookupStatus.textContent = vocabLab.state.lookupInfo;
  } else {
    vocabLab.dom.lookupStatus.textContent = "每次查询都会直连 DeepSeek，返回新的词汇讲解与学习建议。";
  }

  if (!vocabLab.state.currentReport) {
    vocabLab.dom.lookupResult.innerHTML = `
      <div class="vocab-placeholder-card">
        <strong>输入一个词，我会这样教你</strong>
        <p>我会先给你基本信息和中文义项，再解释语感、搭配、常见误用，最后用 2 到 3 个自然例句帮你把它记住。</p>
        <div class="lookup-mini-list">
          <span>1. 基本信息</span>
          <span>2. 中文含义</span>
          <span>3. 用法说明</span>
          <span>4. 自然例句</span>
          <span>5. 语感与注意点</span>
          <span>6. 学习提示</span>
        </div>
      </div>
    `;
    return;
  }

  const report = vocabLab.state.currentReport;
  const record = getMergedRecordById(report.recordId);
  const learningBanner = buildLearningBanner(record);
  const actionBar = buildLookupActionBar(record);

  vocabLab.dom.lookupResult.innerHTML = `
    ${learningBanner}
    <section class="lookup-report-hero">
      <div>
        <p class="lookup-kicker">DeepSeek Teacher Mode</p>
        <h3>${escapeHtml(report.writing)}</h3>
        <p class="lookup-reading">${escapeHtml(report.reading)}${report.romaji ? ` / ${escapeHtml(report.romaji)}` : ""}</p>
      </div>
      <div class="lookup-hero-tags">
        <span>${escapeHtml(report.partOfSpeech)}</span>
        <span>${escapeHtml(report.frequencyLabel)}</span>
        <span>${escapeHtml(report.registerLabel)}</span>
      </div>
    </section>

    <section class="lookup-core-card">
      <strong>核心义项</strong>
      <p>${escapeHtml(report.coreMeaningCn)}</p>
      ${report.contextNote ? `<div class="lookup-context-note">你的补充语境：${escapeHtml(report.contextNote)}</div>` : ""}
    </section>

    ${buildNoteBlock("1. 基本信息", [
      ["单词", report.writing],
      ["假名", report.reading],
      ["罗马音", report.romaji || "可选 / 本次未重点展示"],
      ["词性", report.partOfSpeech]
    ])}

    ${buildArrayBlock("2. 中文含义", report.meanings)}
    ${buildLabelValueBlock("3. 用法说明", report.usageNotes)}
    ${buildExampleBlock(report.examples)}
    ${buildLabelValueBlock("5. 语感 / 注意点", report.nuanceNotes)}
    ${buildListTextBlock("6. 学习提示", report.learningTip, report.weakPoints)}
    ${buildListTextBlock("补充教师备注", report.teacherNote, report.collocations)}
    ${actionBar}
  `;
}

function buildLearningBanner(record) {
  if (!record || !record.progress || record.deletedAt) {
    return "";
  }

  return `
    <div class="lookup-learning-banner">
      <strong>你之前已经学过这个词</strong>
      <p>
        当前掌握度 ${record.masteryScore}% ，上次学习 ${formatDate(record.lastStudiedAt)}，
        ${record.weakPointSummary ? `主要薄弱点：${escapeHtml(record.weakPointSummary)}。` : ""}
      </p>
      <div class="lookup-inline-actions">
        <button class="secondary-btn" type="button" data-record-action="review" data-record-id="${record.id}">继续复习</button>
        <button class="secondary-btn" type="button" data-record-open="${record.id}">查看上次记录</button>
      </div>
    </div>
  `;
}

function buildLookupActionBar(record) {
  const recordId = record?.id || vocabLab.state.currentReport.recordId;
  if (!recordId) {
    return "";
  }

  const actions = [];
  if (!record || !record.progress) {
    actions.push(`<button class="primary-btn" type="button" data-record-action="add-learning" data-record-id="${recordId}">加入学习</button>`);
  } else {
    actions.push(`<button class="primary-btn" type="button" data-record-action="review" data-record-id="${recordId}">继续学习</button>`);
    actions.push(`<button class="secondary-btn" type="button" data-record-action="mastered" data-record-id="${recordId}">标记已掌握</button>`);
    actions.push(`<button class="secondary-btn" type="button" data-record-action="pause" data-record-id="${recordId}">暂停学习</button>`);
  }

  actions.push(`<button class="secondary-btn" type="button" data-record-action="favorite" data-record-id="${recordId}">${record?.isFavorite ? "取消收藏" : "收藏"}</button>`);
  actions.push(`<button class="ghost-btn" type="button" data-record-action="show-records" data-record-id="${recordId}">去学习记录查看</button>`);

  return `<div class="lookup-action-bar">${actions.join("")}</div>`;
}

function renderRecentLookupChips() {
  const recentEntries = [...vocabLab.state.entries]
    .filter((entry) => !entry.deletedAt)
    .sort((left, right) => Number(right.lastQueriedAt || 0) - Number(left.lastQueriedAt || 0))
    .slice(0, 8);

  if (!recentEntries.length) {
    vocabLab.dom.recentLookupChips.innerHTML = `<span class="empty-text">还没有查询记录</span>`;
    return;
  }

  vocabLab.dom.recentLookupChips.innerHTML = recentEntries
    .map((entry) => `
      <button class="term-chip" type="button" data-recent-word="${escapeHtml(entry.surfaceWord || entry.normalizedWord || "")}">
        ${escapeHtml(entry.surfaceWord || entry.normalizedWord || "")}
      </button>
    `)
    .join("");
}

function renderRecordsPanel() {
  renderStatsGrid();
  renderFilters();
  renderRecordList();
  renderDetailPanel();
  renderBulkBar();
}

function renderStatsGrid() {
  const stats = buildStats();
  vocabLab.dom.statsGrid.innerHTML = `
    ${buildStatCard("今日待复习", stats.due, "优先把今天该复习的词拉出来。")}
    ${buildStatCard("学习中", stats.learning, "已经加入计划、还没完全掌握的词。")}
    ${buildStatCard("已掌握", stats.mastered, "标记完成后会保留历史，不再自动安排复习。")}
    ${buildStatCard("收藏", stats.favorite, "适合后续重点回看。")}
  `;
}

function renderFilters() {
  const chips = vocabLab.dom.recordFilters?.querySelectorAll("[data-record-filter]") || [];
  chips.forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.recordFilter === vocabLab.state.recordFilter);
  });
  vocabLab.dom.manageRecordsBtn.textContent = vocabLab.state.manageMode ? "退出管理" : "管理记录";
}

function renderRecordList() {
  const records = getVisibleRecords();
  vocabLab.dom.recordListTitle.textContent = buildRecordListTitle();
  vocabLab.dom.recordListMeta.textContent = `共 ${records.length} 条`;

  if (!records.length) {
    vocabLab.dom.recordList.innerHTML = `
      <div class="record-empty-card">
        <strong>这个分组里暂时没有内容</strong>
        <p>你可以先查一个词，或者切换筛选器看看别的学习状态。</p>
      </div>
    `;
    return;
  }

  vocabLab.dom.recordList.innerHTML = records
    .map((record) => {
      const actionGroup = buildRecordCardActions(record);
      const isSelected = vocabLab.state.selectedIds.has(record.id);
      const isActive = record.id === vocabLab.state.currentRecordId;
      const reviewLabel = buildReviewLabel(record);

      return `
        <article class="record-card ${isActive ? "is-active" : ""}">
          <div class="record-card-head">
            ${vocabLab.state.manageMode && !record.deletedAt ? `
              <label class="record-checkbox">
                <input type="checkbox" data-select-record="${record.id}" ${isSelected ? "checked" : ""} />
              </label>
            ` : ""}
            <button class="record-open-zone" type="button" data-record-open="${record.id}">
              <div class="record-word-row">
                <strong>${escapeHtml(record.displayWord)}</strong>
                <span>${escapeHtml(record.reading)}</span>
              </div>
              <div class="record-sub-row">
                <span>${escapeHtml(record.partOfSpeech)}</span>
                <span>${escapeHtml(record.statusLabel)}</span>
              </div>
              <p class="record-core-meaning">${escapeHtml(record.coreMeaningCn)}</p>
            </button>
          </div>

          <div class="record-metrics">
            <span>掌握度 ${record.masteryScore}%</span>
            <span>${escapeHtml(reviewLabel)}</span>
            <span>查询 ${record.lookupCount} 次</span>
          </div>

          <div class="record-weak-point">${escapeHtml(record.weakPointSummary || "暂无明显薄弱点，建议继续结合例句回看。")}</div>
          <div class="record-card-actions">${actionGroup}</div>
        </article>
      `;
    })
    .join("");
}

function renderDetailPanel() {
  const record = getMergedRecordById(vocabLab.state.currentRecordId);

  if (!record) {
    vocabLab.dom.detailPanel.innerHTML = `
      <div class="detail-empty-card">
        <strong>点开一条记录看详情</strong>
        <p>右侧会展示完整讲解、你的学习状态和这条词的历史轨迹。</p>
      </div>
    `;
    return;
  }

  if (vocabLab.state.detailLoading) {
    vocabLab.dom.detailPanel.innerHTML = `
      <div class="detail-empty-card">
        <strong>正在读取学习轨迹</strong>
        <p>我在把这条词的查询、加入学习、复习和删除记录整理出来。</p>
      </div>
    `;
    return;
  }

  const report = record.report;
  const eventMarkup = vocabLab.state.currentEvents.length
    ? vocabLab.state.currentEvents.slice(0, 8).map((item) => `
        <li>
          <strong>${escapeHtml(EVENT_LABELS[item.eventType] || item.eventType)}</strong>
          <span>${formatDateTime(item.createdAt)}</span>
          ${item.aiFeedback ? `<p>${escapeHtml(item.aiFeedback)}</p>` : ""}
        </li>
      `).join("")
    : `<li><strong>还没有更多学习事件</strong><span>目前主要是查询记录。</span></li>`;

  vocabLab.dom.detailPanel.innerHTML = `
    <section class="detail-hero">
      <div>
        <p class="lookup-kicker">Record Detail</p>
        <h3>${escapeHtml(record.displayWord)}</h3>
        <p class="lookup-reading">${escapeHtml(record.reading)}${report.romaji ? ` / ${escapeHtml(report.romaji)}` : ""}</p>
      </div>
      <div class="lookup-hero-tags">
        <span>${escapeHtml(record.statusLabel)}</span>
        <span>掌握度 ${record.masteryScore}%</span>
        <span>${escapeHtml(record.registerLabel)}</span>
      </div>
    </section>

    <section class="detail-summary-card">
      <strong>核心语感</strong>
      <p>${escapeHtml(report.coreMeaningCn)}</p>
      <div class="detail-meta-line">
        <span>上次学习：${formatDate(record.lastStudiedAt)}</span>
        <span>下次复习：${formatDate(record.nextReviewAt)}</span>
      </div>
    </section>

    ${buildListTextBlock("常用搭配", report.collocations.join(" / ") || "本次讲解没有单独拆出搭配，可以先看例句记忆。", report.weakPoints)}
    ${buildExampleBlock(report.examples)}
    ${buildLabelValueBlock("语感与注意点", report.nuanceNotes)}

    <section class="detail-section">
      <div class="detail-section-title">学习记录</div>
      <ul class="detail-timeline">${eventMarkup}</ul>
    </section>

    <div class="detail-action-bar">
      ${record.progress
        ? `<button class="primary-btn" type="button" data-record-action="review" data-record-id="${record.id}">开始复习</button>`
        : `<button class="primary-btn" type="button" data-record-action="add-learning" data-record-id="${record.id}">加入学习</button>`
      }
      <button class="secondary-btn" type="button" data-record-action="favorite" data-record-id="${record.id}">${record.isFavorite ? "取消收藏" : "收藏"}</button>
      ${record.deletedAt
        ? `<button class="secondary-btn" type="button" data-record-action="restore" data-record-id="${record.id}">恢复记录</button>
           <button class="danger-btn" type="button" data-record-action="permanent-delete" data-record-id="${record.id}">永久删除</button>`
        : `<button class="secondary-btn" type="button" data-record-action="mastered" data-record-id="${record.id}">标记已掌握</button>
           <button class="secondary-btn" type="button" data-record-action="pause" data-record-id="${record.id}">暂停学习</button>
           <button class="danger-btn" type="button" data-record-action="soft-delete" data-record-id="${record.id}">删除记录</button>`
      }
    </div>
  `;
}

function renderBulkBar() {
  const count = vocabLab.state.selectedIds.size;
  vocabLab.dom.bulkBar.hidden = !vocabLab.state.manageMode || count === 0;
  vocabLab.dom.bulkCount.textContent = `已选择 ${count} 项`;
}

function buildRecordListTitle() {
  switch (vocabLab.state.recordFilter) {
    case "due":
      return "待复习";
    case "learning":
      return "学习中";
    case "mastered":
      return "已掌握";
    case "favorite":
      return "收藏";
    case "queries":
      return "最近查询";
    case "trash":
      return "回收站";
    default:
      return "全部记录";
  }
}

function buildStats() {
  const records = getAllMergedRecords();
  return {
    due: records.filter((record) => !record.deletedAt && isDueRecord(record)).length,
    learning: records.filter((record) => !record.deletedAt && isLearningRecord(record)).length,
    mastered: records.filter((record) => !record.deletedAt && record.progress?.status === "mastered").length,
    favorite: records.filter((record) => !record.deletedAt && record.isFavorite).length
  };
}

function getAllMergedRecords() {
  return vocabLab.state.entries
    .map((entry) => buildMergedRecord(entry))
    .filter(Boolean);
}

function getLearningRecords() {
  return getAllMergedRecords().filter((record) => !record.deletedAt && Boolean(record.progress));
}

function getVisibleRecords() {
  const records = getAllMergedRecords();
  const searched = applySearch(records, vocabLab.state.recordSearch);
  const filtered = applyFilter(searched, vocabLab.state.recordFilter);
  return applySort(filtered, vocabLab.state.recordSort);
}

function getMergedRecordById(recordId) {
  return getAllMergedRecords().find((record) => record.id === recordId) || null;
}

function buildMergedRecord(entry) {
  if (!entry) {
    return null;
  }

  const progress = vocabLab.state.progressMap.get(entry.id) || null;
  const report = normalizeAnalysisPayload(entry.lastAnalysis || {}, entry.surfaceWord || entry.normalizedWord || "", entry.lastContextNote || "");
  const deletedAt = entry.deletedAt || progress?.deletedAt || null;
  const displayWord = entry.surfaceWord || entry.normalizedWord || report.writing;
  const masteryScore = progress ? Number(progress.masteryScore || 0) : 0;
  const weakPoints = Array.isArray(progress?.weakPoints) && progress.weakPoints.length
    ? progress.weakPoints
    : report.weakPoints;

  return {
    id: entry.id,
    entry,
    progress,
    report,
    deletedAt,
    displayWord,
    reading: entry.reading || report.reading || "需要确认",
    partOfSpeech: entry.partOfSpeech || report.partOfSpeech || "需要确认",
    registerLabel: entry.registerLabel || report.registerLabel || "需要确认",
    coreMeaningCn: entry.coreMeaningCn || report.coreMeaningCn || "需要结合语境确认",
    masteryScore,
    isFavorite: Boolean(progress?.isFavorite ?? entry.isFavorite),
    lookupCount: Number(entry.lookupCount || 0),
    lastQueriedAt: Number(entry.lastQueriedAt || 0),
    lastStudiedAt: Number(progress?.lastStudiedAt || 0),
    nextReviewAt: Number(progress?.nextReviewAt || 0),
    weakPointSummary: weakPoints.filter(Boolean).slice(0, 2).join(" / "),
    statusLabel: buildStatusLabel(progress, deletedAt)
  };
}

function buildStatusLabel(progress, deletedAt) {
  if (deletedAt) {
    return "已放入回收站";
  }

  if (!progress) {
    return "仅查询记录";
  }

  switch (progress.status) {
    case "learning":
      return "学习中";
    case "reviewing":
      return "待复习";
    case "mastered":
      return "已掌握";
    case "paused":
      return "已暂停";
    default:
      return "学习中";
  }
}

function applySearch(records, keyword) {
  const term = String(keyword || "").trim().toLowerCase();
  if (!term) {
    return records;
  }

  return records.filter((record) => {
    const text = [
      record.displayWord,
      record.reading,
      record.partOfSpeech,
      record.coreMeaningCn,
      record.weakPointSummary
    ].join(" ").toLowerCase();

    return text.includes(term);
  });
}

function applyFilter(records, filter) {
  switch (filter) {
    case "due":
      return records.filter((record) => !record.deletedAt && isDueRecord(record));
    case "learning":
      return records.filter((record) => !record.deletedAt && isLearningRecord(record));
    case "mastered":
      return records.filter((record) => !record.deletedAt && record.progress?.status === "mastered");
    case "favorite":
      return records.filter((record) => !record.deletedAt && record.isFavorite);
    case "queries":
      return records.filter((record) => !record.deletedAt && !record.progress);
    case "trash":
      return records.filter((record) => Boolean(record.deletedAt));
    case "all":
    default:
      return records.filter((record) => !record.deletedAt);
  }
}

function applySort(records, sortKey) {
  const cloned = [...records];
  cloned.sort((left, right) => compareRecords(left, right, sortKey));
  return cloned;
}

function compareRecords(left, right, sortKey) {
  if (sortKey === "recentStudy") {
    return Number(right.lastStudiedAt || right.lastQueriedAt || 0) - Number(left.lastStudiedAt || left.lastQueriedAt || 0);
  }

  if (sortKey === "masteryLow") {
    return Number(left.masteryScore || 0) - Number(right.masteryScore || 0);
  }

  if (sortKey === "lookupCount") {
    return Number(right.lookupCount || 0) - Number(left.lookupCount || 0);
  }

  if (sortKey === "recentLookup") {
    return Number(right.lastQueriedAt || 0) - Number(left.lastQueriedAt || 0);
  }

  const leftReview = normalizeReviewTime(left);
  const rightReview = normalizeReviewTime(right);
  return leftReview - rightReview;
}

function normalizeReviewTime(record) {
  if (!record.progress || !record.nextReviewAt) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number(record.nextReviewAt);
}

function isLearningRecord(record) {
  if (!record.progress) {
    return false;
  }
  return ["learning", "reviewing", "paused"].includes(record.progress.status);
}

function isDueRecord(record) {
  if (!record.progress) {
    return false;
  }

  const status = record.progress.status;
  if (!["learning", "reviewing"].includes(status)) {
    return false;
  }

  return Number(record.nextReviewAt || 0) <= Date.now();
}

function buildReviewLabel(record) {
  if (record.deletedAt) {
    return "已在回收站";
  }

  if (!record.progress) {
    return `最近查询 ${formatDate(record.lastQueriedAt)}`;
  }

  if (record.progress.status === "mastered") {
    return "已停止自动复习";
  }

  if (record.progress.status === "paused") {
    return "复习已暂停";
  }

  if (!record.nextReviewAt) {
    return "等待安排复习";
  }

  if (record.nextReviewAt <= Date.now()) {
    return "今天待复习";
  }

  return `${formatDate(record.nextReviewAt)} 复习`;
}

function buildRecordCardActions(record) {
  if (record.deletedAt) {
    return `
      <button class="secondary-btn" type="button" data-record-action="restore" data-record-id="${record.id}">恢复</button>
      <button class="danger-btn" type="button" data-record-action="permanent-delete" data-record-id="${record.id}">永久删除</button>
    `;
  }

  if (!record.progress) {
    return `
      <button class="primary-btn" type="button" data-record-action="add-learning" data-record-id="${record.id}">加入学习</button>
      <button class="secondary-btn" type="button" data-record-open="${record.id}">查看详情</button>
      <button class="ghost-btn" type="button" data-record-action="soft-delete" data-record-id="${record.id}">删除</button>
    `;
  }

  return `
    <button class="primary-btn" type="button" data-record-action="review" data-record-id="${record.id}">${record.progress.status === "mastered" ? "再复习一次" : "继续复习"}</button>
    <button class="secondary-btn" type="button" data-record-open="${record.id}">查看详情</button>
    <button class="ghost-btn" type="button" data-record-action="favorite" data-record-id="${record.id}">${record.isFavorite ? "取消收藏" : "收藏"}</button>
  `;
}

function normalizeAnalysisPayload(rawReport, fallbackWord, contextNote) {
  const report = rawReport && typeof rawReport === "object" ? rawReport : {};
  const meanings = normalizeTitledItems(report.meanings);
  const usageNotes = normalizeLabelValueItems(report.usageNotes);
  const nuanceNotes = normalizeLabelValueItems(report.nuanceNotes);
  const examples = normalizeExamples(report.examples);
  const collocations = uniqueStrings(Array.isArray(report.collocations) ? report.collocations : []);
  const weakPoints = uniqueStrings(Array.isArray(report.weakPoints) ? report.weakPoints : []);

  return {
    writing: String(report.writing || fallbackWord || "未输入").trim(),
    reading: String(report.reading || "需要确认").trim(),
    romaji: String(report.romaji || "").trim(),
    partOfSpeech: String(report.partOfSpeech || "需要确认").trim(),
    frequencyLabel: String(report.frequencyLabel || "需要确认").trim(),
    registerLabel: String(report.registerLabel || "需要确认").trim(),
    coreMeaningCn: String(report.coreMeaningCn || meanings[0]?.body || "需要结合语境进一步确认").trim(),
    meanings: meanings.length ? meanings : [{ title: "最常见含义", body: "需要结合语境进一步确认。" }],
    usageNotes: usageNotes.length ? usageNotes : [
      { label: "是否常用", value: "需要确认" },
      { label: "使用场景", value: "请结合真实句子进一步判断。" },
      { label: "搭配或固定表达", value: collocations.join(" / ") || "建议先通过例句观察。" }
    ],
    collocations,
    examples: examples.length ? examples : [{
      ja: "例句暂未成功生成，建议重新查询一次。",
      zh: "这次还没有拿到可直接学习的例句。",
      note: "通常是因为模型返回内容不完整，可以稍后重试。"
    }],
    nuanceNotes: nuanceNotes.length ? nuanceNotes : [
      { label: "与相似词的区别", value: "需要结合近义词重新确认。" },
      { label: "常见错误用法", value: "请避免在没有确认语感前直接套用。" },
      { label: "使用时需要注意", value: "先看例句，再决定是否主动使用。" }
    ],
    weakPoints,
    learningTip: String(report.learningTip || "先记住这个词最自然的一句例句，再回看它与近义词的区别。").trim(),
    teacherNote: String(report.teacherNote || report.nextStepSuggestion || "本次结果由 DeepSeek 生成，并按学习者阅读方式重新整理。").trim(),
    contextNote: String(contextNote || report.contextNote || "").trim()
  };
}

function normalizeTitledItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      title: String(item?.title || "").trim(),
      body: String(item?.body || "").trim()
    }))
    .filter((item) => item.title && item.body);
}

function normalizeLabelValueItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      label: String(item?.label || "").trim(),
      value: String(item?.value || "").trim()
    }))
    .filter((item) => item.label && item.value);
}

function normalizeExamples(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      ja: String(item?.ja || "").trim(),
      zh: String(item?.zh || "").trim(),
      note: String(item?.note || "").trim()
    }))
    .filter((item) => item.ja && item.zh);
}

function buildArrayBlock(title, items) {
  return `
    <section class="detail-section">
      <div class="detail-section-title">${escapeHtml(title)}</div>
      <div class="detail-list">
        ${items.map((item) => `
          <div class="detail-list-item">
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.body)}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function buildLabelValueBlock(title, items) {
  return `
    <section class="detail-section">
      <div class="detail-section-title">${escapeHtml(title)}</div>
      <div class="detail-list">
        ${items.map((item) => `
          <div class="detail-list-item">
            <strong>${escapeHtml(item.label)}</strong>
            <p>${escapeHtml(item.value)}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function buildExampleBlock(items) {
  return `
    <section class="detail-section">
      <div class="detail-section-title">4. 例句</div>
      <div class="example-grid">
        ${items.map((item, index) => `
          <article class="example-card">
            <strong>例句 ${index + 1}</strong>
            <p class="example-ja">${escapeHtml(item.ja)}</p>
            <p class="example-zh">中文：${escapeHtml(item.zh)}</p>
            <p class="example-note">说明：${escapeHtml(item.note)}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function buildNoteBlock(title, pairs) {
  return `
    <section class="detail-section">
      <div class="detail-section-title">${escapeHtml(title)}</div>
      <div class="info-grid">
        ${pairs.map(([label, value]) => `
          <div class="info-card">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(value)}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function buildListTextBlock(title, mainText, extraItems) {
  const extras = Array.isArray(extraItems) ? extraItems.filter(Boolean) : [];
  return `
    <section class="detail-section">
      <div class="detail-section-title">${escapeHtml(title)}</div>
      <div class="detail-text-card">
        <p>${escapeHtml(mainText)}</p>
        ${extras.length ? `<div class="chip-row">${extras.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      </div>
    </section>
  `;
}

function buildStatCard(title, value, note) {
  return `
    <article class="stat-card">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(String(value))}</span>
      <p>${escapeHtml(note)}</p>
    </article>
  `;
}

function calculateNextReview(score) {
  if (score < 40) {
    return addDaysToNow(1);
  }
  if (score < 70) {
    return addDaysToNow(3);
  }
  return addDaysToNow(7);
}

function addDaysToNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function normalizeLookupWord(value) {
  const input = String(value || "").trim().replace(/\s+/g, " ");
  if (!input) {
    return "";
  }

  if (window.wanakana && /[A-Za-z]/.test(input)) {
    return window.wanakana.toKana(input);
  }

  return input;
}

function toRecordId(word) {
  return encodeURIComponent(word);
}

function uniqueStrings(items) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function formatDate(value) {
  if (!value) {
    return "未记录";
  }

  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    return "未记录";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(value) {
  if (!value) {
    return "未记录";
  }

  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    return "未记录";
  }

  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const EVENT_LABELS = {
  lookup: "查询词汇",
  restored: "恢复记录",
  removed: "移入回收站",
  review_complete: "完成一次复习",
  marked_mastered: "标记已掌握",
  paused: "暂停学习",
  added_to_learning: "加入学习",
  favorited: "加入收藏",
  unfavorited: "取消收藏"
};
