/**
 * Personal Expense Tracker - Main App Controller
 * Manages UI interactions, camera receipts, responsive layouts, and PWA setup
 */

let currentMonthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
let activeTab = 'dashboard';
let deferredInstallPrompt = null;
let currentReceiptBase64 = null;
let editingTransactionId = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Setup theme
  const settings = window.store.getSettings();
  applyTheme(settings.theme || 'dark');

  // Register Service Worker
  registerServiceWorker();

  // Handle PWA Install Prompt
  setupInstallPrompt();

  // Setup Month Picker
  setupMonthPicker();

  // Setup Navigation Tabs
  setupNavigation();

  // Setup Modals & Event Listeners
  setupModals();

  // Setup Search & Filters
  setupFilters();

  // Setup Form Submissions
  setupTransactionForm();

  // Populate Categories Dropdown immediately on startup
  populateCategorySelector('expense');

  // Check Local Network Info for QR Code
  checkNetworkInfo();

  // Subscribe to store updates
  window.store.subscribe(() => {
    populateCategorySelector(document.querySelector('input[name="txType"]:checked')?.value || 'expense');
    renderCurrentView();
  });

  // Initial Render
  renderCurrentView();

  // Try fetching newer data from server on startup if reachable
  window.store.fetchFromServer().then(res => {
    if (res && res.success) {
      populateCategorySelector(document.querySelector('input[name="txType"]:checked')?.value || 'expense');
      renderCurrentView();
      showToast('Data synchronized with laptop', 'info');
    }
  }).catch(() => {});
}

// --- Service Worker & PWA ---

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
        .catch(err => console.log('[PWA] Service Worker registration failed:', err));
    });
  }
}

function setupInstallPrompt() {
  const installBanner = document.getElementById('installBanner');
  const installBtn = document.getElementById('btnInstallApp');
  const settingsInstallBtn = document.getElementById('btnSettingsInstall');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBanner) installBanner.classList.remove('hidden');
    if (settingsInstallBtn) settingsInstallBtn.classList.remove('hidden');
  });

  const triggerInstall = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('[PWA] User response to install:', outcome);
    deferredInstallPrompt = null;
    if (installBanner) installBanner.classList.add('hidden');
    if (settingsInstallBtn) settingsInstallBtn.classList.add('hidden');
  };

  if (installBtn) installBtn.addEventListener('click', triggerInstall);
  if (settingsInstallBtn) settingsInstallBtn.addEventListener('click', triggerInstall);

  const dismissBtn = document.getElementById('btnDismissInstall');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      if (installBanner) installBanner.classList.add('hidden');
    });
  }
}

// --- Handcrafted Color Themes (3 Dark & 3 Light) ---

const THEMES = {
  'dark-slate': {
    id: 'dark-slate',
    name: 'Midnight Slate',
    mode: 'dark',
    icon: '🌌',
    metaColor: '#0b0f19',
    desc: 'Obsidian & neon indigo'
  },
  'dark-emerald': {
    id: 'dark-emerald',
    name: 'Forest Emerald',
    mode: 'dark',
    icon: '🌲',
    metaColor: '#07130e',
    desc: 'Pine & emerald glow'
  },
  'dark-amethyst': {
    id: 'dark-amethyst',
    name: 'Amethyst Night',
    mode: 'dark',
    icon: '🔮',
    metaColor: '#0f0a1c',
    desc: 'Cosmic violet & neon'
  },
  'light-nordic': {
    id: 'light-nordic',
    name: 'Nordic Glacier',
    mode: 'light',
    icon: '❄️',
    metaColor: '#f8fafc',
    desc: 'Crisp slate & royal blue'
  },
  'light-sand': {
    id: 'light-sand',
    name: 'Sage & Sand',
    mode: 'light',
    icon: '🌿',
    metaColor: '#f7f6f0',
    desc: 'Warm linen & moss'
  },
  'light-rose': {
    id: 'light-rose',
    name: 'Rose Quartz',
    mode: 'light',
    icon: '🌸',
    metaColor: '#faf5f7',
    desc: 'Soft blush & raspberry'
  }
};

function normalizeTheme(theme) {
  if (theme === 'dark') return 'dark-slate';
  if (theme === 'light') return 'light-nordic';
  if (THEMES[theme]) return theme;
  return 'dark-slate';
}

