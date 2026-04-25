import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let books = [];

export function initReadingModule() {
  const root = document.getElementById("reading-app");

  root.innerHTML = `
    <input id="bookInput" placeholder="输入书名">
    <button id="addBtn">添加</button>
    <ul id="list"></ul>
  `;

  document.getElementById("addBtn").addEventListener("click", addBook);
}

function addBook() {
  const input = document.getElementById("bookInput");
  const text = input.value.trim();

  if (!text) return;

  books.push({ text, done: false });
  input.value = "";

  render();
}

function render() {
  const list = document.getElementById("list");
  list.innerHTML = "";

  books.forEach((book, index) => {
    const li = document.createElement("li");

    li.innerHTML = `
      <span style="${book.done ? 'text-decoration: line-through;' : ''}">
        ${book.text}
      </span>
      <button onclick="toggle(${index})">完成</button>
      <button onclick="remove(${index})">删除</button>
    `;

    list.appendChild(li);
  });
}

// 挂到全局（简单写法）
window.toggle = function(index) {
  books[index].done = !books[index].done;
  render();
};

window.remove = function(index) {
  books.splice(index, 1);
  render();
};