/**
 * Clean & normalize text for fuzzy comparison
 */
function normalizeName(str) {
  if (!str) return '';
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-zA-Z0-9\s]/g, '') // remove special symbols & emojis
    .toLowerCase()
    .trim();
}

/**
 * Generate aliases for a member name
 * E.g. "➪ 𝓨𝓾𝓼𝓾𝓯𝓳𝓸𝓷𝓸𝓿 𝓐𝓫𝓭𝓾𝓵𝓵𝓸𝓱" -> ["yusufjonov abdulloh", "yusufjonov", "abdulloh"]
 */
function getMemberAliases(memberName) {
  const clean = normalizeName(memberName);
  if (!clean) return [];
  const parts = clean.split(/\s+/).filter(Boolean);
  const aliases = [clean];
  for (const part of parts) {
    if (part.length >= 3 && !aliases.includes(part)) {
      aliases.push(part);
    }
  }
  return aliases;
}

/**
 * Parse money text to integer
 * Examples:
 *  "70000" -> 70000
 *  "70 000" -> 70000
 *  "70k" -> 70000
 *  "70 ming" -> 70000
 *  "1.5 mln" -> 1500000
 *  "86.000" -> 86000
 */
function parseAmount(text) {
  if (!text) return null;
  let clean = text.trim().toLowerCase();

  // Strip currency words: so'm, som, sum, uzs
  clean = clean.replace(/so['ʻ`’]?m|som|sum|uzs/gi, '').trim();

  // Remove spaces between thousands digits: "70 000" -> "70000"
  clean = clean.replace(/\s+/g, '');

  // If format is like "86.000" or "86,000" with exactly 3 digits after separator
  const thousandDotMatch = clean.match(/^(\d{1,3})[.,](\d{3})$/);
  if (thousandDotMatch) {
    return parseInt(thousandDotMatch[1] + thousandDotMatch[2], 10);
  }

  // Match digits with optional decimal point and suffix
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
 * Pre-process raw text to normalize amounts and remove clutter
 */
function preprocessText(rawText) {
  if (!rawText) return '';

  let text = rawText
    .replace(/^\/(?:harajat|xarajat|qosh|add|h)\s*/i, '') // remove command
    .replace(/@\w+_bot\b/gi, '') // remove bot mention
    .trim();

  // Convert "86 000" -> "86000", "15 000" -> "15000"
  text = text.replace(/(?<=\b\d{1,3})\s+(\d{3})\b/g, '$1');

  // Convert "70 ming" -> "70ming", "1.5 mln" -> "1.5mln", "70 k" -> "70k"
  text = text.replace(/(\d+(?:[.,]\d+)?)\s+(ming|mln|k|m)\b/gi, '$1$2');

  // Clean currency words when attached or next to numbers: "50000 so'm" -> "50000"
  text = text.replace(/(\d+)\s*(?:so['ʻ`’]?m|som|sum|uzs)\b/gi, '$1');

  return text.trim();
}

/**
 * Parse an expense message string
 *
 * Supported formats:
 * - "70000 non" -> { name: defaultName, amount: 70000, description: "non" }
 * - "non 15000" -> { name: defaultName, amount: 15000, description: "non" }
 * - "tuxum non, yogʻ 86000" -> { name: defaultName, amount: 86000, description: "tuxum non, yogʻ" }
 * - "Ali 70000 go'sht" -> { name: "Ali", amount: 70000, description: "go'sht" }
 * - "Ali go'sht 70000" -> { name: "Ali", amount: 70000, description: "go'sht" }
 * - "go'sht 70000 Ali" -> { name: "Ali", amount: 70000, description: "go'sht" }
 * - "Ali 70k" -> { name: "Ali", amount: 70000, description: "Harajat" }
 * - "70000" -> { name: defaultName, amount: 70000, description: "Harajat" }
 */
function parseExpenseMessage(text, defaultName = 'Men', knownMembers = []) {
  if (!text) return null;

  const cleaned = preprocessText(text);
  if (!cleaned) return null;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // 1. Locate amount token
  let amountIndex = -1;
  let detectedAmount = null;

  for (let i = 0; i < tokens.length; i++) {
    const amt = parseAmount(tokens[i]);
    if (amt !== null && amt > 0) {
      amountIndex = i;
      detectedAmount = amt;
      break;
    }
  }

  if (detectedAmount === null || detectedAmount <= 0) {
    return null;
  }

  // Tokens before amount and after amount
  const beforeTokens = tokens.slice(0, amountIndex);
  const afterTokens = tokens.slice(amountIndex + 1);
  const otherTokens = [...beforeTokens, ...afterTokens];

  // If no other tokens at all, e.g. "70000"
  if (otherTokens.length === 0) {
    return {
      name: defaultName,
      amount: detectedAmount,
      description: 'Harajat'
    };
  }

  // Build list of known candidates to match
  const memberCandidates = [];
  if (Array.isArray(knownMembers)) {
    for (const m of knownMembers) {
      const origName = typeof m === 'string' ? m : m?.name;
      if (origName) {
        memberCandidates.push({
          original: origName,
          aliases: getMemberAliases(origName)
        });
      }
    }
  }

  // Also include defaultName as candidate
  if (defaultName && !memberCandidates.some(c => c.original === defaultName)) {
    memberCandidates.push({
      original: defaultName,
      aliases: getMemberAliases(defaultName)
    });
  }

  // 2. Check if any token matches a known member
  let matchedMember = null;
  let memberTokenIndex = -1;

  for (let i = 0; i < otherTokens.length; i++) {
    const tokenClean = normalizeName(otherTokens[i]);
    if (!tokenClean) continue;

    for (const candidate of memberCandidates) {
      if (candidate.aliases.includes(tokenClean)) {
        matchedMember = candidate.original;
        memberTokenIndex = i;
        break;
      }
    }
    if (matchedMember) break;
  }

  // If a known member was found in the text
  if (matchedMember) {
    const descTokens = otherTokens.filter((_, idx) => idx !== memberTokenIndex);
    const desc = descTokens.join(' ').replace(/^,\s*|,\s*$/g, '').trim() || 'Harajat';
    return {
      name: matchedMember,
      amount: detectedAmount,
      description: desc
    };
  }

  // 3. No known member matched.
  // Did user specify an unknown/new name, or is it just description?
  //
  // Patterns:
  // - "Ali 70000 go'sht" -> beforeTokens: ["Ali"], afterTokens: ["go'sht"]
  //   If there are tokens both before AND after the amount, the one before is likely the person's name!
  if (beforeTokens.length === 1 && afterTokens.length > 0) {
    const candidateName = beforeTokens[0];
    // Check that candidateName looks like a name (starts with capital letter or alpha)
    if (/^[A-Za-zА-Яа-яЎўҚқҒғҲҳ]/.test(candidateName)) {
      return {
        name: candidateName,
        amount: detectedAmount,
        description: afterTokens.join(' ').trim() || 'Harajat'
      };
    }
  }

  // - If all text is before the amount (e.g. "tuxum non, yogʻ 86000", "non 15000", "chuchvara 45000")
  //   OR all text is after the amount (e.g. "86000 tuxum non", "15000 non")
  //   Then the text is the DESCRIPTION, and the spender is defaultName!
  const fullDesc = otherTokens.join(' ').replace(/^,\s*|,\s*$/g, '').trim() || 'Harajat';
  return {
    name: defaultName,
    amount: detectedAmount,
    description: fullDesc
  };
}

module.exports = {
  normalizeName,
  getMemberAliases,
  parseAmount,
  preprocessText,
  parseExpenseMessage
};
