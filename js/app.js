// Application Constants
const DEFAULT_USERS = ['BAHU', 'MONTY', 'BACON', 'KOLAYA', 'HOCKMAN', 'TASK'];
let USERS = [...DEFAULT_USERS];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

window.currentlyOpenAccordion = null;

// Global State
let state = {
    balances: {},
    transactions: [],
    mealCounts: {},
    mealSchedule: {},
    costPerMeal: 0,
    activityLog: [],
    guests: []
};

// Undo System
let undoStack = [];
const MAX_UNDO = 5;

function pushUndo(actionLabel) {
    undoStack.push({ label: actionLabel, snapshot: JSON.parse(JSON.stringify(state)) });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    showUndoButton(actionLabel);
}

function showUndoButton(label) {
    const container = document.getElementById('undo-container');
    if (!container) return;
    container.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'undo-floating';
    btn.innerHTML = `<i class="fas fa-rotate-left"></i> Undo: ${label}`;
    btn.onclick = () => undoLastAction();
    container.appendChild(btn);
    // Auto-hide after 6 seconds
    setTimeout(() => { if (container.firstChild === btn) container.innerHTML = ''; }, 6000);
}

window.undoLastAction = function() {
    if (undoStack.length === 0) return showNotification('Nothing to undo!', 'error');
    const entry = undoStack.pop();
    state = entry.snapshot;
    saveData();
    recalculateBalances(true, true, false);
    showNotification(`Undone: ${entry.label}`, 'info');
    document.getElementById('undo-container').innerHTML = '';
}

// Theme Toggle
window.toggleTheme = function() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem('hostel_theme', next);
    updateThemeIcon(next);
}

function loadTheme() {
    const saved = localStorage.getItem('hostel_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerHTML = theme === 'light' ? '<i class="fas fa-sun" style="color:#ffb300"></i>' : '<i class="fas fa-moon"></i>';
}

// Weekly Reset
window.resetWeeklyMeals = function() {
    if (!confirm('⚠️ Are you sure you want to RESET all meals for the week?\n\nThis will clear all meal ticks (common & personal).\nTransactions and balances will be recalculated.')) return;
    pushUndo('Weekly Reset');
    USERS.forEach(u => {
        if (state.mealSchedule[u]) {
            DAYS.forEach(d => {
                state.mealSchedule[u][d] = { B: false, L: false, D: false };
            });
        }
    });
    recalculateBalances(true);
    logActivity('Weekly meals reset');
    showNotification('Weekly meals have been reset! 🔄', 'success');
}

// Guest Member Management
window.addGuestMember = function() {
    const input = document.getElementById('guest-name-input');
    if (!input) return;
    const name = input.value.trim().toUpperCase();
    if (!name) return showNotification('Please enter a name!', 'error');
    if (USERS.includes(name)) return showNotification(`${name} already exists!`, 'error');
    
    pushUndo('Add Guest');
    state.guests.push(name);
    USERS.push(name);
    
    state.mealSchedule[name] = {};
    DAYS.forEach(d => { state.mealSchedule[name][d] = { B: false, L: false, D: false }; });
    state.balances[name] = 0;
    state.mealCounts[name] = 0;
    
    saveData();
    logActivity(`Guest "${name}" added`);
    input.value = '';
    renderGuestList();
    showNotification(`Guest ${name} added! 🎉`, 'success');
}

window.removeGuestMember = function(name) {
    if (!confirm(`Remove guest "${name}"? This will delete all their meal data.`)) return;
    pushUndo('Remove Guest');
    state.guests = state.guests.filter(g => g !== name);
    USERS = USERS.filter(u => u !== name);
    delete state.mealSchedule[name];
    delete state.balances[name];
    delete state.mealCounts[name];
    state.transactions.forEach(tx => {
        if (tx.splitAmong) tx.splitAmong = tx.splitAmong.filter(u => u !== name);
    });
    saveData();
    recalculateBalances(true);
    logActivity(`Guest "${name}" removed`);
    renderGuestList();
    showNotification(`Guest ${name} removed.`, 'info');
}

function renderGuestList() {
    const container = document.getElementById('guest-list');
    if (!container) return;
    container.innerHTML = '';
    if (state.guests.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center;">No guests added yet.</p>';
        return;
    }
    state.guests.forEach(g => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.04); border-radius:10px; border:1px solid var(--glass-border);';
        item.innerHTML = `
            <span style="font-weight:700; color:var(--text-primary);"><i class="fas fa-user-plus" style="color:var(--color-accent); margin-right:8px;"></i>${g}</span>
            <button onclick="removeGuestMember('${g}')" style="background:rgba(255,7,58,0.15); border:none; color:var(--color-negative); padding:6px 12px; border-radius:8px; font-weight:700; font-size:0.8rem; cursor:pointer;"><i class="fas fa-trash"></i></button>
        `;
        container.appendChild(item);
    });
}

function loadGuests() {
    if (state.guests && state.guests.length > 0) {
        state.guests.forEach(g => { if (!USERS.includes(g)) USERS.push(g); });
    }
}

// Activity Feed
function logActivity(action) {
    if (!state.activityLog) state.activityLog = [];
    state.activityLog.unshift({ action, time: new Date().toISOString() });
    if (state.activityLog.length > 50) state.activityLog = state.activityLog.slice(0, 50);
    saveData();
}

// Transaction Comments
window.addComment = function(txId) {
    const input = document.getElementById(`comment-input-${txId}`);
    if (!input || !input.value.trim()) return;
    const tx = state.transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!tx.comments) tx.comments = [];
    tx.comments.push({ text: input.value.trim(), time: new Date().toISOString() });
    saveData();
    input.value = '';
    renderHistory();
    logActivity(`Comment added on "${tx.desc || tx.type}"`);
}
// ==========================================
// Initialization & Boot
// ==========================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('btn-install');
    if (installBtn) installBtn.style.display = 'inline-block';
});

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
    // Setup Install Button
    const installBtn = document.getElementById('btn-install');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') installBtn.style.display = 'none';
                deferredPrompt = null;
            }
        });
    }
});

function initApp() {
    loadTheme();
    loadData();
    loadGuests();
    setupNavigation();
    setupForms();
    renderDashboard();
    renderHistory();
    
    document.getElementById('btn-export').addEventListener('click', () => {
        exportData();
    });
}

function loadData() {
    if (!window.db) {
        console.log("No Firebase Instance found. Using Local Storage.");
        loadLocalData(false);
        return;
    }

    const docRef = window.db.collection("hostel").doc("main_state");
    docRef.onSnapshot((docSnap) => {
        try {
            if (docSnap.exists) {
                state = docSnap.data();
                if (!state.mealCounts) state.mealCounts = {};
                if (!state.mealSchedule) state.mealSchedule = {};
                if (!state.transactions) state.transactions = [];
                USERS.forEach(u => {
                    if(!state.mealCounts[u]) state.mealCounts[u] = 0;
                    if(!state.mealSchedule[u]) {
                        state.mealSchedule[u] = {};
                        DAYS.forEach(d => state.mealSchedule[u][d] = { B: false, L: false, D: false });
                    }
                });
                // Recalculate balances but DO NOT save back to DB to prevent infinite trigger loops
                recalculateBalances(true, true, false); 
            } else {
                console.log("Firestore empty. Migrating from local...");
                loadLocalData(true); 
                saveData(); 
            }
        } catch(e) {
            console.error("Error processing Snapshot:", e);
            if(Object.keys(state.balances).length === 0) loadLocalData(false);
        }
    }, (error) => {
        console.error("Firestore error:", error);
        showNotification("Failed to connect to real-time database.", "error");
        loadLocalData(false);
    });
}

