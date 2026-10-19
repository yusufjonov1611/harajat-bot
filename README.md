# 💰 Harajat Bot (Telegram & CLI)

Kvartiradoshlar, do'stlar, safardoshlar va sheriklar uchun birgalikdagi chiqimlarni (harajatlarni) yozib borish, oy oxirida odamlar soniga teng taqsimlash va kim kimga qancha pul berishi kerakligini aniq hisoblab beruvchi bot.

---

## 📌 Asosiy xususiyatlari

1. **Oson harajat yozish:**
   - Shunchaki xabar yozish kifoya: `70000 bozorlik` yoki `Ali 70000 go'sht`, `Vali 100k mevalar`.
   - Guruhda (Group chat) ishlatilganda har kim o'z nomidan yozishi mumkin, bot foydalanuvchining ismini avtomatik taniydi.
2. **Oy oxirida teng taqsimlash:**
   - `/hisob` yoki tugma orqali oylik jami harajat hisoblanadi.
   - Odamlar sonini kiritish imkoniyati (masalan: 2, 3, 4 kishi).
3. **Aqlli qarz hisob-kitobi (Debt settlement):**
   - **Misol:** Ali 70 000 so'm, Vali 100 000 so'm harajat qilgan bo'lsa:
     - Jami: 170 000 so'm
     - 2 kishiga bo'linganda: 85 000 so'mdan
     - Natija: **👉 Ali Valiga 15 000 so'm berishi kerak** deb aniq ko'rsatadi.
4. **Yangi oyni boshlash:**
   - Oylik hisob-kitob qilingach, `/yangi_oy` buyrug'i bilan o'tgan oyni arxivlab, yangi oyni 0 dan boshlash mumkin.
5. **Ma'lumotlar xavfsizligi:**
   - Harajatlar `data/expenses.json` faylida avtomatik saqlanadi, server qayta yoqilganda ham o'chib ketmaydi.

---

## 🚀 Ishga tushirish

### 1. Bot tokenini olish:
1. Telegramda [@BotFather](https://t.me/BotFather) ga kiring.
2. `/newbot` buyrug'ini yuboring va ko'rsatmalarga asosan bot nomi va username bering.
3. BotFather bergan **HTTP API Token**ni nusxalab oling.

### 2. .env faylini sozlash:
Loyiha papkasidagi `.env` faylini ochib, bot tokeningizni yozing:
```env
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

### 3. Botni ishga tushirish:
```bash
npm start
```
Bot ishga tushgach, Telegramda unga `/start` yuborishingiz yoki o'z guruhingizga qo'shib ishlatishingiz mumkin!

---

## 🖥 Terminalda (Telegram botsiz) sinab ko'rish:
Agar hozircha Telegram bot tokeningiz bo'lmasa, uni to'g'ridan-to'g'ri terminalda sinab ko'rishingiz mumkin:
```bash
npm run cli
```

---

## 📱 Telegram Mini App (Web App)
Bot ichida to'liq interaktiv Web App integratsiyasi mavjud:
- **Tezkor ochish:** Klaviaturadagi `📱 Ilovani ochish` tugmasi yoki pastki chap burchakdagi **Menu Button** orqali.
- **Sinxronizatsiya:** Botdagi harajatlar Web Appda, Web Appdagi harajatlar Botda bir vaqtda ko'rinadi (har bir guruh yoki chat alohida `chatId` orqali saqlanadi).
- **Haptic Feedback:** Telegram mobil ilovasida tugmalar bosilganda tebranish (vibratsiya) effekti.
- **Ismni avtomatik aniqlash:** Foydalanuvchi Telegram akkauntidagi ismi formaga avtomatik joylanadi.

---

## 📱 Bot buyruqlari

| Buyruq | Tavsif |
|---|---|
| `/start` | Botni ishga tushirish, Mini App tugmasi va asosiy menyu |
| `/app` yoki `/ilova` | Telegram Mini Appni ochish tugmasini olish |
| `70000 bozorlik` | Harajat qo'shish (ism xabar yuboruvchidan olinadi) |
| `Ali 70000 go'sht` | Aniq ism bilan harajat qo'shish |
| `/royxat` | Shu oydagi barcha harajatlar ro'yxati va Mini App havolasi |
| `/hisob` yoki `/hisob 2` | Harajatlarni teng taqsimlash va hisobot |
| `/odamlar 3` | Standart odamlar sonini belgilash |
| `/bekor` | Oxirgi kiritilgan xarajatni o'chirish |
| `/yangi_oy` | Oyni yakunlab, arxivlab, yangi oyni 0 dan boshlash |

