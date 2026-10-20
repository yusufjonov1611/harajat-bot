const fs = require('fs');
const path = require('path');
const https = require('https');

const DB_PATH = path.join(__dirname, '..', 'data', 'expenses.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'yusufjonov1611/harajat-bot';

class Storage {
  constructor() {
    this.data = {
      main: {
        expenses: [],
        peopleCount: null,
        members: {},
        customMembers: [],
        subscribers: {},
        history: []
      }
    };
    this.syncTimeout = null;
    this.lastSha = null;
    this.init();
  }

  async init() {
    this.loadFromDisk();
    if (GITHUB_TOKEN && GITHUB_REPO) {
      await this.fetchFromGitHub();
    }
  }

  loadFromDisk() {
    try {
      const dataDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.data = parsed;
        }
      }
      this.ensureMainRoom();
    } catch (err) {
      console.error('Storage disk load error:', err.message);
      this.ensureMainRoom();
    }
  }

  ensureMainRoom() {
    if (!this.data['main']) {
      this.data['main'] = {
        expenses: [],
        peopleCount: null,
        members: {},
        customMembers: [],
        subscribers: {},
        history: []
      };
    }

    // Merge any stray rooms (web_global or old numeric IDs) into 'main'
    for (const [key, val] of Object.entries(this.data)) {
      if (key !== 'main' && val && Array.isArray(val.expenses)) {
        for (const exp of val.expenses) {
          if (!this.data['main'].expenses.some(e => e.id === exp.id)) {
            this.data['main'].expenses.push(exp);
          }
        }
        if (val.peopleCount && !this.data['main'].peopleCount) {
          this.data['main'].peopleCount = val.peopleCount;
        }
      }
    }
    this.saveToDisk();
  }

  saveToDisk() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Storage disk save error:', err.message);
    }
  }

  save() {
    this.saveToDisk();
    this.scheduleGitHubSync();
  }

  scheduleGitHubSync() {
    if (!GITHUB_TOKEN || !GITHUB_REPO) return;
    if (this.syncTimeout) clearTimeout(this.syncTimeout);

    // Debounce GitHub commits by 1.5 seconds to avoid rate limits on rapid inputs
    this.syncTimeout = setTimeout(() => {
      this.pushToGitHub().catch(err => {
        console.warn('GitHub auto-sync error:', err.message);
      });
    }, 1500);
  }

  async fetchFromGitHub() {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/contents/data/expenses.json`,
        method: 'GET',
        headers: {
          'User-Agent': 'NodeJS-StorageSync',
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const resJson = JSON.parse(body);
              this.lastSha = resJson.sha;
              const content = Buffer.from(resJson.content, 'base64').toString('utf-8');
              const parsed = JSON.parse(content);
              if (parsed && typeof parsed === 'object') {
                // If remote has data, merge or adopt it
                const remoteExpenses = parsed.main?.expenses || parsed.web_global?.expenses || [];
                const localExpenses = this.data.main?.expenses || [];

                // Adopt if remote has more or equal
                if (remoteExpenses.length >= localExpenses.length) {
                  this.data = parsed;
                  this.ensureMainRoom();
                  console.log(`☁️ GitHubdan ${remoteExpenses.length} ta harajat sinxronlashtirildi!`);
                }
              }
            } catch (e) {
              console.warn('GitHub JSON parsing error:', e.message);
            }
          }
          resolve();
        });
      });
      req.on('error', (e) => {
        console.warn('GitHub fetch error:', e.message);
        resolve();
      });
      req.end();
    });
  }

  async pushToGitHub() {
    if (!GITHUB_TOKEN || !GITHUB_REPO) return;

    return new Promise((resolve, reject) => {
      // 1. Get current SHA if not cached
      const getShaReq = https.request({
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/contents/data/expenses.json`,
        method: 'GET',
        headers: {
          'User-Agent': 'NodeJS-StorageSync',
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          let sha = this.lastSha;
          if (res.statusCode === 200) {
            try {
              sha = JSON.parse(body).sha;
            } catch (e) {}
          }

          // 2. PUT updated data
          const contentB64 = Buffer.from(JSON.stringify(this.data, null, 2), 'utf-8').toString('base64');
          const putPayload = {
            message: 'Auto-sync expenses database',
            content: contentB64,
            branch: 'main'
          };
          if (sha) putPayload.sha = sha;

          const putReq = https.request({
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_REPO}/contents/data/expenses.json`,
            method: 'PUT',
            headers: {
              'User-Agent': 'NodeJS-StorageSync',
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            }
          }, (putRes) => {
            let putBody = '';
            putRes.on('data', d => putBody += d);
            putRes.on('end', () => {
              if (putRes.statusCode === 200 || putRes.statusCode === 201) {
                try {
                  this.lastSha = JSON.parse(putBody).content?.sha;
                } catch (e) {}
                console.log('☁️ Ma\'lumotlar GitHubga doimiy saqlandi!');
                resolve(true);
              } else {
                resolve(false);
              }
            });
          });

          putReq.on('error', reject);
          putReq.write(JSON.stringify(putPayload));
          putReq.end();
        });
      });

      getShaReq.on('error', reject);
      getShaReq.end();
    });
  }

  getChatData(chatId = 'main') {
    // Har doim bitta yagona umumiy xonadan foydalanamiz
    const key = 'main';
    if (!this.data[key]) {
      this.data[key] = {
        expenses: [],
        peopleCount: null,
        members: {},
        customMembers: [],
        subscribers: {},
        history: []
      };
      this.save();
    }
    return this.data[key];
  }

  addExpense(chatId = 'main', { userId, userName, amount, description }) {
    const chat = this.getChatData('main');
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

  deleteLastExpense(chatId = 'main', userId = null) {
    const chat = this.getChatData('main');
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

  setPeopleCount(chatId = 'main', count) {
    const chat = this.getChatData('main');
    chat.peopleCount = count > 0 ? count : null;
    this.save();
    return chat.peopleCount;
  }

  getExpenses(chatId = 'main') {
    const chat = this.getChatData('main');
    return chat.expenses;
  }

  archiveMonth(chatId = 'main') {
    const chat = this.getChatData('main');
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

  getHistory(chatId = 'main') {
    const chat = this.getChatData('main');
    return chat.history || [];
  }

  clearExpenses(chatId = 'main') {
    const chat = this.getChatData('main');
    chat.expenses = [];
    this.save();
  }

  registerChat(chatId, info = {}) {
    if (!chatId) return;
    const chat = this.getChatData('main');
    if (!chat.subscribers) chat.subscribers = {};
    const idStr = String(chatId);
    chat.subscribers[idStr] = {
      id: idStr,
      name: info.name || 'A\'zo',
      type: info.type || 'private',
      updatedAt: new Date().toISOString()
    };
    this.save();
  }

  getSubscribers() {
    const chat = this.getChatData('main');
    return chat.subscribers || {};
  }

  getMembers() {
    const chat = this.getChatData('main');
    const membersMap = new Map();

    // 1. Bot orqali ro'yxatdan o'tgan foydalanuvchilar (Subscribers)
    if (chat.subscribers) {
      for (const [id, sub] of Object.entries(chat.subscribers)) {
        if (sub.name) {
          membersMap.set(sub.name.trim(), {
            id: id,
            name: sub.name.trim(),
            telegramId: id,
            type: sub.type || 'user'
          });
        }
      }
    }

    // 2. Harajatlarda ishtirok etgan a'zolar
    if (chat.expenses) {
      for (const exp of chat.expenses) {
        if (exp.userName && !membersMap.has(exp.userName.trim())) {
          membersMap.set(exp.userName.trim(), {
            id: exp.userId || null,
            name: exp.userName.trim(),
            telegramId: exp.userId || null,
            type: 'user'
          });
        }
      }
    }

    // 3. Qo'lda qo'shilgan a'zolar (Custom members)
    if (chat.customMembers && Array.isArray(chat.customMembers)) {
      for (const m of chat.customMembers) {
        const name = typeof m === 'string' ? m : m.name;
        if (name && !membersMap.has(name.trim())) {
          membersMap.set(name.trim(), {
            id: null,
            name: name.trim(),
            telegramId: null,
            type: 'user'
          });
        }
      }
    }

    return Array.from(membersMap.values());
  }

  addMember(name) {
    if (!name || !name.trim()) return null;
    const chat = this.getChatData('main');
    if (!chat.customMembers) chat.customMembers = [];
    const trimmed = name.trim();
    if (!chat.customMembers.includes(trimmed)) {
      chat.customMembers.push(trimmed);
      this.save();
    }
    return { name: trimmed };
  }

  removeMember(name) {
    if (!name || !name.trim()) return false;
    const chat = this.getChatData('main');
    const trimmed = name.trim();
    if (chat.customMembers) {
      chat.customMembers = chat.customMembers.filter(m => m !== trimmed);
    }
    if (chat.subscribers) {
      for (const [id, sub] of Object.entries(chat.subscribers)) {
        if (sub.name === trimmed) delete chat.subscribers[id];
      }
    }
    this.save();
    return true;
  }
}

module.exports = new Storage();
