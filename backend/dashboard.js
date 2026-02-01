// ========================================================================
// FILE PURPOSE: Spendly Dashboard - Main Application Logic
// ========================================================================
// This is the BRAIN of the Spendly app! It handles everything you see and do
// on the dashboard, including:
//
// 💰 MONEY TRACKING:
// - Recording transactions (money spent)
// - Calculating daily budgets
// - Showing spending heatmaps (calendar view)
//
// 📊 FINANCIAL PLANNING:
// - Setting monthly budget limits
// - Managing fixed expenses (rent, subscriptions)
// - Creating savings goals
// - Tracking loans (money borrowed/lent)
//
// 👥 SOCIAL FEATURES:
// - Group chats
// - Splitting bills with friends
// - Managing group expenses
//
// 📈 ANALYTICS:
// - Spending sentiment analysis (worthy/regret/neutral)
// - Category breakdowns
// - Charts and visualizations
//
// HOW IT WORKS:
// 1. Firebase loads user data from the cloud
// 2. This file receives the data and stores it in memory
// 3. User interacts with the page (clicks buttons, adds expenses)
// 4. This file updates the display and saves changes back to Firebase
// ========================================================================

// ========================================================================
// SECTION 1: STATE MANAGEMENT (The App's Memory)
// ========================================================================
// "State" is a programming term for "data the app currently remembers."
// Think of it like the app's short-term memory - all the information it
// needs to know RIGHT NOW to display the correct information to you.
//
// We get some data from Firebase (stored globally) and keep other data
// in local variables (stored just in this file).
// ========================================================================

// ------------------------------------------------------------------------
// FIREBASE REFERENCES (Connections to Cloud Services)
// ------------------------------------------------------------------------
// These variables give us access to Firebase services that were set up
// in firebase-init.js. We grab them from the window object (shared space).
// ------------------------------------------------------------------------
const auth = window._auth;      // Authentication service (handles login/logout)
const db = window._db;          // Database service (stores all user data)
const user = () => window._uid; // Function that returns current user's ID
const appId = "spendly-hackathon-v1";  // Unique identifier for this app
window.userData = window.userData || {}; // User's data from database (or empty object if not loaded yet)

// ------------------------------------------------------------------------
// CHART INSTANCES (References to Graphs/Charts)
// ------------------------------------------------------------------------
// These variables hold references to the charts displayed on the page.
// We need to keep track of them so we can update or destroy them later.
// Starting with "null" means "no chart created yet."
// ------------------------------------------------------------------------
let categoryChartInstance = null;   // The doughnut chart showing spending by category (Food, Transport, etc.)
let sentimentChartInstance = null;  // The doughnut chart showing spending by emotion (Worthy, Regret, Neutral)

// ------------------------------------------------------------------------
// CORE APPLICATION DATA (The Important Stuff)
// ------------------------------------------------------------------------
// These arrays and objects store all the user's financial information.
// They start EMPTY and get filled when Firebase loads the user's data.
// ------------------------------------------------------------------------
let userProfile = {};      // User's personal info (name, phone, avatar picture)
let transactions = [];     // List of all money spent (each item is one purchase)
let fixedExpenses = [];    // Monthly bills that don't change (rent, Netflix, gym membership)
let activeGoals = [];      // Savings goals (things user is saving money for)
let activeLoans = [];      // Money borrowed from others OR lent to others
let chatStore = {};        // All chat messages organized by group name
// Example: chatStore["Roommates"] = [message1, message2, ...]
let groupMembers = {};     // People in each group
// Example: groupMembers["Roommates"] = [{name: "John", phone: "123"}, ...]

// ------------------------------------------------------------------------
// UI STATE (What's Currently Displayed)
// ------------------------------------------------------------------------
// These variables track what the user is currently viewing or interacting with.
// They control which section is visible, which filters are active, etc.
// ------------------------------------------------------------------------
let monthlyLimit = 0;              // Total money available per month (₹ amount)
let dailySpent = 0;                // How much money spent TODAY (₹ amount)
let currentFilter = "month";       // Time period filter for analytics (day/week/month)
let currentChatId = "Roommates";   // Which group chat is currently open
let tempMembers = [];              // Temporary list when creating a new group (cleared after creation)

// ========================================================================
// FUNCTION: saveState()
// ========================================================================
// WHAT IT DOES:
// This function saves ALL current data to the Firebase cloud database.
// It's called whenever something important changes (new transaction,
// updated budget, new goal, etc.)
//
// WHY IT EXISTS:
// Without this function, all your changes would be lost when you close
// the browser! This function ensures everything is permanently saved
// to the cloud.
//
// HOW IT WORKS:
// 1. Collects all data from local variables (transactions, goals, etc.)
// 2. Puts it all into one big object (window.userData)
// 3. Calls syncUserData() which uploads to Firebase
// 4. If upload succeeds, your data is safe in the cloud!
// ========================================================================
async function saveState() {
  try {
    // ------------------------------------------------------------------
    // STEP 1: Make sure userData object exists
    // ------------------------------------------------------------------
    // If for some reason it doesn't exist, create an empty object
    // The "|| {}" means "or use empty object if userData is undefined"
    // ------------------------------------------------------------------
    window.userData = window.userData || {};

    // ------------------------------------------------------------------
    // STEP 2: Copy user profile information
    // ------------------------------------------------------------------
    // Take the current values from userProfile and save them to userData
    // If a value doesn't exist, use a default value
    // ------------------------------------------------------------------
    window.userData.name = userProfile.name || window.userData.name || "User";
    window.userData.phone = userProfile.phone || window.userData.phone || "";
    window.userData.avatar = userProfile.avatar || window.userData.avatar || "";

    // ------------------------------------------------------------------
    // STEP 3: Copy all financial data
    // ------------------------------------------------------------------
    // Save all the arrays and objects containing user's financial info
    // ------------------------------------------------------------------
    window.userData.transactions = transactions || [];      // All purchases
    window.userData.fixedExpenses = fixedExpenses || [];    // Monthly bills
    window.userData.goals = activeGoals || [];              // Savings goals
    window.userData.loans = activeLoans || [];              // Borrowed/lent money
    window.userData.chatGroups = chatStore || {};           // Chat messages
    window.userData.groupMembers = groupMembers || {};      // Group members
    window.userData.monthlyLimit = monthlyLimit !== undefined ? monthlyLimit : 0;

    // ------------------------------------------------------------------
    // STEP 4: Upload to Firebase cloud
    // ------------------------------------------------------------------
    // If the sync function exists (it's provided by firebase-init.js),
    // call it to upload all this data to the cloud database
    // ------------------------------------------------------------------
    if (typeof window.syncUserData === "function") {
      await window.syncUserData(window.userData);
    } else {
      // If sync function doesn't exist, just log a message
      // (This shouldn't happen in normal usage)
      console.debug("syncUserData() not available — state updated locally.");
    }
  } catch (err) {
    // If something went wrong, log the error so we can debug it
    console.error("Failed to save state:", err);
  }
}

// ========================================================================
// FUNCTION: initApp()
// ========================================================================
// WHAT IT DOES:
// This is called ONCE when the dashboard first loads. It sets up
// everything on the page and makes it ready for the user to interact with.
//
// THINK OF IT LIKE:
// When you turn on your computer, it needs a few seconds to "boot up"
// and get everything ready. This function is the "boot up" for our app.
//
// WHAT GETS INITIALIZED:
// - Date tracker (shows current date and days left in month)
// - Charts (doughnut graphs)
// - Transaction lists
// - Budget calculations
// - Chat history
// - User profile display
// - Spending heatmap (calendar view)
// ========================================================================
async function initApp() {
  try {
    // ------------------------------------------------------------------
    // STEP 1: Render all UI components
    // ------------------------------------------------------------------
    // These functions draw different parts of the page. We call them
    // all at once to build the complete dashboard interface.
    // ------------------------------------------------------------------
    updateDateTracker();              // Show today's date and days left in month
    initChart();                      // Create the category spending chart
    renderExpenseModal();             // Set up the "Add Expense" popup window
    renderTransactions();             // Display the list of transactions
    renderRecentTransactionsWidget(); // Show recent purchases widget
    recalculateDashboard();           // Calculate and display daily budget

    // ------------------------------------------------------------------
    // STEP 2: Create default group chat
    // ------------------------------------------------------------------
    // Every user gets a default "Roommates" chat group
    // If it doesn't exist yet, create empty arrays for it
    // ------------------------------------------------------------------
    if (!chatStore["Roommates"]) chatStore["Roommates"] = [];
    if (!groupMembers["Roommates"]) groupMembers["Roommates"] = [];

    // ------------------------------------------------------------------
    // STEP 3: Render chat and profile
    // ------------------------------------------------------------------
    renderChatHistory("Roommates");   // Load and display Roommates chat messages
    updateProfileUI();                // Show user's name and avatar picture
    renderHeatmap();                  // Create the spending calendar heatmap
  } catch (e) {
    // If anything goes wrong during initialization, log the error
    console.error("Critical App Error in initApp:", e);
  }
}

// ========================================================================
// SECTION 2: DATE & TIME TRACKING
// ========================================================================

// ========================================================================
// FUNCTION: updateDateTracker()
// ========================================================================
// WHAT IT DOES:
// Displays the current date and calculates how many days are left in the
// current month. This helps users understand their budget timeline.
//
// EXAMPLE OUTPUT: "Jan 15 • 16 Days Left"
// ========================================================================
function updateDateTracker() {
  const now = new Date();  // Get today's date and time

  // Array of month names (short versions)
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const day = now.getDate();  // Day number (1-31)
  const month = monthNames[now.getMonth()];  // Get month name from array
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();  // Total days this month
  const daysLeft = daysInMonth - day;  // Calculate days remaining

  // Find the display element and update its text
  const trackerEl = document.getElementById("liveDateTracker");
  if (trackerEl) trackerEl.innerText = `${month} ${day} • ${daysLeft} Days Left`;

  return daysLeft || 1;  // Return days left (minimum 1 to avoid division errors)
}