function loadLocalData(migrating = false) {
    const saved = localStorage.getItem('hostel_data');
    if (saved) {
        state = JSON.parse(saved);
        if (!state.mealCounts) state.mealCounts = {};
        if (!state.mealSchedule) state.mealSchedule = {};
        USERS.forEach(u => {
            if(!state.mealCounts[u]) state.mealCounts[u] = 0;
            if(!state.mealSchedule[u]) {
                state.mealSchedule[u] = {};
                DAYS.forEach(d => state.mealSchedule[u][d] = { B: false, L: false, D: false });
            }
        });
        state.transactions = state.transactions.filter(tx => tx.type !== 'meal');
    } else {
        state.mealCounts = {};
        state.mealSchedule = {};
        USERS.forEach(u => {
            state.balances[u] = 0;
            state.mealCounts[u] = 0;
            state.mealSchedule[u] = {};
            DAYS.forEach(d => state.mealSchedule[u][d] = { B: false, L: false, D: false });
        });
    }

    if (!migrating) {
        recalculateBalances(false, true, false);
    }
}

function saveData() {
    localStorage.setItem('hostel_data', JSON.stringify(state));
    if (window.db) {
        const docRef = window.db.collection("hostel").doc("main_state");
        docRef.set(state).catch(e => {
            console.error("Error writing to Firestore", e);
            showNotification("Database Error! Please check your Firebase Rules.", "error");
        });
    }
}

function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const dt = document.createElement('a');
    dt.setAttribute("href", dataStr);
    dt.setAttribute("download", "hostel_backup_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(dt);
    dt.click();
    dt.remove();
    showNotification("Data exported successfully!", "success");
}

function recalculateBalances(triggerRenders = true, renderMeals = true, shouldSave = true) {
    let groceryTotal = 0;
    state.transactions.forEach(tx => {
        if (tx.type === 'grocery') {
            // Only add to groceryTotal if it's for everyone (splitAmong is empty or includes everyone)
            if (!tx.splitAmong || tx.splitAmong.length === 0 || tx.splitAmong.length === USERS.length) {
                groceryTotal += tx.amount;
            }
        }
    });

    let totalMeals = 0;
    USERS.forEach(user => { 
        let userTotal = 0;
        if(state.mealSchedule && state.mealSchedule[user]) {
            DAYS.forEach(d => {
                ['B', 'L', 'D'].forEach(m => {
                    if (state.mealSchedule[user][d][m] === true) userTotal++;
                });
            });
        }
        state.mealCounts[user] = userTotal;
        totalMeals += userTotal; 
    });

    let costPerMeal = totalMeals > 0 ? groceryTotal / totalMeals : 0;
    state.costPerMeal = costPerMeal;

    USERS.forEach(u => state.balances[u] = 0);

    // Apply meal costs (debit)
    USERS.forEach(u => {
        let mealsForUser = state.mealCounts[u] || 0;
        state.balances[u] -= (mealsForUser * costPerMeal);
    });

    // Apply transactions
    state.transactions.forEach(tx => {
        if (tx.type === 'grocery') {
            state.balances[tx.payer] += tx.amount; // Payer gets credit
            
            // If this was an isolated expense, split the debit among selected users
            if (tx.splitAmong && tx.splitAmong.length > 0 && tx.splitAmong.length < USERS.length) {
                let splitAmount = tx.amount / tx.splitAmong.length;
                tx.splitAmong.forEach(u => {
                    state.balances[u] -= splitAmount;
                });
            }
        } else if (tx.type === 'payment') {
            state.balances[tx.from] += tx.amount;
            state.balances[tx.to] -= tx.amount;
        }
    });

    if (shouldSave) saveData();
    
    if (triggerRenders) {
        renderDashboard();
        renderHistory();
        if(renderMeals && typeof renderMealForm === 'function') renderMealForm();
    }
    
    // Check and show daily morning notification if needed
    if (typeof checkDailyMorningNotification === 'function') {
        checkDailyMorningNotification();
    }
    // Check debt alerts
    if (typeof checkDebtAlerts === 'function') {
        checkDebtAlerts();
    }
}

// ==========================================
// UI & Notifications
// ==========================================
function showNotification(message, type = 'success') {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    let icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    if(type === 'info') icon = 'fa-info-circle';
    notif.innerHTML = `<span><i class="fas ${icon}" style="margin-right: 8px;"></i> ${message}</span>`;
    container.appendChild(notif);
    setTimeout(() => {
        notif.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

let morningNotifShown = false;
function checkDailyMorningNotification() {
    if (morningNotifShown) return;
    
    const todayStr = new Date().toDateString();
    const lastNotified = localStorage.getItem('hostel_last_morning_notif');
    if (lastNotified === todayStr) return;
    
    const jsDay = new Date().getDay();
    const dayIndex = jsDay === 0 ? 6 : jsDay - 1; // 0 is Sunday, so make it 6, else jsDay - 1
    const currentDayStr = DAYS[dayIndex];

    let todayMeals = 0;
    let unmarkedUsers = [];
    USERS.forEach(u => {
        if (state.mealSchedule && state.mealSchedule[u] && state.mealSchedule[u][currentDayStr]) {
            const ms = state.mealSchedule[u][currentDayStr];
            if (ms.B || ms.L || ms.D || ms.B === 'personal' || ms.L === 'personal' || ms.D === 'personal') {
                todayMeals++;
            } else {
                unmarkedUsers.push(u);
            }
        } else {
            unmarkedUsers.push(u);
        }
    });

    setTimeout(() => {
        showMorningToast(currentDayStr, todayMeals, unmarkedUsers);
        localStorage.setItem('hostel_last_morning_notif', todayStr);
    }, 1500);
    
    morningNotifShown = true;
}

function showMorningToast(dayName, count, unmarked = []) {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = 'notification success';
    notif.style.background = 'linear-gradient(135deg, rgba(57,255,20,0.2), rgba(0,0,0,0.85))';
    notif.style.border = '1px solid var(--color-positive)';
    notif.style.padding = '20px';
    notif.style.boxShadow = '0 10px 30px rgba(57,255,20,0.2)';
    notif.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px;">
            <i class="fas fa-sun" style="font-size: 2.2rem; color: #ffeb3b; text-shadow: 0 0 15px rgba(255,235,59,0.5);"></i>
            <h3 style="margin: 0; color: var(--color-positive); font-weight: 800;">Good Morning!</h3>
            <p style="margin: 0; font-size: 0.95rem; color: var(--text-primary); line-height: 1.4;">
                Happy ${dayName}! <strong style="color: var(--color-positive); font-size: 1.1rem;">${count}</strong> people registered for meals today.
            </p>
            ${unmarked.length > 0 ? `<p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--color-negative);">⚠️ ${unmarked.join(', ')} have no meals marked!</p>` : ''}
            <button onclick="document.querySelector('[data-target=view-meal]').click(); this.closest('.notification').remove();" 
                style="margin-top: 6px; background: var(--color-positive); color: #000; border: none; padding: 8px 20px; border-radius: 20px; font-weight: 700; font-size: 0.85rem; cursor: pointer;">
                <i class="fas fa-hamburger"></i> Mark Meals Now
            </button>
        </div>
    `;
    container.appendChild(notif);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
        notif.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => notif.remove(), 300);
    }, 8000);
}

// Debt Alert System
const DEBT_LIMIT = 2000;
let debtAlertsShown = {};

function checkDebtAlerts() {
    USERS.forEach(u => {
        const bal = state.balances[u] || 0;
        if (bal < -DEBT_LIMIT && !debtAlertsShown[u]) {
            debtAlertsShown[u] = true;
            showDebtAlert(u, Math.abs(bal));
        } else if (bal >= -DEBT_LIMIT) {
            debtAlertsShown[u] = false;
        }
    });
}

function showDebtAlert(user, amount) {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = 'notification error';
    notif.style.background = 'linear-gradient(135deg, rgba(255,7,58,0.2), rgba(0,0,0,0.9))';
    notif.style.border = '1px solid var(--color-negative)';
    notif.style.padding = '16px';
    notif.style.boxShadow = '0 8px 25px rgba(255,7,58,0.3)';
    notif.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
            <i class="fas fa-exclamation-triangle" style="font-size: 1.8rem; color: var(--color-negative); text-shadow: 0 0 10px rgba(255,7,58,0.5);"></i>
            <div>
                <div style="font-weight: 800; color: var(--color-negative); font-size: 0.95rem;">⚠️ Debt Alert!</div>
                <div style="font-size: 0.85rem; color: var(--text-primary); margin-top: 2px;"><strong>${user}</strong> owes <strong style="color: var(--color-negative);">Rs.${Math.round(amount).toLocaleString()}</strong> - exceeds Rs.${DEBT_LIMIT.toLocaleString()} limit!</div>
            </div>
            <button onclick="this.closest('.notification').remove()" style="background:none; border:none; color:var(--text-secondary); font-size:1.2rem; cursor:pointer; margin-left:auto;"><i class="fas fa-times"></i></button>
        </div>
    `;
    container.appendChild(notif);
    
    setTimeout(() => {
        notif.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => notif.remove(), 300);
    }, 10000);
}

// ==========================================
// Navigation Routing Engine
// ==========================================
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            views.forEach(v => {
                if (v.id === targetId) {
                    v.classList.add('active');
                    v.classList.remove('hidden');
                } else {
                    v.classList.remove('active');
                    v.classList.add('hidden');
                }
            });
            if (targetId === 'view-dashboard') renderDashboard();
            else if (targetId === 'view-grocery') renderGroceryForm();
            else if (targetId === 'view-meal') renderMealForm();
            else if (targetId === 'view-history') renderHistory();
            else if (targetId === 'view-payment') renderPaymentForm();
            else if (targetId === 'view-reports') renderReports();
        });
    });
}

