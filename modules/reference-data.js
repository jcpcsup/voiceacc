export const dictationExampleGroups = [
  {
    id: "expense",
    title: "Expense",
    cue: "Spent / Paid",
    examples: [
      "Spent 45 with Cash on groceries milk from Walmart yesterday project pantry refill tags home,food",
      "Paid 89 with Cash on utilities internet day before yesterday project apartment tags recurring,home",
      "Spent 220 with Bkash on dining lunch from Cafe Rio today project office outing tags food,team",
      "Paid 640 with Main Bank on transport fuel on 2026-03-28 project commute tags car,travel",
      "Spent 1200 with Cash on health medicine from Popular Pharmacy yesterday project family care tags health,urgent",
    ],
  },
  {
    id: "income",
    title: "Income",
    cue: "Received / Got",
    examples: [
      "Received 2500 with Main Bank from Acme Corp on 2026-03-01 on salary payroll project march payroll tags salary,bonus",
      "Got 1200 with Cash from Rahim on refund cashback today project march return tags refund,cashback",
      "Earned 8500 with City Bank from Client Nova on freelance invoice yesterday project website build tags client,invoice",
      "Received 30000 with Main Bank from ABC Ltd on salary bonus on 2026-03-30 project annual bonus tags salary,bonus",
      "Sold 4500 with Cash from Rahat on shopping resale today project side hustle tags sale,extra",
    ],
  },
  {
    id: "transfer",
    title: "Transfer",
    cue: "Move Between Accounts",
    examples: [
      "Transfer 300 from Main Bank to Savings on 2026-03-15 tags reserve",
      "Transfer 1500 from Cash to Bkash on tomorrow tags wallet topup",
    ],
  },
];

export const dictationExamples = dictationExampleGroups.flatMap((group) => group.examples);

export const captureFields = [
  "Amount",
  "Date",
  "Account / From Account",
  "To Account for transfers",
  "Category",
  "Subcategory",
  "Payee or Payer",
  "Project",
  "Tags",
  "Details",
];

export const categoryKeywordMap = {
  groceries: ["groceries", "supermarket", "market", "food shopping"],
  dining: ["restaurant", "dinner", "lunch", "breakfast", "cafe", "coffee"],
  transport: ["uber", "taxi", "fuel", "gas", "metro", "train", "bus"],
  utilities: ["internet", "electricity", "water bill", "gas bill", "utility"],
  housing: ["rent", "mortgage", "apartment", "home repair"],
  health: ["doctor", "pharmacy", "medicine", "clinic", "hospital"],
  entertainment: ["movie", "netflix", "concert", "game"],
  shopping: ["shopping", "amazon", "mall", "clothes"],
  salary: ["salary", "payroll", "bonus", "wage"],
  freelance: ["invoice", "client payment", "consulting", "freelance"],
  refund: ["refund", "rebate", "cashback"],
};