// ========================================================================
// SECTION 3: PAGE NAVIGATION
// ========================================================================

// ========================================================================
// FUNCTION: switchSection()
// ========================================================================
// WHAT IT DOES:
// Switches between different pages in the app (Dashboard, Transactions,
// Loans, Goals, Squad Groups, Crew). Only ONE page is visible at a time.
//
// HOW IT WORKS:
// 1. Hide ALL pages
// 2. Show ONLY the requested page
// 3. If switching to Transactions, refresh the data displays
//
// THINK OF IT LIKE:
// Changing TV channels - you can only watch one channel at a time!
// ========================================================================
function switchSection(sectionId) {
  // List of all page sections in the app
  const sections = ['dashboard', 'transactions', 'loans', 'goals', 'squad-groups', 'crew'];

  // STEP 1: Hide all sections
  sections.forEach(id => {
    const el = document.getElementById(id);  // Find the section element
    if (el) {
      el.classList.add('hidden');      // Add CSS class to hide it
      el.classList.remove('active');   // Remove active status
      el.style.display = 'none';       // Force hide with inline style
    }
  });

  // STEP 2: Show the requested section
  const target = document.getElementById(sectionId);
  if (target) {
    target.classList.remove('hidden');   // Remove hide class
    target.classList.add('active');      // Mark as active
    target.style.display = 'block';      // Make it visible

    // STEP 3: Special handling for Transactions page
    // When opening transactions, refresh the displays because chart sizes
    // depend on the element being visible
    if (sectionId === 'transactions') {
      // Wait 10 milliseconds for element to fully appear, then refresh
      setTimeout(() => {
        if (typeof renderHeatmap === 'function') renderHeatmap();
        if (typeof renderFullTransactions === 'function') renderFullTransactions();
      }, 10);
    }
  }
}

// ========================================================================
// SECTION 4: SPENDING HEATMAP (Calendar View)
// ========================================================================

// ========================================================================
// FUNCTION: renderHeatmap()
// ========================================================================
// WHAT IT DOES:
// Creates a visual calendar showing spending for each day of the month.
// Each day is color-coded:
// - 🟢 GREEN = Spent less than daily budget (good job!)
// - 🟡 YELLOW = Close to daily budget (be careful!)
// - 🔴 RED = Overspent (exceeded daily budget!)
// - ⚪ GRAY = No spending data
//
// HOW THE FORMULA WORKS:
// Daily Budget = (Monthly Limit - Fixed Expenses) / Days in Month
//
// EXAMPLE:
// Monthly Limit: ₹30,000
// Fixed Expenses: ₹12,000 (rent, bills, etc.)
// Days in Month: 30
// Daily Budget: (30,000 - 12,000) / 30 = ₹600 per day
// ========================================================================
function renderHeatmap() {
  // Find the grid container element
  const grid = document.getElementById("heatmapGrid");
  if (!grid) return;  // Exit if element doesn't exist

  grid.innerHTML = "";  // Clear any existing content

  // Get current date information
  const now = new Date();
  const year = now.getFullYear();   // Current year (e.g., 2026)
  const month = now.getMonth();     // Current month (0=Jan, 11=Dec)
  const daysInMonth = new Date(year, month + 1, 0).getDate();  // How many days this month?

  // ======================================================================
  // STEP 1: Calculate Daily Safe Spending Limit
  // ======================================================================
  // Formula: (Total Monthly Budget - Fixed Monthly Bills) / Days in Month
  // ======================================================================
  const limit = window.userData.monthlyLimit || 0;  // Total budget for the month
  const fixed = (window.userData.fixedExpenses || []).reduce((sum, item) => sum + item.amount, 0);  // Sum all fixed bills
  const safeDailyLimit = (limit - fixed) / daysInMonth;  // Safe amount per day

  // ======================================================================
  // STEP 2: Count how much was spent each day
  // ======================================================================
  // Create an object like: {1: 450, 2: 0, 3: 780, ...}
  // Where the number is the day and the value is total spent that day
  // ======================================================================
  const spendingMap = {};  // Will store {dayNumber: totalSpent}

  (window.userData.transactions || []).forEach((tx) => {
    const d = new Date(tx.timestamp);  // When was this purchase made?

    // Only count transactions from THIS month and year
    if (d.getMonth() === month && d.getFullYear() === year) {
      const dayKey = d.getDate();  // Which day (1-31)?
      // Add this transaction to that day's total
      spendingMap[dayKey] = (spendingMap[dayKey] || 0) + (tx.amount || 0);
    }
  });

  // ======================================================================
  // STEP 3: Create a box for each day of the month
  // ======================================================================
  for (let i = 1; i <= daysInMonth; i++) {
    const spent = spendingMap[i] || 0;  // How much spent on day i? (0 if nothing)

    // Default color: gray/empty (no spending data)
    let colorClass = "bg-white/5 border-white/10 text-gray-500";

    // If there was spending, choose color based on performance
    if (spent > 0) {
      if (spent <= safeDailyLimit) {
        // ============================================================
        // GREEN: Under or at budget ✅
        // You spent less than your daily limit! Great job!
        // ============================================================
        colorClass = "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]";
      } else if (spent > safeDailyLimit && spent <= (safeDailyLimit * 1.2)) {
        // ============================================================
        // YELLOW: Slightly over budget ⚠️
        // You spent up to 20% more than your daily limit
        // Example: If limit is ₹500, you spent ₹501-₹600
        // ============================================================
        colorClass = "bg-yellow-500/20 border-yellow-500/50 text-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.2)]";
      } else {
        // ============================================================
        // RED: Significantly over budget 🚨
        // You spent more than 20% over your daily limit
        // Example: If limit is ₹500, you spent  ₹601+
        // ============================================================
        colorClass = "bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]";
      }
    }

    // Create the calendar cell (the box for this day)
    const cell = document.createElement("div");
    cell.className = `heatmap-cell ${colorClass} h-10 w-full rounded-md border flex items-center justify-center text-xs font-bold cursor-pointer transition hover:scale-110`;
    cell.innerText = i;  // Show the day number
    cell.title = `Day ${i}: ₹${spent} / Safe: ₹${Math.round(safeDailyLimit)}`;  // Tooltip on hover
    cell.onclick = () => window.showToast(`Day ${i}: Spent ₹${spent}`);  // Show alert when clicked

    // Add this cell to the grid
    grid.appendChild(cell);
  }
}

// ========================================================================
// SECTION 5: QUICK EXPENSE ADDER
// ========================================================================
// This allows users to quickly add an expense from the main dashboard
// without opening the full expense modal. It's a shortcut for fast entry.
// ========================================================================

// ========================================================================
// FUNCTION: addQuickExpense()
// ========================================================================
// WHAT IT DOES:
// Adds a new expense transaction directly from the dashboard's quick-add
// form (the small form at the top of the page).
//
// STEPS:
// 1. Get the expense details from input fields
// 2. Validate that required fields are filled
// 3. Create a new transaction object
// 4. Add it to the transactions list
// 5. Clear the input fields
// 6. Refresh the displays
// 7. Save to Firebase cloud
// ========================================================================
async function addQuickExpense() {
  // Get references to the input fields on the page
  const nameInput = document.getElementById("quickExpenseName");      // What you bought
  const amtInput = document.getElementById("quickExpenseAmount");     // How much it cost
  const catInput = document.getElementById("quickExpenseCategory");   // Category (Food, Transport, etc.)

  // VALIDATION: Make sure user filled in the required fields
  if (!nameInput.value || !amtInput.value) {
    window.showToast("Please enter item and amount!");  // Show error message
    return;  // Stop here, don't add the expense
  }

  // Convert the amount from text to a number
  const amount = parseInt(amtInput.value);

  // ======================================================================
  // Create a new transaction object with all the details
  // ======================================================================
  const newTx = {
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),  // "Jan 15"
    timestamp: Date.now(),           // Exact time in milliseconds (for sorting)
    merchant: nameInput.value,       // Where/what you bought (e.g., "Starbucks")
    category: catInput.value,        // Category selected (e.g., "Food")
    amount: amount,                  // How much you spent (e.g., 450)
    sentiment: "neutral"             // Default feeling about this purchase
  };

  // Add this new transaction to the BEGINNING of the list
  // (unshift adds to start, so newest transactions appear first)
  window.userData.transactions.unshift(newTx);

  // ======================================================================
  // Clear the input fields so user can add another expense
  // ======================================================================
  nameInput.value = "";
  amtInput.value = "";

  // ======================================================================
  // Update the displays to show the new transaction
  // ======================================================================
  renderHeatmap();              // Update the calendar heatmap
  renderFullTransactions();     // Update the transactions table
  window.showToast(`Added ₹${amount}`);  // Show success message

  // ======================================================================
  // Save everything to Firebase cloud database
  // ======================================================================
  await saveState();
}

// ========================================================================
// SECTION 6: TRANSACTION DISPLAY
// ========================================================================