// ==========================================
// View Renderers
// ==========================================
let chartInstance = null;

function getSettlements() {
    let debtors = [];
    let creditors = [];
    
    for (let u of USERS) {
        let bal = state.balances[u];
        if (bal < -0.01) debtors.push({ user: u, amount: Math.abs(bal) });
        else if (bal > 0.01) creditors.push({ user: u, amount: bal });
    }
    
    debtors.sort((a,b) => b.amount - a.amount);
    creditors.sort((a,b) => b.amount - a.amount);
    
    let settlements = [];
    let i = 0, j = 0;
    
    while (i < debtors.length && j < creditors.length) {
        let d = debtors[i], c = creditors[j];
        let amount = Math.min(d.amount, c.amount);
        settlements.push({ from: d.user, to: c.user, amount: amount });
        d.amount -= amount; c.amount -= amount;
        if (d.amount < 0.01) i++;
        if (c.amount < 0.01) j++;
    }
    return settlements;
}

function renderDashboard() {
    const grid = document.getElementById('balances-grid');
    grid.innerHTML = ''; 
    const settlements = getSettlements();

    USERS.forEach(user => {
        const bal = state.balances[user] || 0;
        let amountClass = 'zero', cardClass = '';
        if (bal > 0) { amountClass = 'positive'; cardClass = 'pos-card'; }
        else if (bal < 0) { amountClass = 'negative'; cardClass = 'neg-card'; }

        const formattedBal = Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const prefix = bal > 0 ? '+' : (bal < 0 ? '-' : '');

        let debtsHTML = '';
        const userDebts = settlements.filter(s => s.from === user);
        if (userDebts.length > 0) {
            debtsHTML = `<div style="font-size: 0.8rem; color: #ff073a; margin-top: 10px; font-weight: 600; text-align: right; width: 100%;">`;
            userDebts.forEach(d => {
                debtsHTML += `<div style="margin-bottom: 3px;">Owes <span style="color: #fff">${d.to}</span> Rs.${Math.round(d.amount).toLocaleString()}</div>`;
            });
            debtsHTML += `</div>`;
        }

        const userCredits = settlements.filter(s => s.to === user);
        if (userCredits.length > 0 && userDebts.length === 0) {
            debtsHTML = `<div style="font-size: 0.8rem; color: var(--color-positive); margin-top: 10px; font-weight: 600; text-align: right; width: 100%;">`;
            userCredits.forEach(c => {
                debtsHTML += `<div style="margin-bottom: 3px;"><span style="color: #fff">${c.from}</span> owes you Rs.${Math.round(c.amount).toLocaleString()}</div>`;
            });
            debtsHTML += `</div>`;
        }

        const card = document.createElement('div');
        card.className = `glass-card balance-card ${cardClass}`;
        card.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; width: 100%;"><div class="name">${user}</div><div class="amount ${amountClass}">${prefix}Rs.${formattedBal}</div></div>${debtsHTML}`;
        grid.appendChild(card);
    });

    // Render Chart: Show user expenses
    const costPerMealDisplay = document.getElementById('cost-per-meal-display');
    if (costPerMealDisplay) {
        costPerMealDisplay.textContent = (state.costPerMeal || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }

    let userExpenses = USERS.map(u => (state.mealCounts[u] || 0) * (state.costPerMeal || 0));

    const ctx = document.getElementById('expenseChart');
    if (ctx) {
        if (chartInstance) {
            chartInstance.data.labels = USERS;
            chartInstance.data.datasets[0].data = userExpenses;
            chartInstance.update();
        } else {
            if (typeof Chart !== 'undefined') {
                chartInstance = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: USERS,
                        datasets: [{
                            data: userExpenses,
                            backgroundColor: ['#ff073a', '#39ff14', '#0ff', '#f0f', '#ff0', '#00f'],
                            borderWidth: 0,
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { color: '#a0a0a0', font: {family: "'Inter', sans-serif"} } } },
                        cutout: '70%'
                    }
                });
            }
        }
    }
}

