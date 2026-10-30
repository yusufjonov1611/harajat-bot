require('dotenv').config();
const { Bot, Keyboard, InlineKeyboard } = require('grammy');
const storage = require('./storage');
const { calculateSettlement, formatSettlementReport, formatMoney } = require('./calculator');
const { parseExpenseMessage, parseAmount } = require('./parser');

const token = process.env.BOT_TOKEN;

if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  console.log('--------------------------------------------------');
  console.log('⚠️ DIQQAT: .env faylida BOT_TOKEN ko\'rsatilmagan!');
  console.log('Telegram botni ishga tushirish uchun:');
  console.log('1. Telegramda @BotFather ga kiring va yangi bot ochib token oling.');
  console.log('2. .env fayliga BOT_TOKEN=<sizning_tokeningiz> deb yozing.');
  console.log('3. "npm start" buyrug\'ini ishga tushiring.');
  console.log('--------------------------------------------------');
  console.log('Hozir esa terminal orqali sinab ko\'rish uchun: node cli.js ni ishga tushirishingiz mumkin.');
  console.log('--------------------------------------------------');
}

const bot = new Bot(token || 'dummy_token');

const webAppUrl = (process.env.WEBAPP_URL || '').replace(/\/$/, '');

function getChatWebAppUrl() {
  return webAppUrl;
}

// Har qanday a'zo yozganda yoki start bosganda uni bildirishnomalar ro'yxatiga qo'shish

// Guruhga qo'shilganda yoki huquq berilganda guruh chat ID sini ro'yxatga olish
bot.on('my_chat_member', async (ctx) => {
  if (ctx.chat?.id) {
    storage.registerChat(ctx.chat.id, {
      name: ctx.chat.title || 'Guruh',
      type: ctx.chat.type,
      title: ctx.chat.title || null
    });
    console.log(`👥 Bot guruhga qo'shildi va ro'yxatga olindi: ${ctx.chat.title} (${ctx.chat.id})`);
  }
});

bot.use(async (ctx, next) => {
  if (ctx.chat?.id) {
    storage.registerChat(ctx.chat.id, {
      name: ctx.from?.first_name || ctx.chat.title || 'A\'zo',
      type: ctx.chat.type
    });
  }
  return next();
});

// Barcha sheriklarga yangi harajat haqida bildirishnoma tarqatish
async function broadcastNewExpense(exp, sourceChatId = null) {
  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    console.warn('BOT_TOKEN mavjud emas, xabarnoma yuborilmadi.');
    return;
  }

  const chatData = storage.getChatData('main');
  const members = storage.getMembers().map(m => m.name);
  const calc = calculateSettlement(chatData.expenses, chatData.peopleCount, members);
  const peopleCount = chatData.peopleCount || (calc.peopleCount || Object.keys(calc.spentMap).length || 2);
  const perPerson = calc.perPersonShare || Math.round(calc.totalExpense / peopleCount);

  const text =
    `💸 <b>YANGI HARAJAT QILINDI!</b>\n\n` +
    `👤 <b>Kim:</b> ${exp.userName}\n` +
    `💰 <b>Summa:</b> ${formatMoney(exp.amount)} so'm\n` +
    `📝 <b>Nima uchun:</b> ${exp.description}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>Oylik jami harajat:</b> ${formatMoney(calc.totalExpense)} so'm\n` +
    `👥 <b>1 kishiga ulush:</b> ${formatMoney(perPerson)} so'm (${peopleCount} kishi)\n\n` +
    `💡 <i>Hisob-kitob avtomatik yangilandi.</i>`;

  const inlineKb = new InlineKeyboard();
  if (webAppUrl) {
    inlineKb.webApp('📱 Ilovada ko\'rish', webAppUrl);
  }

  const subscribers = storage.getSubscribers();
  const subIds = Object.keys(subscribers);
  console.log(`📢 Bildirishnoma tarqatilmoqda (${subIds.length} ta chatga)...`);

  for (const [subId, sub] of Object.entries(subscribers)) {
    if (sourceChatId && String(subId) === String(sourceChatId)) continue;
    try {
      await bot.api.sendMessage(subId, text, {
        parse_mode: 'HTML',
        reply_markup: inlineKb
      });
      console.log(`  ✓ Bildirishnoma yuborildi: ${subId} (${sub.name || 'Chat'})`);
    } catch (err) {
      console.warn(`  ✗ Bildirishnoma yuborishda xatolik (${subId}):`, err.message);
    }
  }
}

