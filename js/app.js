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

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const REPEAT_LABELS = {
  none: "不重复",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  yearly: "每年"
};

const menuButtons = document.querySelectorAll(".menu-btn");
const pages = document.querySelectorAll(".page");

const bookInput = document.getElementById("bookInput");
const addBtn = document.getElementById("addBtn");
const bookList = document.getElementById("bookList");

const calendarGrid = document.getElementById("calendarGrid");
const weekdayRow = document.getElementById("weekdayRow");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
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
const calendarEventsQuery = query(calendarEventsRef, orderBy("date", "asc"), orderBy("startTime", "asc"));

let calendarEvents = [];
let currentMonth = startOfMonth(new Date());

initNavigation();
initReadingList();
initCalendar();

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
      console.error("读取阅读清单失败:", error);
      bookList.innerHTML = '<li class="empty-text">读取失败，请检查 Firebase 配置和数据库规则。</li>';
    }
  );
}

async function addBook() {
  const title = bookInput.value.trim();

  if (!title) {
    alert("请输入书名。");
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
    console.error("添加书籍失败:", error);
    alert("添加失败，请检查 Firebase 配置。");
  }
}

function renderBooks(docs) {
  bookList.innerHTML = "";

  if (!docs.length) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "empty-text";
    emptyLi.textContent = "还没有添加书籍。";
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
        console.error("更新书籍状态失败:", error);
        alert("更新失败。");
      }
    });

    const notePreview = document.createElement("div");
    notePreview.className = "book-note-preview";
    notePreview.textContent = book.note || "还没有备注";

    headerDiv.appendChild(titleDiv);
    headerDiv.appendChild(notePreview);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "book-actions";

    const noteBtn = document.createElement("button");
    noteBtn.className = "action-btn note-btn";
    noteBtn.textContent = "备注";
    noteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openNoteEditor(li, bookId, book.note || "");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-btn delete-btn";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", async () => {
      try {
        await deleteDoc(doc(db, "books", bookId));
      } catch (error) {
        console.error("删除书籍失败:", error);
        alert("删除失败。");
      }
    });

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
  textarea.placeholder = "在这里输入备注...";
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
      console.error("保存备注失败:", error);
      alert("保存备注失败。");
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
      renderCalendar();
    },
    (error) => {
      console.error("读取日历失败:", error);
      calendarGrid.innerHTML = '<div class="empty-text">日历读取失败，请检查 Firebase 索引与权限。</div>';
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
  calendarMonthLabel.textContent = `${currentMonth.getFullYear()} 年 ${currentMonth.getMonth() + 1} 月`;
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

  header.appendChild(dayNumber);
  header.appendChild(addButton);

  const eventsContainer = document.createElement("div");
  eventsContainer.className = "day-events";

  const dayEvents = getEventsForDate(dateKey);

  if (!dayEvents.length) {
    const emptyState = document.createElement("span");
    emptyState.className = "empty-text";
    emptyState.textContent = "暂无事项";
    eventsContainer.appendChild(emptyState);
  } else {
    dayEvents.forEach((eventItem) => {
      const pill = document.createElement("button");
      pill.className = "event-pill";
      pill.type = "button";
      pill.innerHTML = `
        <strong>${escapeHtml(eventItem.title)}</strong>
        <span>${escapeHtml(formatTimeRange(eventItem))}</span>
      `;

      pill.addEventListener("click", () => openEventModal(eventItem));
      eventsContainer.appendChild(pill);
    });
  }

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
  return `${first.startTime || ""}${first.title}`.localeCompare(`${second.startTime || ""}${second.title}`, "zh-CN");
}

function occursOnDate(eventItem, dateKey) {
  if (!eventItem.date || eventItem.date > dateKey) {
    return false;
  }

  if (eventItem.date === dateKey) {
    return true;
  }

  switch (eventItem.repeat) {
    case "daily":
      return true;
    case "weekly":
      return new Date(eventItem.date).getDay() === new Date(dateKey).getDay();
    case "monthly":
      return new Date(eventItem.date).getDate() === new Date(dateKey).getDate();
    case "yearly": {
      const original = new Date(eventItem.date);
      const target = new Date(dateKey);
      return original.getMonth() === target.getMonth() && original.getDate() === target.getDate();
    }
    default:
      return false;
  }
}

function openEventModal(eventData = {}) {
  const isEditing = Boolean(eventData.id);

  modalTitle.textContent = isEditing ? "编辑事项" : "新增事项";
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
    startTime: eventStartTimeInput.value,
    endTime: eventEndTimeInput.value,
    note: eventNoteInput.value.trim(),
    repeat: eventRepeatInput.value || "none",
    updatedAt: Date.now()
  };

  if (!payload.title || !payload.date) {
    alert("请至少填写标题和日期。");
    return;
  }

  if (payload.startTime && payload.endTime && payload.endTime <= payload.startTime) {
    alert("结束时间需要晚于开始时间。");
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

    if (payload.date) {
      currentMonth = startOfMonth(new Date(payload.date));
    }

    closeEventModal();
  } catch (error) {
    console.error("保存事项失败:", error);
    alert("保存失败，请检查 Firebase 配置和数据库规则。");
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
    console.error("删除事项失败:", error);
    alert("删除失败。");
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
    alert("当前已为你导出 .ics 文件。部署 Firebase Functions 后，再把订阅地址填到 js/firebase.js 里的 APPLE_CALENDAR_FEED_URL，就能一键订阅到苹果日历。");
    return;
  }

  const subscribeUrl = buildWebcalUrl(APPLE_CALENDAR_FEED_URL);

  try {
    await navigator.clipboard.writeText(subscribeUrl);
  } catch (error) {
    console.warn("复制订阅地址失败:", error);
  }

  window.open(subscribeUrl, "_blank");
}

function refreshAppleSubscribeState() {
  if (!APPLE_CALENDAR_FEED_URL) {
    appleSyncHint.textContent = "目前已支持导出 .ics 文件。把 Firebase Functions 的公开订阅地址填进配置后，这里会直接一键唤起 Apple 日历订阅。";
    return;
  }

  appleSyncHint.textContent = `Apple 订阅地址已就绪：${APPLE_CALENDAR_FEED_URL}`;
}

function buildCalendarIcs(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//My Site Calendar//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:我的实时日历"
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

    lines.push(`SUMMARY:${escapeIcsText(eventItem.title)}`);

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
  const date = new Date(dateString);
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
    : "全天";

  if (eventItem.repeat && eventItem.repeat !== "none") {
    return `${timeLabel} · ${REPEAT_LABELS[eventItem.repeat] || "重复"}`;
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
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}

function addHour(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes, 0);
  date.setHours(date.getHours() + 1);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