function applyTheme(rawTheme) {
  const theme = normalizeTheme(rawTheme);
  const themeInfo = THEMES[theme] || THEMES['dark-slate'];

  document.documentElement.setAttribute('data-theme', theme);

  // Update mobile status bar theme-color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme && themeInfo.metaColor) {
    metaTheme.setAttribute('content', themeInfo.metaColor);
  }

  // Update header theme button icon and tooltip
  const toggleBtn = document.getElementById('btnThemeToggle');
  if (toggleBtn) {
    toggleBtn.textContent = themeInfo.icon;
    toggleBtn.title = `Current Theme: ${themeInfo.name} (${themeInfo.mode === 'dark' ? 'Dark' : 'Light'}). Tap to change.`;
  }

  // Update Settings screen theme indicator
  const subtitle = document.getElementById('settingsThemeSubtitle');
  if (subtitle) {
    subtitle.textContent = `${themeInfo.icon} ${themeInfo.name} (${themeInfo.mode === 'dark' ? 'Dark' : 'Light'})`;
  }

  // Highlight active card in Theme Modal
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-theme-id') === theme);
  });
}

function selectTheme(themeId) {
  const theme = normalizeTheme(themeId);
  applyTheme(theme);
  window.store.updateSettings({ theme });
  const themeInfo = THEMES[theme];
  showToast(`Theme changed to ${themeInfo.icon} ${themeInfo.name}`, 'info');
  window.store.syncWithServer().catch(() => {});
}

// Make selectTheme globally accessible
window.selectTheme = selectTheme;
window.THEMES = THEMES;

// --- Navigation ---

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // FAB button
  const fab = document.getElementById('fabAdd');
  if (fab) {
    fab.addEventListener('click', () => openTransactionModal());
  }

  // Quick Action Buttons
  document.querySelectorAll('.btn-quick-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-category');
      const amt = btn.getAttribute('data-amount') || '';
      openTransactionModal({ category: cat, amount: amt, type: 'expense' });
    });
  });
}

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });

  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.toggle('active', view.id === `tab-${tabName}`);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderCurrentView();
}

// --- Month Picker ---

function setupMonthPicker() {
  const btnPrev = document.getElementById('btnPrevMonth');
  const btnNext = document.getElementById('btnNextMonth');
  const label = document.getElementById('currentMonthLabel');

  const updateMonthDisplay = () => {
    const [year, month] = currentMonthYear.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const formatted = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (label) label.textContent = formatted;
    renderCurrentView();
  };

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      const [year, month] = currentMonthYear.split('-').map(Number);
      const prevDate = new Date(year, month - 2, 1);
      currentMonthYear = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      updateMonthDisplay();
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const [year, month] = currentMonthYear.split('-').map(Number);
      const nextDate = new Date(year, month, 1);
      currentMonthYear = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      updateMonthDisplay();
    });
  }

  updateMonthDisplay();
}

// --- Main Render Dispatcher ---

function renderCurrentView() {
  const settings = window.store.getSettings();
  const currency = settings.currency || '$';

  // Update Top Balance Header
  renderSummaryHeader(currency);

  switch (activeTab) {
    case 'dashboard':
      renderDashboard(currency);
      break;
    case 'transactions':
      renderTransactionsList(currency);
      break;
    case 'budgets':
      renderBudgets(currency);
      break;
    case 'analytics':
      renderAnalytics(currency);
      break;
    case 'settings':
      renderSettings();
      break;
  }
}

// --- Render Header & Cards ---