function renderGroceryForm() {
    const select = document.getElementById('grocery-payer');
    const currentVal = select.value;
    select.innerHTML = '<option value="" disabled selected>Select user...</option>';
    USERS.forEach(u => select.innerHTML += `<option value="${u}">${u}</option>`);
    if (currentVal) select.value = currentVal;
    
    // Populate Split Options
    const splitContainer = document.getElementById('grocery-split-options');
    if (splitContainer) {
        splitContainer.innerHTML = '';
        splitContainer.style.display = 'flex';
        splitContainer.style.flexWrap = 'wrap';
        splitContainer.style.gap = '8px';
        splitContainer.style.marginTop = '8px';
        splitContainer.style.background = 'rgba(0,0,0,0.2)';
        splitContainer.style.padding = '12px';
        splitContainer.style.borderRadius = '10px';
        splitContainer.style.border = '1px solid rgba(255,255,255,0.05)';

        const updateChipStyles = () => {
            const chips = splitContainer.querySelectorAll('.split-chip');
            const allCb = document.getElementById('split-all-cb');
            let checkedCount = 0;
            chips.forEach(chip => {
                const cb = chip.querySelector('.split-checkbox');
                if (cb && cb.checked) checkedCount++;
            });
            if (allCb) allCb.checked = (checkedCount === USERS.length);
            
            // Update ALL chip style
            const allChip = document.getElementById('split-all-chip');
            if (allChip && allCb) {
                if (allCb.checked) {
                    allChip.style.background = 'rgba(57, 255, 20, 0.2)';
                    allChip.style.border = '2px solid var(--color-positive)';
                    allChip.style.color = 'var(--color-positive)';
                    allChip.style.boxShadow = '0 0 12px rgba(57,255,20,0.3)';
                } else {
                    allChip.style.background = 'rgba(255,255,255,0.05)';
                    allChip.style.border = '2px solid rgba(255,255,255,0.15)';
                    allChip.style.color = 'var(--text-secondary)';
                    allChip.style.boxShadow = 'none';
                }
            }
            
            chips.forEach(chip => {
                const cb = chip.querySelector('.split-checkbox');
                if (!cb) return;
                if (cb.checked) {
                    chip.style.background = 'rgba(57, 255, 20, 0.2)';
                    chip.style.border = '2px solid var(--color-positive)';
                    chip.style.color = 'var(--color-positive)';
                    chip.style.boxShadow = '0 0 12px rgba(57,255,20,0.3)';
                } else {
                    chip.style.background = 'rgba(255,255,255,0.05)';
                    chip.style.border = '2px solid rgba(255,255,255,0.15)';
                    chip.style.color = 'var(--text-secondary)';
                    chip.style.boxShadow = 'none';
                }
            });
        };

        // ALL chip
        const allChip = document.createElement('div');
        allChip.id = 'split-all-chip';
        allChip.style.cssText = 'display:flex; align-items:center; gap:6px; padding:8px 16px; border-radius:20px; cursor:pointer; font-size:0.85rem; font-weight:800; transition:all 0.2s ease; user-select:none; background:rgba(255,255,255,0.05); border:2px solid rgba(255,255,255,0.15); color:var(--text-secondary);';
        allChip.innerHTML = `<input type="checkbox" id="split-all-cb" style="display:none;"><i class="fas fa-users" style="font-size:0.9rem;"></i> ALL`;
        allChip.addEventListener('click', () => {
            const cb = document.getElementById('split-all-cb');
            cb.checked = !cb.checked;
            document.querySelectorAll('.split-checkbox').forEach(c => c.checked = cb.checked);
            updateChipStyles();
        });
        splitContainer.appendChild(allChip);

        USERS.forEach(u => {
            const chip = document.createElement('div');
            chip.className = 'split-chip';
            chip.style.cssText = 'display:flex; align-items:center; gap:5px; padding:8px 14px; border-radius:20px; cursor:pointer; font-size:0.85rem; font-weight:600; transition:all 0.2s ease; user-select:none; background:rgba(255,255,255,0.05); border:2px solid rgba(255,255,255,0.15); color:var(--text-secondary);';
            chip.innerHTML = `<input type="checkbox" class="split-checkbox" value="${u}" style="display:none;"> ${u}`;
            chip.addEventListener('click', () => {
                const cb = chip.querySelector('.split-checkbox');
                cb.checked = !cb.checked;
                updateChipStyles();
            });
            splitContainer.appendChild(chip);
        });
    }

    const d = document.getElementById('grocery-date');
    if (d && !d.value) d.valueAsDate = new Date();
    
    renderAutoMealChips();
}

function renderAutoMealChips() {
    const chipStyle = (active) => `display:flex; align-items:center; gap:5px; padding:7px 13px; border-radius:20px; cursor:pointer; font-size:0.82rem; font-weight:600; transition:all 0.2s ease; user-select:none; ${
        active ? 'background:rgba(57,255,20,0.2); border:2px solid var(--color-positive); color:var(--color-positive); box-shadow:0 0 10px rgba(57,255,20,0.3);' 
               : 'background:rgba(255,255,255,0.05); border:2px solid rgba(255,255,255,0.15); color:var(--text-secondary); box-shadow:none;'
    }`;

    // === DAY CHIPS ===
    const dayContainer = document.getElementById('auto-day-chips');
    if (dayContainer) {
        dayContainer.innerHTML = '';
        const jsDay = new Date().getDay();
        const todayIndex = jsDay === 0 ? 6 : jsDay - 1;

        const updateDayStyles = () => {
            const allDayCb = document.getElementById('day-all-cb');
            const allDayChip = document.getElementById('day-all-chip');
            const dayCbs = dayContainer.querySelectorAll('.auto-day-cb');
            let checkedCount = 0;
            dayCbs.forEach(cb => { if(cb.checked) checkedCount++; });
            if(allDayCb) allDayCb.checked = (checkedCount === DAYS.length);
            if(allDayChip) allDayChip.style.cssText = chipStyle(allDayCb && allDayCb.checked);
            dayContainer.querySelectorAll('.day-chip').forEach(chip => {
                const cb = chip.querySelector('.auto-day-cb');
                if(cb) chip.style.cssText = chipStyle(cb.checked);
            });
        };

        // ALL days chip
        const allChip = document.createElement('div');
        allChip.id = 'day-all-chip';
        allChip.style.cssText = chipStyle(false);
        allChip.innerHTML = `<input type="checkbox" id="day-all-cb" style="display:none;"><i class="fas fa-calendar-week" style="font-size:0.85rem;"></i> ALL`;
        allChip.addEventListener('click', () => {
            const cb = document.getElementById('day-all-cb');
            cb.checked = !cb.checked;
            dayContainer.querySelectorAll('.auto-day-cb').forEach(c => c.checked = cb.checked);
            updateDayStyles();
        });
        dayContainer.appendChild(allChip);

        DAYS.forEach((day, idx) => {
            const chip = document.createElement('div');
            chip.className = 'day-chip';
            const isToday = (idx === todayIndex);
            chip.style.cssText = chipStyle(isToday);
            chip.innerHTML = `<input type="checkbox" class="auto-day-cb" value="${day}" style="display:none;" ${isToday ? 'checked' : ''}> ${day.substring(0,3)}`;
            chip.addEventListener('click', () => {
                const cb = chip.querySelector('.auto-day-cb');
                cb.checked = !cb.checked;
                updateDayStyles();
            });
            dayContainer.appendChild(chip);
        });
        updateDayStyles();
    }

    // === MEAL CHIPS ===
    const mealContainer = document.getElementById('auto-meal-chips');
    if (mealContainer) {
        mealContainer.innerHTML = '';
        const MEALS = [{val: 'B', label: 'Morning', icon: 'fa-sun'}, {val: 'L', label: 'Afternoon', icon: 'fa-cloud-sun'}, {val: 'D', label: 'Night', icon: 'fa-moon'}];

        MEALS.forEach(m => {
            const chip = document.createElement('div');
            chip.className = 'meal-chip';
            chip.style.cssText = chipStyle(false);
            chip.innerHTML = `<input type="checkbox" class="auto-meal-cb" value="${m.val}" style="display:none;"><i class="fas ${m.icon}" style="font-size:0.85rem;"></i> ${m.label}`;
            chip.addEventListener('click', () => {
                const cb = chip.querySelector('.auto-meal-cb');
                cb.checked = !cb.checked;
                chip.style.cssText = chipStyle(cb.checked);
            });
            mealContainer.appendChild(chip);
        });
    }
}

window.togglePersonalFields = function() {
    const type = document.getElementById('grocery-bill-type').value;
    const descField = document.getElementById('grocery-desc');
    const autoMealActionText = document.getElementById('auto-meal-action-text');
    
    if (type === 'personal') {
        if (!descField.value) descField.value = 'Isolated/Group Meal';
        if (autoMealActionText) {
            autoMealActionText.textContent = '(Will MARK AS PERSONAL meals)';
            autoMealActionText.style.color = '#ffb300';
        }
    } else {
        if(descField.value === 'Isolated/Group Meal' || descField.value === 'Outside/Personal Meal') descField.value = '';
        if (autoMealActionText) {
            autoMealActionText.textContent = '(Will TICK AS COMMON meals)';
            autoMealActionText.style.color = 'var(--color-positive)';
        }
    }
}

