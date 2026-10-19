const { parseExpenseMessage, parseAmount } = require('./src/parser');

const tests = [
  { input: "70000 bozorlik", def: "Ali" },
  { input: "Ali 70000 go'sht", def: "Ali" },
  { input: "Vali 100k", def: "Vali" },
  { input: "Ali 15 ming berishi kerak", def: "Ali" },
  { input: "/harajat Vali 100000 mevalar", def: "Vali" }
];

for (const t of tests) {
  console.log(t.input, '=>', parseExpenseMessage(t.input, t.def));
}
