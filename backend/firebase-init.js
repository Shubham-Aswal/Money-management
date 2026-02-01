// ========================================================================
// FILE PURPOSE: Firebase Setup and User Authentication Manager
// ========================================================================
// This file connects our app to Firebase, which is Google's cloud service.
// Think of Firebase as a remote computer in the cloud that:
// 1. Stores all user data (transactions, budgets, goals, etc.)
// 2. Handles user login and signup (authentication)
// 3. Remembers who is logged in
//
// WHAT HAPPENS IN THIS FILE:
// - We connect to Firebase using our app's unique ID
// - We set up functions for logging in and signing up
// - We automatically save user data to the cloud
// - We redirect users to the right page (login vs dashboard)
// ========================================================================

// ========================================================================
// IMPORTS: Getting Firebase Tools
// ========================================================================
// These lines bring in special tools from Firebase that we need.
// It's like importing ingredients before cooking - we need them nearby!
// ========================================================================

console.log("🔥 firebase-init.js LOADED");  // This appears in browser console to confirm file loaded
window.firebaseInitTest = "YES";             // Sets a marker to check if this file ran successfully

// ========================================================================
// IMPORT: Firebase Core App
// ========================================================================
// This is the main Firebase toolkit - we need this first before anything else
// ========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";

// ========================================================================
// IMPORT: Authentication Tools
// ========================================================================
// These tools handle everything related to user login and signup:
// - getAuth: Sets up the authentication system
// - onAuthStateChanged: Watches for login/logout events
// - GoogleAuthProvider: Enables "Login with Google" button
// - signInWithPopup: Opens Google login popup window
// - signOut: Logs the user out
// - signInWithEmailAndPassword: Logs in with email and password
// - createUserWithEmailAndPassword: Creates new account with email and password
// ========================================================================
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ========================================================================
// IMPORT: Database (Firestore) Tools
// ========================================================================
// These tools handle storing and retrieving data from the cloud database:
// - getFirestore: Sets up the database connection
// - doc: Creates a reference to a specific document (like pointing to a file)
// - getDoc: Reads data from a document
// - setDoc: Writes data to a document
// ========================================================================
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";


// ========================================================================
// CONFIGURATION: Our App's Unique Firebase ID
// ========================================================================
// This is like our app's address and password to connect to Firebase.
// Each Firebase project has unique values for these fields.
// 
// WHAT EACH FIELD MEANS:
// - apiKey: Secret password to access Firebase services
// - authDomain: Web address for login page
// - projectId: Unique name for our project
// - storageBucket: Where files/images would be stored
// - messagingSenderId: For notifications (not used yet)
// - appId: Unique ID for this specific app
// - measurementId: For tracking app usage stats (analytics)
// ========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDWCG-VBZEkRj7G9zMO8lHXucEYicBD1d8",
  authDomain: "money-management-700df.firebaseapp.com",
  projectId: "money-management-700df",
  storageBucket: "money-management-700df.firebasestorage.app",
  messagingSenderId: "672203393892",
  appId: "1:672203393892:web:bdd948e2f96c00b5420871",
  measurementId: "G-SFNGL2PG5L"
};


// ========================================================================
// INITIALIZATION: Starting Firebase Services
// ========================================================================
// Now that we have the configuration, we need to actually connect to Firebase
// and start up the services we need (auth and database).
// ========================================================================

// Connect to Firebase using our configuration
// This is like dialing into our specific Firebase account
const app = initializeApp(firebaseConfig);

// Set up the authentication service
// This handles all login/signup/logout functionality
const auth = getAuth(app);

// Set up the database (Firestore) service
// This is where all user data gets stored (transactions, budgets, etc.)
const db = getFirestore(app);

// ========================================================================
// GLOBAL VARIABLES: Making Firebase Available Everywhere
// ========================================================================
// We attach these to "window" so other files (like dashboard.js) can use them
// Think of "window" as a shared bulletin board where all files can post notes
// ========================================================================
window._auth = auth;          // The authentication service
window._db = db;              // The database service
window._uid = null;           // User ID (will be set when someone logs in)
window.userData = {};         // All the user's data (will be filled from database)



