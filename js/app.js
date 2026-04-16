import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
// 阅读清单 Firebase 同步
// ======================
const bookInput = document.getElementById("bookInput");
const addBtn = document.getElementById("addBtn");
const bookList = document.getElementById("bookList");

const booksRef = collection(db, "books");
const booksQuery = query(booksRef, orderBy("createdAt", "desc"));

if (bookInput && addBtn && bookList) {
  addBtn.addEventListener("click", addBook);

  bookInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      addBook();
    }
  });

  listenBooks();
}

// 添加书名
async function addBook() {
  const title = bookInput.value.trim();

  if (!title) {
    alert("请输入书名");
    return;
  }

  try {
    await addDoc(booksRef, {
      title: title,
      note: "",
      completed: false,
      createdAt: Date.now()
    });

    bookInput.value = "";
    bookInput.focus();
  } catch (error) {
    console.error("添加书籍失败：", error);
    alert("添加失败，请检查 Firebase Rules 或控制台报错。");
  }
}

// 实时监听数据库
function listenBooks() {
  onSnapshot(
    booksQuery,
    (snapshot) => {
      renderBooks(snapshot.docs);
    },
    (error) => {
      console.error("读取数据库失败：", error);
      bookList.innerHTML = `
        <li class="empty-text">读取失败，请检查 Firebase Rules 或索引设置。</li>
      `;
    }
  );
}

// 渲染书单
function renderBooks(docs) {
  bookList.innerHTML = "";

  if (!docs.length) {
    renderEmptyState();
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

    // 顶部：书名 + 备注预览
    const headerDiv = document.createElement("div");
    headerDiv.className = "book-header";

    const titleDiv = document.createElement("div");
    titleDiv.className = "book-title";
    titleDiv.textContent = book.title;
    titleDiv.title = "点击书名可切换划线状态";

    titleDiv.addEventListener("click", async () => {
      try {
        await updateDoc(doc(db, "books", bookId), {
          completed: !book.completed
        });
      } catch (error) {
        console.error("切换完成状态失败：", error);
        alert("更新失败。");
      }
    });

    const notePreview = document.createElement("div");
    notePreview.className = "book-note-preview";
    notePreview.textContent = book.note || "";

    headerDiv.appendChild(titleDiv);
    headerDiv.appendChild(notePreview);

    // 按钮区
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "book-actions";

    const noteBtn = document.createElement("button");
    noteBtn.className = "action-btn note-btn";
    noteBtn.textContent = "备注";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-btn delete-btn";
    deleteBtn.textContent = "删除";

    noteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openNoteEditor(li, notePreview, bookId, book.note || "");
    });

    deleteBtn.addEventListener("click", async () => {
      try {
        await deleteDoc(doc(db, "books", bookId));
      } catch (error) {
        console.error("删除失败：", error);
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

// 打开备注编辑框
function openNoteEditor(bookItem, notePreview, bookId, oldNote) {
  closeAllEditors();

  const existingEditor = bookItem.querySelector(".book-note-editor");
  if (existingEditor) {
    return;
  }

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

    const newNote = textarea.value;

    try {
      await updateDoc(doc(db, "books", bookId), {
        note: newNote
      });
    } catch (error) {
      console.error("保存备注失败：", error);
      alert("保存备注失败。");
    }

    if (editorDiv.parentNode) {
      editorDiv.remove();
    }

    document.removeEventListener("mousedown", saveAndClose);
  }

  setTimeout(() => {
    document.addEventListener("mousedown", saveAndClose);
  }, 0);
}

// 关闭其他正在编辑的备注框
function closeAllEditors() {
  const editors = document.querySelectorAll(".book-note-editor");
  editors.forEach((editor) => editor.remove());
}

// 空状态
function renderEmptyState() {
  const emptyLi = document.createElement("li");
  emptyLi.className = "empty-text";
  emptyLi.textContent = "还没有添加书籍。";
  bookList.appendChild(emptyLi);
}