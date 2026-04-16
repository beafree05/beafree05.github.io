// ======================
// 左侧菜单切换功能
// ======================
const menuButtons = document.querySelectorAll(".menu-btn");
const pages = document.querySelectorAll(".page");

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

// ======================
// 阅读清单功能
// ======================
const bookInput = document.getElementById("bookInput");
const addBtn = document.getElementById("addBtn");
const bookList = document.getElementById("bookList");

if (bookInput && addBtn && bookList) {
  addBtn.addEventListener("click", addBook);

  bookInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      addBook();
    }
  });
}

function addBook() {
  const title = bookInput.value.trim();

  if (!title) {
    alert("请输入书名");
    return;
  }

  removeEmptyState();

  const li = document.createElement("li");
  li.className = "book-item";

  li.dataset.note = "";
  li.dataset.editing = "false";

  const headerDiv = document.createElement("div");
  headerDiv.className = "book-header";

  const titleDiv = document.createElement("div");
  titleDiv.className = "book-title";
  titleDiv.textContent = title;
  titleDiv.title = "点击书名可切换划线状态";

  titleDiv.addEventListener("click", function () {
    li.classList.toggle("completed");
  });

  const notePreview = document.createElement("div");
  notePreview.className = "book-note-preview";
  notePreview.textContent = "";

  headerDiv.appendChild(titleDiv);
  headerDiv.appendChild(notePreview);

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "book-actions";

  const noteBtn = document.createElement("button");
  noteBtn.className = "action-btn note-btn";
  noteBtn.textContent = "备注";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "action-btn delete-btn";
  deleteBtn.textContent = "删除";

  noteBtn.addEventListener("click", function (e) {
    e.stopPropagation();

    const isEditing = li.dataset.editing === "true";
    if (!isEditing) {
      openNoteEditor(li, notePreview);
    }
  });

  deleteBtn.addEventListener("click", function () {
    li.remove();

    if (bookList.children.length === 0) {
      renderEmptyState();
    }
  });

  actionsDiv.appendChild(noteBtn);
  actionsDiv.appendChild(deleteBtn);

  li.appendChild(headerDiv);
  li.appendChild(actionsDiv);

  bookList.appendChild(li);

  bookInput.value = "";
  bookInput.focus();
}

function openNoteEditor(bookItem, notePreview) {
  closeAllEditors();

  bookItem.dataset.editing = "true";

  const editorDiv = document.createElement("div");
  editorDiv.className = "book-note-editor";

  const textarea = document.createElement("textarea");
  textarea.className = "book-note-input";
  textarea.placeholder = "在这里输入备注...";
  textarea.value = bookItem.dataset.note || "";

  editorDiv.appendChild(textarea);
  bookItem.appendChild(editorDiv);

  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, 0);

  function saveAndClose(event) {
    if (editorDiv.contains(event.target)) {
      return;
    }

    const savedText = textarea.value.trim();
    bookItem.dataset.note = savedText;
    notePreview.textContent = savedText;

    editorDiv.remove();
    bookItem.dataset.editing = "false";

    document.removeEventListener("mousedown", saveAndClose);
  }

  setTimeout(() => {
    document.addEventListener("mousedown", saveAndClose);
  }, 0);
}

function closeAllEditors() {
  const editingItems = document.querySelectorAll('.book-item[data-editing="true"]');

  editingItems.forEach((item) => {
    const editor = item.querySelector(".book-note-editor");
    const textarea = item.querySelector(".book-note-input");
    const preview = item.querySelector(".book-note-preview");

    if (editor && textarea && preview) {
      const savedText = textarea.value.trim();
      item.dataset.note = savedText;
      preview.textContent = savedText;
      editor.remove();
      item.dataset.editing = "false";
    }
  });
}

function renderEmptyState() {
  if (document.getElementById("emptyText")) return;

  const emptyLi = document.createElement("li");
  emptyLi.id = "emptyText";
  emptyLi.className = "empty-text";
  emptyLi.textContent = "还没有添加书籍。";
  bookList.appendChild(emptyLi);
}

function removeEmptyState() {
  const emptyText = document.getElementById("emptyText");
  if (emptyText) {
    emptyText.remove();
  }
}

if (bookList) {
  renderEmptyState();
}