// ========================================================================
// HELPER FUNCTION: Google Login
// ========================================================================
// This function is called when user clicks "Continue with Google" button.
// It opens a popup window where they can log in with their Google account.
// 
// HOW IT WORKS:
// 1. Creates a Google login provider
// 2. Opens a popup for user to select their Google account
// 3. Returns the result (success or error)
// ========================================================================
window.googleLogin = async function () {
  const provider = new GoogleAuthProvider();  // Create Google login tool
  return signInWithPopup(auth, provider);     // Show Google login popup
};

// ========================================================================
// HELPER FUNCTION: Email/Password Login
// ========================================================================
// This function is called when user submits the login form with email and password.
// 
// PARAMETERS:
// - email: The user's email address (e.g., "user@example.com")
// - pass: The user's password
// 
// RETURNS: A promise that resolves if login succeeds, or rejects if it fails
// ========================================================================
window.emailLogin = async function (email, pass) {
  return signInWithEmailAndPassword(auth, email, pass);
};

// ========================================================================
// HELPER FUNCTION: Email/Password Signup
// ========================================================================
// This function is called when user submits the signup form to create a new account.
// 
// PARAMETERS:
// - email: The email they want to use for their new account
// - pass: The password they want to set
// 
// RETURNS: A promise that resolves if account creation succeeds
// ========================================================================
window.emailSignup = async function (email, pass) {
  return createUserWithEmailAndPassword(auth, email, pass);
};




// ========================================================================
// FUNCTION: loadUserDoc()
// ========================================================================
// This function loads a user's data from the Firebase database.
// 
// WHAT IS A "USER DOCUMENT"?
// Think of it like a personal folder in the cloud. Each user has one folder
// that contains all their information: name, transactions, budgets, goals, etc.
// 
// WHAT HAPPENS:
// 1. First, we try to open the user's folder
// 2. If the folder exists (returning user), we read their data
// 3. If the folder doesn't exist (new user), we create it with default values
// 
// PARAMETERS:
// - uid: User ID (a unique code that identifies each user)
// 
// RETURNS: An object containing all the user's data
// ========================================================================
async function loadUserDoc(uid) {
  // Create a reference to the user's document in the database
  // It's like getting the address: database -> "users" folder -> user's specific file
  const ref = doc(db, "users", uid);

  // Try to read the document from the database
  const snap = await getDoc(ref);

  // ========================================================================
  // CASE 1: NEW USER (Document doesn't exist yet)
  // ========================================================================
  // If the user just created their account, they won't have a document yet.
  // So we create one with default/empty values.
  // ========================================================================
  if (!snap.exists()) {
    // Create a new user object with default values
    const newUser = {
      name: "User",                           // Default name (they can change it later)
      phone: "",                              // No phone number yet
      email: "",                              // No email stored yet
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=default",  // Default profile picture
      transactions: [],                       // Empty list (no spending history yet)
      fixedExpenses: [],                      // Empty list (no monthly bills set yet)
      goals: [],                              // Empty list (no savings goals yet)
      loans: [],                              // Empty list (no loans tracked yet)
      chatGroups: {},                         // Empty object (no group chats yet)
      groupMembers: {},                       // Empty object (no group members yet)
      monthlyLimit: 0,                        // No budget set yet (₹0)
      createdAt: Date.now()                   // Timestamp of when account was created
    };

    // Save this default data to the database
    await setDoc(ref, newUser);
    console.log("✅ Created new user document in Firestore");

    // Return the default data to use in the app
    return newUser;
  }

  // ========================================================================
  // CASE 2: EXISTING USER (Document exists)
  // ========================================================================
  // The user's folder exists, so just return their data
  // ========================================================================
  return snap.data();
}