// Barcha sheriklarga oy yakuniy hisob-kitobini tarqatish
async function broadcastMonthEnd(reportText) {
  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') return;

  const inlineKb = new InlineKeyboard();
  if (webAppUrl) {
    inlineKb.webApp('📊 Mini Appda ko\'rish', webAppUrl);
  }

  const subscribers = storage.getSubscribers();
  for (const [subId] of Object.entries(subscribers)) {
    try {
      await bot.api.sendMessage(subId, reportText, {
        parse_mode: 'HTML',
        reply_markup: inlineKb
      });
    } catch (err) {
      console.warn(`Oy yakuni hisobotini yuborishda xato (${subId}):`, err.message);
    }
  }
}

// Asosiy menyu klaviaturasi
function getMainKeyboard() {
  const kb = new Keyboard();
  if (webAppUrl) {
    kb.webApp('📱 Ilovani ochish (Mini App)', webAppUrl).row();
  }
  return kb
    .text('➕ Harajat yozish').text('📋 Ro\'yxat').row()
    .text('🧮 Hisoblash (Taqsimlash)').text('👥 A\'zolar ro\'yxati').row()
    .text('↩️ Oxirgisini bekor qilish').text('🔄 Yangi oyni boshlash')
    .resized();
}

// A'zolar / Foydalanuvchilar ro'yxati
async function handleMembers(ctx) {
  const chatData = storage.getChatData('main');
  const members = storage.getMembers();
  const calc = calculateSettlement(chatData.expenses, chatData.peopleCount, members.map(m => m.name));

  if (members.length === 0) {
    return ctx.reply(
      `👥 <b>A'zolar ro'yxati hozircha bo'sh.</b>\n\n` +
      `A'zolar botga /start bosganda yoki birinchi harajatni yozganda avtomatik ro'yxatga qo'shiladi.`,
      { parse_mode: 'HTML' }
    );
  }

  let text = `👥 <b>GURUH A'ZOLARI VA ULARNING BALANSI:</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  members.forEach((m, idx) => {
    const spent = calc.spentMap ? (calc.spentMap[m.name] || 0) : 0;
    const diff = calc.perPersonShare ? spent - calc.perPersonShare : 0;
    const badge = diff > 0.01 ? `🟢 +${formatMoney(diff)} so'm (haqdor)` :
                  diff < -0.01 ? `🔴 -${formatMoney(-diff)} so'm (qarzdor)` : `⚪️ Teng`;

    text += `${idx + 1}. 👤 <b>${m.name}</b>\n`;
    text += `   Sarfladi: <b>${formatMoney(spent)} so'm</b> | ${badge}\n`;
  });

  text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `👥 <b>Jami a'zolar:</b> ${members.length} kishi\n`;
  text += `💰 <b>Jami harajat:</b> ${formatMoney(calc.totalExpense || 0)} so'm\n\n`;
  text += `💡 <i>A'zo nomidan harajat yozish: <code>Ali 50000 bozorlik</code></i>`;

  const inlineKb = new InlineKeyboard();
  if (webAppUrl) {
    inlineKb.webApp('📱 Ilovada boshqarish', webAppUrl);
  }

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: inlineKb
  });
}

bot.command(['azolar', 'a_zolar', 'foydalanuvchilar', 'members'], handleMembers);
bot.hears(['👥 A\'zolar ro\'yxati', '👥 A\'zolar'], handleMembers);

// Holatni saqlash (oddiy session: odamlar sonini kutish)
const userState = {};

