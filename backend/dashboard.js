/* dashboard.js — Cleaned & Firestore-ready (Version 2)
   Assumes:
   - firebase initialization & window.userData/window._uid/window.syncUserData dispatched via dashboard.html
   - A "firestore-ready" window event will be fired when user data has been loaded into window.userData
*/

// ---------- STATE ----------
// use firebase objects from global scope
const auth = window._auth;
const db = window._db;
const user = () => window._uid;
const appId = "spendly-hackathon-v1";
window.userData = window.userData || {};


let categoryChartInstance = null;
let sentimentChartInstance = null;

// Core application state (empty until Firestore populates)
let userProfile = {};
let transactions = [];
let fixedExpenses = [];
let activeGoals = [];
let activeLoans = [];
let chatStore = {};        // chatStore[groupName] = [ messageObj, ... ]
let groupMembers = {};     // groupMembers[groupName] = [ {name, phone, email}, ... ]

// UI state
let monthlyLimit = 30000;
let dailySpent = 0;
let currentFilter = "month";
let currentChatId = "Roommates";
let tempMembers = [];

// ---------- UTILITY: Save to Firestore ----------
/**
 * saveState()
 * - Copies current in-memory state into window.userData
 * - Calls window.syncUserData() if available to persist in Firestore
 */
async function saveState() {
  try {
    // ensure global userData exists
    window.userData = window.userData || {};

    window.userData.name = userProfile.name || window.userData.name || "User";
    window.userData.phone = userProfile.phone || window.userData.phone || "";
    window.userData.avatar = userProfile.avatar || window.userData.avatar || "";

    window.userData.transactions = transactions || [];
    window.userData.fixedExpenses = fixedExpenses || [];
    window.userData.goals = activeGoals || [];
    window.userData.loans = activeLoans || [];
    window.userData.chatGroups = chatStore || {};
    window.userData.groupMembers = groupMembers || {};

    // if sync function exists (provided in dashboard.html), call it
    if (typeof window.syncUserData === "function") {
      await window.syncUserData();
    } else {
      console.debug("syncUserData() not available — state updated locally.");
    }
  } catch (err) {
    console.error("Failed to save state:", err);
  }
}

// ---------- CORE APP INITIALIZER (UI rendering only) ----------
async function initApp() {
  try {
    // 1. RENDER UI IMMEDIATELY (these functions exist in your original file)
    updateDateTracker();
    initChart();
    renderExpenseModal();
    renderTransactions();
    renderRecentTransactionsWidget();
    recalculateDashboard();

    // ensure we have a default chat group
    if (!chatStore["Roommates"]) chatStore["Roommates"] = [];
    if (!groupMembers["Roommates"]) groupMembers["Roommates"] = [];

    renderChatHistory("Roommates");
    updateProfileUI();
    renderHeatmap();
  } catch (e) {
    console.error("Critical App Error in initApp:", e);
  }
}

// ---------- DATE TRACKER ----------
function updateDateTracker() {
  const now = new Date();
  const monthNames = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
  ];
  const day = now.getDate();
  const month = monthNames[now.getMonth()];
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - day;

  const trackerEl = document.getElementById("liveDateTracker");
  if (trackerEl) trackerEl.innerText = `${month} ${day} • ${daysLeft} Days Left`;

  return daysLeft || 1;
}

// ---------- HEATMAP ----------
function renderHeatmap() {
  const grid = document.getElementById("heatmapGrid");
  if (!grid) return;

  grid.innerHTML = "";
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();

  const spendingMap = {};
  transactions.forEach((tx) => {
    const d = new Date(tx.timestamp || tx.date ? tx.timestamp || Date.now() : Date.now());
    if (d.getMonth() === month && d.getFullYear() === year) {
      const dayKey = d.getDate();
      spendingMap[dayKey] = (spendingMap[dayKey] || 0) + (tx.amount || 0);
    }
  });

  for (let i = 0; i < startDay; i++) {
    const empty = document.createElement("div");
    empty.className = "heatmap-cell";
    grid.appendChild(empty);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const amount = spendingMap[i] || 0;
    let colorClass = "bg-white/5 border border-white/5";
    if (amount > 0) colorClass = "bg-brand-accent/40 border border-brand-accent/50";
    if (amount >= 500) colorClass = "bg-brand-warning/60 border border-brand-warning/50";
    if (amount >= 2000) colorClass = "bg-brand-danger border border-brand-danger/50";
    const cell = document.createElement("div");
    cell.className = `heatmap-cell ${colorClass}`;
    cell.innerText = i;
    cell.title = `Day ${i}: ₹${amount}`;
    cell.onclick = () => window.showToast(`Day ${i}: Spent ₹${amount}`);
    grid.appendChild(cell);
  }
}