function renderSummaryHeader(currency) {
  const summary = window.store.getMonthlySummary(currentMonthYear);

  const elBalance = document.getElementById('summaryBalance');
  const elIncome = document.getElementById('summaryIncome');
  const elExpense = document.getElementById('summaryExpense');
  const elSavingsRate = document.getElementById('summarySavingsRate');

  if (elBalance) {
    const sign = summary.netSavings < 0 ? '-' : '';
    elBalance.textContent = `${sign}${currency}${Math.abs(summary.netSavings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    elBalance.className = summary.netSavings >= 0 ? 'metric-val positive' : 'metric-val negative';
  }

  if (elIncome) {
    elIncome.textContent = `+${currency}${summary.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (elExpense) {
    elExpense.textContent = `-${currency}${summary.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (elSavingsRate) {
    elSavingsRate.textContent = `${summary.savingsRate}%`;
  }
}

// --- Render Dashboard ---

function renderDashboard(currency) {
  const summary = window.store.getMonthlySummary(currentMonthYear);
  const categories = window.store.getCategories();

  // Donut chart dataset
  const donutData = Object.entries(summary.categoryExpenses).map(([name, val]) => {
    const cat = window.store.getCategoryByName(name);
    return {
      label: name,
      value: val,
      color: cat.color || '#6366f1',
      icon: cat.icon || '🏷️'
    };
  });

  window.ExpenseCharts.renderDonut('dashboardDonutChart', donutData, currency);

  // Spending Pace / Daily Allowance
  renderPaceCalculator(summary, currency);

  // Recent 5 Transactions
  const recent = window.store.getTransactions().slice(0, 5);
  const container = document.getElementById('recentTransactionsList');
  if (container) {
    if (recent.length === 0) {
      container.innerHTML = `<div class="empty-state">No transactions yet. Tap the <b>+</b> button below to log one!</div>`;
    } else {
      container.innerHTML = recent.map(t => renderTransactionItem(t, currency)).join('');
      attachTransactionClickEvents(container);
    }
  }
}

function renderPaceCalculator(summary, currency) {
  const container = document.getElementById('dashboardPace');
  if (!container) return;

  const [year, month] = currentMonthYear.split('-').map(Number);
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month;
  
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysPassed = isCurrentMonth ? now.getDate() : daysInMonth;
  const daysRemaining = isCurrentMonth ? Math.max(1, daysInMonth - daysPassed) : 0;

  const avgDailySpent = daysPassed > 0 ? (summary.totalExpense / daysPassed) : 0;

  // Total budget
  const budgets = window.store.getBudgets();
  const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);

  if (totalBudget > 0 && isCurrentMonth) {
    const remainingBudget = Math.max(0, totalBudget - summary.totalExpense);
    const allowedDaily = (remainingBudget / daysRemaining).toFixed(2);
    const pctUsed = ((summary.totalExpense / totalBudget) * 100).toFixed(0);

    container.innerHTML = `
      <div class="pace-card">
        <div class="pace-header">
          <span>Monthly Budget Status</span>
          <span class="pace-badge ${pctUsed > 100 ? 'badge-danger' : pctUsed > 80 ? 'badge-warning' : 'badge-success'}">${pctUsed}% Used</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${Math.min(100, pctUsed)}%; background-color: ${pctUsed > 100 ? '#f43f5e' : pctUsed > 80 ? '#fbbf24' : '#10b981'};"></div>
        </div>
        <div class="pace-details">
          <span>Allowed spend: <b>${currency}${allowedDaily}/day</b> for ${daysRemaining} days remaining</span>
          <span>Budget: ${currency}${totalBudget}</span>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="pace-card">
        <div class="pace-header">
          <span>Average Spending Pace</span>
        </div>
        <div class="pace-details">
          <span>Average Daily: <b>${currency}${avgDailySpent.toFixed(2)}/day</b> over ${daysPassed} days</span>
        </div>
      </div>
    `;
  }
}

// --- Render Transactions Tab ---

function setupFilters() {
  const typeFilter = document.getElementById('filterType');
  const catFilter = document.getElementById('filterCategory');
  const searchInput = document.getElementById('filterSearch');

  if (typeFilter) typeFilter.addEventListener('change', () => renderTransactionsList());
  if (catFilter) catFilter.addEventListener('change', () => renderTransactionsList());
  if (searchInput) searchInput.addEventListener('input', () => renderTransactionsList());
}

function renderTransactionsList(currency) {
  if (!currency) currency = window.store.getSettings().currency || '$';

  const type = document.getElementById('filterType') ? document.getElementById('filterType').value : 'all';
  const category = document.getElementById('filterCategory') ? document.getElementById('filterCategory').value : 'all';
  const search = document.getElementById('filterSearch') ? document.getElementById('filterSearch').value.trim() : '';

  // Populate category filter dropdown if empty
  const catFilterEl = document.getElementById('filterCategory');
  if (catFilterEl && catFilterEl.options.length <= 1) {
    const cats = window.store.getCategories();
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${c.icon} ${c.name}`;
      catFilterEl.appendChild(opt);
    });
  }

  const transactions = window.store.getTransactions({
    type,
    category,
    search,
    monthYear: currentMonthYear
  });

  const container = document.getElementById('transactionsList');
  const countEl = document.getElementById('transactionsCount');
  if (countEl) countEl.textContent = `${transactions.length} record${transactions.length === 1 ? '' : 's'}`;

  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No matching transactions found.</p>
        <button class="btn btn-secondary btn-sm" onclick="clearFilters()">Reset Filters</button>
      </div>
    `;
    return;
  }

  // Group transactions by date
  const groups = {};
  transactions.forEach(t => {
    const d = t.date || 'Unknown Date';
    if (!groups[d]) groups[d] = [];
    groups[d].push(t);
  });

  let html = '';
  for (const [date, items] of Object.entries(groups)) {
    const dateFormatted = formatFriendlyDate(date);
    const dayTotal = items.reduce((sum, item) => sum + (item.type === 'expense' ? -item.amount : item.amount), 0);

    html += `
      <div class="transaction-group">
        <div class="group-header">
          <span class="group-date">${dateFormatted}</span>
          <span class="group-total ${dayTotal >= 0 ? 'text-success' : 'text-danger'}">
            ${dayTotal >= 0 ? '+' : '-'}${currency}${Math.abs(dayTotal).toFixed(2)}
          </span>
        </div>
        <div class="group-items">
          ${items.map(t => renderTransactionItem(t, currency)).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  attachTransactionClickEvents(container);
}

function clearFilters() {
  if (document.getElementById('filterType')) document.getElementById('filterType').value = 'all';
  if (document.getElementById('filterCategory')) document.getElementById('filterCategory').value = 'all';
  if (document.getElementById('filterSearch')) document.getElementById('filterSearch').value = '';
  renderTransactionsList();
}

function renderTransactionItem(t, currency) {
  const cat = window.store.getCategoryByName(t.category);
  const isIncome = t.type === 'income';
  const cleanId = escapeHtml(t.id || '');
  const cleanCat = escapeHtml(t.category || 'Other Expense');
  const cleanMethod = escapeHtml(t.paymentMethod || 'Cash');
  const cleanCurrency = escapeHtml(currency || '$');
  const cleanAmount = (parseFloat(t.amount) || 0).toFixed(2);
  const catColor = escapeHtml(cat.color || '#6366f1');

  return `
    <div class="transaction-item" data-id="${cleanId}">
      <div class="tx-icon" style="background-color: ${catColor}20; color: ${catColor};">
        ${escapeHtml(cat.icon || '🏷️')}
      </div>
      <div class="tx-info">
        <div class="tx-title-row">
          <span class="tx-category">${cleanCat}</span>
          ${(t.receipt && typeof t.receipt === 'string' && t.receipt.startsWith('data:image/')) ? '<span class="receipt-badge" title="Has receipt photo">🧾</span>' : ''}
        </div>
        <div class="tx-meta">
          <span>${cleanMethod}</span>
          ${t.notes ? `<span>• ${escapeHtml(t.notes)}</span>` : ''}
        </div>
      </div>
      <div class="tx-amount ${isIncome ? 'amount-income' : 'amount-expense'}">
        ${isIncome ? '+' : '-'}${cleanCurrency}${cleanAmount}
      </div>
    </div>
  `;
}

function attachTransactionClickEvents(container) {
  container.querySelectorAll('.transaction-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const id = item.getAttribute('data-id');
      const tx = window.store.getTransactionById(id);
      if (tx) {
        openTransactionDetailModal(tx);
      }
    });
  });
}