// ========================================================================
// FUNCTION: renderFullTransactions()
// ========================================================================
// WHAT IT DOES:
// Displays ALL transactions in a table format on the Transactions page.
// Each row shows: date, merchant name, category, and amount spent.
//
// This is different from the "recent transactions widget" which only
// shows the last 4 transactions. This function shows EVERYTHING.
// ========================================================================
function renderFullTransactions() {
  // Find the table body element where transactions will be displayed
  const list = document.getElementById("fullTransactionsList");
  if (!list) return;  // Exit if element doesn't exist

  list.innerHTML = "";  // Clear any existing rows

  // Loop through ALL transactions and create a table row for each one
  (window.userData.transactions || []).forEach(tx => {
    // Create a new table row element
    const row = document.createElement("tr");
    row.className = "hover:bg-white/5 transition";  // Add hover effect

    // Set the HTML content for this row (4 columns: date, merchant, category, amount)
    row.innerHTML = `
            <td class="px-6 py-4 text-gray-400 whitespace-nowrap">${tx.date}</td>
            <td class="px-6 py-4 font-bold text-white">${tx.merchant}</td>
            <td class="px-6 py-4"><span class="px-2 py-1 bg-white/10 rounded text-xs text-gray-300 border border-white/10">${tx.category}</span></td>
            <td class="px-6 py-4 text-right font-bold text-red-400">-₹${tx.amount}</td>
        `;

    // Add this row to the table
    list.appendChild(row);
  });
}

// ========================================================================
// SECTION 7: USER PROFILE MANAGEMENT
// ========================================================================
// These functions handle the user's profile: name, phone number, and
// avatar (profile picture). Users can edit their profile and choose
// different avatar pictures.
// ========================================================================

// ========================================================================
// FUNCTION: toggleProfileModal()
// ========================================================================
// WHAT IT DOES:
// Opens or closes the profile editing popup window.
//
// WHEN OPENING:
// - Shows the modal
// - Pre-fills the form with current profile data
//
// WHEN CLOSING:
// - Hides the modal
// ========================================================================
window.toggleProfileModal = (show) => {
  // Find the profile modal element
  const el = document.getElementById("profileModal");

  // Show or hide it based on the 'show' parameter
  if (el) el.style.display = show ? "flex" : "none";

  // If we're opening the modal, pre-fill the form with current data
  if (show) {
    document.getElementById("profileName").value = userProfile.name || "";
    document.getElementById("profilePhone").value = userProfile.phone || "";
    document.getElementById("modalAvatar").src = userProfile.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=default";
  }
};

// ========================================================================
// FUNCTION: randomizeAvatar()
// ========================================================================
// WHAT IT DOES:
// Generates a random new avatar (profile picture) when user clicks the
// "randomize" button. Each click creates a completely new avatar design.
//
// HOW IT WORKS:
// - Creates a random seed (random text string)
// - Uses that seed with the DiceBear API to generate a unique avatar
// - Temporarily stores it (not saved until user clicks "Save Profile")
// ========================================================================
window.randomizeAvatar = () => {
  // Generate a random seed (7-character random string)
  const seed = Math.random().toString(36).substring(7);

  // Create the avatar URL using the random seed
  // DiceBear API generates cartoon avatars based on the seed
  const newAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;

  // Update the image in the modal to show the new avatar
  const avatarEl = document.getElementById("modalAvatar");
  if (avatarEl) avatarEl.src = newAvatar;

  // Store this temporarily (will be saved permanently when user clicks "Save Profile")
  userProfile.tempAvatar = newAvatar;
};

// ========================================================================
// FUNCTION: saveProfile()
// ========================================================================
// WHAT IT DOES:
// Saves the user's profile changes (name, phone, avatar) permanently.
//
// STEPS:
// 1. Get the values from the form fields
// 2. Update the userProfile object
// 3. Update the UI to show the new profile
// 4. Close the modal
// 5. Save to Firebase
// ========================================================================
window.saveProfile = async () => {
  // Get the values from the form
  const name = document.getElementById("profileName").value;
  const phone = document.getElementById("profilePhone").value;

  // Update the profile object with new values (if provided)
  if (name) userProfile.name = name;
  if (phone) userProfile.phone = phone;
  if (userProfile.tempAvatar) {
    userProfile.avatar = userProfile.tempAvatar;
    delete userProfile.tempAvatar;
  }

  updateProfileUI();
  window.toggleProfileModal(false);
  window.showToast("Profile Updated!");

  // persist
  await saveState();
};

// ========================================================================
// FUNCTION: updateProfileUI()
// ========================================================================
// WHAT IT DOES:
// Updates the user's name and avatar image displayed in the sidebar.
// This is called when the app loads and after profile changes are saved.
// ========================================================================
function updateProfileUI() {
  // Update the name display in the sidebar
  const nameEl = document.getElementById("sidebarName");
  if (nameEl) nameEl.innerText = userProfile.name || "User";

  // Update the avatar image in the sidebar
  const avatarEl = document.getElementById("sidebarAvatar");
  if (avatarEl) avatarEl.src = userProfile.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=default";
}

// ========================================================================
// SECTION 8: RECENT TRANSACTIONS WIDGET
// ========================================================================

// ========================================================================
// FUNCTION: renderRecentTransactionsWidget()
// ========================================================================
// WHAT IT DOES:
// Displays the 4 most recent transactions in a small widget on the
// dashboard's main page. This gives users a quick view of their latest
// spending without having to open the full Transactions page.
//
// EACH TRANSACTION SHOWS:
// - An icon representing the category
// - Merchant name (where you bought it)
// - Date of purchase
// - Amount spent
// ========================================================================
function renderRecentTransactionsWidget() {
  // Find the widget container element
  const list = document.getElementById("miniTransactionList");
  if (!list) return;  // Exit if element doesn't exist

  list.innerHTML = "";  // Clear any existing content

  // Get only the first 4 transactions (most recent)
  const recent = transactions.slice(0, 4);

  // If no transactions exist yet, show a message
  if (recent.length === 0) {
    list.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">No recent activity</p>';
    return;
  }

  // Create a display element for each of the 4 recent transactions
  recent.forEach((tx) => {
    list.innerHTML += `
      <div class="flex justify-between items-center p-2 border-b border-white/5 last:border-0">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full ${tx.bg || 'bg-black'} ${tx.color || 'text-white'} flex items-center justify-center text-xs"><i class="ph-fill ${tx.icon || 'ph-shopping-bag'}"></i></div>
          <div>
            <p class="text-xs font-bold text-white">${tx.merchant || 'Unknown'}</p>
            <p class="text-[10px] text-gray-500">${(tx.date || '').split(',')[0] || ''}</p>
          </div>
        </div>
        <span class="text-xs font-bold text-white">-₹${tx.amount || 0}</span>
      </div>
    `;
  });
}

// ========================================================================
// SECTION 9: SAVINGS GOALS
// ========================================================================
// Goals are things you're saving money for (e.g., "Buy a PS5", "Vacation").
// For each goal, you set:
// - Target amount (how much money you need)
// - Target date (when you want to achieve it)
// The app calculates how much you need to save per day to reach your goal.
// ========================================================================

// ========================================================================
// SECTION 9: SAVINGS GOALS
// ========================================================================
// Goals are things you're saving money for (e.g., "Buy a PS5", "Vacation").
// For each goal, you set:
// - Target amount (how much money you need)
// - Target date (when you want to achieve it)
// The app calculates how much you need to save per day to reach your goal.
// ========================================================================

// ========================================================================
// FUNCTION: toggleGoalModal()
// ========================================================================
// WHAT IT DOES:
// Opens or closes the "Add Goal" popup window.
// ========================================================================
window.toggleGoalModal = (show) => {
  const el = document.getElementById("goalModal");
  if (el) el.style.display = show ? "flex" : "none";
};

// ========================================================================
// FUNCTION: updateGoalCalc()
// ========================================================================
// WHAT IT DOES:
// Calculates how much you need to save PER DAY to reach your goal.
// This calculation happens automatically as you type in the goal form.
//
// THE MATH:
// Daily Savings Needed = Goal Amount / Days Until Target Date
//
// EXAMPLE:
// Goal: Save ₹15,000 for a new phone
// Target Date: 60 days from now
// Daily Savings: ₹15,000 / 60 = ₹250 per day
//
// This means: "If you save ₹250 every day for the next 60 days, you'll
// have enough money to buy your new phone!"
// ========================================================================
function updateGoalCalc() {
  // Get the goal amount from the input field
  const amt = parseInt(document.getElementById("goalAmount")?.value || 0);

  // Get the target date from the input field
  const dateStr = document.getElementById("goalDate")?.value;

  // Only calculate if both amount and date are provided
  if (amt > 0 && dateStr) {
    const targetDate = new Date(dateStr);  // Convert date string to Date object
    const today = new Date();              // Get today's date

    // Calculate difference in milliseconds between now and target date
    const diffTime = Math.abs(targetDate - today);

    // Convert milliseconds to days
    // (1000 ms * 60 sec * 60 min * 24 hours = milliseconds in one day)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Calculate daily savings needed
    if (diffDays > 0) {
      const daily = (amt / diffDays).toFixed(0);  // Round to nearest rupee

      // Display the result to the user
      const display = document.getElementById("goalImpactCalc");
      if (display) display.innerHTML = `Daily Deduction: <span class="font-bold text-white">₹${daily} / day</span> (${diffDays} days)`;
    }
  }
}

// Attach the calculator to the input fields
// This makes it recalculate automatically whenever the user types
document.getElementById("goalAmount")?.addEventListener("input", updateGoalCalc);
document.getElementById("goalDate")?.addEventListener("change", updateGoalCalc);

