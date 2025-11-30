// =======================
// firebase-init.js
// =======================

// Firebase imports
console.log("🔥 firebase-init.js LOADED");
window.firebaseInitTest = "YES";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";


// ---------------------------
// YOUR CONFIG
// ---------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDWCG-VBZEkRj7G9zMO8lHXucEYicBD1d8",
  authDomain: "money-management-700df.firebaseapp.com",
  projectId: "money-management-700df",
  storageBucket: "money-management-700df.firebasestorage.app",
  messagingSenderId: "672203393892",
  appId: "1:672203393892:web:bdd948e2f96c00b5420871",
  measurementId: "G-SFNGL2PG5L"
};


// ---------------------------
// INITIALIZE
// ---------------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Make globals for dashboard.js
window._auth = auth;
window._db = db;
window._uid = null;
window.userData = {}; // will fill after Firestore loads



// ======================================================
// LOGIN HELPERS (used in login.js)
// ======================================================
window.googleLogin = async function () {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

window.emailLogin = async function (email, pass) {
  return signInWithEmailAndPassword(auth, email, pass);
};

window.emailSignup = async function (email, pass) {
  return createUserWithEmailAndPassword(auth, email, pass);
};




// ======================================================
// LOAD USER DOCUMENT
// ======================================================
async function loadUserDoc(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  // 🆕 FIRST TIME USER → create default document
  if (!snap.exists()) {
    const newUser = {
      name: "User",
      phone: "",
      email: "",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
      transactions: [],
      fixedExpenses: [],
      goals: [],
      loans: [],
      chatGroups: {},
      groupMembers: {},
      monthlyLimit: 0,
      createdAt: Date.now()
    };

    await setDoc(ref, newUser);
    console.log("✅ Created new user document in Firestore");
    return newUser;
  }

  return snap.data();
}




// ======================================================
// SAVE USER DATA (called by dashboard.js → saveState())
// ======================================================
window.syncUserData = async (data) => {
    if (!window._uid) {
        console.warn("❌ UID not loaded yet, retrying in 300ms...");
        setTimeout(() => window.syncUserData(data), 300);
        return;
    }

    // Use window.userData if data is not provided
    const dataToSave = data || window.userData || {};
    
    const userRef = doc(db, "users", window._uid);
    await setDoc(userRef, dataToSave, { merge: true });
    console.log("✅ Firestore saved:", dataToSave);
};




// ======================================================
// AUTH STATE LISTENER
// ======================================================
onAuthStateChanged(auth, async (user) => {
  const currentPath = window.location.pathname;

  // ---------------------
  // USER LOGGED OUT
  // ---------------------
  if (!user) {
    if (!currentPath.includes("login-page")) {
      window.location.href = "../login-page/login.html";
    }
    return;
  }


  // ---------------------
  // USER LOGGED IN
  // ---------------------
  window._uid = user.uid;

  // load Firestore data
  const data = await loadUserDoc(user.uid);
  window.userData = data;

  // tell dashboard.js that Firestore is ready
  window.dispatchEvent(new Event("firestore-ready"));

  // if currently on login page → redirect to dashboard
  if (currentPath.includes("login-page")) {
    window.location.href = "../dashboard/dashboard.html";
  }
});




// ======================================================
// LOGOUT
window.logout = async function () {
  await signOut(auth);
  window.location.href = "../login-page/login.html";
};