// /start komandasi
bot.command('start', async (ctx) => {
  const name = ctx.from?.first_name || 'Foydalanuvchi';
  const chatId = ctx.chat.id;
  const appUrl = getChatWebAppUrl(chatId);

  const chatData = storage.getChatData('main');
  const expenses = chatData.expenses || [];
  const members = storage.getMembers().map(m => m.name);
  const calc = calculateSettlement(expenses, chatData.peopleCount, members);

  let inlineKb = new InlineKeyboard();
  if (appUrl) {
    inlineKb.webApp('🚀 Mini Appda ochish', appUrl).row();
  }
  inlineKb.text('📋 Ro\'yxatni ko\'rish', 'view_list').text('🧮 Hisob-kitob', 'calc_settle');

  let welcomeText = `👋 Assalomu alaykum, <b>${name}</b>!\n\n` +
    `🤖 <b>Harajat Bot</b>iga xush kelibsiz!\n\n`;

  if (expenses.length > 0) {
    welcomeText += `📊 <b>Joriy oylik faol hisob:</b>\n` +
      `💰 <b>Jami harajat:</b> ${formatMoney(calc.totalExpense)} so'm (${expenses.length} ta yozuv)\n` +
      `👥 <b>1 kishiga ulush:</b> ${formatMoney(calc.perPersonShare)} so'm\n\n`;

    if (calc.transactions && calc.transactions.length > 0) {
      welcomeText += `🤝 <b>Qarzlar taqsimoti:</b>\n`;
      calc.transactions.slice(0, 3).forEach(t => {
        welcomeText += `👉 <b>${t.from}</b> ➔ <b>${t.to}</b>ga: <b>${formatMoney(t.amount)} so'm</b>\n`;
      });
      welcomeText += `\n`;
    }
  }

  welcomeText += `💡 <b>Yangi harajat qo'shish:</b>\n` +
    `Shunchaki xabar yozing: <code>70000 bozorlik</code> yoki <code>Ali 70000 go'sht</code>`;

  await ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    reply_markup: inlineKb
  });

  await ctx.reply('Asosiy menyu:', {
    reply_markup: getMainKeyboard(chatId)
  });
});

// /help komandasi
bot.command('help', async (ctx) => {
  const helpText = `📖 <b>Harajat Bot qo'llanmasi:</b>\n\n` +
    `<b>Xarajat qo'shish usullari:</b>\n` +
    `• <code>70000 bozorlik</code> - profilingiz nomi bilan qo'shadi\n` +
    `• <code>Ali 70000 go'sht</code> - Ali nomidan qo'shadi\n` +
    `• <code>Vali 100k</code> - Vali nomidan 100 000 so'm qo'shadi\n` +
    `• <code>/harajat Ali 70000 go'sht</code>\n\n` +
    `<b>Hisob-kitob:</b>\n` +
    `• <code>/hisob</code> - xarajat qilganlar bo'yicha taqsimlaydi\n` +
    `• <code>/hisob 2</code> - harajatlarni 2 kishiga teng bo'lib hisoblaydi\n` +
    `• <code>/odamlar 3</code> - doimiy a'zolar sonini 3 kishi qilib belgilaydi\n\n` +
    `<b>Boshqa buyruqlar:</b>\n` +
    `• <code>/app</code> yoki <code>/ilova</code> - Mini Appni ochish\n` +
    `• <code>/royxat</code> - oylik harajatlar ro'yxati\n` +
    `• <code>/bekor</code> - oxirgi harajatni o'chirish\n` +
    `• <code>/yangi_oy</code> - oyni yakunlab yangisini boshlash\n` +
    `• <code>/tarix</code> - o'tgan oylar tarixi`;

  await ctx.reply(helpText, { parse_mode: 'HTML' });
});

// /app yoki /ilova komandasi
bot.command(['app', 'webapp', 'ilova'], async (ctx) => {
  const appUrl = getChatWebAppUrl(ctx.chat.id);
  if (!appUrl) {
    return ctx.reply('⚠️ Mini App URL sozlanmagan. Iltimos .env faylida WEBAPP_URL parametrini kiriting.');
  }
  await ctx.reply('📱 <b>Harajat Mini App</b>\n\nQuyidagi tugma orqali ilovani to\'g\'ridan-to\'g\'ri Telegram ichida ochishingiz mumkin:', {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().webApp('🚀 Mini Appni ochish', appUrl)
  });
});