// ========================================================================
// FUNCTION: saveGoal()
// ========================================================================
// WHAT IT DOES:
// Creates a new savings goal and adds it to your goals list.
//
// WHAT HAPPENS:
// 1. Gets goal details from the form (name, amount, date)
// 2. Validates that all fields are filled
// 3. Calculates daily savings needed
// 4. Creates the goal object
// 5. Adds it to your goals list
// 6. Updates the display
// 7. Saves to Firebase
// ========================================================================
window.saveGoal = async () => {
  // Get references to the input fields
  const nameInput = document.getElementById("goalName");
  const amountInput = document.getElementById("goalAmount");
  const dateInput = document.getElementById("goalDate");

  // Validate that all fields are filled
  if (!nameInput.value || !amountInput.value || !dateInput.value) {
    window.showToast("Please fill all details");
    return;
  }

  const targetDate = new Date(dateInput.value);
  const today = new Date();
  const diffTime = Math.abs(targetDate - today);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;  // Days until goal
  const daily = Math.ceil(parseInt(amountInput.value) / diffDays);  // Daily savings needed

  // Create the goal object with all details
  const goal = {
    id: Date.now(),                      // Unique ID (timestamp)
    name: nameInput.value,               // Goal name (e.g., "New Laptop")
    amount: parseInt(amountInput.value), // Target amount (e.g., 50000)
    deadline: dateInput.value,           // Target date
    daily: daily,                        // How much to save per day
    daysLeft: diffDays,                  // Days remaining
  };

  // Add goal to the list
  activeGoals.push(goal);

  // Update the display and close the modal
  renderGoals();                          // Show updated goals list
  window.toggleGoalModal(false);          // Close the popup
  window.showToast("Goal Set! Budget Adjusted.");  // Show success message

  // Clear the form fields
  nameInput.value = "";
  amountInput.value = "";
  dateInput.value = "";

  // Save to Firebase
  await saveState();
};

// ========================================================================
// FUNCTION: removeGoal()
// ========================================================================
// WHAT IT DOES:
// Deletes a goal from your goals list when you click the remove button.
//
// WHEN YOU MIGHT USE THIS:
// - You already achieved the goal
// - You changed your mind about the goal
// - The goal is no longer realistic
// ========================================================================
window.removeGoal = async (id) => {
  // Remove the goal with the matching ID from the array
  // filter() keeps all goals EXCEPT the one with this ID
  activeGoals = activeGoals.filter((g) => g.id !== id);

  // Update the display
  renderGoals();
  window.showToast("Goal removed");

  // Save the changes to Firebase
  await saveState();
};

// ========================================================================
// FUNCTION: renderGoals()
// ========================================================================
// WHAT IT DOES:
// Displays all your active savings goals on the Goals page.
// Each goal shows:
// - Goal name
// - Target amount
// - Daily savings needed
// - Days remaining
// - Progress bar (if you've been tracking contributions)
// ========================================================================
function renderGoals() {
  // Find the goals list container
  const list = document.getElementById("goalsList");
  if (!list) return;

  // Find the "no goals" message element
  const noMsg = document.getElementById("noGoalsMsg");
  if (activeGoals.length > 0 && noMsg) noMsg.style.display = "none";
  if (activeGoals.length === 0 && noMsg) noMsg.style.display = "block";

  Array.from(list.children).forEach((child) => {
    if (child.id !== "noGoalsMsg") list.removeChild(child);
  });

  activeGoals.forEach((goal) => {
    const item = document.createElement("div");
    item.className = "card-glass p-6 relative overflow-hidden border border-brand-warning/30 group";
    item.innerHTML = `
      <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
        <button onclick="removeGoal(${goal.id})" class="p-1 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition"><i class="ph-bold ph-trash"></i></button>
      </div>
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="font-bold text-white text-lg">${goal.name}</h3>
          <p class="text-xs text-gray-400">Target: ₹${goal.amount}</p>
        </div>
        <div class="bg-brand-warning/10 text-brand-warning p-2 rounded-lg"><i class="ph-bold ph-star"></i></div>
      </div>
      <div class="mb-2 flex justify-between text-xs">
        <span class="text-gray-400">${goal.daysLeft} days left</span>
        <span class="text-white font-bold">Saving ₹${goal.daily}/day</span>
      </div>
      <div class="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
        <div class="h-full bg-brand-warning w-[10%]"></div>
      </div>
    `;
    list.appendChild(item);
  });

  recalculateDashboard();
}

// ========================================================================
// SECTION 11: SQUAD & GROUP CHAT
// ========================================================================
// The Squad feature lets you create groups with friends/roommates to:
// - Chat with each other
// - Split bills and expenses
// - Track shared costs (like rent, utilities, groceries)
//
// Each group has:
// - Group name (e.g., "Roommates", "College Friends")
// - Members list (people in the group)
// - Chat history
// - Shared expenses
// ========================================================================

// ========================================================================
// FUNCTION: handleAddMember()
// ========================================================================
// WHAT IT DOES:
// Adds a new member to the temporary members list when creating a group.
// This is used in the "Create New Group" flow.
//
// HOW IT WORKS:
// 1. Gets member details from form (name, phone, email)
// 2. Validates required fields
// 3. Adds to temporary list
// 4. Shows the member in the preview list
// 5. Clears the form for next member
// ========================================================================
window.handleAddMember = () => {
  // Get input field references
  const nameInput = document.getElementById("newMemberName");
  const phoneInput = document.getElementById("newMemberPhone");
  const emailInput = document.getElementById("newMemberEmail");

  // Validate that at least name and phone are provided
  if (nameInput.value && phoneInput.value) {
    // Create member object
    const newMember = { name: nameInput.value, phone: phoneInput.value, email: emailInput.value };

    // Add to temporary list (will be saved when group is created)
    tempMembers.push(newMember);

    // Show the member in the preview list
    const list = document.getElementById("tempMemberList");
    list.innerHTML += `<div class="flex justify-between items-center p-2 bg-white/5 rounded border border-white/5 text-xs"><span>${newMember.name}</span><span class="text-gray-400">${newMember.phone}</span></div>`;

    // Clear the form fields for next member
    nameInput.value = "";
    phoneInput.value = "";
    emailInput.value = "";
  } else {
    window.showToast("Name and Phone required");
  }
};

// ========================================================================
// FUNCTION: switchGroup()
// ========================================================================
// WHAT IT DOES:
// Switches the currently displayed chat to a different group.
// Updates the UI to show the selected group's chat history.
//
// EXAMPLE:
// If you click "Roommates" in the groups list, this function loads
// all the messages from the Roommates chat.
// ========================================================================
window.switchGroup = (chatId) => {
  // Update the current chat ID
  currentChatId = chatId;

  // Update the group name display
  const nameEl = document.getElementById("currentGroupName");
  if (nameEl) nameEl.innerText = chatId;

  // Remove "active" class from all group items
  document.querySelectorAll(".group-item").forEach((el) => el.classList.remove("active"));

  // Add "active" class to the clicked group
  let activeItem = document.getElementById(`group-${chatId}`) || document.getElementById(`group-dm-${chatId}`);
  if (activeItem) activeItem.classList.add("active");

  // Load and display this group's chat history
  renderChatHistory(chatId);
};

// ========================================================================
// FUNCTION: renderChatHistory()
// ========================================================================
// WHAT IT DOES:
// Displays all messages for a specific group chat.
//
// MESSAGE TYPES:
// - Regular messages: Normal text chat
// - Split requests: Bill splitting requests
// - System messages: Notifications (e.g., "John joined the group")
//
// Each message type is displayed differently for clarity.
// ========================================================================
function renderChatHistory(chatId) {
  // Find the chat container
  const container = document.getElementById("squadChatContainer");
  if (!container) return;

  container.innerHTML = "";  // Clear existing messages

  // Get all messages for this group
  const messages = chatStore[chatId] || [];

  // If no messages yet, show a placeholder
  if (messages.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-gray-500 text-xs">Start a conversation with ${chatId}</div>`;
    return;
  }

  // Display each message based on its type
  messages.forEach((msg) => {
    if (msg.type === "split") {
      // Bill splitting request
      renderSquadSplitDOM(msg, container);
    } else if (msg.type === "system") {
      // System notification
      container.insertAdjacentHTML("beforeend", `<div class="flex w-full justify-center my-4"><span class="text-[10px] bg-white/10 px-3 py-1 rounded-full text-gray-400">${msg.text}</span></div>`);
    } else {
      // Regular text message
      renderSquadMessageDOM(msg, container);
    }
  });

  // Auto-scroll to bottom to show latest messages
  container.scrollTop = container.scrollHeight;
}

// ========================================================================
// FUNCTION: renderSquadMessageDOM()
// ========================================================================
// WHAT IT DOES:
// Renders a single chat message in the conversation view.
//
// MESSAGE LAYOUT:
// - Messages from YOU appear on the right side (blue bubble)
// - Messages from OTHERS appear on the left side (grey bubble)
// - Other people's messages show their name above the message
//
// This creates the familiar "chat bubble" interface you see in WhatsApp,
// iMessage, etc.
// ========================================================================
function renderSquadMessageDOM(msg, container) {
  const isMe = msg.isMe;  // Is this message from the current user?

  // Create the message bubble HTML
  container.insertAdjacentHTML("beforeend",
    `<div class="flex w-full mb-4 ${isMe ? "justify-end" : "justify-start"}">
      <div class="chat-bubble ${isMe ? "chat-mine" : "chat-theirs"}">
        ${!isMe ? `<div class="text-[10px] opacity-50 mb-1 font-bold text-pink-400">${msg.author}</div>` : ""}
        ${msg.text}
      </div>
    </div>`);
}

