require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const storage = require('./storage');
const { calculateSettlement, formatMoney } = require('./calculator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Default chat ID for global/web app use
const DEFAULT_CHAT = 'web_global';

// GET: Current expenses and calculation
app.get('/api/expenses', (req, res) => {
  const chatId = req.query.chatId || DEFAULT_CHAT;
  const chatData = storage.getChatData(chatId);
  const peopleCount = req.query.peopleCount ? parseInt(req.query.peopleCount, 10) : chatData.peopleCount;

  const calculation = calculateSettlement(chatData.expenses, peopleCount);

  res.json({
    success: true,
    expenses: chatData.expenses,
    peopleCount: chatData.peopleCount,
    calculation
  });
});

// POST: Add new expense
app.post('/api/expenses', (req, res) => {
  const chatId = req.body.chatId || DEFAULT_CHAT;
  const { userName, amount, description } = req.body;

  if (!userName || !amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Ism va to\'g\'ri summa kiritilishi shart.' });
  }

  const exp = storage.addExpense(chatId, {
    userName: userName.trim(),
    amount: Number(amount),
    description: (description || 'Harajat').trim()
  });

  const chatData = storage.getChatData(chatId);
  const calculation = calculateSettlement(chatData.expenses, chatData.peopleCount);

  res.json({
    success: true,
    expense: exp,
    calculation
  });
});

// DELETE: Delete specific expense
app.delete('/api/expenses/:id', (req, res) => {
  const chatId = req.query.chatId || DEFAULT_CHAT;
  const expId = req.params.id;
  const chatData = storage.getChatData(chatId);

  const idx = chatData.expenses.findIndex(e => e.id === expId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Harajat topilmadi.' });
  }

  const removed = chatData.expenses.splice(idx, 1)[0];
  storage.save();

  const calculation = calculateSettlement(chatData.expenses, chatData.peopleCount);

  res.json({
    success: true,
    removed,
    calculation
  });
});

// POST: Set people count
app.post('/api/settings', (req, res) => {
  const chatId = req.body.chatId || DEFAULT_CHAT;
  const { peopleCount } = req.body;

  const count = peopleCount ? parseInt(peopleCount, 10) : null;
  storage.setPeopleCount(chatId, count);

  const chatData = storage.getChatData(chatId);
  const calculation = calculateSettlement(chatData.expenses, count);

  res.json({
    success: true,
    peopleCount: chatData.peopleCount,
    calculation
  });
});

// POST: Archive current month and start new
app.post('/api/archive', (req, res) => {
  const chatId = req.body.chatId || DEFAULT_CHAT;
  const archived = storage.archiveMonth(chatId);

  res.json({
    success: true,
    archived
  });
});

// GET: History of archived months
app.get('/api/history', (req, res) => {
  const chatId = req.query.chatId || DEFAULT_CHAT;
  const history = storage.getHistory(chatId);
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
