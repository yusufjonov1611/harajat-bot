const readline = require('readline');
const storage = require('./src/storage');
const { calculateSettlement, formatSettlementReport, formatMoney } = require('./src/calculator');
const { parseExpenseMessage } = require('./src/parser');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const CHAT_ID = 'cli_test_chat';

console.clear();
console.log('====================================================');
console.log('          HARAJAT BOT - TERMINAL VERSIYASI          ');
console.log('====================================================');
console.log('Buyruqlar:');
console.log(' 1. Harajat yozish: Masalan: "Ali 70000 go\'sht" yoki "Vali 100000"');
console.log(' 2. Ro\'yxatni ko\'rish: "royxat"');
console.log(' 3. Hisoblash: "hisob 2" (yoki shunchaki "hisob")');
console.log(' 4. Yangi oyni boshlash: "yangi"');
console.log(' 5. Chiqish: "exit"');
console.log('====================================================\n');

function prompt() {
  rl.question('👉 Harajat yoki buyruq kiriting: ', (input) => {
    const text = input.trim();
    if (!text) return prompt();

    if (text.toLowerCase() === 'exit') {
      console.log('Dastur yakunlandi.');
      rl.close();
      return;
    }

    if (text.toLowerCase() === 'royxat') {
      const expenses = storage.getExpenses(CHAT_ID);
      if (expenses.length === 0) {
        console.log('📭 Hozircha hech qanday harajat yo\'q.\n');
      } else {
        console.log('\n--- HARAJATLAR RO\'YXATI ---');
        let total = 0;
        expenses.forEach((e, i) => {
          total += e.amount;
          console.log(`${i + 1}. ${e.userName}: ${formatMoney(e.amount)} so'm (${e.description})`);
        });
        console.log(`JAMI: ${formatMoney(total)} so'm\n`);
      }
      return prompt();
    }

    if (text.toLowerCase().startsWith('hisob')) {
      const parts = text.split(/\s+/);
      const count = parts.length > 1 ? parseInt(parts[1], 10) : null;
      const expenses = storage.getExpenses(CHAT_ID);
      const res = calculateSettlement(expenses, count);
      console.log('\n' + formatSettlementReport(res).replace(/<[^>]*>/g, '') + '\n');
      return prompt();
    }

    if (text.toLowerCase() === 'yangi') {
      storage.clearExpenses(CHAT_ID);
      console.log('✅ Oylik harajatlar tozalandi. Yangi oy boshlandi!\n');
      return prompt();
    }

    // Try parsing as expense
    const parsed = parseExpenseMessage(text, 'Foydalanuvchi');
    if (parsed && parsed.amount > 0) {
      storage.addExpense(CHAT_ID, {
        userId: 'cli_user',
        userName: parsed.name,
        amount: parsed.amount,
        description: parsed.description
      });
      console.log(`✅ Saqlandi: ${parsed.name} -> ${formatMoney(parsed.amount)} so'm (${parsed.description})\n`);
    } else {
      console.log('⚠️ Tushunarsiz format. Masalan: "Ali 70000" yoki "hisob 2"\n');
    }

    prompt();
  });
}

// Initial demo data if empty
const currentExp = storage.getExpenses(CHAT_ID);
if (currentExp.length === 0) {
  storage.addExpense(CHAT_ID, { userName: 'Ali', amount: 70000, description: 'Bozorlik' });
  storage.addExpense(CHAT_ID, { userName: 'Vali', amount: 100000, description: 'Supermarket' });
  console.log('💡 Namuna ma\'lumotlar yuklandi (Ali: 70 000, Vali: 100 000)');
  console.log('Tekshirib ko\'rish uchun "hisob 2" deb yozing:\n');
}

prompt();