window.toggleAutoMealFields = function() {
    const checked = document.getElementById('grocery-auto-meal').checked;
    document.getElementById('auto-meal-fields').style.display = checked ? 'block' : 'none';
}

function renderMealForm() {
    const list = document.getElementById('meal-counts-list');
    if (!list) return;
    list.innerHTML = '';
    
    USERS.forEach(user => {
        const schedule = state.mealSchedule[user] || {};
        let commonTotal = state.mealCounts[user] || 0;
        let personalTotal = 0;
        DAYS.forEach(d => {
            ['B', 'L', 'D'].forEach(m => {
                if(schedule[d] && schedule[d][m] === 'personal') personalTotal++;
            });
        });
        
        let userTotalText = personalTotal > 0 ? `${commonTotal} Com | ${personalTotal} Per` : `${commonTotal} Meals`;
        const hasMeals = (commonTotal + personalTotal) > 0;
        const borderColor = hasMeals ? 'var(--color-positive)' : 'rgba(255,255,255,0.1)';
        const headerBg = hasMeals ? 'linear-gradient(135deg, rgba(57, 255, 20, 0.15), rgba(0,0,0,0.4))' : 'rgba(255,255,255,0.05)';
        const checkIcon = hasMeals ? '<i class="fas fa-check-circle" style="color: var(--color-positive); margin-left: 8px; font-size: 1.1rem; text-shadow: 0 0 8px rgba(57,255,20,0.5);"></i>' : '<i class="fas fa-check-circle" style="color: transparent; margin-left: 8px; font-size: 1.1rem;"></i>';
        const badgeColor = hasMeals ? 'var(--color-positive)' : 'var(--text-secondary)';
        const badgeBg = hasMeals ? 'rgba(57, 255, 20, 0.1)' : 'rgba(255,255,255,0.1)';
        const nameColor = hasMeals ? 'var(--color-positive)' : 'var(--text-primary)';
        const nameShadow = hasMeals ? '0 0 10px rgba(57,255,20,0.4)' : 'none';

        const card = document.createElement('div');
        card.id = `schedule-card-${user}`;
        card.className = 'glass-card schedule-card';
        card.style.padding = '0';
        card.style.overflow = 'hidden';
        card.style.marginBottom = '12px';
        card.style.border = hasMeals ? `2px solid ${borderColor}` : `1px solid ${borderColor}`;
        card.style.transition = 'all 0.3s ease';

        const header = document.createElement('div');
        header.id = `schedule-header-${user}`;
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '15px';
        header.style.cursor = 'pointer';
        header.style.background = headerBg;
        header.style.transition = 'all 0.3s ease';
        header.onclick = () => {
            const body = document.getElementById(`schedule-body-${user}`);
            const icon = document.getElementById(`schedule-icon-${user}`);
            const isClosing = body.style.display !== 'none';

            // Close all others first
            USERS.forEach(u => {
                const b = document.getElementById(`schedule-body-${u}`);
                const i = document.getElementById(`schedule-icon-${u}`);
                if (b && i) {
                    b.style.display = 'none';
                    i.className = 'fas fa-chevron-down';
                }
            });

            // Toggle current
            if (!isClosing) {
                body.style.display = 'block';
                icon.className = 'fas fa-chevron-up';
                window.currentlyOpenAccordion = user;
            } else {
                if (window.currentlyOpenAccordion === user) window.currentlyOpenAccordion = null;
            }
        };

        header.innerHTML = `
            <div style="display: flex; align-items: center;">
                <span id="name-text-${user}" style="font-weight: 800; font-size: 1.1rem; color: ${nameColor}; text-shadow: ${nameShadow}; transition: all 0.3s ease;">${user}</span>
                <span id="check-icon-${user}">${checkIcon}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="glass-badge" style="background: ${badgeBg}; color: ${badgeColor}; padding: 4px 10px; border-radius: 10px; font-size: 0.85rem; transition: all 0.3s ease;" id="badge-total-${user}">
                    ${userTotalText}
                </span>
                <i id="schedule-icon-${user}" class="${window.currentlyOpenAccordion === user ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}" style="color: var(--text-secondary);"></i>
            </div>
        `;

        const body = document.createElement('div');
        body.id = `schedule-body-${user}`;
        body.style.display = window.currentlyOpenAccordion === user ? 'block' : 'none';
        body.style.padding = '15px';
        body.style.borderTop = '1px solid rgba(255,255,255,0.1)';
        body.style.background = 'rgba(0,0,0,0.2)';

        let tableHTML = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                <thead>
                    <tr style="color: var(--text-secondary); text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <th style="padding-bottom: 12px; text-align: left;">Day</th>
                        <th style="padding-bottom: 12px;">Morning</th>
                        <th style="padding-bottom: 12px;">Afternoon</th>
                        <th style="padding-bottom: 12px;">Night</th>
                    </tr>
                </thead>
                <tbody>
        `;

        DAYS.forEach(d => {
            const bVal = schedule[d] ? schedule[d]['B'] : false;
            const lVal = schedule[d] ? schedule[d]['L'] : false;
            const dVal = schedule[d] ? schedule[d]['D'] : false;
            
            const getCellStyle = (val) => {
                if(val === true) return 'cursor: pointer; text-align: center; padding: 12px 0; background: rgba(57, 255, 20, 0.15); color: var(--color-positive); font-weight: bold; border-radius: 8px; border: 1px solid var(--color-positive); box-shadow: 0 0 10px rgba(57,255,20,0.2); transition: all 0.2s ease;';
                if(val === 'personal') return 'cursor: pointer; text-align: center; padding: 12px 0; background: rgba(255, 179, 0, 0.15); color: #ffb300; font-weight: bold; border-radius: 8px; border: 1px solid #ffb300; box-shadow: 0 0 10px rgba(255,179,0,0.2); transition: all 0.2s ease;';
                return 'cursor: pointer; text-align: center; padding: 12px 0; background: rgba(255, 255, 255, 0.05); color: var(--text-secondary); font-weight: normal; border-radius: 8px; border: 1px solid transparent; box-shadow: none; transition: all 0.2s ease;';
            };
            const getIcon = (val) => {
                if(val === true) return '<i class="fas fa-check"></i>';
                if(val === 'personal') return '<i class="fas fa-pizza-slice"></i>';
                return '<i class="fas fa-minus" style="opacity: 0.3;"></i>';
            };

            tableHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 12px 10px 12px 0; font-weight: 500; width: 25%;">${d.substring(0,3)}</td>
                    <td style="padding: 6px 4px;"><div id="cell-${user}-${d}-B" onclick="toggleMealCell('${user}', '${d}', 'B')" style="${getCellStyle(bVal)}">${getIcon(bVal)}</div></td>
                    <td style="padding: 6px 4px;"><div id="cell-${user}-${d}-L" onclick="toggleMealCell('${user}', '${d}', 'L')" style="${getCellStyle(lVal)}">${getIcon(lVal)}</div></td>
                    <td style="padding: 6px 4px;"><div id="cell-${user}-${d}-D" onclick="toggleMealCell('${user}', '${d}', 'D')" style="${getCellStyle(dVal)}">${getIcon(dVal)}</div></td>
                </tr>
            `;
        });

        tableHTML += `
                <tr>
                    <td colspan="4" style="padding: 16px 4px 8px 4px;">
                        <button class="btn-primary" style="width: 100%; font-size: 0.9rem; padding: 10px; border-radius: 8px;" onclick="advanceAccordion('${user}', event)">Done / Next <i class="fas fa-arrow-right"></i></button>
                    </td>
                </tr>
            </tbody></table>`;
        body.innerHTML = tableHTML;

        card.appendChild(header);
        card.appendChild(body);
        list.appendChild(card);
    });
}