// ========================================================================
// FUNCTION: syncUserData()
// ========================================================================
// This function saves user data to the Firebase cloud database.
// It's called whenever something changes (new transaction, updated budget, etc.)
// 
// THINK OF IT LIKE:
// Every time you make a change in the app, this function "uploads" your changes
// to the cloud so they're saved forever. Even if you close the browser, your
// data is safe in the cloud and will be there next time you log in.
// 
// PARAMETERS:
// - data: An object containing all the user's current data to save
// ========================================================================
window.syncUserData = async (data) => {
  // ====================================================================
  // CHECK: Make sure we know who the user is
  // ====================================================================
  // We can't save data if we don't know whose data it is!
  // If _uid is not set yet, we wait a bit and try again
  // ====================================================================
  if (!window._uid) {
    console.warn("❌ UID not loaded yet, retrying in 300ms...");
    // Wait 300 milliseconds (0.3 seconds) and try again
    setTimeout(() => window.syncUserData(data), 300);
    return;  // Exit this attempt and wait for the retry
  }

  // ====================================================================
  // PREPARE: Make sure we have data to save
  // ====================================================================
  // Use the provided data, or fall back to window.userData, or use empty object
  // ====================================================================
  const dataToSave = data || window.userData || {};

  // ====================================================================
  // SAVE: Write the data to the database
  // ====================================================================
  // Get reference to the user's document in the database
  const userRef = doc(db, "users", window._uid);

  // Save the data to the database
  // The "{ merge: true }" means: if the document exists, update it;
  // if it doesn't exist, create it. Don't delete existing fields.
  await setDoc(userRef, dataToSave, { merge: true });

  // Log success message to browser console (for debugging)
  console.log("✅ Firestore saved:", dataToSave);
};




// ========================================================================
// AUTHENTICATION STATE LISTENER
// ========================================================================
// This is one of the MOST IMPORTANT parts of this file!
// 
// WHAT IT DOES:
// This code is ALWAYS watching to see if someone is logged in or logged out.
// Whenever the login status changes, this code automatically runs.
// 
// WHEN DOES IT RUN?
// - When the page first loads (checks if user is already logged in)
// - When user logs in (switches from logged out to logged in)
// - When user logs out (switches from logged in to logged out)
// 
// WHY IS THIS USEFUL?
// We can automatically redirect users to the right page:
// - If logged OUT → send to login page
// - If logged IN → send to dashboard and load their data
// ========================================================================
onAuthStateChanged(auth, async (user) => {
  // Get the current page path (e.g., "/login-page/login.html")
  const currentPath = window.location.pathname;

  // ========================================================================
  // CASE 1: USER IS LOGGED OUT
  // ========================================================================
  // The "user" parameter will be NULL if no one is logged in
  // ========================================================================
  if (!user) {
    // Check if we're currently NOT on the login page
    if (!currentPath.includes("login-page")) {
      // Redirect to login page (they can't access dashboard without logging in)
      window.location.href = "../login-page/login.html";
    }
    return;  // Stop here, nothing else to do for logged out users
  }


  // ========================================================================
  // CASE 2: USER IS LOGGED IN
  // ========================================================================
  // If we reach this point, someone is logged in!
  // Now we need to:
  // 1. Save their user ID
  // 2. Load their data from the database
  // 3. Make the data available to the dashboard
  // 4. Redirect to dashboard if they're on the login page
  // ========================================================================

  // Save the user's unique ID to a global variable
  // This ID is like a serial number that identifies exactly which user this is
  window._uid = user.uid;

  // Load all of this user's data from the Firebase database
  // This gets their transactions, budget, goals, loans, chat messages, etc.
  const data = await loadUserDoc(user.uid);

  // Save the loaded data to a global variable so dashboard.js can use it
  window.userData = data;

  // Tell the dashboard that data is ready
  // This fires an event that dashboard.js is listening for
  // Think of it like ringing a bell to say "Data is ready! You can start now!"
  window.dispatchEvent(new Event("firestore-ready"));

  // If user is currently on the login page, redirect them to dashboard
  // (They're already logged in, no need to stay on login page)
  if (currentPath.includes("login-page")) {
    window.location.href = "../dashboard/dashboard.html";
  }
});




// ========================================================================
// FUNCTION: logout()
// ========================================================================
// This function logs the user out and sends them back to the login page.
// Called when user clicks the "Logout" button in the dashboard.
// 
// WHAT IT DOES:
// 1. Signs the user out from Firebase (clears their login session)
// 2. Redirects to the login page
// ========================================================================
window.logout = async function () {
  await signOut(auth);  // Sign out from Firebase
  window.location.href = "../login-page/login.html";  // Go to login page
};



