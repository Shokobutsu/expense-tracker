/**
 * Storage & Data Management Layer
 * Handles IndexedDB / LocalStorage, defaults, data sync, and export/import
 */

const DEFAULT_CATEGORIES = [
  { id: 'cat-food', name: 'Food & Dining', icon: '🍔', color: '#f97316', type: 'expense' },
  { id: 'cat-groceries', name: 'Groceries', icon: '🛒', color: '#10b981', type: 'expense' },
  { id: 'cat-transport', name: 'Transport', icon: '🚗', color: '#3b82f6', type: 'expense' },
  { id: 'cat-housing', name: 'Housing & Rent', icon: '🏠', color: '#8b5cf6', type: 'expense' },
  { id: 'cat-bills', name: 'Bills & Utilities', icon: '💡', color: '#eab308', type: 'expense' },
  { id: 'cat-shopping', name: 'Shopping', icon: '🛍️', color: '#ec4899', type: 'expense' },
  { id: 'cat-entertainment', name: 'Entertainment', icon: '🎬', color: '#a855f7', type: 'expense' },
  { id: 'cat-health', name: 'Health & Medical', icon: '💊', color: '#ef4444', type: 'expense' },
  { id: 'cat-travel', name: 'Travel', icon: '✈️', color: '#06b6d4', type: 'expense' },
  { id: 'cat-other', name: 'Other Expense', icon: '🏷️', color: '#64748b', type: 'expense' },
  { id: 'cat-salary', name: 'Salary', icon: '💰', color: '#22c55e', type: 'income' },
  { id: 'cat-freelance', name: 'Freelance & Bonus', icon: '💼', color: '#6366f1', type: 'income' },
  { id: 'cat-invest', name: 'Investments', icon: '📈', color: '#0ea5e9', type: 'income' },
  { id: 'cat-gift', name: 'Gifts & Other', icon: '🎁', color: '#14b8a6', type: 'income' }
];

const DEFAULT_PAYMENT_METHODS = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Digital Wallet'];

const DEFAULT_BUDGETS = {
  'Food & Dining': 400,
  'Groceries': 350,
  'Transport': 150,
  'Shopping': 200,
  'Bills & Utilities': 250,
  'Entertainment': 100
};

const STORAGE_KEY = 'expense_tracker_state_v1';

class ExpenseStore {
  constructor() {
    this.state = {
      transactions: [],
      budgets: { ...DEFAULT_BUDGETS },
      categories: [...DEFAULT_CATEGORIES],
      settings: {
        currency: '$',
        theme: 'dark'
      },
      lastSynced: null
    };
    this.listeners = new Set();
    this.init();
  }

  init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const categories = (parsed.categories && parsed.categories.length > 0)
          ? parsed.categories
          : [...DEFAULT_CATEGORIES];

