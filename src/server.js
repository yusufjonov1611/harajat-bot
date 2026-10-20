require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const storage = require('./storage');
const { calculateSettlement, formatMoney } = require('./calculator');

// Telegram Botni parallel ishga tushirish
let botModule = null;
try {
  botModule = require('./bot');
} catch (botErr) {
  console.warn('Telegram bot yuklanishida ogohlantirish:', botErr.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Telegram WebApp va brauzer keshini oldini olish
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// Default chat ID for global/web app use
const DEFAULT_CHAT = 'main';

// GET: Current expenses and calculation
app.get('/api/expenses', (req, res) => {
  const chatData = storage.getChatData('main');
  const peopleCount = req.query.peopleCount ? parseInt(req.query.peopleCount, 10) : chatData.peopleCount;
  const members = storage.getMembers().map(m => m.name);

  const calculation = calculateSettlement(chatData.expenses, peopleCount, members);

  res.json({
    success: true,
    expenses: chatData.expenses,
    peopleCount: chatData.peopleCount,
    calculation,
    members: storage.getMembers()
  });
});

// POST: Add new expense
app.post('/api/expenses', (req, res) => {
  const { userName, amount, description } = req.body;

  if (!userName || !amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Ism va to\'g\'ri summa kiritilishi shart.' });
  }

  const exp = storage.addExpense('main', {
    userName: userName.trim(),
    amount: Number(amount),
    description: (description || 'Harajat').trim()
  });

  const chatData = storage.getChatData('main');
  const members = storage.getMembers().map(m => m.name);
  const calculation = calculateSettlement(chatData.expenses, chatData.peopleCount, members);

  // Barcha a'zolarga Telegram orqali xabarnoma tarqatish
  if (botModule && botModule.broadcastNewExpense) {
    botModule.broadcastNewExpense(exp).catch(err => console.warn('Broadcast error:', err.message));
  }

  res.json({
    success: true,
    expense: exp,
    calculation
  });
});

// POST: Client-side restore / sync (if client has data server doesn't have)
app.post('/api/sync', (req, res) => {
  const { expenses } = req.body;
  if (Array.isArray(expenses) && expenses.length > 0) {
    const chatData = storage.getChatData('main');
    let addedCount = 0;
    for (const exp of expenses) {
      if (exp.userName && exp.amount && !chatData.expenses.some(e => e.id === exp.id)) {
        chatData.expenses.push(exp);
        addedCount++;
      }
    }
    if (addedCount > 0) {
      storage.save();
    }
  }

  const chatData = storage.getChatData('main');
  const members = storage.getMembers().map(m => m.name);
  const calculation = calculateSettlement(chatData.expenses, chatData.peopleCount, members);

  res.json({
    success: true,
    expenses: chatData.expenses,
    calculation
  });
});

// DELETE: Delete specific expense
app.delete('/api/expenses/:id', (req, res) => {
  const expId = req.params.id;
  const chatData = storage.getChatData('main');

  const idx = chatData.expenses.findIndex(e => e.id === expId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Harajat topilmadi.' });
  }

  const removed = chatData.expenses.splice(idx, 1)[0];
  storage.save();

  const members = storage.getMembers().map(m => m.name);
  const calculation = calculateSettlement(chatData.expenses, chatData.peopleCount, members);

  res.json({
    success: true,
    removed,
    calculation
  });
});

// POST: Set people count
app.post('/api/settings', (req, res) => {
  const { peopleCount } = req.body;

  const count = peopleCount ? parseInt(peopleCount, 10) : null;
  storage.setPeopleCount('main', count);

  const chatData = storage.getChatData('main');
  const members = storage.getMembers().map(m => m.name);
  const calculation = calculateSettlement(chatData.expenses, count, members);

  res.json({
    success: true,
    peopleCount: chatData.peopleCount,
    calculation
  });
});

// POST: Archive current month and start new
app.post('/api/archive', async (req, res) => {
  let report = null;

  if (botModule && botModule.handleNewMonth) {
    report = await botModule.handleNewMonth();
  } else {
    storage.archiveMonth('main');
  }

  res.json({
    success: true,
    report
  });
});

// GET: Members list
app.get('/api/members', (req, res) => {
  const members = storage.getMembers();
  const chatData = storage.getChatData('main');
  const calc = calculateSettlement(chatData.expenses, chatData.peopleCount, members.map(m => m.name));

  res.json({
    success: true,
    members,
    spentMap: calc.spentMap || {},
    perPersonShare: calc.perPersonShare || 0
  });
});

// POST: Add new member
app.post('/api/members', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Ism kiritilishi shart.' });
  }
  const member = storage.addMember(name);
  res.json({ success: true, member });
});

// DELETE: Remove member
app.delete('/api/members/:name', (req, res) => {
  const { name } = req.params;
  const removed = storage.removeMember(decodeURIComponent(name));
  res.json({ success: true, removed });
});

// GET: History of archived months
app.get('/api/history', (req, res) => {
  const history = storage.getHistory('main');
  res.json({
    success: true,
    history
  });
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🌐 Harajat Web App serveri ishga tushdi:`);
  console.log(`   👉 Local:   http://localhost:${PORT}`);
  console.log(`   👉 Tarmoq:  http://127.0.0.1:${PORT}`);
  console.log(`====================================================`);
});