function renderPaymentForm() {
    const sFrom = document.getElementById('pay-from');
    const sTo = document.getElementById('pay-to');
    const cvFrom = sFrom.value, cvTo = sTo.value;
    
    sFrom.innerHTML = '<option value="" disabled selected>Select Payer...</option>';
    sTo.innerHTML = '<option value="" disabled selected>Select Receiver...</option>';
    USERS.forEach(u => {
        sFrom.innerHTML += `<option value="${u}">${u}</option>`;
        sTo.innerHTML += `<option value="${u}">${u}</option>`;
    });
    
    if (cvFrom) sFrom.value = cvFrom;
    if (cvTo) sTo.value = cvTo;
    
    const d = document.getElementById('pay-date');
    if (d && !d.value) d.valueAsDate = new Date();
}

function renderHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML = '';
    
    if (state.transactions.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No transactions yet.</p>';
    } else {
        const reversed = [...state.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));
        
        reversed.forEach(tx => {
            const card = document.createElement('div');
            card.className = 'history-card';
            
            let icon, title, meta, amtClass;
            if (tx.type === 'grocery') {
                if (tx.billType === 'personal') {
                    icon = '<i class="fas fa-pizza-slice" style="color: #ffb300"></i>';
                    title = `${tx.payer} Direct Split`;
                } else {
                    icon = '<i class="fas fa-shopping-cart" style="color: var(--color-positive)"></i>';
                    title = `${tx.payer} added Grocery`;
                }
                meta = tx.desc;
                if (tx.billType === 'personal' && tx.personalMeals && tx.personalMeals.length > 0) {
                    meta = `<span style="color: #ffb300; font-weight: bold;">[${tx.personalDay}: ${tx.personalMeals.join(',')}]</span> ${tx.desc}`;
                }
                amtClass = 'grocery';
            } else if (tx.type === 'meal') {
                icon = '<i class="fas fa-hamburger" style="color: var(--color-negative)"></i>';
                title = `Meal Split`;
                meta = `${tx.participants.length} ate`;
                amtClass = 'meal';
            } else if (tx.type === 'payment') {
                icon = '<i class="fas fa-handshake" style="color: var(--color-accent)"></i>';
                title = `${tx.from} paid ${tx.to}`;
                meta = `Cash Settlement`;
                amtClass = 'grocery'; // Neutral/Positive color
            }
            
            let dateStr = new Date(tx.date).toLocaleDateString();
            let formattedAmt = tx.amount.toLocaleString();
            
            let commentsHTML = '';
            const comments = tx.comments || [];
            if (comments.length > 0) {
                commentsHTML = comments.map(c => {
                    const cTime = new Date(c.time).toLocaleString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
                    return `<div style="padding:4px 0; font-size:0.78rem; color:var(--text-secondary); border-top:1px solid rgba(255,255,255,0.03);"><span style="color:var(--color-accent);">${cTime}</span>: ${c.text}</div>`;
                }).join('');
            }

            card.innerHTML = `
                <div style="width: 100%;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="details" style="flex:1;">
                            <div class="title">${icon} ${title}</div>
                            <div class="meta">${dateStr} | ${meta}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div class="amt ${amtClass}">Rs.${formattedAmt}</div>
                            <button class="btn-delete" title="Delete Log" onclick="deleteTransaction(${tx.id})"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    ${commentsHTML ? `<div style="margin-top:8px; padding-left:4px;">${commentsHTML}</div>` : ''}
                    <div style="display:flex; gap:6px; margin-top:8px;">
                        <input type="text" id="comment-input-${tx.id}" placeholder="Add comment..." style="flex:1; padding:6px 10px; font-size:0.8rem; border-radius:8px;">
                        <button onclick="addComment(${tx.id})" style="background:var(--color-accent); color:#000; border:none; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    const settleBtn = document.getElementById('btn-settle');
    if(settleBtn) settleBtn.onclick = () => showSettleUpModal();
    
    // Render activity feed
    renderActivityFeed();
    renderGuestList();
}

function renderActivityFeed() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;
    const logs = state.activityLog || [];
    if (logs.length === 0) {
        feed.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem; text-align:center;">No activity yet.</p>';
        return;
    }
    feed.innerHTML = '';
    logs.slice(0, 20).forEach(log => {
        const timeStr = new Date(log.time).toLocaleString('en-US', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:0.82rem; padding:6px 8px; background:rgba(255,255,255,0.02); border-radius:6px;';
        item.innerHTML = `<i class="fas fa-circle" style="font-size:0.35rem; color:var(--color-accent);"></i><span style="color:var(--text-secondary);">${timeStr}</span> <span style="color:var(--text-primary);">${log.action}</span>`;
        feed.appendChild(item);
    });
}

window.deleteTransaction = function(id) {
    if(!confirm("Are you sure you want to completely delete this log? Building balances will be recalculated.")) return;
    pushUndo('Delete Transaction');
    state.transactions = state.transactions.filter(t => t.id !== id);
    saveData();
    recalculateBalances(true);
    logActivity('Transaction deleted');
    showNotification("Transaction deleted safely.", "info");
}

function showSettleUpModal() {
    let settlements = getSettlements();
    
    const container = document.getElementById('history-list');
    container.innerHTML = `
        <h3 style="margin-bottom: 12px; color: var(--color-accent); font-weight: 800;"><i class="fas fa-magic"></i> Magic Settle Up</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">Minimum transactions needed to clear all debts:</p>
    `;
    
    if (settlements.length === 0) {
        container.innerHTML += `<div class="settle-card" style="border-color: var(--color-positive);">All balances are settled! Nobody owes anything. 🎉</div>`;
    } else {
        settlements.forEach(s => {
            container.innerHTML += `<div class="settle-card"><strong>${s.from}</strong> owes <strong>${s.to}</strong>: <span style="color: var(--color-positive); font-weight: 800;">Rs.${Math.round(s.amount).toLocaleString()}</span></div>`;
        });
    }
    
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-primary'; backBtn.style.marginTop = '16px'; backBtn.style.width = '100%';
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to History';
    backBtn.onclick = () => renderHistory();
    container.appendChild(backBtn);
}

// ==========================================
// Reports & Analytics
// ==========================================
let currentReportPeriod = 'week';
let reportBarInstance = null;
let reportLineInstance = null;

window.setReportPeriod = function(period, btn) {
    currentReportPeriod = period;
    document.querySelectorAll('.report-period-btn').forEach(b => {
        b.style.border = '2px solid var(--glass-border)';
        b.style.background = 'transparent';
        b.style.color = 'var(--text-secondary)';
        b.style.fontWeight = '600';
    });
    if (btn) {
        btn.style.border = '2px solid var(--color-accent)';
        btn.style.background = 'rgba(0,229,255,0.15)';
        btn.style.color = 'var(--color-accent)';
        btn.style.fontWeight = '700';
    }
    renderReports();
}

function getFilteredTransactions(period) {
    const now = new Date();
    return state.transactions.filter(tx => {
        if (period === 'all') return true;
        const txDate = new Date(tx.date);
        if (period === 'week') {
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return txDate >= weekAgo;
        }
        if (period === 'month') {
            return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
        }
        return true;
    });
}

function renderReports() {
    const txs = getFilteredTransactions(currentReportPeriod);
    
    // Calculate stats
    let totalSpent = 0;
    let perPersonSpend = {};
    USERS.forEach(u => perPersonSpend[u] = 0);
    
    txs.forEach(tx => {
        if (tx.type === 'grocery') {
            totalSpent += tx.amount;
            perPersonSpend[tx.payer] = (perPersonSpend[tx.payer] || 0) + tx.amount;
        }
    });
    
    const avgPerPerson = USERS.length > 0 ? totalSpent / USERS.length : 0;
    let topBuyer = USERS[0] || '-';
    let topAmount = 0;
    USERS.forEach(u => {
        if ((perPersonSpend[u] || 0) > topAmount) {
            topAmount = perPersonSpend[u] || 0;
            topBuyer = u;
        }
    });

    // Render stat cards
    const statsContainer = document.getElementById('report-stats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="glass-card" style="padding: 16px; text-align: center;">
                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Total Spent</div>
                <div style="font-size: 1.3rem; font-weight: 800; color: var(--color-accent); margin-top: 6px;">Rs.${Math.round(totalSpent).toLocaleString()}</div>
            </div>
            <div class="glass-card" style="padding: 16px; text-align: center;">
                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Avg/Person</div>
                <div style="font-size: 1.3rem; font-weight: 800; color: var(--color-positive); margin-top: 6px;">Rs.${Math.round(avgPerPerson).toLocaleString()}</div>
            </div>
            <div class="glass-card" style="padding: 16px; text-align: center;">
                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Top Buyer</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #ffb300; margin-top: 6px;">${topBuyer}</div>
            </div>
        `;
    }

    // Bar Chart: Per-person spending
    const barCtx = document.getElementById('reportBarChart');
    if (barCtx && typeof Chart !== 'undefined') {
        const barData = USERS.map(u => perPersonSpend[u] || 0);
        const barColors = ['#ff073a', '#39ff14', '#0ff', '#f0f', '#ff0', '#00f'];
        
        if (reportBarInstance) {
            reportBarInstance.data.labels = USERS;
            reportBarInstance.data.datasets[0].data = barData;
            reportBarInstance.update();
        } else {
            reportBarInstance = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: USERS,
                    datasets: [{
                        label: 'Amount Paid (Rs)',
                        data: barData,
                        backgroundColor: barColors.map(c => c + '44'),
                        borderColor: barColors,
                        borderWidth: 2,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            ticks: { color: '#888', callback: v => 'Rs.' + v.toLocaleString() },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: { ticks: { color: '#aaa', font: { weight: '600' } }, grid: { display: false } }
                    }
                }
            });
        }
    }

    // Line Chart: Spending trends by week
    const lineCtx = document.getElementById('reportLineChart');
    if (lineCtx && typeof Chart !== 'undefined') {
        // Group transactions by week
        const allGrocery = state.transactions.filter(tx => tx.type === 'grocery').sort((a,b) => new Date(a.date) - new Date(b.date));
        
        let weeklyData = {};
        allGrocery.forEach(tx => {
            const d = new Date(tx.date);
            const weekStart = new Date(d);
            weekStart.setDate(d.getDate() - d.getDay());
            const key = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            weeklyData[key] = (weeklyData[key] || 0) + tx.amount;
        });
        
        const labels = Object.keys(weeklyData);
        const values = Object.values(weeklyData);
        
        // Cumulative for trends
        let cumulative = [];
        let sum = 0;
        values.forEach(v => { sum += v; cumulative.push(sum); });

        if (reportLineInstance) {
            reportLineInstance.data.labels = labels;
            reportLineInstance.data.datasets[0].data = values;
            reportLineInstance.data.datasets[1].data = cumulative;
            reportLineInstance.update();
        } else {
            reportLineInstance = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Weekly',
                            data: values,
                            borderColor: '#00e5ff',
                            backgroundColor: 'rgba(0, 229, 255, 0.1)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 2,
                            pointRadius: 4,
                            pointBackgroundColor: '#00e5ff'
                        },
                        {
                            label: 'Cumulative',
                            data: cumulative,
                            borderColor: '#39ff14',
                            backgroundColor: 'rgba(57, 255, 20, 0.05)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 2,
                            pointRadius: 3,
                            pointBackgroundColor: '#39ff14',
                            borderDash: [5, 5]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { 
                            position: 'bottom', 
                            labels: { color: '#aaa', font: { family: "'Inter', sans-serif", size: 11 }, usePointStyle: true } 
                        } 
                    },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            ticks: { color: '#888', callback: v => 'Rs.' + (v/1000).toFixed(1) + 'k' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: { ticks: { color: '#aaa', font: { size: 10 } }, grid: { display: false } }
                    }
                }
            });
        }
    }
}

