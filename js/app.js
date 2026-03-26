// Application Constants
const USERS = ['BAHU', 'MONTY', 'BACON', 'KOLAYA', 'HOCKMAN', 'TASK'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Global State
let state = {
    balances: {},
    transactions: [],
    mealCounts: {},
    mealSchedule: {},
    costPerMeal: 0
};

// ==========================================
// Initialization & Boot
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    loadData();
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
        if (tx.type === 'grocery') groceryTotal += tx.amount;
    });

    let totalMeals = 0;
    USERS.forEach(user => { 
        let userTotal = 0;
        if(state.mealSchedule && state.mealSchedule[user]) {
            DAYS.forEach(d => {
                ['B', 'L', 'D'].forEach(m => {
                    if (state.mealSchedule[user][d][m]) userTotal++;
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
            state.balances[tx.payer] += tx.amount;
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
        });
    });
}

// ==========================================
// View Renderers
// ==========================================
let chartInstance = null;

function renderDashboard() {
    const grid = document.getElementById('balances-grid');
    grid.innerHTML = ''; 
    USERS.forEach(user => {
        const bal = state.balances[user] || 0;
        let amountClass = 'zero', cardClass = '';
        if (bal > 0) { amountClass = 'positive'; cardClass = 'pos-card'; }
        else if (bal < 0) { amountClass = 'negative'; cardClass = 'neg-card'; }

        const formattedBal = Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const prefix = bal > 0 ? '+' : (bal < 0 ? '-' : '');

        const card = document.createElement('div');
        card.className = `glass-card balance-card ${cardClass}`;
        card.innerHTML = `<div class="name">${user}</div><div class="amount ${amountClass}">${prefix}Rs.${formattedBal}</div>`;
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
    
    const d = document.getElementById('grocery-date');
    if (d && !d.value) d.valueAsDate = new Date();
}

function renderMealForm() {
    const list = document.getElementById('meal-counts-list');
    if (!list) return;
    list.innerHTML = '';
    
    USERS.forEach(user => {
        const schedule = state.mealSchedule[user] || {};
        let userTotal = state.mealCounts[user] || 0;
        
        const hasMeals = userTotal > 0;
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
            if (body.style.display === 'none') {
                body.style.display = 'block';
                icon.className = 'fas fa-chevron-up';
            } else {
                body.style.display = 'none';
                icon.className = 'fas fa-chevron-down';
            }
        };

        header.innerHTML = `
            <div style="display: flex; align-items: center;">
                <span id="name-text-${user}" style="font-weight: 800; font-size: 1.1rem; color: ${nameColor}; text-shadow: ${nameShadow}; transition: all 0.3s ease;">${user}</span>
                <span id="check-icon-${user}">${checkIcon}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="glass-badge" style="background: ${badgeBg}; color: ${badgeColor}; padding: 4px 10px; border-radius: 10px; font-size: 0.85rem; transition: all 0.3s ease;" id="badge-total-${user}">
                    ${userTotal} Meals
                </span>
                <i id="schedule-icon-${user}" class="fas fa-chevron-down" style="color: var(--text-secondary);"></i>
            </div>
        `;

        const body = document.createElement('div');
        body.id = `schedule-body-${user}`;
        body.style.display = 'none';
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
            const bChecked = (schedule[d] && schedule[d]['B']) ? true : false;
            const lChecked = (schedule[d] && schedule[d]['L']) ? true : false;
            const dChecked = (schedule[d] && schedule[d]['D']) ? true : false;
            
            const getCellStyle = (checked) => {
                if(checked) return 'cursor: pointer; text-align: center; padding: 12px 0; background: rgba(57, 255, 20, 0.15); color: var(--color-positive); font-weight: bold; border-radius: 8px; border: 1px solid var(--color-positive); box-shadow: 0 0 10px rgba(57,255,20,0.2); transition: all 0.2s ease;';
                return 'cursor: pointer; text-align: center; padding: 12px 0; background: rgba(255, 255, 255, 0.05); color: var(--text-secondary); font-weight: normal; border-radius: 8px; border: 1px solid transparent; box-shadow: none; transition: all 0.2s ease;';
            };
            const getIcon = (checked) => checked ? '<i class="fas fa-check"></i>' : '<i class="fas fa-minus" style="opacity: 0.3;"></i>';

            tableHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 12px 10px 12px 0; font-weight: 500; width: 25%;">${d.substring(0,3)}</td>
                    <td style="padding: 6px 4px;"><div id="cell-${user}-${d}-B" onclick="toggleMealCell('${user}', '${d}', 'B')" style="${getCellStyle(bChecked)}">${getIcon(bChecked)}</div></td>
                    <td style="padding: 6px 4px;"><div id="cell-${user}-${d}-L" onclick="toggleMealCell('${user}', '${d}', 'L')" style="${getCellStyle(lChecked)}">${getIcon(lChecked)}</div></td>
                    <td style="padding: 6px 4px;"><div id="cell-${user}-${d}-D" onclick="toggleMealCell('${user}', '${d}', 'D')" style="${getCellStyle(dChecked)}">${getIcon(dChecked)}</div></td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
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
                icon = '<i class="fas fa-shopping-cart" style="color: var(--color-positive)"></i>';
                title = `${tx.payer} added Grocery`;
                meta = tx.desc;
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
            
            card.innerHTML = `
                <div class="details" style="flex:1;">
                    <div class="title">${icon} ${title}</div>
                    <div class="meta">${dateStr} | ${meta}</div>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <div class="amt ${amtClass}">Rs.${formattedAmt}</div>
                    <button class="btn-delete" title="Delete Log" onclick="deleteTransaction(${tx.id})"><i class="fas fa-trash"></i></button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    const settleBtn = document.getElementById('btn-settle');
    if(settleBtn) settleBtn.onclick = () => showSettleUpModal();
}

window.deleteTransaction = function(id) {
    if(!confirm("Are you sure you want to completely delete this log? Building balances will be recalculated.")) return;
    state.transactions = state.transactions.filter(t => t.id !== id);
    saveData();
    recalculateBalances(true);
    showNotification("Transaction deleted safely.", "info");
}

function showSettleUpModal() {
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
// Core Business Logic
// ==========================================
function setupForms() {
    renderGroceryForm();
    renderMealForm();
    renderPaymentForm();
    
    document.getElementById('form-grocery').addEventListener('submit', (e) => {
        e.preventDefault();
        const payer = document.getElementById('grocery-payer').value;
        const amount = parseFloat(document.getElementById('grocery-amount').value);
        const desc = document.getElementById('grocery-desc').value;
        const dStr = document.getElementById('grocery-date').value;
        
        state.transactions.push({
            id: Date.now(), type: 'grocery', payer, amount, desc,
            date: dStr ? new Date(dStr + 'T12:00:00').toISOString() : new Date().toISOString()
        });
        
        recalculateBalances(true);
        showNotification(`${payer} added Rs.${amount} for ${desc}`);
        e.target.reset(); document.getElementById('grocery-date').valueAsDate = new Date();
    });



    document.getElementById('form-payment').addEventListener('submit', (e) => {
        e.preventDefault();
        const from = document.getElementById('pay-from').value;
        const to = document.getElementById('pay-to').value;
        if (from === to) return showNotification("You can't pay yourself!", "error");
        
        const amount = parseFloat(document.getElementById('pay-amount').value);
        const dStr = document.getElementById('pay-date').value;
        
        state.transactions.push({
            id: Date.now(), type: 'payment', from, to, amount,
            date: dStr ? new Date(dStr + 'T12:00:00').toISOString() : new Date().toISOString()
        });
        
        recalculateBalances(true);
        showNotification(`Logged Rs.${amount} transfer from ${from} to ${to}`);
        e.target.reset(); document.getElementById('pay-date').valueAsDate = new Date();
    });
}

window.toggleMealCell = function(user, day, meal) {
    const isCurrentlyChecked = state.mealSchedule[user][day][meal];
    const newState = !isCurrentlyChecked;
    state.mealSchedule[user][day][meal] = newState;

    const cell = document.getElementById(`cell-${user}-${day}-${meal}`);
    if (cell) {
        if (newState) {
            cell.style.background = 'rgba(57, 255, 20, 0.15)';
            cell.style.color = 'var(--color-positive)';
            cell.style.fontWeight = 'bold';
            cell.style.border = '1px solid var(--color-positive)';
            cell.style.boxShadow = '0 0 10px rgba(57,255,20,0.2)';
            cell.innerHTML = '<i class="fas fa-check"></i>';
        } else {
            cell.style.background = 'rgba(255, 255, 255, 0.05)';
            cell.style.color = 'var(--text-secondary)';
            cell.style.fontWeight = 'normal';
            cell.style.border = '1px solid transparent';
            cell.style.boxShadow = 'none';
            cell.innerHTML = '<i class="fas fa-minus" style="opacity: 0.3;"></i>';
        }
    }

    let userTotal = 0;
    DAYS.forEach(d => {
        ['B', 'L', 'D'].forEach(m => {
            if(state.mealSchedule[user][d] && state.mealSchedule[user][d][m]) userTotal++;
        });
    });
    
    const hasMeals = userTotal > 0;
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

    if(badge) badge.textContent = `${userTotal} Meals`;

    // Recalculate balances without re-rendering the meal UI to keep accordion open
    recalculateBalances(true, false); 
}

// ==========================================
// Service Worker Registration
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {}, (err) => {});
    });
}
