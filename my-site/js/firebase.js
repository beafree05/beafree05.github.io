import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAs1iWrVR1E4IRcIPvkGrS61NmNRR3oS_0",
  authDomain: "reading-list-for-sairyushi.firebaseapp.com",
  projectId: "reading-list-for-sairyushi",
  storageBucket: "reading-list-for-sairyushi.firebasestorage.app",
  messagingSenderId: "115198998780",
  appId: "1:115198998780:web:f20f230757aa2b570cbf79"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);