// /harajat komandasi
bot.command(['harajat', 'qosh', 'xarajat'], async (ctx) => {
  const text = ctx.message.text;
  const defaultName = ctx.from?.first_name || 'Foydalanuvchi';
  const parsed = parseExpenseMessage(text, defaultName);

  if (!parsed) {
    return ctx.reply(
      `❌ Noto'g'ri format!\n` +
      `Masalan bunday yozing:\n` +
      `<code>/harajat 70000 go'sht</code> yoki\n` +
      `<code>/harajat Ali 70000 go'sht</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const exp = storage.addExpense('main', {
    userId: ctx.from?.id,
    userName: parsed.name,
    amount: parsed.amount,
    description: parsed.description
  });

  const chatData = storage.getChatData('main');
  const calc = calculateSettlement(chatData.expenses, chatData.peopleCount);

  const inlineKb = new InlineKeyboard();
  if (webAppUrl) {
    inlineKb.webApp('📊 Umumiy hisob (Mini App)', webAppUrl).row();
  }
  inlineKb.text('❌ Bekor qilish', `delete_${exp.id}`);

  await ctx.reply(
    `✅ <b>Harajat umumiy hisobga qo'shildi!</b>\n\n` +
    `👤 <b>Kim:</b> ${exp.userName}\n` +
    `💰 <b>Summa:</b> ${formatMoney(exp.amount)} so'm\n` +
    `📝 <b>Izoh:</b> ${exp.description}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>Jami oylik harajat:</b> ${formatMoney(calc.totalExpense)} so'm\n` +
    `👥 <b>1 kishiga:</b> ${formatMoney(calc.perPersonShare)} so'm (${calc.peopleCount || Object.keys(calc.spentMap).length || 2} kishi)`,
    { parse_mode: 'HTML', reply_markup: inlineKb }
  );

  // Boshqa barcha sheriklarga yangi harajat haqida bildirishnoma yuborish
  broadcastNewExpense(exp, ctx.chat.id).catch(e => console.warn('Broadcast error:', e.message));
});

// /royxat komandasi va tugmasi
async function handleList(ctx) {
  const expenses = storage.getExpenses('main');
  if (expenses.length === 0) {
    return ctx.reply('📭 Hozircha hech qanday harajat yozilmagan.\nHarajat yozish uchun: <code>70000 go\'sht</code> deb yozing.', {
      parse_mode: 'HTML'
    });
  }

  let total = 0;
  const userTotals = {};

  let msg = `📋 <b>SHU OYDAGI HARAJATLAR RO'YXATI:</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  expenses.forEach((item, index) => {
    total += item.amount;
    userTotals[item.userName] = (userTotals[item.userName] || 0) + item.amount;
    msg += `${index + 1}. <b>${item.userName}</b>: ${formatMoney(item.amount)} so'm <i>(${item.description})</i>\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 <b>JAMI:</b> ${formatMoney(total)} so'm\n\n`;
  msg += `👥 <b>A'zolar bo'yicha:</b>\n`;
  for (const [name, sum] of Object.entries(userTotals)) {
    msg += `• <b>${name}:</b> ${formatMoney(sum)} so'm\n`;
  }

  msg += `\n💡 <i>Hisob-kitob qilish uchun /hisob buyrug'ini bosing.</i>`;
  const appUrl = getChatWebAppUrl(ctx.chat.id);
  const inlineKb = appUrl ? new InlineKeyboard().webApp('📱 Mini Appda ko\'rish', appUrl) : undefined;
  await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: inlineKb });
}

bot.command('royxat', handleList);
bot.hears('📋 Ro\'yxat', handleList);
bot.hears('📋 Harajatlar ro\'yxati', handleList);