// ========================================================================
// FUNCTION: renderSquadSplitDOM()
// ========================================================================
// WHAT IT DOES:
// Renders a bill splitting request in the chat.
//
// WHAT IS A SPLIT REQUEST?
// When someone in the group  asks others to chip in for a shared expense.
//
// EXAMPLE:
// You ordered pizza for ₹800 for the group. You create a split request
// asking each person to pay their share (₹800 ÷ 4 people = ₹200 each).
//
// The split request shows:
// - What was purchased ("Pizza")
// - Total amount (₹800)
// - Status ("Waiting for others..." or "Paid")
// ========================================================================
function renderSquadSplitDOM(msg, container) {
  const html = `<div class="flex w-full justify-end mb-4"><div class="chat-bubble chat-mine !p-0 overflow-hidden border-0"><div class="bg-brand-dark p-3 min-w-[220px]"><div class="flex justify-between items-start mb-2 border-b border-white/10 pb-2"><div><div class="text-[10px] text-white/60 uppercase tracking-widest">You requested</div><div class="font-bold text-white flex items-center gap-2">${msg.item}</div></div><div class="text-xl font-black text-white">₹${msg.amount}</div></div><div class="text-xs text-gray-300 mb-2">Waiting for others...</div></div></div></div>`;
  container.insertAdjacentHTML("beforeend", html);
}

// ========================================================================
// FUNCTION: sendSquadChat()
// ========================================================================
// WHAT IT DOES:
// Sends a new chat message to the current group.
//
// HOW IT WORKS:
// 1. Gets the text from the input field
// 2. Creates a message object
// 3. Adds it to the chat history
// 4. Updates the display
// 5. Clears the input field
// 6. Saves to Firebase
// ========================================================================
window.sendSquadChat = async () => {
  const input = document.getElementById("squadInput");
  if (!input) return;

  const text = input.value.trim();  // Get text and remove extra spaces
  if (!text) return;  // Don't send empty messages

  input.value = "";  // Clear the input field

  const msg = { type: "text", text, author: "You", isMe: true, timestamp: Date.now() };

  if (!chatStore[currentChatId]) chatStore[currentChatId] = [];
  chatStore[currentChatId].push(msg);

  renderChatHistory(currentChatId);

  // persist chat state
  await saveState();
};

// ---------- SPLIT BILL ----------
window.submitSplit = async () => {
  const itemInput = document.getElementById("splitItem");
  const amountInput = document.getElementById("splitAmount");
  if (!itemInput || !amountInput) return;

  const msgData = { type: "split", item: itemInput.value, amount: amountInput.value, author: "You", timestamp: Date.now(), isMe: true };

  if (!chatStore[currentChatId]) chatStore[currentChatId] = [];
  chatStore[currentChatId].push(msgData);
  renderChatHistory(currentChatId);
  window.toggleContryModal(false);

  // Notify group members (simulated)
  const members = groupMembers[currentChatId] || [];
  if (members.length > 0) {
    members.forEach((m) => console.log(`[Simulated] Sending request to ${m.name} via ${m.phone} / ${m.email}`));
    window.showToast(`Request sent to ${members.length} members`);
  } else {
    window.showToast("Split Request Posted!");
  }

  itemInput.value = "";
  amountInput.value = "";

  // persist
  await saveState();
};

// ---------- EXPENSES & BUDGETS ----------
window.toggleExpenseModal = (show) => {
  const el = document.getElementById("expenseModal");
  if (el) el.style.display = show ? "flex" : "none";
  if (show) {
    renderExpenseModal();
    const firstTab = document.querySelector(".modal-tab");
    if (firstTab) window.switchModalTab("logExpense", firstTab);
  }
};

window.switchModalTab = (tabName, btn) => {
  document.querySelectorAll(".modal-tab").forEach((t) => t.classList.remove("active"));
  if (btn) btn.classList.add("active");

  const tabLog = document.getElementById("tab-logExpense");
  const tabBudget = document.getElementById("tab-budgetSettings");
  if (tabLog) tabLog.style.display = tabName === "logExpense" ? "block" : "none";
  if (tabBudget) tabBudget.style.display = tabName === "budgetSettings" ? "block" : "none";
};

window.setExpenseCategory = (cat, btn) => {
  const input = document.getElementById("expenseCategory");
  if (input) input.value = cat;
  const buttons = btn.parentElement.querySelectorAll("button");
  buttons.forEach((b) => b.className = "flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded text-xs font-bold hover:bg-white/10");
  btn.className = "flex-1 py-2 bg-brand-DEFAULT/20 text-brand-DEFAULT border border-brand-DEFAULT/50 rounded text-xs font-bold focus:ring-2 ring-brand-DEFAULT";
};

window.setExpenseSentiment = (sent, btn) => {
  const input = document.getElementById("expenseSentiment");
  if (input) input.value = sent;
  const buttons = btn.parentElement.querySelectorAll("button");
  buttons.forEach((b) => b.className = "flex-1 py-3 bg-white/5 text-gray-400 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 transition flex flex-col items-center gap-1");
  if (sent === "worthy") btn.className = "flex-1 py-3 bg-brand-accent/20 text-brand-accent border border-brand-accent/50 rounded-xl text-xs font-bold hover:bg-brand-accent/30 transition flex flex-col items-center gap-1";
  else if (sent === "regret") btn.className = "flex-1 py-3 bg-brand-danger/20 text-brand-danger border border-brand-danger/50 rounded-xl text-xs font-bold hover:bg-brand-danger/30 transition flex flex-col items-center gap-1";
  else btn.className = "flex-1 py-3 bg-white/20 text-white border border-white/30 rounded-xl text-xs font-bold hover:bg-white/30 transition flex flex-col items-center gap-1";
};

window.saveTransaction = async () => {
  const nameInput = document.getElementById("expenseName");
  const amtInput = document.getElementById("expenseAmount");
  const catInput = document.getElementById("expenseCategory");
  const sentInput = document.getElementById("expenseSentiment");

  if (!nameInput || !amtInput) return;

  const merchant = nameInput.value;
  const amount = parseInt(amtInput.value);
  const category = catInput ? catInput.value : "Food";
  const sentiment = sentInput ? sentInput.value : "ignore";

  if (!merchant || !amount) {
    window.showToast("Please enter valid expense details");
    return;
  }

  dailySpent += amount;

  const newTx = {
    date: "Today, Just now",
    timestamp: Date.now(),
    merchant,
    category,
    amount,
    icon: category === "Food" ? "ph-hamburger" : category === "Transport" ? "ph-taxi" : "ph-shopping-bag",
    color: "text-brand-light",
    bg: "bg-brand-DEFAULT/20",
    sentiment,
  };

  transactions.unshift(newTx);

  renderTransactions();
  renderRecentTransactionsWidget();
  recalculateDashboard();
  renderHeatmap();
  window.toggleExpenseModal(false);
  window.showToast(`Spent ₹${amount} at ${merchant}`);

  nameInput.value = "";
  amtInput.value = "";

  // persist
  await saveState();
};

function renderTransactions() {
  const list = document.getElementById("transactionsList");
  if (!list) return;
  list.innerHTML = "";

  transactions.forEach((tx) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-white/5 transition group";

    let sentBadge = "";
    if (tx.sentiment === "worthy") sentBadge = '<span class="ml-2 text-[10px] text-brand-accent bg-brand-accent/10 px-1 rounded">🤩</span>';
    if (tx.sentiment === "regret") sentBadge = '<span class="ml-2 text-[10px] text-brand-danger bg-brand-danger/10 px-1 rounded">💀</span>';

    tr.innerHTML = `
      <td class="p-4 text-gray-400">${tx.date}</td>
      <td class="p-4 font-medium text-white flex items-center gap-3">
        <div class="w-8 h-8 rounded-full ${tx.bg || 'bg-black'} ${tx.color || 'text-white'} flex items-center justify-center"><i class="ph-fill ${tx.icon || 'ph-shopping-bag'}"></i></div>
        ${tx.merchant || 'Unknown'} ${sentBadge}
      </td>
      <td class="p-4"><span class="px-2 py-1 rounded bg-white/5 text-xs border border-white/10">${tx.category || ''}</span></td>
      <td class="p-4 text-right font-bold text-white">-₹${tx.amount || 0}.00</td>
      <td class="p-4 text-center text-gray-600 group-hover:text-brand-light cursor-pointer"><i class="ph-bold ph-receipt"></i></td>
    `;
    list.appendChild(tr);
  });
}

// ========================================================================
// SECTION 12: SPEND ING ANALYSIS & SENTIMENT TRACKING
// ========================================================================
// This feature helps you understand HOW YOU FEEL about your spending.
//
// THREE SENTIMENT CATEGORIES:
// 1. 🤩 WORTHY: Money well spent (e.g., healthy food, books, gym)
// 2. 💀 REGRET: Wish you hadn't spent this (e.g., impulse buys, junk food)
// 3. 🤷 IGNORE/NEUTRAL: No strong feelings (e.g., groceries, utilities)
//
// WHY THIS MATTERS:
// - Helps you identify spending patterns
// - Shows where money brings value vs regret
// - Guides future spending decisions
//
// EXAMPLE:
// If you see lots of "regret" spending on food delivery, maybe it's
// time to cook more at home!
// ========================================================================

// ========================================================================
// FUNCTION: toggleSpendingDetails()
// ========================================================================
// WHAT IT DOES:
// Opens or closes the detailed spending analysis popup.
// When opening, automatically shows this month's spending breakdown.
// ========================================================================
window.toggleSpendingDetails = (show) => {
  const el = document.getElementById("spendingDetailsModal");
  if (el) el.style.display = show ? "flex" : "none";
  if (show) window.applyDateFilter("month");  // Default to showing this month
};

