// Test expense settlement logic
function calculateSettlement(expenses, peopleCountInput, participantNames = []) {
  // Aggregate expenses per person
  const spentMap = {};
  let totalExpense = 0;

  for (const exp of expenses) {
    const name = exp.name.trim();
    spentMap[name] = (spentMap[name] || 0) + exp.amount;
    totalExpense += exp.amount;
  }

  const spenders = Object.keys(spentMap);
  const peopleCount = Math.max(peopleCountInput || spenders.length, spenders.length);

  // If peopleCount > spenders.length, add non-spending members
  const allMembers = new Set([...spenders, ...participantNames]);
  let unnamedIndex = 1;
  while (allMembers.size < peopleCount) {
    allMembers.add(`A'zo ${unnamedIndex++}`);
  }

  const memberList = Array.from(allMembers);
  for (const member of memberList) {
    if (!spentMap[member]) {
      spentMap[member] = 0;
    }
  }

  const perPersonShare = totalExpense / peopleCount;

  // Calculate net balances: positive means they should receive, negative means they owe
  const debtors = []; // owes money
  const creditors = []; // receives money

  for (const [name, amount] of Object.entries(spentMap)) {
    const net = amount - perPersonShare;
    if (net < -0.01) {
      debtors.push({ name, amountOwed: -net });
    } else if (net > 0.01) {
      creditors.push({ name, amountToReceive: net });
    }
  }

  // Sort: biggest debtor first, biggest creditor first
  debtors.sort((a, b) => b.amountOwed - a.amountOwed);
  creditors.sort((a, b) => b.amountToReceive - a.amountToReceive);

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
    totalExpense,
    peopleCount,
    perPersonShare: Math.round(perPersonShare),
    spentMap,
    transactions
  };
}

// Test case 1: Ali (70) and Vali (100), 2 people
const test1 = calculateSettlement(
  [
    { name: 'Ali', amount: 70000 },
    { name: 'Vali', amount: 100000 }
  ],
  2
);

console.log('--- Test 1 (Ali 70, Vali 100, 2 kishi) ---');
console.log('Jami:', test1.totalExpense);
console.log('1 kishiga:', test1.perPersonShare);
console.log('Tranzaksiyalar:', test1.transactions);

// Test case 2: Ali (70), Vali (100), G'ani (0), 3 people
const test2 = calculateSettlement(
  [
    { name: 'Ali', amount: 70000 },
    { name: 'Vali', amount: 100000 }
  ],
  3,
  ["G'ani"]
);
console.log('\n--- Test 2 (Ali 70, Vali 100, G\'ani 0, 3 kishi) ---');
console.log('Jami:', test2.totalExpense);
console.log('1 kishiga:', test2.perPersonShare);
console.log('Tranzaksiyalar:', test2.transactions);