// /hisob komandasi va tugmasi
async function handleCalculate(ctx, explicitCount = null) {
  const chatData = storage.getChatData('main');
  const expenses = chatData.expenses || [];

  if (expenses.length === 0) {
    return ctx.reply('📭 Hali harajatlar kiritilmagan. Hisob-kitob qilish uchun avval harajat yozing.\nMasalan: <code>70000 bozorlik</code>', {
      parse_mode: 'HTML',
      reply_markup: getMainKeyboard(ctx.chat.id)
    });
  }

  let peopleCount = explicitCount;
  if (!peopleCount && chatData.peopleCount) {
    peopleCount = chatData.peopleCount;
  }

  const members = storage.getMembers().map(m => m.name);
  const result = calculateSettlement(expenses, peopleCount, members);
  const report = formatSettlementReport(result);

  const inlineKb = new InlineKeyboard();
  const appUrl = getChatWebAppUrl(ctx.chat.id);
  if (appUrl) {
    inlineKb.webApp('📊 Grafik & Mini Appda ko\'rish', appUrl).row();
  }
  inlineKb
    .text('🔄 Odamlar sonini o\'zgartirish', 'set_people')
    .row()
    .text('🏁 Yangi oyni boshlash', 'new_month_confirm');

  await ctx.reply(report, {
    parse_mode: 'HTML',
    reply_markup: inlineKb
  });
}


bot.command(['yangilash', 'refresh'], async (ctx) => {
  await handleCalculate(ctx);
});
bot.hears(['🔄 Yangilash', 'Yangilash', 'yangilash'], async (ctx) => {
  await handleCalculate(ctx);
});

bot.command('hisob', async (ctx) => {
  const match = ctx.message.text.trim().split(/\s+/);
  let count = null;
  if (match.length >= 2) {
    count = parseInt(match[1], 10);
  }
  await handleCalculate(ctx, count);
});

bot.hears('🧮 Hisoblash (Taqsimlash)', async (ctx) => {
  await handleCalculate(ctx);
});

// Odamlar sonini kiritish
bot.command('odamlar', async (ctx) => {
  const match = ctx.message.text.trim().split(/\s+/);
  if (match.length >= 2) {
    const num = parseInt(match[1], 10);
    if (num > 0) {
      storage.setPeopleCount('main', num);
      return ctx.reply(`✅ Odamlar soni muvaffaqiyatli saqlandi: <b>${num} kishi</b>.\nEndi hisob-kitob shu songa bo'linadi.`, {
        parse_mode: 'HTML'
      });
    }
  }
  userState[ctx.chat.id] = { action: 'awaiting_people_count' };
  await ctx.reply('👥 Harajatlar necha kishiga bo\'linishi kerak? Iltimos raqam kiriting (masalan: 2 yoki 3):');
});

bot.hears('👥 Odamlar soni', async (ctx) => {
  const chatData = storage.getChatData('main');
  const current = chatData.peopleCount ? `${chatData.peopleCount} kishi` : "belgilanmagan (avtomatik)";
  userState[ctx.chat.id] = { action: 'awaiting_people_count' };
  await ctx.reply(
    `👥 Hozirgi kishi soni: <b>${current}</b>\n\n` +
    `Yangi odamlar sonini kiriting (masalan: <b>2</b> yoki <b>3</b>):`,
    { parse_mode: 'HTML' }
  );
});

// Bekor qilish (oxirgisini o'chirish)
async function handleUndo(ctx) {
  const removed = storage.deleteLastExpense('main');
  if (!removed) {
    return ctx.reply('📭 O\'chirish uchun hech qanday harajat topilmadi.');
  }
  await ctx.reply(
    `🗑 <b>Oxirgi harajat o'chirildi:</b>\n` +
    `👤 ${removed.userName}: ${formatMoney(removed.amount)} so'm (${removed.description})`,
    { parse_mode: 'HTML' }
  );
}
bot.command('bekor', handleUndo);
bot.hears('↩️ Oxirgisini bekor qilish', handleUndo);