// ========================================================================
// FUNCTION: applyDateFilter()
// ========================================================================
// WHAT IT DOES:
// Filters the spending analysis by time period (day/week/month).
//
// TIME PERIODS:
// - "day": Only today's spending
// - "week": Last 7 days
// - "month": Last 30 days
//
// Updates the sentiment chart and transaction list based on the filter.
// ========================================================================
window.applyDateFilter = (period) => {
  currentFilter = period;  // Save the selected filter

  // Update button styles to show which filter is active
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.className = `filter-btn text-xs px-3 py-1.5 rounded-md transition text-gray-400 hover:text-white`;
    if (btn.id === `filter-${period}`) btn.className = `filter-btn active text-xs px-3 py-1.5 rounded-md bg-brand-DEFAULT text-white shadow-lg transition`;
  });

  // Recalculate analysis with new filter
  updateSentimentAnalysis();
  filterSentiment("all");
};

// ========================================================================
// FUNCTION: getFilteredTransactions()
// ========================================================================
// WHAT IT DOES:
// Returns only the transactions that match the current time filter.
//
// HOW IT WORKS:
// - Calculates how long ago each transaction was made
// - Keeps only transactions within the selected time period
//
// EXAMPLE:
// If filter is "week", it returns transactions from the last 7 days
// ========================================================================
function getFilteredTransactions() {
  const now = Date.now();  // Current time in milliseconds
  const oneDayMs = 24 * 60 * 60 * 1000;  // Milliseconds in one day

  return transactions.filter((t) => {
    const diff = now - (t.timestamp || Date.now());  // How long ago was this transaction?

    // Check if transaction falls within the selected period
    if (currentFilter === "day") return diff < oneDayMs;           // Last 24 hours
    if (currentFilter === "week") return diff < oneDayMs * 7;      // Last 7 days
    if (currentFilter === "month") return diff < oneDayMs * 30;    // Last 30 days
    return true;  // If no filter, include all
  });
}

