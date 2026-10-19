const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'expenses.json');

class Storage {
  constructor() {
    this.data = {};
    this.load();
  }

  load() {
    try {
      const dataDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.data = {};
        this.save();
      }
    } catch (err) {
      console.error('Storage load error:', err);
      this.data = {};
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Storage save error:', err);
    }
  }

  getChatData(chatId) {
    const key = String(chatId);
    if (!this.data[key]) {
      this.data[key] = {
        expenses: [],
        peopleCount: null,
        members: {}, // { userId: userName }
        history: []
      };
      this.save();
    }
    return this.data[key];
  }

  addExpense(chatId, { userId, userName, amount, description }) {
    const chat = this.getChatData(chatId);
    const expense = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      userId: userId ? String(userId) : null,
      userName: userName || 'Noma\'lum',
      amount: Number(amount),
      description: description || 'Harajat',
      createdAt: new Date().toISOString()
    };

    if (userId && userName) {
      chat.members[String(userId)] = userName;
    }

    chat.expenses.push(expense);
    this.save();
    return expense;
  }

  deleteLastExpense(chatId, userId = null) {
    const chat = this.getChatData(chatId);
    if (chat.expenses.length === 0) return null;

    if (!userId) {
      const removed = chat.expenses.pop();
      this.save();
      return removed;
    }

    const uId = String(userId);
    for (let i = chat.expenses.length - 1; i >= 0; i--) {
      if (chat.expenses[i].userId === uId) {
        const removed = chat.expenses.splice(i, 1)[0];
        this.save();
        return removed;
      }
    }
    return null;
  }

  setPeopleCount(chatId, count) {
    const chat = this.getChatData(chatId);
    chat.peopleCount = count > 0 ? count : null;
    this.save();
    return chat.peopleCount;
  }

  getExpenses(chatId) {
    const chat = this.getChatData(chatId);
    return chat.expenses;
  }

  archiveMonth(chatId) {
    const chat = this.getChatData(chatId);
    if (chat.expenses.length === 0) return null;

    const archiveItem = {
      id: Date.now().toString(36),
      archivedAt: new Date().toISOString(),
      expenses: [...chat.expenses],
      peopleCount: chat.peopleCount
    };

    if (!chat.history) chat.history = [];
    chat.history.push(archiveItem);

    // Reset current active month expenses
    chat.expenses = [];
    this.save();
    return archiveItem;
  }

  getHistory(chatId) {
    const chat = this.getChatData(chatId);
    return chat.history || [];
  }

  clearExpenses(chatId) {
    const chat = this.getChatData(chatId);
    chat.expenses = [];
    this.save();
  }
}

module.exports = new Storage();