// ==========================================
// Core Business Logic
// ==========================================
function setupForms() {
    renderGroceryForm();
    renderMealForm();
    renderPaymentForm();
    
    document.getElementById('form-grocery').addEventListener('submit', (e) => {
        e.preventDefault();
        const billType = document.getElementById('grocery-bill-type').value;
        const payer = document.getElementById('grocery-payer').value;
        const amount = parseFloat(document.getElementById('grocery-amount').value);
        const desc = document.getElementById('grocery-desc').value;
        const dStr = document.getElementById('grocery-date').value;
        
        const autoMeal = document.getElementById('grocery-auto-meal').checked;
        
        let selectedDays = [];
        if (autoMeal) {
            document.querySelectorAll('.auto-day-cb:checked').forEach(cb => selectedDays.push(cb.value));
        }
        
        let selectedMeals = [];
        if (autoMeal) {
            document.querySelectorAll('.auto-meal-cb:checked').forEach(cb => selectedMeals.push(cb.value));
        }

        let splitAmong = [];
        document.querySelectorAll('.split-checkbox:checked').forEach(cb => splitAmong.push(cb.value));
        if (splitAmong.length === 0) splitAmong = [...USERS];
        
        pushUndo(`Add ${billType === 'personal' ? 'Split' : 'Grocery'}`);
        
        let actionMsg = '';
        // Auto-sync meals for ALL selected days
        if (autoMeal && selectedDays.length > 0 && selectedMeals.length > 0) {
            let unticked = [];
            selectedDays.forEach(day => {
                // Selected users: mark personal or common
                splitAmong.forEach(u => {
                    if (state.mealSchedule[u] && state.mealSchedule[u][day]) {
                        selectedMeals.forEach(meal => {
                            if (billType === 'personal') {
                                state.mealSchedule[u][day][meal] = 'personal'; // Mark as personal
                            } else {
                                state.mealSchedule[u][day][meal] = true; // Add as common
                            }
                        });
                    }
                });
                
                // For personal bills: untick NON-selected users (they weren't there)
                if (billType === 'personal') {
                    const notSelected = USERS.filter(u => !splitAmong.includes(u));
                    notSelected.forEach(u => {
                        if (state.mealSchedule[u] && state.mealSchedule[u][day]) {
                            selectedMeals.forEach(meal => {
                                if (state.mealSchedule[u][day][meal] === true) {
                                    state.mealSchedule[u][day][meal] = false; // Untick common
                                    if (!unticked.includes(u)) unticked.push(u);
                                }
                            });
                        }
                    });
                }
            });
            let mealStr = selectedMeals.join(',');
            let dayStr = selectedDays.length === DAYS.length ? 'ALL DAYS' : selectedDays.map(d => d.substring(0,3)).join(',');
            actionMsg = billType === 'personal' ? ` & MARKED PERSONAL (${dayStr}: ${mealStr})!` : ` & TICKED (${dayStr}: ${mealStr})!`;
            if (unticked.length > 0) {
                actionMsg += ` [${unticked.join(',')} UNTICKED]`;
            }
        }

        state.transactions.push({
            id: Date.now(), type: 'grocery', billType, payer, amount, desc, splitAmong, 
            personalDay: selectedDays.length > 0 ? selectedDays.join(',') : null, 
            personalMeals: selectedMeals,
            date: dStr ? new Date(dStr + 'T12:00:00').toISOString() : new Date().toISOString()
        });
        
        recalculateBalances(true);
        let msg = (billType === 'personal' || splitAmong.length < USERS.length) ? 
            `${payer} added Rs.${amount} (Split among ${splitAmong.join(', ')})` : 
            `${payer} added Rs.${amount} for ${desc}`;
        showNotification(msg + actionMsg);
        logActivity(`${payer} added grocery Rs.${amount} (${desc})`);
        
        // Reset Logic
        e.target.reset(); 
        document.getElementById('grocery-date').valueAsDate = new Date();
        document.getElementById('grocery-bill-type').value = 'common';
        document.getElementById('auto-meal-fields').style.display = 'none';
        
        document.querySelectorAll('.auto-meal-cb').forEach(cb => cb.checked = false);
        document.querySelectorAll('.auto-day-cb').forEach(cb => cb.checked = false);
        const allCb = document.getElementById('split-all-cb');
        if (allCb) allCb.checked = false;
        const dayAllCb = document.getElementById('day-all-cb');
        if (dayAllCb) dayAllCb.checked = false;
        
        renderAutoMealChips();
        
        if(typeof togglePersonalFields === 'function') togglePersonalFields();
    });



    document.getElementById('form-payment').addEventListener('submit', (e) => {
        e.preventDefault();
        const from = document.getElementById('pay-from').value;
        const to = document.getElementById('pay-to').value;
        if (from === to) return showNotification("You can't pay yourself!", "error");
        
        pushUndo('Add Payment');
        
        const amount = parseFloat(document.getElementById('pay-amount').value);
        const dStr = document.getElementById('pay-date').value;
        
        state.transactions.push({
            id: Date.now(), type: 'payment', from, to, amount,
            date: dStr ? new Date(dStr + 'T12:00:00').toISOString() : new Date().toISOString()
        });
        
        recalculateBalances(true);
        logActivity(`${from} paid ${to} Rs.${amount}`);
        showNotification(`Logged Rs.${amount} transfer from ${from} to ${to}`);
        e.target.reset(); document.getElementById('pay-date').valueAsDate = new Date();
    });
}