        this.state = {
          ...this.state,
          ...parsed,
          categories,
          settings: { ...this.state.settings, ...(parsed.settings || {}) },
          budgets: { ...this.state.budgets, ...(parsed.budgets || {}) }
        };
      } else {
        // First run: populate with realistic demo transactions for the current month
        this.populateDemoData();
      }
    } catch (e) {
      console.warn('Failed to load local storage, initializing defaults:', e);
      this.populateDemoData();
    }

    if (!this.state.categories || this.state.categories.length === 0) {
      this.state.categories = [...DEFAULT_CATEGORIES];
    }
  }

  populateDemoData() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');

    this.state.transactions = [
      {
        id: 'tx-1',
        type: 'income',
        amount: 4500,
        category: 'Salary',
        paymentMethod: 'Bank Transfer',
        date: `${year}-${month}-01`,
        notes: 'Monthly Primary Salary',
        receipt: null,
        createdAt: new Date(year, today.getMonth(), 1, 9, 0).toISOString()
      },
      {
        id: 'tx-2',
        type: 'expense',
        amount: 85.50,
        category: 'Groceries',
        paymentMethod: 'Credit Card',
        date: `${year}-${month}-03`,
        notes: 'Supermarket weekly fresh produce',
        receipt: null,
        createdAt: new Date(year, today.getMonth(), 3, 14, 30).toISOString()
      },
      {
        id: 'tx-3',
        type: 'expense',
        amount: 24.00,
        category: 'Food & Dining',
        paymentMethod: 'Digital Wallet',
        date: `${year}-${month}-05`,
        notes: 'Ramen lunch with coworkers',
        receipt: null,
        createdAt: new Date(year, today.getMonth(), 5, 12, 15).toISOString()
      },
      {
        id: 'tx-4',
        type: 'expense',
        amount: 45.00,
        category: 'Transport',
        paymentMethod: 'Credit Card',
        date: `${year}-${month}-07`,
        notes: 'Fuel / Gas refuel',
        receipt: null,
        createdAt: new Date(year, today.getMonth(), 7, 18, 0).toISOString()
      },
      {
        id: 'tx-5',
        type: 'expense',
        amount: 110.00,
        category: 'Bills & Utilities',
        paymentMethod: 'Bank Transfer',
        date: `${year}-${month}-08`,
        notes: 'Electric & High-speed Internet',
        receipt: null,
        createdAt: new Date(year, today.getMonth(), 8, 10, 0).toISOString()
      },
      {
        id: 'tx-6',
        type: 'expense',
        amount: 65.00,
        category: 'Shopping',
        paymentMethod: 'Credit Card',
        date: `${year}-${month}-10`,
        notes: 'New running shoes',
        receipt: null,
        createdAt: new Date(year, today.getMonth(), 10, 16, 45).toISOString()
      }
    ];
    this.save();
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
      if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
          window.showToast('Storage quota exceeded! Remove older receipt images to free up space.', 'danger');
        }
      }
    }
    this.notify();
  }

  sanitizeTransaction(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const cleanAmount = Math.abs(parseFloat(raw.amount));
    return {
      id: (typeof raw.id === 'string' && raw.id.length <= 64)
        ? raw.id.replace(/[^a-zA-Z0-9_-]/g, '')
        : 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      type: raw.type === 'income' ? 'income' : 'expense',
      amount: isNaN(cleanAmount) ? 0 : Math.round(cleanAmount * 100) / 100,
      category: typeof raw.category === 'string' ? raw.category.slice(0, 60).trim() : 'Other Expense',
      paymentMethod: typeof raw.paymentMethod === 'string' ? raw.paymentMethod.slice(0, 60).trim() : 'Cash',
      date: (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) ? raw.date : new Date().toISOString().slice(0, 10),
      notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 500) : '',
      receipt: (typeof raw.receipt === 'string' && raw.receipt.startsWith('data:image/') && raw.receipt.length < 2000000) ? raw.receipt : null,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        console.error('Error in store listener:', e);
      }
    }
  }

  // --- Transactions ---

  getTransactions(filter = {}) {
    let list = [...this.state.transactions];

    if (filter.type && filter.type !== 'all') {
      list = list.filter(t => t.type === filter.type);
    }

    if (filter.category && filter.category !== 'all') {
      list = list.filter(t => t.category === filter.category);
    }

    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(t =>
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.paymentMethod && t.paymentMethod.toLowerCase().includes(q)) ||
        String(t.amount).includes(q)
      );
    }

    if (filter.monthYear) {
      // YYYY-MM
      list = list.filter(t => t.date && t.date.startsWith(filter.monthYear));
    }

    // Default sort: Date descending, then createdAt descending
    list.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return list;
  }

  addTransaction(tx) {
    const sanitized = this.sanitizeTransaction(tx);
    if (!sanitized) return null;

    this.state.transactions.unshift(sanitized);
    this.save();
    return sanitized;
  }

  updateTransaction(id, updates) {
    const idx = this.state.transactions.findIndex(t => t.id === id);
    if (idx !== -1) {
      const merged = { ...this.state.transactions[idx], ...updates, id };
      const sanitized = this.sanitizeTransaction(merged);
      if (sanitized) {
        this.state.transactions[idx] = sanitized;
        this.save();
        return sanitized;
      }
    }
    return null;
  }

  deleteTransaction(id) {
    this.state.transactions = this.state.transactions.filter(t => t.id !== id);
    this.save();
  }

  getTransactionById(id) {
    return this.state.transactions.find(t => t.id === id);
  }

  // --- Budgets ---

  getBudgets() {
    return { ...this.state.budgets };
  }

  setBudget(category, amount) {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      delete this.state.budgets[category];
    } else {
      this.state.budgets[category] = val;
    }
    this.save();
  }

  // --- Categories ---

  getCategories() {
    if (!this.state.categories || this.state.categories.length === 0) {
      this.state.categories = [...DEFAULT_CATEGORIES];
      this.save();
    }
    return [...this.state.categories];
  }

  getCategoryByName(name) {
    return this.state.categories.find(c => c.name === name) || {
      name,
      icon: '🏷️',
      color: '#64748b'
    };
  }

  // --- Settings ---

  getSettings() {
    return { ...this.state.settings };
  }

  updateSettings(updates) {
    this.state.settings = { ...this.state.settings, ...updates };
    this.save();
  }

  // --- Calculations ---

  getMonthlySummary(monthYear) {
    // monthYear is YYYY-MM
    const txs = this.getTransactions({ monthYear });
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryExpenses = {};

    for (const t of txs) {
      if (t.type === 'income') {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount;
        categoryExpenses[t.category] = (categoryExpenses[t.category] || 0) + t.amount;
      }
    }

    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) : 0;

    return {
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate,
      categoryExpenses,
      transactionCount: txs.length
    };
  }

  // --- Export & Backup ---

  exportToCSV() {
    const transactions = this.getTransactions();
    const currency = this.state.settings.currency || '$';
    const headers = ['ID', 'Date', 'Type', 'Category', 'Amount', 'Currency', 'Payment Method', 'Notes', 'Has Receipt'];
    
    // Security: Prevent CSV Formula Injection (CWE-1236)
    const sanitizeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = transactions.map(t => [
      sanitizeCsv(t.id),
      sanitizeCsv(t.date || ''),
      sanitizeCsv(t.type || 'expense'),
      sanitizeCsv(t.category || ''),
      parseFloat(t.amount) || 0,
      sanitizeCsv(currency),
      sanitizeCsv(t.paymentMethod || ''),
      sanitizeCsv(t.notes || ''),
      t.receipt ? '"Yes"' : '"No"'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  exportToJSON() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.state, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `expense_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  importFromJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON format');
      
      // Strictly validate and sanitize transactions array
      if (parsed.transactions && Array.isArray(parsed.transactions)) {
        const sanitizedList = [];
        for (const raw of parsed.transactions) {
          const clean = this.sanitizeTransaction(raw);
          if (clean) sanitizedList.push(clean);
        }
        this.state.transactions = sanitizedList;
      }

      if (parsed.budgets && typeof parsed.budgets === 'object' && !Array.isArray(parsed.budgets)) {
        const cleanBudgets = {};
        for (const [k, v] of Object.entries(parsed.budgets)) {
          if (typeof k === 'string' && k.length <= 60 && typeof v === 'number' && !isNaN(v)) {
            cleanBudgets[k] = Math.max(0, v);
          }
        }
        this.state.budgets = cleanBudgets;
      }

      if (parsed.categories && Array.isArray(parsed.categories)) {
        const validCategories = parsed.categories.filter(c =>
          c && typeof c === 'object' && typeof c.name === 'string' && c.name.length <= 60
        );
        if (validCategories.length > 0) {
          this.state.categories = validCategories;
        }
      }

      if (parsed.settings && typeof parsed.settings === 'object') {
        if (parsed.settings.currency && typeof parsed.settings.currency === 'string') {
          this.state.settings.currency = parsed.settings.currency.slice(0, 5);
        }
        if (parsed.settings.theme && typeof parsed.settings.theme === 'string') {
          this.state.settings.theme = parsed.settings.theme.slice(0, 20);
        }
      }

      this.save();
      return { success: true, count: this.state.transactions.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // --- Sync with Laptop Server ---

  async syncWithServer() {
    try {
      // First try sending our data to server
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state)
      });

      if (!response.ok) {
        throw new Error('Sync failed with status ' + response.status);
      }

      const res = await response.json();
      this.state.lastSynced = res.syncedAt || new Date().toISOString();
      this.save();
      return { success: true, timestamp: this.state.lastSynced };
    } catch (err) {
      console.warn('Sync failed (likely offline or remote):', err.message);
      return { success: false, error: err.message };
    }
  }

  async fetchFromServer() {
    try {
      const response = await fetch('/api/data');
      if (!response.ok) throw new Error('Failed to fetch from server');
      const data = await response.json();
      if (data && data.transactions) {
        const categories = (data.categories && data.categories.length > 0)
          ? data.categories
          : (this.state.categories && this.state.categories.length > 0 ? this.state.categories : [...DEFAULT_CATEGORIES]);

        this.state = {
          ...this.state,
          ...data,
          categories,
          settings: { ...this.state.settings, ...(data.settings || {}) },
          budgets: { ...this.state.budgets, ...(data.budgets || {}) }
        };
        this.save();
        return { success: true, count: this.state.transactions.length };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

// Global store instance
window.store = new ExpenseStore();