// Yangi oy boshlash (Arxivlash va yakuniy hisobotni tarqatish)
async function handleNewMonth(ctx = null) {
  const chatData = storage.getChatData('main');
  const expenses = chatData.expenses;
  if (!expenses || expenses.length === 0) {
    if (ctx) await ctx.reply('ℹ️ Hozirgi oyda harajatlar yo\'q, yangi oy allaqachon faol.');
    return null;
  }

  const members = storage.getMembers().map(m => m.name);
  const result = calculateSettlement(expenses, chatData.peopleCount, members);
  const peopleCount = chatData.peopleCount || result.peopleCount || 2;

  let report = `🏁 <b>OY YAKUNLANDI VA HISOB-KITOB QILINDI!</b>\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `💰 <b>Jami oylik harajat:</b> ${formatMoney(result.totalExpense)} so'm\n`;
  report += `👥 <b>A'zolar soni:</b> ${peopleCount} kishi\n`;
  report += `💵 <b>1 kishiga tushgan ulush:</b> ${formatMoney(result.perPersonShare)} so'm\n\n`;

  report += `📊 <b>A'zolarning oylik sarfi:</b>\n`;
  for (const [name, sum] of Object.entries(result.spentMap)) {
    const diff = sum - result.perPersonShare;
    const diffText = diff > 0.01 ? `(+${formatMoney(diff)} haqdor)` : diff < -0.01 ? `(-${formatMoney(-diff)} qarzdor)` : `(teng)`;
    report += `• <b>${name}:</b> ${formatMoney(sum)} so'm <i>${diffText}</i>\n`;
  }

  report += `\n⚖️ <b>KIM KIMGA QANCHA PUL BERISHI KERAK:</b>\n`;
  if (result.transactions.length === 0) {
    report += `🎉 Barcha a'zolar teng xarajat qilgan! Hech kim hech kimga qarz emas.\n`;
  } else {
    result.transactions.forEach((t) => {
      report += `👉 <b>${t.from}</b> ➔ <b>${t.to}</b> ga: <b>${formatMoney(t.amount)} so'm</b> berishi kerak\n`;
    });
  }

  report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `✨ <i>O'tgan oy arxivlandi. Yangi oy uchun hisob-kitob 0 dan boshlandi!</i>`;

  // Arxivlash
  storage.archiveMonth('main');

  // Barcha a'zolarga oylik yakuniy hisobotni tarqatish (SMS/Telegram bildirishnoma)
  await broadcastMonthEnd(report);

  if (ctx) {
    await ctx.reply(report, {
      parse_mode: 'HTML',
      reply_markup: getMainKeyboard()
    });
  }

  return report;
}

bot.command('yangi_oy', handleNewMonth);
bot.hears('🔄 Yangi oyni boshlash', handleNewMonth);

// Inline tugmalar bilan ishlash
bot.callbackQuery(/delete_(.+)/, async (ctx) => {
  const expId = ctx.match[1];
  const chatData = storage.getChatData('main');
  const index = chatData.expenses.findIndex(e => e.id === expId);

  if (index !== -1) {
    const removed = chatData.expenses.splice(index, 1)[0];
    storage.save();
    await ctx.answerCallbackQuery({ text: 'Harajat o\'chirildi!' });
    await ctx.editMessageText(
      `🗑 <b>O'chirildi:</b> ${removed.userName} - ${formatMoney(removed.amount)} so'm (${removed.description})`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.answerCallbackQuery({ text: 'Bu harajat allaqachon o\'chirilgan yoki topilmadi.' });
  }
});

bot.callbackQuery('view_list', async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleList(ctx);
});

bot.callbackQuery('calc_settle', async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleCalculate(ctx);
});

bot.callbackQuery('set_people', async (ctx) => {
  await ctx.answerCallbackQuery();
  userState[ctx.chat.id] = { action: 'awaiting_people_count' };
  await ctx.reply('👥 Harajatlar necha kishiga bo\'linishi kerak? Raqam yuboring (masalan: 2):');
});

bot.callbackQuery('new_month_confirm', async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleNewMonth(ctx);
});

// Harajat qo'shish tugmasi
bot.hears('➕ Harajat yozish', async (ctx) => {
  await ctx.reply(
    `✍️ Harajatni quyidagi formatlardan birida yozing:\n\n` +
    `• <code>70000 bozorlik</code>\n` +
    `• <code>Ali 70000 go'sht</code>\n` +
    `• <code>Vali 100k mevalar</code>`,
    { parse_mode: 'HTML' }
  );
});