function formatFriendlyDate(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (dateStr === today) return 'Today';
  if (dateStr === yest) return 'Yesterday';

  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  return dateStr;
}

// --- Render Budgets Tab ---

function renderBudgets(currency) {
  const summary = window.store.getMonthlySummary(currentMonthYear);
  const budgets = window.store.getBudgets();
  const categories = window.store.getCategories().filter(c => c.type === 'expense');

  const container = document.getElementById('budgetsList');
  if (!container) return;

  let html = '';

  categories.forEach(cat => {
    const budgetLimit = budgets[cat.name] || 0;
    const spent = summary.categoryExpenses[cat.name] || 0;
    const percentage = budgetLimit > 0 ? Math.round((spent / budgetLimit) * 100) : 0;
    const remaining = budgetLimit - spent;

    let statusClass = 'progress-normal';
    let statusText = 'On Track';
    if (percentage >= 100) {
      statusClass = 'progress-danger';
      statusText = 'Exceeded!';
    } else if (percentage >= 80) {
      statusClass = 'progress-warning';
      statusText = 'Nearing Limit';
    }

    html += `
      <div class="budget-card">
        <div class="budget-header">
          <div class="budget-category">
            <span class="category-icon" style="background: ${cat.color}20">${cat.icon}</span>
            <div>
              <span class="category-name">${cat.name}</span>
              <span class="budget-status ${statusClass}">${statusText} (${percentage}%)</span>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="openBudgetModal('${escapeHtml(cat.name)}', ${budgetLimit})">
            ${budgetLimit > 0 ? 'Edit' : '+ Set'}
          </button>
        </div>

        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${statusClass}" style="width: ${Math.min(100, percentage)}%"></div>
        </div>

        <div class="budget-footer">
          <span>Spent: <b>${currency}${spent.toFixed(2)}</b></span>
          <span>${budgetLimit > 0 ? `Limit: ${currency}${budgetLimit.toFixed(2)}` : 'No budget set'}</span>
          <span class="${remaining < 0 ? 'text-danger' : 'text-success'}">
            ${budgetLimit > 0 ? (remaining >= 0 ? `${currency}${remaining.toFixed(2)} left` : `Over by ${currency}${Math.abs(remaining).toFixed(2)}`) : ''}
          </span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// --- Render Analytics Tab ---

function renderAnalytics(currency) {
  const summary = window.store.getMonthlySummary(currentMonthYear);

  // 1. Big Donut
  const donutData = Object.entries(summary.categoryExpenses).map(([name, val]) => {
    const cat = window.store.getCategoryByName(name);
    return {
      label: name,
      value: val,
      color: cat.color || '#6366f1',
      icon: cat.icon || '🏷️'
    };
  });
  window.ExpenseCharts.renderDonut('analyticsDonutChart', donutData, currency);

  // 2. Bar Comparison for previous 4 months
  const monthlyData = [];
  const [curYear, curMonth] = currentMonthYear.split('-').map(Number);

  for (let i = 3; i >= 0; i--) {
    const d = new Date(curYear, curMonth - 1 - i, 1);
    const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mSummary = window.store.getMonthlySummary(mStr);
    const monthLabel = d.toLocaleDateString(undefined, { month: 'short' });
    monthlyData.push({
      label: monthLabel,
      income: mSummary.totalIncome,
      expense: mSummary.totalExpense
    });
  }
  window.ExpenseCharts.renderBarComparison('analyticsBarChart', monthlyData, currency);

  // 3. Top 5 Expenses
  const topExpenses = window.store.getTransactions({ monthYear: currentMonthYear, type: 'expense' })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const topListEl = document.getElementById('analyticsTopExpenses');
  if (topListEl) {
    if (topExpenses.length === 0) {
      topListEl.innerHTML = '<div class="empty-state">No expense records this month</div>';
    } else {
      topListEl.innerHTML = topExpenses.map((t, i) => {
        const cat = window.store.getCategoryByName(t.category);
        return `
          <div class="top-expense-row">
            <span class="rank-badge">#${i + 1}</span>
            <span class="cat-pill">${cat.icon} ${t.category}</span>
            <span class="top-notes">${escapeHtml(t.notes || 'Expense')}</span>
            <span class="top-amt">${currency}${t.amount.toFixed(2)}</span>
          </div>
        `;
      }).join('');
    }
  }
}

// --- Render Settings Tab ---

function renderSettings() {
  const settings = window.store.getSettings();
  const selectCurrency = document.getElementById('selectCurrency');
  if (selectCurrency) {
    selectCurrency.value = settings.currency || '$';
  }

  const syncStatusEl = document.getElementById('settingsSyncStatus');
  if (syncStatusEl) {
    syncStatusEl.textContent = settings.lastSynced
      ? `Last synced: ${new Date(settings.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Not synced yet';
  }

  const currentTheme = normalizeTheme(settings.theme);
  const themeInfo = THEMES[currentTheme];
  const subtitle = document.getElementById('settingsThemeSubtitle');
  if (subtitle && themeInfo) {
    subtitle.textContent = `${themeInfo.icon} ${themeInfo.name} (${themeInfo.mode === 'dark' ? 'Dark' : 'Light'})`;
  }
}

// --- Transaction Modal & Form ---

function setupTransactionForm() {
  const form = document.getElementById('transactionForm');
  const typeRadios = document.querySelectorAll('input[name="txType"]');
  const cameraInput = document.getElementById('receiptCameraInput');
  const removePhotoBtn = document.getElementById('btnRemoveReceipt');

  // Switch Categories when Type changes (Income vs Expense)
  typeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      populateCategorySelector(radio.value);
    });
  });

  // Camera & Image Compression
  if (cameraInput) {
    cameraInput.addEventListener('change', handleReceiptUpload);
  }

  if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', () => {
      currentReceiptBase64 = null;
      document.getElementById('receiptPreviewContainer').classList.add('hidden');
      cameraInput.value = '';
    });
  }

  // Form Submit
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const type = document.querySelector('input[name="txType"]:checked').value;
      const amount = parseFloat(document.getElementById('txAmount').value);
      const category = document.getElementById('txCategory').value;
      const paymentMethod = document.getElementById('txPaymentMethod').value;
      const date = document.getElementById('txDate').value;
      const notes = document.getElementById('txNotes').value;

      if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'warning');
        return;
      }

      if (editingTransactionId) {
        window.store.updateTransaction(editingTransactionId, {
          type,
          amount,
          category,
          paymentMethod,
          date,
          notes,
          receipt: currentReceiptBase64
        });
        showToast('Transaction updated', 'success');
      } else {
        window.store.addTransaction({
          type,
          amount,
          category,
          paymentMethod,
          date,
          notes,
          receipt: currentReceiptBase64
        });
        showToast('Transaction saved', 'success');
      }

      closeModal('transactionModal');
      // Auto-trigger background server sync
      window.store.syncWithServer().catch(() => {});
    });
  }
}