window.toggleMealCell = function(user, day, meal) {
    const currentState = state.mealSchedule[user][day][meal];
    let newState;
    if (currentState === false || !currentState) {
        newState = true; // Unticked -> Common
    } else if (currentState === true) {
        newState = 'personal'; // Common -> Personal
    } else {
        newState = false; // Personal -> Unticked
    }
    state.mealSchedule[user][day][meal] = newState;

    const cell = document.getElementById(`cell-${user}-${day}-${meal}`);
    if (cell) {
        if (newState === true) {
            cell.style.background = 'rgba(57, 255, 20, 0.15)';
            cell.style.color = 'var(--color-positive)';
            cell.style.fontWeight = 'bold';
            cell.style.border = '1px solid var(--color-positive)';
            cell.style.boxShadow = '0 0 10px rgba(57,255,20,0.2)';
            cell.innerHTML = '<i class="fas fa-check"></i>';
        } else if (newState === 'personal') {
            cell.style.background = 'rgba(255, 179, 0, 0.15)';
            cell.style.color = '#ffb300';
            cell.style.fontWeight = 'bold';
            cell.style.border = '1px solid #ffb300';
            cell.style.boxShadow = '0 0 10px rgba(255,179,0,0.2)';
            cell.innerHTML = '<i class="fas fa-pizza-slice"></i>';
        } else {
            cell.style.background = 'rgba(255, 255, 255, 0.05)';
            cell.style.color = 'var(--text-secondary)';
            cell.style.fontWeight = 'normal';
            cell.style.border = '1px solid transparent';
            cell.style.boxShadow = 'none';
            cell.innerHTML = '<i class="fas fa-minus" style="opacity: 0.3;"></i>';
        }
    }

    let commonTotal = 0;
    let personalTotal = 0;
    DAYS.forEach(d => {
        ['B', 'L', 'D'].forEach(m => {
            let val = state.mealSchedule[user][d] && state.mealSchedule[user][d][m];
            if(val === true) commonTotal++;
            if(val === 'personal') personalTotal++;
        });
    });
    
    const hasMeals = (commonTotal + personalTotal) > 0;
    let userTotalText = personalTotal > 0 ? `${commonTotal} Com | ${personalTotal} Per` : `${commonTotal} Meals`;
    const card = document.getElementById(`schedule-card-${user}`);
    const header = document.getElementById(`schedule-header-${user}`);
    const nameText = document.getElementById(`name-text-${user}`);
    const checkIconContainer = document.getElementById(`check-icon-${user}`);
    const badge = document.getElementById(`badge-total-${user}`);
    
    if (hasMeals) {
        if(card) card.style.border = '2px solid var(--color-positive)';
        if(header) header.style.background = 'linear-gradient(135deg, rgba(57, 255, 20, 0.15), rgba(0,0,0,0.4))';
        if(checkIconContainer) checkIconContainer.innerHTML = '<i class="fas fa-check-circle" style="color: var(--color-positive); margin-left: 8px; font-size: 1.1rem; text-shadow: 0 0 8px rgba(57,255,20,0.5);"></i>';
        if(badge) {
            badge.style.color = 'var(--color-positive)';
            badge.style.background = 'rgba(57, 255, 20, 0.1)';
        }
        if(nameText) {
            nameText.style.color = 'var(--color-positive)';
            nameText.style.textShadow = '0 0 10px rgba(57,255,20,0.4)';
            nameText.style.fontWeight = '800';
        }
    } else {
        if(card) card.style.border = '1px solid rgba(255,255,255,0.1)';
        if(header) header.style.background = 'rgba(255,255,255,0.05)';
        if(checkIconContainer) checkIconContainer.innerHTML = '<i class="fas fa-check-circle" style="color: transparent; margin-left: 8px; font-size: 1.1rem;"></i>';
        if(badge) {
            badge.style.color = 'var(--text-secondary)';
            badge.style.background = 'rgba(255,255,255,0.1)';
        }
        if(nameText) {
            nameText.style.color = 'var(--text-primary)';
            nameText.style.textShadow = 'none';
            nameText.style.fontWeight = '600';
        }
    }

    if(badge) badge.textContent = userTotalText;

    // Recalculate balances without re-rendering the meal UI to keep accordion open
    recalculateBalances(true, false); 
}

window.advanceAccordion = function(user, event) {
    if(event) event.stopPropagation();
    const currentIndex = USERS.indexOf(user);
    const nextUser = USERS[(currentIndex + 1) % USERS.length];
    
    // Auto close current
    window.currentlyOpenAccordion = null;
    const currBody = document.getElementById(`schedule-body-${user}`);
    const currIcon = document.getElementById(`schedule-icon-${user}`);
    if(currBody && currIcon) {
        currBody.style.display = 'none';
        currIcon.className = 'fas fa-chevron-down';
    }

    const nextHeader = document.getElementById(`schedule-header-${nextUser}`);
    if (nextHeader) {
        nextHeader.click(); // This will set window.currentlyOpenAccordion = nextUser
        setTimeout(() => {
            nextHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }
}

// ==========================================
// Service Worker Registration
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {}, (err) => {});
    });
}