// Oddiy matnli xabarlarni tutish
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const chatId = ctx.chat.id;

  // Agar foydalanuvchidan odamlar soni kutilayotgan bo'lsa
  if (userState[chatId]?.action === 'awaiting_people_count') {
    const num = parseInt(text, 10);
    if (!isNaN(num) && num > 0) {
      storage.setPeopleCount('main', num);
      delete userState[chatId];
      await ctx.reply(`✅ Odamlar soni: <b>${num} kishi</b> qilib belgilandi.`, {
        parse_mode: 'HTML'
      });
      return handleCalculate(ctx, num);
    } else {
      return ctx.reply('⚠️ Iltimos, faqat noldan katta butun son kiriting (masalan: 2 yoki 3).');
    }
  }

  // Agar foydalanuvchi to'g'ridan-to'g'ri faqat raqam yozsa (masalan: "2") va xarajatlar mavjud bo'lsa
  const onlyNumber = parseInt(text, 10);
  if (/^\d+$/.test(text) && onlyNumber <= 50) {
    const chatData = storage.getChatData('main');
    if (chatData.expenses.length > 0) {
      storage.setPeopleCount('main', onlyNumber);
      return handleCalculate(ctx, onlyNumber);
    }
  }

  // Harajat sifatida tahlil qilish
  const defaultName = ctx.from?.first_name || 'Sherik';
  const parsed = parseExpenseMessage(text, defaultName);

  if (parsed && parsed.amount > 0) {
    const exp = storage.addExpense('main', {
      userId: ctx.from?.id,
      userName: parsed.name,
      amount: parsed.amount,
      description: parsed.description
    });

    const chatData = storage.getChatData('main');
    const calc = calculateSettlement(chatData.expenses, chatData.peopleCount);

    const inlineKb = new InlineKeyboard();
    if (webAppUrl) {
      inlineKb.webApp('📊 Umumiy hisob (Mini App)', webAppUrl).row();
    }
    inlineKb.text('❌ Bekor qilish', `delete_${exp.id}`);

    await ctx.reply(
      `✅ <b>Harajat umumiy hisobga qo'shildi!</b>\n\n` +
      `👤 <b>Kim:</b> ${exp.userName}\n` +
      `💰 <b>Summa:</b> ${formatMoney(exp.amount)} so'm\n` +
      `📝 <b>Izoh:</b> ${exp.description}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 <b>Jami oylik harajat:</b> ${formatMoney(calc.totalExpense)} so'm\n` +
      `👥 <b>1 kishiga:</b> ${formatMoney(calc.perPersonShare)} so'm (${calc.peopleCount || Object.keys(calc.spentMap).length || 2} kishi)`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );

    // Boshqa barcha sheriklarga yangi harajat haqida bildirishnoma yuborish
    broadcastNewExpense(exp, ctx.chat.id).catch(e => console.warn('Broadcast error:', e.message));
  }
});

// Xatoliklarni ushlash
bot.catch((err) => {
  console.error('Bot xatosi:', err);
});

// Agar BOT_TOKEN mavjud bo'lsa ishga tushirish
if (token && token !== 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  bot.start({
    onStart: async (botInfo) => {
      console.log(`🚀 Bot muvaffaqiyatli ishga tushdi: @${botInfo.username}`);
      if (webAppUrl) {
        try {
          await bot.api.setChatMenuButton({
            menu_button: {
              type: 'web_app',
              text: '📱 Ilova',
              web_app: { url: webAppUrl }
            }
          });
          console.log(`📱 Telegram Menu Button Mini Appga ulandi: ${webAppUrl}`);
        } catch (menuErr) {
          console.warn('Menu button sozlashda eslatma:', menuErr.message);
        }
      }
    }
  });
}

module.exports = {
  bot,
  broadcastNewExpense,
  broadcastMonthEnd,
  handleNewMonth
};
