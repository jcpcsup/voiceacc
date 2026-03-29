export const dictationExamples = [
  "Spent 45 on groceries at Walmart yesterday from Cash tags home,food",
  "Received 2500 salary from Acme Corp on 2026-03-01 into Main Bank project March payroll",
  "Transfer 300 from Main Bank to Savings on 03/15/2026 tags reserve",
  "Paid 89 for internet bill from Main Bank category Utilities project apartment",
];

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