function populateCategorySelector(type = 'expense', selectedCategory = null) {
  const select = document.getElementById('txCategory');
  if (!select) return;

  let allCats = window.store.getCategories();
  if (!allCats || allCats.length === 0) {
    allCats = (typeof DEFAULT_CATEGORIES !== 'undefined') ? DEFAULT_CATEGORIES : [];
  }

  const categories = allCats.filter(c => c.type === type);
  if (categories.length === 0) {
    // If still empty for some reason, don't clear the fallback HTML options
    return;
  }

  select.innerHTML = '';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.icon} ${c.name}`;
    if (selectedCategory && selectedCategory === c.name) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function handleReceiptUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Security: reject files that are not images or exceed 12MB
  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file', 'warning');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast('File size too large (max 12MB)', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // Memory & Storage Quota Optimization:
      // Compress to max 640px and 0.62 JPEG quality (~30KB), keeping receipts crisp without exhausting localStorage
      const maxDim = 640;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      currentReceiptBase64 = canvas.toDataURL('image/jpeg', 0.62);

      // Show preview
      const previewImg = document.getElementById('receiptPreviewImg');
      if (previewImg) previewImg.src = currentReceiptBase64;
      document.getElementById('receiptPreviewContainer').classList.remove('hidden');
    };
    img.onerror = () => {
      showToast('Could not process image file', 'danger');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function openTransactionModal(preset = {}) {
  editingTransactionId = preset.id || null;
  const modalTitle = document.getElementById('txModalTitle');
  if (modalTitle) {
    modalTitle.textContent = editingTransactionId ? 'Edit Transaction' : 'Add Transaction';
  }

  const type = preset.type || 'expense';
  const radio = document.querySelector(`input[name="txType"][value="${type}"]`);
  if (radio) radio.checked = true;

  populateCategorySelector(type, preset.category);

  document.getElementById('txAmount').value = preset.amount !== undefined ? preset.amount : '';
  document.getElementById('txPaymentMethod').value = preset.paymentMethod || 'Cash';
  document.getElementById('txDate').value = preset.date || new Date().toISOString().slice(0, 10);
  document.getElementById('txNotes').value = preset.notes || '';

  // Receipt preview
  currentReceiptBase64 = preset.receipt || null;
  const previewContainer = document.getElementById('receiptPreviewContainer');
  const previewImg = document.getElementById('receiptPreviewImg');
  if (currentReceiptBase64) {
    if (previewImg) previewImg.src = currentReceiptBase64;
    previewContainer.classList.remove('hidden');
  } else {
    previewContainer.classList.add('hidden');
  }

  openModal('transactionModal');
}

// --- Transaction Details & Action Modal ---

function openTransactionDetailModal(tx) {
  const currency = window.store.getSettings().currency || '$';
  const cat = window.store.getCategoryByName(tx.category);

  const container = document.getElementById('detailModalContent');
  if (!container) return;

  const cleanCat = escapeHtml(tx.category || 'Other Expense');
  const cleanCurrency = escapeHtml(currency);
  const cleanAmount = (parseFloat(tx.amount) || 0).toFixed(2);
  const cleanDate = escapeHtml(tx.date || '');
  const cleanType = escapeHtml(tx.type || 'expense');
  const cleanMethod = escapeHtml(tx.paymentMethod || 'Cash');
  const catColor = escapeHtml(cat.color || '#6366f1');
  const hasValidReceipt = (tx.receipt && typeof tx.receipt === 'string' && tx.receipt.startsWith('data:image/'));

  container.innerHTML = `
    <div class="detail-header">
      <div class="detail-badge" style="background: ${catColor}20; color: ${catColor};">${escapeHtml(cat.icon || '🏷️')}</div>
      <h3 class="detail-category">${cleanCat}</h3>
      <div class="detail-amount ${tx.type === 'income' ? 'text-success' : 'text-danger'}">
        ${tx.type === 'income' ? '+' : '-'}${cleanCurrency}${cleanAmount}
      </div>
    </div>

    <div class="detail-rows">
      <div class="detail-row">
        <span>Date:</span>
        <b>${cleanDate}</b>
      </div>
      <div class="detail-row">
        <span>Type:</span>
        <b style="text-transform: capitalize;">${cleanType}</b>
      </div>
      <div class="detail-row">
        <span>Payment Method:</span>
        <b>${cleanMethod}</b>
      </div>
      ${tx.notes ? `
        <div class="detail-row notes-row">
          <span>Notes:</span>
          <p>${escapeHtml(tx.notes)}</p>
        </div>
      ` : ''}
    </div>

    ${hasValidReceipt ? `
      <div class="detail-receipt-preview" id="btnDetailReceiptZoom">
        <img src="${escapeHtml(tx.receipt)}" alt="Receipt">
        <span class="zoom-hint">🔍 Tap to enlarge receipt</span>
      </div>
    ` : ''}

    <div class="detail-actions">
      <button class="btn btn-outline" id="btnEditTx">✏️ Edit</button>
      <button class="btn btn-danger" id="btnDeleteTx">🗑️ Delete</button>
    </div>
  `;

  // Safely attach receipt zoom event listener without inline script injection
  if (hasValidReceipt) {
    const zoomEl = document.getElementById('btnDetailReceiptZoom');
    if (zoomEl) {
      zoomEl.addEventListener('click', () => {
        openFullscreenReceipt(tx.receipt);
      });
    }
  }

  document.getElementById('btnEditTx').addEventListener('click', () => {
    closeModal('detailModal');
    openTransactionModal(tx);
  });

  document.getElementById('btnDeleteTx').addEventListener('click', () => {
    if (confirm('Delete this transaction?')) {
      window.store.deleteTransaction(tx.id);
      closeModal('detailModal');
      showToast('Transaction deleted', 'info');
      window.store.syncWithServer().catch(() => {});
    }
  });

  openModal('detailModal');
}

function openFullscreenReceipt(src) {
  // Validate that source is safe
  if (typeof src === 'string' && (src.startsWith('data:image/') || src.startsWith('./'))) {
    const img = document.getElementById('fullscreenReceiptImg');
    if (img) img.src = src;
    openModal('receiptModal');
  }
}

// --- Budget Set Modal ---

function openBudgetModal(categoryName, currentLimit = 0) {
  const nameEl = document.getElementById('budgetCategoryName');
  const inputEl = document.getElementById('budgetAmountInput');
  if (nameEl) nameEl.textContent = categoryName;
  if (inputEl) inputEl.value = currentLimit > 0 ? currentLimit : '';

  const saveBtn = document.getElementById('btnSaveBudget');
  saveBtn.onclick = () => {
    const val = parseFloat(inputEl.value);
    window.store.setBudget(categoryName, isNaN(val) ? 0 : val);
    closeModal('budgetModal');
    showToast(`Budget updated for ${categoryName}`, 'success');
    window.store.syncWithServer().catch(() => {});
  };

  openModal('budgetModal');
}

// --- Setup Modals & Dialogs ---

function setupModals() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = btn.closest('.modal-backdrop');
      if (modal) modal.classList.remove('active');
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });

  // Settings Buttons
  const btnSync = document.getElementById('btnSyncServer');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.textContent = '⏳ Syncing...';
      const res = await window.store.syncWithServer();
      btnSync.textContent = '🔄 Sync with Laptop';
      if (res.success) {
        showToast('Successfully synced with laptop!', 'success');
        renderSettings();
      } else {
        showToast('Sync failed: ensure laptop server is running', 'warning');
      }
    });
  }

  const btnExportCSV = document.getElementById('btnExportCSV');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => window.store.exportToCSV());
  }

  const btnExportJSON = document.getElementById('btnExportJSON');
  if (btnExportJSON) {
    btnExportJSON.addEventListener('click', () => window.store.exportToJSON());
  }

  const fileImport = document.getElementById('fileImportJSON');
  if (fileImport) {
    fileImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const res = window.store.importFromJSON(event.target.result);
        if (res.success) {
          showToast(`Imported ${res.count} transactions!`, 'success');
          renderCurrentView();
        } else {
          showToast('Import error: ' + res.error, 'danger');
        }
      };
      reader.readAsText(file);
      fileImport.value = '';
    });
  }

  const selectCurrency = document.getElementById('selectCurrency');
  if (selectCurrency) {
    selectCurrency.addEventListener('change', (e) => {
      window.store.updateSettings({ currency: e.target.value });
      showToast(`Currency set to ${e.target.value}`, 'info');
      renderCurrentView();
    });
  }

  const btnThemeToggle = document.getElementById('btnThemeToggle');
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => openModal('themeModal'));
  }

  const btnPairingQR = document.getElementById('btnShowPairingQR');
  if (btnPairingQR) {
    btnPairingQR.addEventListener('click', () => {
      checkNetworkInfo();
      openModal('pairingModal');
    });
  }

  const btnZoomQr = document.getElementById('btnZoomQr');
  if (btnZoomQr) {
    btnZoomQr.addEventListener('click', () => {
      checkNetworkInfo();
      openModal('pairingModal');
    });
  }

  const btnCopyDashboard = document.getElementById('btnCopyDashboardUrl');
  if (btnCopyDashboard) {
    btnCopyDashboard.addEventListener('click', () => {
      const url = document.getElementById('dashboardMobileUrl')?.textContent || '';
      copyToClipboard(url);
    });
  }

  const btnCopyModal = document.getElementById('btnCopyModalUrl');
  if (btnCopyModal) {
    btnCopyModal.addEventListener('click', () => {
      const url = document.getElementById('pairingMobileUrl')?.textContent || '';
      copyToClipboard(url);
    });
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

async function copyToClipboard(text) {
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('Copied link: ' + text, 'success');
      return;
    }
  } catch (err) {}

  // Fallback copy mechanism
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('Copied link: ' + text, 'success');
  } catch (e) {
    showToast('Failed to copy link', 'warning');
  }
  document.body.removeChild(textarea);
}

// --- Phone QR Code Pairing Display ---

async function checkNetworkInfo() {
  let mobileUrl = '';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('/api/info', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const info = await res.json();
      mobileUrl = info.mobileUrl;
    }
  } catch (e) {
    // Offline or server running standalone
  }

  // Resilient fallback logic
  if (!mobileUrl) {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      const portPart = window.location.port ? `:${window.location.port}` : '';
      const pathPart = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
      mobileUrl = `${window.location.protocol}//${host}${portPart}${pathPart}`;
    } else {
      mobileUrl = `http://192.168.31.93:3000`;
    }
  }

  // Hide the "Connect Phone" banner if we are ALREADY running on a mobile device
  if (window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    const banner = document.getElementById('dashboardPhoneCard');
    if (banner) banner.style.display = 'none';
  }

  // Update pairing modal
  const urlDisplay = document.getElementById('pairingMobileUrl');
  if (urlDisplay) urlDisplay.textContent = mobileUrl;
  const qrModalContainer = document.getElementById('pairingQrCode');
  if (qrModalContainer && mobileUrl) {
    renderSvgQrCode(qrModalContainer, mobileUrl, 6, 4);
  }

  // Update dashboard quick connect card
  const dashboardUrl = document.getElementById('dashboardMobileUrl');
  if (dashboardUrl) dashboardUrl.textContent = mobileUrl;
  const dashboardQr = document.getElementById('dashboardQrCode');
  if (dashboardQr && mobileUrl) {
    renderSvgQrCode(dashboardQr, mobileUrl, 4, 2);
  }
}

/**
 * Pure Local SVG QR-Code Matrix Renderer
 * 100% Offline, Zero external cloud requests, Zero private IP leakage
 */
function renderSvgQrCode(container, text, cellSize = 6, margin = 4) {
  try {
    if (typeof qrcode === 'function') {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const svgTag = qr.createSvgTag(cellSize, margin);
      container.innerHTML = `
        <div class="qr-box">
          <div class="qr-svg-wrapper" style="background: #ffffff; padding: 10px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 14px rgba(0,0,0,0.25);">
            ${svgTag}
          </div>
        </div>
      `;
      return;
    }
  } catch (err) {
    console.warn('Local QR generation error, using fallback:', err);
  }

  // Graceful zero-network fallback
  container.innerHTML = `
    <div class="qr-box">
      <div class="qr-fallback" style="padding: 16px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color);">
        📱 Open on phone:<br><b style="word-break: break-all; color: var(--accent-primary);">${escapeHtml(text)}</b>
      </div>
    </div>
  `;
}

// --- Toast Notifications ---

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
