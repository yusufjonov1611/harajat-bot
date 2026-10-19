/**
 * Parse money text to integer
 * Examples:
 *  "70000" -> 70000
 *  "70 000" -> 70000
 *  "70k" -> 70000
 *  "70 ming" -> 70000
 *  "1.5 mln" -> 1500000
 */
function parseAmount(text) {
  if (!text) return null;
  const clean = text.trim().toLowerCase().replace(/\s+/g, '');

  // Match: digits with optional . or , and suffix (k, ming, mln, m)
  const match = clean.match(/^(\d+(?:[.,]\d+)?)(k|ming|mln|m)?$/);
  if (!match) return null;

  let num = parseFloat(match[1].replace(',', '.'));
  const suffix = match[2];

  if (suffix === 'k' || suffix === 'ming') {
    num *= 1000;
  } else if (suffix === 'mln' || suffix === 'm') {
    num *= 1000000;
  }

  return Math.round(num);
}

/**
 * Parse an expense message string
 * Formats supported:
 * 1. "Ali 70000 Go'sht uchun" -> { name: "Ali", amount: 70000, description: "Go'sht uchun" }
 * 2. "70000 Go'sht uchun" -> { name: defaultName, amount: 70000, description: "Go'sht uchun" }
 * 3. "Ali 70k" -> { name: "Ali", amount: 70000, description: "Harajat" }
 * 4. "100 000" -> { name: defaultName, amount: 100000, description: "Harajat" }
 * 5. "/harajat Ali 70000 go'sht"
 */
function parseExpenseMessage(text, defaultName = 'Men') {
  if (!text) return null;

  // Remove command prefix if any
  let cleanText = text.replace(/^\/(?:harajat|qosh|xarajat)\s*/i, '').trim();

  // Replace phrases like "70 ming" with "70ming"
  cleanText = cleanText.replace(/(\d+)\s+(ming|mln|k)\b/gi, '$1$2');

  const parts = cleanText.split(/\s+/);
  if (parts.length === 0 || !parts[0]) return null;

  // Case 1: First word is an amount (e.g. "70000 go'sht" or "70k non")
  const firstAsAmount = parseAmount(parts[0]);
  if (firstAsAmount !== null && firstAsAmount > 0) {
    const desc = parts.slice(1).join(' ').trim() || 'Harajat';
    return {
      name: defaultName,
      amount: firstAsAmount,
      description: desc
    };
  }

  // Case 2: Second word is an amount (e.g. "Ali 70000 go'sht" or "Vali 100k")
  if (parts.length >= 2) {
    const secondAsAmount = parseAmount(parts[1]);
    if (secondAsAmount !== null && secondAsAmount > 0) {
      const name = parts[0];
      const desc = parts.slice(2).join(' ').trim() || 'Harajat';
      return {
        name,
        amount: secondAsAmount,
        description: desc
      };
    }
  }

  // Case 3: Amount might have space like "Ali 70 000 go'sht"
  // Let's scan for a numeric sequence
  for (let i = 0; i < parts.length; i++) {
    const amt = parseAmount(parts[i]);
    if (amt !== null && amt > 0) {
      const name = i === 0 ? defaultName : parts.slice(0, i).join(' ');
      const desc = parts.slice(i + 1).join(' ').trim() || 'Harajat';
      return {
        name,
        amount: amt,
        description: desc
      };
    }
  }

  return null;
}

module.exports = {
  parseAmount,
  parseExpenseMessage
};