// ========================================================================
// FUNCTION: updateSentimentAnalysis()
// ========================================================================
// WHAT IT DOES:
// Calculates and displays your spending breakdown by emotional category.
//
// THE CALCULATION:
// 1. Get transactions for selected time period
// 2. Group spending by sentiment (worthy/regret/ignore)
// 3. Calculate totals for each category
// 4. Update the displays and chart
//
// EXAMPLE OUTPUT:
// Total Spent: ₹5,000
// - Worthy:  ₹3,000 (60%) - Gym, books, healthy food
// - Regret:  ₹1,500 (30%) - Junk food, impulse buys
// - Neutral: ₹500  (10%) - Utilities, transport
// ========================================================================
function updateSentimentAnalysis() {
  // Get transactions for the selected time period
  const filteredTx = getFilteredTransactions();

  // Initialize counters for each sentiment category
  let worthy = 0, regret = 0, ignore = 0;

  // Add up spending for each category
  filteredTx.forEach((tx) => {
    if (tx.sentiment === "worthy") worthy += tx.amount || 0;
    else if (tx.sentiment === "regret") regret += tx.amount || 0;
    else ignore += tx.amount || 0;
  });

  const total = worthy + regret + ignore;  // Total spending

  // Update the total spending display
  const elTotal = document.getElementById("analysisTotal");
  if (elTotal) elTotal.innerText = `₹${total}`;

  // Update individual category displays
  const elWorthy = document.getElementById("totalWorthy");
  if (elWorthy) elWorthy.innerText = `₹${worthy}`;
  const elRegret = document.getElementById("totalRegret");
  if (elRegret) elRegret.innerText = `₹${regret}`;
  const elIgnore = document.getElementById("totalIgnore");
  if (elIgnore) elIgnore.innerText = `₹${ignore}`;

  // Create/update the sentiment doughnut chart
  const ctx = document.getElementById("sentimentChart");
  if (ctx) {
    // Destroy old chart if it exists
    if (sentimentChartInstance) sentimentChartInstance.destroy();

    // Create new chart with updated data
    sentimentChartInstance = new Chart(ctx.getContext("2d"), {
      type: "doughnut",
      data: { labels: ["Worthy", "Regret", "Ignore"], datasets: [{ data: [worthy, regret, ignore], backgroundColor: ["#00ff95", "#ff4b4b", "#555555"], borderWidth: 0, hoverOffset: 10 }] },
      options: { cutout: "70%", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
}

// ========================================================================
// FUNCTION: filterSentiment()
// ========================================================================
// WHAT IT DOES:
// Shows a detailed list of transactions for a specific sentiment category.
//
// EXAMPLE:
// If you click on "Worthy", it shows all the "worthy" purchases you made
// during the selected time period.
// ========================================================================
window.filterSentiment = (type) => {
  const list = document.getElementById("drillDownList");
  const title = document.getElementById("drillDownTitle");
  if (!list) return;

  list.innerHTML = "";  // Clear existing list

  // Set the display title based on time period
  const timeLabel = currentFilter === "day" ? "Today" : currentFilter === "week" ? "This Week" : "This Month";
  if (title) {
    if (type === "worthy") title.innerText = `🤩 Worthy Spending (${timeLabel})`;
    else if (type === "regret") title.innerText = `💀 Regrets (${timeLabel})`;
    else if (type === "ignore") title.innerText = `🤷 Can Ignore (${timeLabel})`;
    else title.innerText = `All Transactions (${timeLabel})`;
  }

  const timeFiltered = getFilteredTransactions();
  const finalFiltered = type === "all" ? timeFiltered : timeFiltered.filter((t) => t.sentiment === type);

  if (finalFiltered.length === 0) {
    list.innerHTML = `<div class="text-center py-8 text-gray-500 text-xs">No transactions found.</div>`;
    return;
  }

  finalFiltered.forEach((tx) => {
    let color = "text-white";
    if (tx.sentiment === "worthy") color = "text-brand-accent";
    if (tx.sentiment === "regret") color = "text-brand-danger";

    const div = document.createElement("div");
    div.className = "p-3 bg-white/5 rounded-lg flex justify-between items-center hover:bg-white/10 transition";
    div.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center"><i class="ph-fill ${tx.icon} text-gray-400"></i></div>
        <div>
          <p class="text-sm font-bold text-gray-200">${tx.merchant}</p>
          <p class="text-[10px] text-gray-500">${tx.date}</p>
        </div>
      </div>
      <span class="font-bold ${color}">-₹${tx.amount}</span>
    `;
    list.appendChild(div);
  });
};

// ---------- BUDGET HELPERS ----------
function renderExpenseModal() {
  const input = document.getElementById("monthlyLimitInput");
  if (input) input.value = monthlyLimit;

  const list = document.getElementById("fixedExpensesList");
  if (list) {
    list.innerHTML = "";
    let totalFixed = 0;
    fixedExpenses.forEach((exp, index) => {
      totalFixed += exp.amount;
      const div = document.createElement("div");
      div.className = "flex justify-between items-center p-2 bg-white/5 rounded border border-white/5 mb-1";
      div.innerHTML = `
        <span class="text-sm">${exp.name}</span>
        <div class="flex items-center gap-3">
          <span class="text-white font-bold">₹${exp.amount}</span>
          <button onclick="removeFixedExpense(${index})" class="text-xs text-red-400 hover:text-red-300"><i class="ph-bold ph-trash"></i></button>
        </div>
      `;
      list.appendChild(div);
    });

    const display = document.getElementById("totalFixedDisplay");
    if (display) display.innerText = `₹${totalFixed}`;
    updateBudgetPreview(totalFixed);
  }
}

window.addFixedExpense = async () => {
  const nameInput = document.getElementById("newExpName");
  const amtInput = document.getElementById("newExpAmount");
  if (!nameInput || !amtInput) return;

  const name = nameInput.value;
  const amount = parseInt(amtInput.value);
  if (name && amount > 0) {
    fixedExpenses.push({ name, amount });
    nameInput.value = "";
    amtInput.value = "";
    renderExpenseModal();
    await saveState();
  }
};

window.removeFixedExpense = async (index) => {
  fixedExpenses.splice(index, 1);
  renderExpenseModal();
  await saveState();
};

function updateBudgetPreview(totalFixed) {
  const limitInput = document.getElementById("monthlyLimitInput");
  const limit = limitInput ? parseInt(limitInput.value) || 0 : monthlyLimit || 0;
  const disposable = limit - totalFixed;

  // --- BUG FIX START ---
  // We use the full days in the month (e.g., 31) to calculate the daily base,
  // rather than the days remaining.
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const dailyBase = Math.floor(disposable / daysInMonth);
  // --- BUG FIX END ---

  let dailyDebt = 0;
  activeLoans.forEach((l) => { if (l.type === "borrow") dailyDebt += l.daily; });

  let dailyGoal = 0;
  activeGoals.forEach((g) => (dailyGoal += g.daily));

  // Calculate final safe spend for the preview
  const finalDaily = Math.max(0, dailyBase - dailyDebt - dailyGoal - dailySpent);

  if (document.getElementById("previewMonthly")) document.getElementById("previewMonthly").innerText = `₹${limit}`;
  if (document.getElementById("previewFixed")) document.getElementById("previewFixed").innerText = `- ₹${totalFixed}`;
  if (document.getElementById("previewDisposable")) document.getElementById("previewDisposable").innerText = `₹${disposable}`;

  // Update the Daily Base text
  if (document.getElementById("previewDailyBase")) document.getElementById("previewDailyBase").innerText = `₹${dailyBase}/day`;

  if (document.getElementById("previewDebtDaily")) document.getElementById("previewDebtDaily").innerText = `- ₹${dailyDebt}/day`;
  if (document.getElementById("previewFinal")) document.getElementById("previewFinal").innerText = `₹${finalDaily}`;
}

const limitInput = document.getElementById("monthlyLimitInput");
if (limitInput) {
  limitInput.addEventListener("input", () => {
    let totalFixed = 0;
    fixedExpenses.forEach((e) => (totalFixed += e.amount));
    updateBudgetPreview(totalFixed);
  });
}

window.saveBudgetSettings = async () => {
  const limitEl = document.getElementById("monthlyLimitInput");
  monthlyLimit = limitEl ? parseInt(limitEl.value) || monthlyLimit : monthlyLimit;
  recalculateDashboard();
  window.toggleExpenseModal(false);
  window.showToast("Budget Updated!");
  await saveState();
};

function recalculateDashboard() {
  let totalFixed = 0;
  fixedExpenses.forEach((e) => (totalFixed += e.amount));
  const disposable = monthlyLimit - totalFixed;

  // --- BUG FIX START ---
  // We now calculate the TOTAL days in the current month (28, 29, 30, or 31)
  // instead of using 'daysRemaining' which caused the logic error on the last day.
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Update the UI text for the date, but we ignore its return value for the math now
  updateDateTracker();

  // Apply User Formula: (MonthlyDisposable / TotalDaysInMonth)
  const dailyBase = Math.floor(disposable / daysInMonth);
  // --- BUG FIX END ---

  let dailyDebt = 0;
  activeLoans.forEach((l) => { if (l.type === "borrow") dailyDebt += l.daily; });

  let dailyGoal = 0;
  activeGoals.forEach((g) => (dailyGoal += g.daily));

  const finalDaily = Math.max(0, dailyBase - dailyDebt - dailyGoal - dailySpent);
  const safeDisplay = document.getElementById("safeSpendAmount");
  if (safeDisplay) safeDisplay.innerText = `₹${finalDaily}`;

  const debtDisplay = document.getElementById("debtDeductionDisplay");
  if (debtDisplay) {
    if (dailyDebt > 0) {
      debtDisplay.style.display = "flex";
      const ddAmount = document.getElementById("debtDeductionAmount");
      if (ddAmount) ddAmount.innerText = `-₹${dailyDebt}/day Debt`;
    } else debtDisplay.style.display = "none";
  }

  const goalDisplay = document.getElementById("goalDeductionDisplay");
  if (goalDisplay) {
    if (dailyGoal > 0) {
      goalDisplay.style.display = "flex";
      const gdAmount = document.getElementById("goalDeductionAmount");
      if (gdAmount) gdAmount.innerText = `-₹${dailyGoal}/day Goals`;
    } else goalDisplay.style.display = "none";
  }
}

// ========================================================================
// SECTION 14: LOANS (Money Borrowed/Lent)
// ========================================================================
// The Loans feature helps you track money owed.
//
// TWO TYPES OF LOANS:
// 1. BORROW (DEBT): Money you owe to someone
//    - Example: Borrowed ₹10,000 from friend for emergency
//    - Shows as RED (debt/negative)
//    
// 2. LEND (ASSET): Money someone owes you
//    - Example: Lent ₹5,000 to roommate for rent
//    - Shows as GREEN (asset/positive)
//
// For each loan, the app calculates:
// - Daily repayment amount (Total / Days)
// - This daily amount is automatically factored into your budget
// ========================================================================

// ========================================================================
// FUNCTION: toggleLoanModal()
// ========================================================================
// WHAT IT DOES:
// Opens or closes the "Add Loan" popup window.
// ========================================================================
window.toggleLoanModal = (show) => {
  const el = document.getElementById("loanModal");
  if (el) el.style.display = show ? "flex" : "none";
};

// ========================================================================
// FUNCTION: setLoanType()
// ========================================================================
// WHAT IT DOES:
// Sets whether this is a BORROW (debt) or LEND (asset) loan.
// Updates button styles to show which option is selected.
//
// VISUAL FEEDBACK:
// - BORROW button turns RED when selected
// - LEND button turns GREEN when selected
// ========================================================================
window.setLoanType = (type, btn) => {
  // Set the hidden input value
  const input = document.getElementById("loanType");
  if (input) input.value = type;

  // Reset all buttons to default style
  const buttons = btn.parentElement.querySelectorAll("button");
  buttons.forEach((b) => b.className = "flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded hover:bg-white/10 text-xs font-bold");

  // Highlight the selected button
  if (type === "borrow") btn.className = "flex-1 py-2 bg-brand-danger/20 text-brand-danger border border-brand-danger/50 rounded hover:bg-brand-danger/30 text-xs font-bold focus:ring-2 ring-brand-danger";
  else btn.className = "flex-1 py-2 bg-brand-accent/20 text-brand-accent border border-brand-accent/50 rounded hover:bg-brand-accent/30 text-xs font-bold focus:ring-2 ring-brand-accent";
};

// Get references to loan calculation input fields
const loanAmountInput = document.getElementById("loanAmount");
const loanDurationInput = document.getElementById("loanDuration");
const loanCalcDisplay = document.getElementById("loanImpactCalc");

// ========================================================================
// FUNCTION: updateLoanCalc()
// ========================================================================
// WHAT IT DOES:
// Calculates daily repayment amount as you type in the loan form.
//
// THE FORMULA:
// Daily Repayment = Total Loan Amount / Days to Repay
//
// EXAMPLE:
// Loan Amount: ₹10,000
// Duration: 50 days
// Daily Repayment: ₹10,000 / 50 = ₹200 per day
//
// This means you need to set aside ₹200 every day to pay back
// the loan on time!
// ========================================================================
function updateLoanCalc() {
  const amt = parseInt(loanAmountInput?.value) || 0;
  const days = parseInt(loanDurationInput?.value) || 0;

  // Only calculate if both values are provided
  if (amt > 0 && days > 0) {
    const daily = (amt / days).toFixed(0);  // Round to nearest rupee
    if (loanCalcDisplay) loanCalcDisplay.innerHTML = `Calculated daily repayment: <span class="font-bold text-white">₹${daily} / day</span>`;
  }
}

// Attach calculator to input fields (updates automatically as you type)
if (loanAmountInput) loanAmountInput.addEventListener("input", updateLoanCalc);
if (loanDurationInput) loanDurationInput.addEventListener("input", updateLoanCalc);

// ========================================================================
// FUNCTION: saveLoan()
// ========================================================================
// WHAT IT DOES:
// Creates a new loan record and adds it to your active loans list.
//
// WHAT GETS SAVED:
// - Type (borrow or lend)
// - Person's name (who you borrowed from / lent to)
// - Total amount
// - Duration (days)
// - Daily repayment amount (calculated automatically)
//
// BUDGET IMPACT:
// If you borrowed money, the daily repayment is automatically deducted
// from your daily safe spending budget!
// ========================================================================
window.saveLoan = async () => {
  // Get values from the form
  const typeInput = document.getElementById("loanType");
  const personInput = document.getElementById("loanPerson");
  const amountInputEl = document.getElementById("loanAmount");
  const durationInputEl = document.getElementById("loanDuration");
  if (!personInput || !amountInputEl || !durationInputEl) return;

  // Create the loan object
  const loan = {
    id: Date.now(),                                                    // Unique ID
    type: typeInput.value,                                             // "borrow" or "lend"
    person: personInput.value,                                         // Person's name
    amount: parseInt(amountInputEl.value),                            // Total amount
    duration: parseInt(durationInputEl.value),                        // Days
    daily: Math.floor(parseInt(amountInputEl.value) / parseInt(durationInputEl.value)),  // Daily repayment
  };

  // Add to active loans list
  activeLoans.push(loan);

  // Update display and close modal
  renderLoans();
  window.toggleLoanModal(false);
  window.showToast("Record Added!");

  // Clear the form
  personInput.value = "";
  amountInputEl.value = "";
  durationInputEl.value = "";

  // Save to Firebase
  await saveState();
};

// ========================================================================
// FUNCTION: renderLoans()
// ========================================================================
// WHAT IT DOES:
// Displays all your active loans on the Loans page.
//
// VISUAL INDICATORS:
// - BORROW (debts): Red color with down arrow ↙️
// - LEND (assets): Green color with up arrow ↗️
//
// EACH LOAN SHOWS:
// - Person's name
// - Total amount
// - Days remaining
// - Daily payment amount
// - Type badge (DEBT or ASSET)
// ========================================================================
function renderLoans() {
  const list = document.getElementById("activeLoansList");
  const noMsg = document.getElementById("noLoansMsg");

  // Hide "no loans" message if there are loans
  if (activeLoans.length > 0 && noMsg) noMsg.style.display = "none";

  if (list) {
    list.innerHTML = "";  // Clear existing list

    // Display each loan
    activeLoans.forEach((loan) => {
      // Set colors and icons based on loan type
      const colorClass = loan.type === "borrow" ? "text-brand-danger" : "text-brand-accent";  // Red or Green
      const icon = loan.type === "borrow" ? "ph-arrow-down-left" : "ph-arrow-up-right";       // ↙️ or ↗️
      const badge = loan.type === "borrow" ? "DEBT" : "ASSET";                                 // Label

      const item = document.createElement("div");
      item.className = "p-4 bg-white/5 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2";
      item.innerHTML = `
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-xl ${colorClass} border border-white/10">
            <i class="ph-bold ${icon}"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h4 class="font-bold text-white">${loan.person}</h4>
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 ${colorClass}">${badge}</span>
            </div>
            <p class="text-xs text-gray-400">Total: ₹${loan.amount} • ${loan.duration} days left</p>
            <p class="text-xs ${colorClass} font-bold mt-1">${loan.type === "borrow" ? "Paying" : "Receiving"} ₹${loan.daily}/day</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="openLoanChat('${loan.person}')" class="px-3 py-2 bg-brand-DEFAULT/10 hover:bg-brand-DEFAULT/20 text-brand-DEFAULT rounded-lg text-xs font-bold border border-brand-DEFAULT/20 flex items-center gap-2 transition">
            <i class="ph-fill ph-chat-centered-text"></i> Chat
          </button>
        </div>
      `;
      list.appendChild(item);
    });
  }
  recalculateDashboard();
}

// ---------- GROUP CREATION ----------
window.toggleContryModal = (show) => {
  const el = document.getElementById("contryModal");
  if (el) el.style.display = show ? "flex" : "none";
};

window.toggleGroupCreator = (show) => {
  const el = document.getElementById("createGroupModal");
  if (el) el.style.display = show ? "flex" : "none";
  if (show) {
    tempMembers = [];
    document.getElementById("tempMemberList").innerHTML = "";
  }
};

window.createNewGroup = async () => {
  const nameInput = document.getElementById("newGroupName");
  if (!nameInput || !nameInput.value) { window.showToast("Group name required"); return; }

  const groupName = nameInput.value.trim();
  activeGroups = activeGroups || {}; // defensive, though we're using groupMembers now

  // Save Group Members separately, keep chatStore[groupName] as messages array
  groupMembers[groupName] = [...tempMembers];

  // initialize messages array
  if (!chatStore[groupName]) chatStore[groupName] = [{
    type: "system",
    text: `Group "${groupName}" created with ${tempMembers.length} members.`,
    timestamp: Date.now()
  }];

  // Add to UI
  const list = document.getElementById("groupList");
  if (list) {
    const newGroup = document.createElement("div");
    newGroup.id = `group-${groupName}`;
    newGroup.className = "p-3 bg-brand-DEFAULT/10 border border-brand-DEFAULT/20 rounded-lg cursor-pointer group-item animate-pulse mb-1";
    newGroup.innerHTML = `
      <div class="flex justify-between items-start">
        <span class="font-bold text-sm">✨ ${groupName}</span>
        <span class="text-[10px] text-gray-400">Just now</span>
      </div>
      <p class="text-xs text-gray-400 mt-1">${tempMembers.length} members</p>
    `;
    newGroup.addEventListener("click", () => window.switchGroup(groupName));
    list.prepend(newGroup);
  }

  window.toggleGroupCreator(false);
  window.showToast(`Squad '${groupName}' created!`);
  nameInput.value = "";

  // persist
  await saveState();
};

// ---------- CHAT: rendering helpers ----------
function renderChatMessage(msg, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const isMe = user && msg.userId === user.uid;
  const div = document.createElement("div");
  div.className = `flex w-full mb-4 ${isMe ? "justify-end" : "justify-start"}`;
  div.innerHTML = `
    <div class="chat-bubble ${isMe ? "chat-mine" : "chat-theirs"}">
      ${!isMe ? `<div class="text-[10px] opacity-50 mb-1 font-bold">${msg.author || "Anon"}</div>` : ""}
      ${msg.text}
      <div class="text-[9px] opacity-50 mt-1 text-right">${new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  `;
  container.appendChild(div);
}

window.sendChat = async () => {
  const input = document.getElementById("chatInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  // Prefer server write if possible
  if (typeof db !== "undefined" && typeof user !== "undefined" && user) {
    // If you want to keep server chat as well, earlier version used artifacts collection.
    // We'll still push locally and rely on server-side rules / cloud writes if configured.
    // For now: local push + saveState
  }

  const msg = { text, userId: user ? user.uid : "local", author: "You", timestamp: Date.now(), isMe: true };
  if (!chatStore[currentChatId]) chatStore[currentChatId] = [];
  chatStore[currentChatId].push(msg);

  renderChatHistory(currentChatId);
  await saveState();
};

// ---------- MINI FEED & MOCKS ----------
function updateMiniFeed(messages) {
  const feed = document.getElementById("miniFeed");
  if (!feed) return;
  feed.innerHTML = "";
  messages.slice(-3).reverse().forEach((msg) => {
    feed.innerHTML += `
      <div class="flex gap-3 items-center p-2 rounded-lg hover:bg-white/5 transition">
        <div class="w-8 h-8 rounded-full bg-brand-DEFAULT/20 text-brand-DEFAULT flex items-center justify-center font-bold text-xs">${msg.author ? msg.author[0] : "A"}</div>
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate text-gray-300">${msg.text}</p>
          <p class="text-[10px] text-gray-600">${msg.author || "Anon"} • Just now</p>
        </div>
      </div>`;
  });
}

function mockRealtimeChat() {
  const mocks = [{ text: "Just bought a Burger! 🍔", author: "Rahul", timestamp: Date.now() }];
  const container = document.getElementById("chatContainer");
  if (!container || container.children.length > 1) return;
  mocks.forEach((m) => {
    m.userId = "other";
    renderChatMessage(m, "chatContainer");
  });
  updateMiniFeed(mocks);
}

// ========================================================================
// SECTION 15: CHARTS & DATA VISUALIZATION
// ========================================================================
// The app uses Chart.js library to create beautiful, interactive charts
// that help you visualize spending patterns.
//
// WHY VISUALIZE DATA?
// - Makes patterns obvious at a glance
// - Helps identify problem areas
// - More engaging than just numbers
// ========================================================================

// ========================================================================
// FUNCTION: initChart()
// ========================================================================
// WHAT IT DOES:
// Creates the category spending chart (doughnut/pie chart).
//
// DISPLAYS:
// How much you spent in each category (Food, Transport, Bills, etc.)
// as colorful slices in a circular chart.
//
// COLORS:
// - Purple: Food
// - Green: Transport
// - Dark: Bills
// ========================================================================
function initChart() {
  const ctx = document.getElementById("categoryChart");
  if (!ctx) return;  // Exit if chart element doesn't exist

  // Destroy old chart if it exists (prevents duplicates)
  if (categoryChartInstance) categoryChartInstance.destroy();

  // Create new doughnut chart
  categoryChartInstance = new Chart(ctx.getContext("2d"), {
    type: "doughnut",  // Circular chart with hole in middle
    data: { labels: ["Food", "Transport", "Bills"], datasets: [{ data: [45, 30, 25], backgroundColor: ["#8B5CF6", "#00ff95", "#1f1f1f"], borderWidth: 0, hoverOffset: 4 }] },
    options: { cutout: "75%", responsive: true, maintainAspectRatio: false, animation: { duration: 800 }, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
  });
}

// ========================================================================
// SECTION 16: APP BOOTSTRAP & INITIALIZATION
// ========================================================================
// This section runs when the app first loads. It's like the "startup
// sequence" that gets everything ready to use.
//
// WHAT HAPPENS:
// 1. Wait for Firebase to load user data
// 2. Copy cloud data to local memory
// 3. Initialize the UI
// 4. Start the app!
// ========================================================================

// ========================================================================
// EVENT: firestore-ready
// ========================================================================
// WHAT IT DOES:
// This code runs when Firebase finishes loading your data from the cloud.
//
// ANALOGY:
// Like waiting for your files to download before opening them. You can't
// work with your data until it's loaded from the cloud!
//
// PROCESS:
// 1. Firestore downloads your data → "firestore-ready" event fires
// 2. Copy data from window.userData to local variables
// 3. Set up default groups if they don't exist
// 4. Call initApp() to start the app
// ========================================================================
window.addEventListener("firestore-ready", () => {
  try {
    // Get user data loaded by Firebase (firebase-init.js)
    const ud = window.userData || {};

    // Copy user profile data
    userProfile = {
      name: ud.name || ud.displayName || "User",
      phone: ud.phone || "",
      avatar: ud.avatar || ud.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
    };

    // Copy all app data arrays from cloud to local variables
    transactions = ud.transactions || [];                    // All purchases
    fixedExpenses = ud.fixedExpenses || [];                 // Monthly bills
    activeGoals = ud.goals || ud.activeGoals || [];         // Savings goals
    activeLoans = ud.loans || ud.activeLoans || [];         // Money borrowed/lent
    chatStore = ud.chatGroups || {};                        // Group chats
    groupMembers = ud.groupMembers || {};                   // Group member lists
    monthlyLimit = ud.monthlyLimit !== undefined ? ud.monthlyLimit : 0;  // Budget limit

    // Ensure default "Roommates" group exists
    if (!chatStore["Roommates"]) chatStore["Roommates"] = [];
    if (!groupMembers["Roommates"]) groupMembers["Roommates"] = [];

    // Start the app UI!
    initApp();
  } catch (e) {
    // If something goes wrong, still try to start the app
    console.error("Error during firestore-ready handling:", e);
    initApp(); // Fallback - show UI even if data loading failed
  }
});

// ========================================================================
// EXPOSE FUNCTIONS FOR DEBUGGING
// ========================================================================
// These lines make certain functions available in the browser console
// for testing and debugging. Developers can call these manually if needed.
// ========================================================================
window.saveState = saveState;
window.initApp = initApp;
window.recalculateDashboard = recalculateDashboard;

// Expose the Transaction Center functions to the HTML
window.switchSection = switchSection;
window.renderHeatmap = renderHeatmap;
window.renderFullTransactions = renderFullTransactions;
window.addQuickExpense = addQuickExpense;

// ========================================================================
// END OF DASHBOARD.JS
// ========================================================================
// 🎉 This file contains the complete application logic for the Spendly
// money management dashboard!
//
// ALL FEATURES:
// ✅ Transaction tracking with heatmap calendar
// ✅ Smart budgeting with daily safe spending
// ✅ Savings goals with automatic calculations
// ✅ Loans management (borrowed/lent tracking)
// ✅ Group chat & bill splitting with friends
// ✅ Sentiment analysis (worthy/regret spending tracking)
// ✅ Profile management with avatar customization
// ✅ Real-time Firebase sync across devices
// ✅ Beautiful charts and visualizations
//
// The code has been comprehensively documented with beginner-friendly
// comments, real-world examples, and step-by-step explanations to make
// it understandable even for non-programmers!
//
// Total lines: 2000+ (including 1,600+ lines of detailed documentation)
// ========================================================================
