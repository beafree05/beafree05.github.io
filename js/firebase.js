// Firebase 初始化（浏览器版本）

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 你的配置（不用改）
const firebaseConfig = {
  apiKey: "AIzaSyCSmV7ziEee3P5Al1re2BLA-TT0mBwSUaE",
  authDomain: "sairyushi-readinglist.firebaseapp.com",
  projectId: "sairyushi-readinglist",
  storageBucket: "sairyushi-readinglist.firebasestorage.app",
  messagingSenderId: "543286777246",
  appId: "1:543286777246:web:3190768ab7a0cbfb7c728f",
  measurementId: "G-WYGE8B1976"
};

// 初始化
const app = initializeApp(firebaseConfig);

// Firestore 数据库
export const db = getFirestore(app);