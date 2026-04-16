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

initNavigation();
initReadingList();
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