// ---------- PROFILE ----------
window.toggleProfileModal = (show) => {
  const el = document.getElementById("profileModal");
  if (el) el.style.display = show ? "flex" : "none";
  if (show) {
    document.getElementById("profileName").value = userProfile.name || "";
    document.getElementById("profilePhone").value = userProfile.phone || "";
    document.getElementById("modalAvatar").src = userProfile.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=default";
  }
};

window.randomizeAvatar = () => {
  const seed = Math.random().toString(36).substring(7);
  const newAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  const avatarEl = document.getElementById("modalAvatar");
  if (avatarEl) avatarEl.src = newAvatar;
  userProfile.tempAvatar = newAvatar;
};

window.saveProfile = async () => {
  const name = document.getElementById("profileName").value;
  const phone = document.getElementById("profilePhone").value;

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

function updateProfileUI() {
  const nameEl = document.getElementById("sidebarName");
  const avatarEl = document.getElementById("sidebarAvatar");
  if (nameEl) nameEl.innerText = userProfile.name || "User";
  if (avatarEl) avatarEl.src = userProfile.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=default";
}

// ---------- RECENT TRANSACTIONS ----------
function renderRecentTransactionsWidget() {
  const list = document.getElementById("miniTransactionList");
  if (!list) return;
  list.innerHTML = "";

  const recent = transactions.slice(0, 4);
  if (recent.length === 0) {
    list.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">No recent activity</p>';
    return;
  }

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

// ---------- GOALS ----------
window.toggleGoalModal = (show) => {
  const el = document.getElementById("goalModal");
  if (el) el.style.display = show ? "flex" : "none";
};

function updateGoalCalc() {
  const amt = parseInt(document.getElementById("goalAmount")?.value || 0);
  const dateStr = document.getElementById("goalDate")?.value;
  if (amt > 0 && dateStr) {
    const targetDate = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(targetDate - today);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      const daily = (amt / diffDays).toFixed(0);
      const display = document.getElementById("goalImpactCalc");
      if (display) display.innerHTML = `Daily Deduction: <span class="font-bold text-white">₹${daily} / day</span> (${diffDays} days)`;
    }
  }
}
document.getElementById("goalAmount")?.addEventListener("input", updateGoalCalc);
document.getElementById("goalDate")?.addEventListener("change", updateGoalCalc);

window.saveGoal = async () => {
  const nameInput = document.getElementById("goalName");
  const amountInput = document.getElementById("goalAmount");
  const dateInput = document.getElementById("goalDate");

  if (!nameInput.value || !amountInput.value || !dateInput.value) {
    window.showToast("Please fill all details");
    return;
  }

  const targetDate = new Date(dateInput.value);
  const today = new Date();
  const diffTime = Math.abs(targetDate - today);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  const daily = Math.ceil(parseInt(amountInput.value) / diffDays);

  const goal = {
    id: Date.now(),
    name: nameInput.value,
    amount: parseInt(amountInput.value),
    deadline: dateInput.value,
    daily: daily,
    daysLeft: diffDays,
  };

  activeGoals.push(goal);
  renderGoals();
  window.toggleGoalModal(false);
  window.showToast("Goal Set! Budget Adjusted.");

  nameInput.value = "";
  amountInput.value = "";
  dateInput.value = "";

  // persist
  await saveState();
};

window.removeGoal = async (id) => {
  activeGoals = activeGoals.filter((g) => g.id !== id);
  renderGoals();
  window.showToast("Goal removed");

  await saveState();
};

function renderGoals() {
  const list = document.getElementById("goalsList");
  if (!list) return;

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

// ---------- SQUAD & CHAT ----------
window.handleAddMember = () => {
  const nameInput = document.getElementById("newMemberName");
  const phoneInput = document.getElementById("newMemberPhone");
  const emailInput = document.getElementById("newMemberEmail");

  if (nameInput.value && phoneInput.value) {
    const newMember = { name: nameInput.value, phone: phoneInput.value, email: emailInput.value };
    tempMembers.push(newMember);

    const list = document.getElementById("tempMemberList");
    list.innerHTML += `<div class="flex justify-between items-center p-2 bg-white/5 rounded border border-white/5 text-xs"><span>${newMember.name}</span><span class="text-gray-400">${newMember.phone}</span></div>`;

    nameInput.value = "";
    phoneInput.value = "";
    emailInput.value = "";
  } else {
    window.showToast("Name and Phone required");
  }
};

window.switchGroup = (chatId) => {
  currentChatId = chatId;
  const nameEl = document.getElementById("currentGroupName");
  if (nameEl) nameEl.innerText = chatId;

  document.querySelectorAll(".group-item").forEach((el) => el.classList.remove("active"));
  let activeItem = document.getElementById(`group-${chatId}`) || document.getElementById(`group-dm-${chatId}`);
  if (activeItem) activeItem.classList.add("active");

  renderChatHistory(chatId);
};

function renderChatHistory(chatId) {
  const container = document.getElementById("squadChatContainer");
  if (!container) return;
  container.innerHTML = "";

  const messages = chatStore[chatId] || [];

  if (messages.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-gray-500 text-xs">Start a conversation with ${chatId}</div>`;
    return;
  }

  messages.forEach((msg) => {
    if (msg.type === "split") {
      renderSquadSplitDOM(msg, container);
    } else if (msg.type === "system") {
      container.insertAdjacentHTML("beforeend", `<div class="flex w-full justify-center my-4"><span class="text-[10px] bg-white/10 px-3 py-1 rounded-full text-gray-400">${msg.text}</span></div>`);
    } else {
      renderSquadMessageDOM(msg, container);
    }
  });

  container.scrollTop = container.scrollHeight;
}

function renderSquadMessageDOM(msg, container) {
  const isMe = msg.isMe;
  container.insertAdjacentHTML("beforeend",
    `<div class="flex w-full mb-4 ${isMe ? "justify-end" : "justify-start"}">
      <div class="chat-bubble ${isMe ? "chat-mine" : "chat-theirs"}">
        ${!isMe ? `<div class="text-[10px] opacity-50 mb-1 font-bold text-pink-400">${msg.author}</div>` : ""}
        ${msg.text}
      </div>
    </div>`);
}

function renderSquadSplitDOM(msg, container) {
  const html = `<div class="flex w-full justify-end mb-4"><div class="chat-bubble chat-mine !p-0 overflow-hidden border-0"><div class="bg-brand-dark p-3 min-w-[220px]"><div class="flex justify-between items-start mb-2 border-b border-white/10 pb-2"><div><div class="text-[10px] text-white/60 uppercase tracking-widest">You requested</div><div class="font-bold text-white flex items-center gap-2">${msg.item}</div></div><div class="text-xl font-black text-white">₹${msg.amount}</div></div><div class="text-xs text-gray-300 mb-2">Waiting for others...</div></div></div></div>`;
  container.insertAdjacentHTML("beforeend", html);
}

window.sendSquadChat = async () => {
  const input = document.getElementById("squadInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

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

// ---------- SPENDING ANALYSIS ----------
window.toggleSpendingDetails = (show) => {
  const el = document.getElementById("spendingDetailsModal");
  if (el) el.style.display = show ? "flex" : "none";
  if (show) window.applyDateFilter("month");
};

window.applyDateFilter = (period) => {
  currentFilter = period;
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.className = `filter-btn text-xs px-3 py-1.5 rounded-md transition text-gray-400 hover:text-white`;
    if (btn.id === `filter-${period}`) btn.className = `filter-btn active text-xs px-3 py-1.5 rounded-md bg-brand-DEFAULT text-white shadow-lg transition`;
  });
  updateSentimentAnalysis();
  filterSentiment("all");
};

function getFilteredTransactions() {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return transactions.filter((t) => {
    const diff = now - (t.timestamp || Date.now());
    if (currentFilter === "day") return diff < oneDayMs;
    if (currentFilter === "week") return diff < oneDayMs * 7;
    if (currentFilter === "month") return diff < oneDayMs * 30;
    return true;
  });
}

function updateSentimentAnalysis() {
  const filteredTx = getFilteredTransactions();
  let worthy = 0, regret = 0, ignore = 0;
  filteredTx.forEach((tx) => {
    if (tx.sentiment === "worthy") worthy += tx.amount || 0;
    else if (tx.sentiment === "regret") regret += tx.amount || 0;
    else ignore += tx.amount || 0;
  });
  const total = worthy + regret + ignore;

  const elTotal = document.getElementById("analysisTotal");
  if (elTotal) elTotal.innerText = `₹${total}`;
  const elWorthy = document.getElementById("totalWorthy");
  if (elWorthy) elWorthy.innerText = `₹${worthy}`;
  const elRegret = document.getElementById("totalRegret");
  if (elRegret) elRegret.innerText = `₹${regret}`;
  const elIgnore = document.getElementById("totalIgnore");
  if (elIgnore) elIgnore.innerText = `₹${ignore}`;

  const ctx = document.getElementById("sentimentChart");
  if (ctx) {
    if (sentimentChartInstance) sentimentChartInstance.destroy();
    sentimentChartInstance = new Chart(ctx.getContext("2d"), {
      type: "doughnut",
      data: { labels: ["Worthy", "Regret", "Ignore"], datasets: [{ data: [worthy, regret, ignore], backgroundColor: ["#00ff95", "#ff4b4b", "#555555"], borderWidth: 0, hoverOffset: 10 }] },
      options: { cutout: "70%", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
}

window.filterSentiment = (type) => {
  const list = document.getElementById("drillDownList");
  const title = document.getElementById("drillDownTitle");
  if (!list) return;
  list.innerHTML = "";

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

  const daysRemaining = updateDateTracker();
  const dailyBase = Math.floor(disposable / daysRemaining);

  let dailyDebt = 0;
  activeLoans.forEach((l) => { if (l.type === "borrow") dailyDebt += l.daily; });

  let dailyGoal = 0;
  activeGoals.forEach((g) => (dailyGoal += g.daily));

  const finalDaily = Math.max(0, dailyBase - dailyDebt - dailyGoal - dailySpent);

  if (document.getElementById("previewMonthly")) document.getElementById("previewMonthly").innerText = `₹${limit}`;
  if (document.getElementById("previewFixed")) document.getElementById("previewFixed").innerText = `- ₹${totalFixed}`;
  if (document.getElementById("previewDisposable")) document.getElementById("previewDisposable").innerText = `₹${disposable}`;
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
  const daysRemaining = updateDateTracker();
  const dailyBase = Math.floor(disposable / daysRemaining);

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

// ---------- LOANS ----------
window.toggleLoanModal = (show) => {
  const el = document.getElementById("loanModal");
  if (el) el.style.display = show ? "flex" : "none";
};

window.setLoanType = (type, btn) => {
  const input = document.getElementById("loanType");
  if (input) input.value = type;
  const buttons = btn.parentElement.querySelectorAll("button");
  buttons.forEach((b) => b.className = "flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded hover:bg-white/10 text-xs font-bold");

  if (type === "borrow") btn.className = "flex-1 py-2 bg-brand-danger/20 text-brand-danger border border-brand-danger/50 rounded hover:bg-brand-danger/30 text-xs font-bold focus:ring-2 ring-brand-danger";
  else btn.className = "flex-1 py-2 bg-brand-accent/20 text-brand-accent border border-brand-accent/50 rounded hover:bg-brand-accent/30 text-xs font-bold focus:ring-2 ring-brand-accent";
};

const loanAmountInput = document.getElementById("loanAmount");
const loanDurationInput = document.getElementById("loanDuration");
const loanCalcDisplay = document.getElementById("loanImpactCalc");
function updateLoanCalc() {
  const amt = parseInt(loanAmountInput?.value) || 0;
  const days = parseInt(loanDurationInput?.value) || 0;
  if (amt > 0 && days > 0) {
    const daily = (amt / days).toFixed(0);
    if (loanCalcDisplay) loanCalcDisplay.innerHTML = `Calculated daily repayment: <span class="font-bold text-white">₹${daily} / day</span>`;
  }
}
if (loanAmountInput) loanAmountInput.addEventListener("input", updateLoanCalc);
if (loanDurationInput) loanDurationInput.addEventListener("input", updateLoanCalc);

window.saveLoan = async () => {
  const typeInput = document.getElementById("loanType");
  const personInput = document.getElementById("loanPerson");
  const amountInputEl = document.getElementById("loanAmount");
  const durationInputEl = document.getElementById("loanDuration");
  if (!personInput || !amountInputEl || !durationInputEl) return;

  const loan = {
    id: Date.now(),
    type: typeInput.value,
    person: personInput.value,
    amount: parseInt(amountInputEl.value),
    duration: parseInt(durationInputEl.value),
    daily: Math.floor(parseInt(amountInputEl.value) / parseInt(durationInputEl.value)),
  };

  activeLoans.push(loan);
  renderLoans();
  window.toggleLoanModal(false);
  window.showToast("Record Added!");

  personInput.value = "";
  amountInputEl.value = "";
  durationInputEl.value = "";

  await saveState();
};

function renderLoans() {
  const list = document.getElementById("activeLoansList");
  const noMsg = document.getElementById("noLoansMsg");
  if (activeLoans.length > 0 && noMsg) noMsg.style.display = "none";

  if (list) {
    list.innerHTML = "";
    activeLoans.forEach((loan) => {
      const colorClass = loan.type === "borrow" ? "text-brand-danger" : "text-brand-accent";
      const icon = loan.type === "borrow" ? "ph-arrow-down-left" : "ph-arrow-up-right";
      const badge = loan.type === "borrow" ? "DEBT" : "ASSET";

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

// ---------- CHARTS ----------
function initChart() {
  const ctx = document.getElementById("categoryChart");
  if (!ctx) return;
  if (categoryChartInstance) categoryChartInstance.destroy();

  categoryChartInstance = new Chart(ctx.getContext("2d"), {
    type: "doughnut",
    data: { labels: ["Food", "Transport", "Bills"], datasets: [{ data: [45, 30, 25], backgroundColor: ["#8B5CF6", "#00ff95", "#1f1f1f"], borderWidth: 0, hoverOffset: 4 }] },
    options: { cutout: "75%", responsive: true, maintainAspectRatio: false, animation: { duration: 800 }, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
  });
}

// ---------- BOOTSTRAP: wait for Firestore data ----------
window.addEventListener("firestore-ready", () => {
  try {
    // initialize local state from window.userData (if present)
    const ud = window.userData || {};
    userProfile = {
      name: ud.name || ud.displayName || "User",
      phone: ud.phone || "",
      avatar: ud.avatar || ud.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
    };

    transactions = ud.transactions || [];
    fixedExpenses = ud.fixedExpenses || [];
    activeGoals = ud.goals || ud.activeGoals || [];
    activeLoans = ud.loans || ud.activeLoans || [];
    chatStore = ud.chatGroups || ud.chatGroups || {};
    groupMembers = ud.groupMembers || {};

    // ensure the default group exists
    if (!chatStore["Roommates"]) chatStore["Roommates"] = [];
    if (!groupMembers["Roommates"]) groupMembers["Roommates"] = [];

    // run app UI init
    initApp();
  } catch (e) {
    console.error("Error during firestore-ready handling:", e);
    initApp(); // fallback to init even on error so UI doesn't stay blank
  }
});
// Expose useful internals for debugging and manual testing
window.saveState = saveState;
window.initApp = initApp;
window.recalculateDashboard = recalculateDashboard;

