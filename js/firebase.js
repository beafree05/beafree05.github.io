import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSmV7ziEee3P5Al1re2BLA-TT0mBwSUaE",
  authDomain: "sairyushi-readinglist.firebaseapp.com",
  projectId: "sairyushi-readinglist",
  storageBucket: "sairyushi-readinglist.firebasestorage.app",
  messagingSenderId: "543286777246",
  appId: "1:543286777246:web:3190768ab7a0cbfb7c728f",
  measurementId: "G-WYGE8B1976"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const APPLE_CALENDAR_FEED_URL = "";
export const VOCAB_ANALYZE_URL = "https://asia-northeast1-sairyushi-readinglist.cloudfunctions.net/vocabAnalyze";
export const LOCAL_VOCAB_ANALYZE_URL = "http://127.0.0.1:4173/api/vocab-analyze";
export const PERSONA_CHAT_URL = "https://asia-northeast1-sairyushi-readinglist.cloudfunctions.net/personaChat";
export const LOCAL_PERSONA_CHAT_URL = "http://127.0.0.1:4173/api/persona-chat";
