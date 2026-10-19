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

// Asosiy menyu klaviaturasi
function getMainKeyboard() {
  const kb = new Keyboard();
  if (webAppUrl) {
    kb.webApp('📱 Ilovani ochish (Mini App)', webAppUrl).row();
  }
  return kb
    .text('➕ Harajat yozish').text('📋 Ro\'yxat').row()
    .text('🧮 Hisoblash (Taqsimlash)').text('👥 Odamlar soni').row()
    .text('↩️ Oxirgisini bekor qilish').text('🔄 Yangi oyni boshlash')
    .resized();
}

// Holatni saqlash (oddiy session: odamlar sonini kutish)
const userState = {};

// /start komandasi
bot.command('start', async (ctx) => {
  const name = ctx.from?.first_name || 'Foydalanuvchi';
  const chatId = ctx.chat.id;
  const appUrl = getChatWebAppUrl(chatId);

  let inlineKb = null;
  if (appUrl) {
    inlineKb = new InlineKeyboard().webApp('🚀 Mini Appda ochish', appUrl);
  }

  const welcomeText = `👋 Assalomu alaykum, <b>${name}</b>!\n\n` +
    `🤖 <b>Harajat Bot</b>iga xush kelibsiz!\n` +
    `Bu bot orqali siz kvartiradoshlar, do'stlar yoki jamoa bilan birgalikdagi harajatlarni oson hisob-kitob qilishingiz mumkin.\n\n` +
    `💡 <b>Qanday ishlatiladi?</b>\n` +
    `1. Harajat yozish uchun shunchaki yozing:\n` +
    `   • <code>70000 bozorlik</code>\n` +
    `   • <code>Ali 70000 go'sht</code>\n` +
    `   • <code>Vali 100k mevalar</code>\n\n` +
    `2. Oy oxirida <b>🧮 Hisoblash</b> tugmasini bosing yoki <code>/hisob 2</code> deb yozing.\n` +
    `   Bot jami summani kishi soniga bo'lib, kim kimga qancha pul berishi kerakligini aniq aytadi!\n\n` +
    `📱 <i>Pastdagi <b>"Ilovani ochish"</b> tugmasi orqali hisoblarni qulay grafik va jadval ko'rinishida ko'rishingiz mumkin!</i>\n\n` +
    `👥 <i>Botni guruhga qo'shib ishlatsangiz yanada qulay bo'ladi!</i>`;

  await ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    reply_markup: inlineKb ? inlineKb : getMainKeyboard(chatId)
  });

  if (inlineKb) {
    await ctx.reply('Menyudan foydalanishingiz mumkin:', {
      reply_markup: getMainKeyboard(chatId)
    });
  }
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
});

// /royxat komandasi va tugmasi
async function handleList(ctx) {
  const expenses = storage.getExpenses(ctx.chat.id);
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
  const chatData = storage.getChatData(ctx.chat.id);
  const expenses = chatData.expenses;

  if (expenses.length === 0) {
    return ctx.reply('📭 Hali harajatlar kiritilmagan. Hisob-kitob qilish uchun avval harajat yozing.', {
      reply_markup: getMainKeyboard(ctx.chat.id)
    });
  }

  let peopleCount = explicitCount;
  if (!peopleCount && chatData.peopleCount) {
    peopleCount = chatData.peopleCount;
  }

  // Agar odamlar soni umuman ma'lum bo'lmasa, so'rash yoki mavjudlar bo'yicha chiqarish
  const result = calculateSettlement(expenses, peopleCount);
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
      storage.setPeopleCount(ctx.chat.id, num);
      return ctx.reply(`✅ Odamlar soni muvaffaqiyatli saqlandi: <b>${num} kishi</b>.\nEndi hisob-kitob shu songa bo'linadi.`, {
        parse_mode: 'HTML'
      });
    }
  }
  userState[ctx.chat.id] = { action: 'awaiting_people_count' };
  await ctx.reply('👥 Harajatlar necha kishiga bo\'linishi kerak? Iltimos raqam kiriting (masalan: 2 yoki 3):');
});

bot.hears('👥 Odamlar soni', async (ctx) => {
  const chatData = storage.getChatData(ctx.chat.id);
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
  const removed = storage.deleteLastExpense(ctx.chat.id);
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

// Yangi oy boshlash (Arxivlash)
async function handleNewMonth(ctx) {
  const archived = storage.archiveMonth(ctx.chat.id);
  if (!archived) {
    return ctx.reply('ℹ️ Hozirgi oyda harajatlar yo\'q, yangi oy allaqachon faol.');
  }
  await ctx.reply(
    `🎉 <b>Oy yakunlandi va arxivlandi!</b>\n` +
    `Jami ${archived.expenses.length} ta harajat arxivida saqlandi.\n` +
    `Yangi oy uchun hisob-kitob 0 dan boshlandi. Yangi harajatlarni kiritishingiz mumkin!`,
    { parse_mode: 'HTML', reply_markup: getMainKeyboard(ctx.chat.id) }
  );
}

bot.command('yangi_oy', handleNewMonth);
bot.hears('🔄 Yangi oyni boshlash', handleNewMonth);

// Inline tugmalar bilan ishlash
bot.callbackQuery(/delete_(.+)/, async (ctx) => {
  const expId = ctx.match[1];
  const chatData = storage.getChatData(ctx.chat.id);
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
      storage.setPeopleCount(chatId, num);
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
    const chatData = storage.getChatData(chatId);
    if (chatData.expenses.length > 0) {
      storage.setPeopleCount(chatId, onlyNumber);
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

module.exports = bot;
