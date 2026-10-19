/**
 * Format number with space separator (e.g. 100000 -> "100 000")
 */
function formatMoney(amount) {
  const rounded = Math.round(amount);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Calculate debt settlement
 * @param {Array} expenses List of expenses: [{ userName, amount, description }]
 * @param {number|null} targetPeopleCount Number of people to divide between
 * @param {Array} knownMembers Additional known members who may have spent 0
 */
function calculateSettlement(expenses, targetPeopleCount = null, knownMembers = []) {
  if (!expenses || expenses.length === 0) {
    return {
      hasExpenses: false,
      message: "Hozircha hech qanday harajat kiritilmagan."
    };
  }

  // 1. Har bir kishi sarflagan summani hisoblash
  const spentMap = {};
  let totalExpense = 0;

  for (const exp of expenses) {
    const name = (exp.userName || 'Noma\'lum').trim();
    const amt = Number(exp.amount) || 0;
    spentMap[name] = (spentMap[name] || 0) + amt;
    totalExpense += amt;
  }

  const spenders = Object.keys(spentMap);

  // Agar odamlar soni berilmagan bo'lsa, xarajat qilganlar soni olinadi
  let peopleCount = targetPeopleCount;
  if (!peopleCount || peopleCount < spenders.length) {
    peopleCount = Math.max(spenders.length, knownMembers.length, 1);
  }

  // Odamlar soni xarajat qilganlardan ko'p bo'lsa, xarajat qilmaganlarni qo'shish
  const allMembers = new Set([...spenders, ...knownMembers]);
  let placeholderIndex = 1;
  while (allMembers.size < peopleCount) {
    allMembers.add(`Sherik ${placeholderIndex++}`);
  }

  const memberList = Array.from(allMembers);
  for (const member of memberList) {
    if (spentMap[member] === undefined) {
      spentMap[member] = 0;
    }
  }

  // 2. Bir kishiga tushadigan ulush
  const perPersonShare = totalExpense / peopleCount;

  // 3. Qarz va haqdorlarni aniqlash
  const debtors = [];   // Berishi kerak bo'lganlar (qarzdorlar)
  const creditors = []; // Olishi kerak bo'lganlar (haqdorlar)

  for (const [name, spent] of Object.entries(spentMap)) {
    const balance = spent - perPersonShare;
    if (balance < -0.01) {
      debtors.push({ name, amountOwed: -balance });
    } else if (balance > 0.01) {
      creditors.push({ name, amountToReceive: balance });
    }
  }

  // Saralash: eng ko'p qarzdor birinchi, eng ko'p haqdor birinchi
  debtors.sort((a, b) => b.amountOwed - a.amountOwed);
  creditors.sort((a, b) => b.amountToReceive - a.amountToReceive);

  // 4. Tranzaksiyalarni hisoblash (kim kimga berishi kerak)
  const transactions = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const transfer = Math.min(debtor.amountOwed, creditor.amountToReceive);

    if (transfer > 0.01) {
      transactions.push({
        from: debtor.name,
        to: creditor.name,
        amount: Math.round(transfer)
      });
    }

    debtor.amountOwed -= transfer;
    creditor.amountToReceive -= transfer;

    if (debtor.amountOwed <= 0.01) dIdx++;
    if (creditor.amountToReceive <= 0.01) cIdx++;
  }

  return {
    hasExpenses: true,
    totalExpense,
    peopleCount,
    perPersonShare: Math.round(perPersonShare),
    spentMap,
    transactions
  };
}

/**
 * Format calculation result into a user-friendly Telegram message
 */
function formatSettlementReport(result) {
  if (!result.hasExpenses) {
    return result.message;
  }

  let text = `💰 <b>OYLIK HARAJATLAR HISOB-KITOBI</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📊 <b>Jami harajat:</b> ${formatMoney(result.totalExpense)} so'm\n`;
  text += `👥 <b>Odamlar soni:</b> ${result.peopleCount} kishi\n`;
  text += `👤 <b>Har bir kishiga:</b> ${formatMoney(result.perPersonShare)} so'm dan\n\n`;

  text += `📋 <b>Kim qancha harajat qildi:</b>\n`;
  for (const [name, spent] of Object.entries(result.spentMap)) {
    const diff = spent - result.perPersonShare;
    let statusIcon = '🔹';
    let statusText = '';
    if (diff > 0) {
      statusIcon = '🟢';
      statusText = `(+${formatMoney(diff)} so'm ortiqcha)`;
    } else if (diff < 0) {
      statusIcon = '🔴';
      statusText = `(-${formatMoney(-diff)} so'm kam)`;
    } else {
      statusIcon = '⚪';
      statusText = `(to'liq teng)`;
    }
    text += `${statusIcon} <b>${name}:</b> ${formatMoney(spent)} so'm ${statusText}\n`;
  }

  text += `\n🤝 <b>KIM KIMGA QANCHA BERISHI KERAK:</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (result.transactions.length === 0) {
    text += `✅ Hamma teng harajat qilgan! Hech kim hech kimga qarz emas.\n`;
  } else {
    for (const t of result.transactions) {
      text += `👉 <b>${t.from}</b> ➔ <b>${t.to}</b>ga <b>${formatMoney(t.amount)} so'm</b> berishi kerak\n`;
    }
  }

  text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `ℹ️ <i>Yangi oyni boshlash uchun /yangi_oy buyrug'idan foydalanishingiz mumkin.</i>`;

  return text;
}

module.exports = {
  formatMoney,
  calculateSettlement,
  formatSettlementReport
};
