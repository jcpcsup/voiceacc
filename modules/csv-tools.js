export function createCsvTools(api) {
  const { state, showToast, getAccount, getCategory, uid, slugify } = api;

  function exportTransactionsCsv() {
    const rows = state.transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      date: transaction.date,
      accountId: transaction.accountId || "",
      accountName: getAccount(transaction.accountId)?.name || "",
      fromAccountId: transaction.fromAccountId || "",
      fromAccountName: getAccount(transaction.fromAccountId)?.name || "",
      toAccountId: transaction.toAccountId || "",
      toAccountName: getAccount(transaction.toAccountId)?.name || "",
      categoryId: transaction.categoryId || "",
      categoryName: getCategory(transaction.categoryId)?.name || "",
      subcategory: transaction.subcategory || "",
      tags: (transaction.tags || []).join(", "),
      payeeOrPayer: transaction.counterparty || "",
      project: transaction.project || "",
      details: transaction.details || "",
      createdAt: transaction.createdAt || "",
      updatedAt: transaction.updatedAt || "",
    }));
    downloadCsv("transactions.csv", rows);
  }

  function exportAccountsCsv() {
    const rows = state.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      sortOrder: account.sortOrder ?? "",
      type: account.type,
      currencySymbol: account.currencySymbol || "$",
      openingBalance: account.openingBalance || 0,
      includeInTotalBalance: account.includeInTotalBalance !== false ? "true" : "false",
      icon: account.icon || "wallet",
      color: account.color || "#19c6a7",
      notes: account.notes || "",
    }));
    downloadCsv("accounts.csv", rows);
  }

  function exportCategoriesCsv() {
    const rows = state.categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      icon: category.icon || "cart",
      color: category.color || "#19c6a7",
      subcategories: (category.subcategories || []).join(", "),
      budgetPeriod: category.budgetPeriod || "monthly",
      budgetLimit: category.budgetLimit || 0,
    }));
    downloadCsv("categories.csv", rows);
  }

  function exportImportTemplate(target) {
    const normalizedTarget = target === "accounts" || target === "categories" ? target : "transactions";
    const filename = `${normalizedTarget}-import-template.csv`;
    downloadCsv(filename, getImportTemplateRows(normalizedTarget), false);
    showToast(`${filename} downloaded.`);
  }

  function getImportTemplateRows(target) {
    if (target === "accounts") {
      return [
        {
          id: "acc-cash",
          name: "Cash",
          sortOrder: 0,
          type: "cash",
          currencySymbol: "$",
          openingBalance: 500,
          includeInTotalBalance: "true",
          icon: "cash",
          color: "#19c6a7",
          notes: "Pocket cash account",
        },
      ];
    }

    if (target === "categories") {
      return [
        {
          id: "groceries",
          name: "Groceries",
          type: "expense",
          icon: "cart",
          color: "#19c6a7",
          subcategories: "Produce, Supermarket",
          budgetPeriod: "monthly",
          budgetLimit: 500,
        },
      ];
    }

    return [
      {
        id: "tx-expense-001",
        type: "expense",
        amount: 45,
        date: "2026-03-15",
        accountName: "Cash",
        fromAccountName: "",
        toAccountName: "",
        categoryName: "Groceries",
        categoryType: "expense",
        subcategory: "Supermarket",
        tags: "food, home",
        payeeOrPayer: "Walmart",
        project: "Home Budget",
        details: "Weekly grocery run",
        createdAt: "2026-03-15T09:00:00.000Z",
        updatedAt: "2026-03-15T09:00:00.000Z",
      },
      {
        id: "tx-income-001",
        type: "income",
        amount: 3200,
        date: "2026-03-01",
        accountName: "Main Bank",
        fromAccountName: "",
        toAccountName: "",
        categoryName: "Salary",
        categoryType: "income",
        subcategory: "Payroll",
        tags: "salary, work",
        payeeOrPayer: "Employer Inc",
        project: "",
        details: "Monthly salary deposit",
        createdAt: "2026-03-01T08:00:00.000Z",
        updatedAt: "2026-03-01T08:00:00.000Z",
      },
      {
        id: "tx-transfer-001",
        type: "transfer",
        amount: 250,
        date: "2026-03-20",
        accountName: "",
        fromAccountName: "Main Bank",
        toAccountName: "Bkash",
        categoryName: "",
        categoryType: "",
        subcategory: "",
        tags: "transfer",
        payeeOrPayer: "",
        project: "",
        details: "Move funds to mobile wallet",
        createdAt: "2026-03-20T10:15:00.000Z",
        updatedAt: "2026-03-20T10:15:00.000Z",
      },
    ];
  }

  function getImportTemplateMessage(target) {
    if (target === "accounts") {
      return "Use this template to bulk-create or update accounts by ID.";
    }
    if (target === "categories") {
      return "Use this template to bulk-create or update categories and subcategory lists.";
    }
    return "Transactions CSV can auto-create missing accounts, categories, and subcategories from the name columns. Type, icon, color, currency, and budget fields can be omitted and the app will use inferred or default values.";
  }

  function downloadCsv(filename, rows, announce = true) {
    if (!rows.length) {
      showToast("There is no data to export yet.");
      return;
    }
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    if (announce) {
      showToast(`${filename} downloaded.`);
    }
  }

  function toCsv(rows) {
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    return lines.join("\n");
  }

  function findAccountId(id, name) {
    if (id && getAccount(id)) {
      return id;
    }
    if (name) {
      const match = state.accounts.find((account) => account.name.toLowerCase() === name.toLowerCase());
      return match ? match.id : "";
    }
    return "";
  }

  function ensureImportedAccount(row, summary) {
    const existingId = findAccountId(row.id, row.name);
    if (existingId) {
      return existingId;
    }
    const normalizedName = String(row.name || row.id || "").trim();
    if (!normalizedName) {
      return "";
    }
    const normalizedType = normalizeImportAccountType(row.type || inferImportedAccountType(normalizedName));
    const payload = {
      id: row.id || slugify(normalizedName) || uid("acc"),
      name: normalizedName,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : state.accounts.length,
      type: normalizedType,
      currencySymbol: String(row.currencySymbol || "$").trim() || "$",
      openingBalance: Number(row.openingBalance || 0),
      includeInTotalBalance: String(row.includeInTotalBalance ?? "true").toLowerCase() !== "false",
      color: row.color || getImportedAccountColor(normalizedType),
      icon: row.icon || getImportedAccountIcon(normalizedType),
      notes: row.notes || "Auto-created from transaction import",
    };
    upsertById(state.accounts, payload);
    if (summary) {
      summary.createdAccounts += 1;
    }
    return payload.id;
  }

  function findCategoryId(id, name) {
    if (id && getCategory(id)) {
      return id;
    }
    if (name) {
      const match = state.categories.find((category) => category.name.toLowerCase() === name.toLowerCase());
      return match ? match.id : "";
    }
    return "";
  }

  function ensureImportedCategory(row, summary) {
    const existingId = findCategoryId(row.id, row.name);
    if (existingId) {
      return existingId;
    }
    const normalizedName = String(row.name || row.id || "").trim();
    if (!normalizedName) {
      return "";
    }
    const normalizedType = normalizeImportCategoryType(row.type);
    const payload = {
      id: row.id || slugify(normalizedName) || uid("cat"),
      name: normalizedName,
      type: normalizedType,
      icon: row.icon || getImportedCategoryIcon(normalizedType),
      color: row.color || getImportedCategoryColor(normalizedType),
      subcategories: [],
      budgetLimit: Number(row.budgetLimit || 0),
      budgetPeriod: row.budgetPeriod === "weekly" ? "weekly" : "monthly",
    };
    upsertById(state.categories, payload);
    if (summary) {
      summary.createdCategories += 1;
    }
    return payload.id;
  }

  function appendImportedSubcategory(categoryId, subcategory, summary) {
    const category = getCategory(categoryId);
    if (!category) {
      return;
    }
    const nextValue = String(subcategory || "").trim();
    if (!nextValue) {
      return;
    }
    if (!Array.isArray(category.subcategories)) {
      category.subcategories = [];
    }
    const exists = category.subcategories.some((item) => item.toLowerCase() === nextValue.toLowerCase());
    if (exists) {
      return;
    }
    category.subcategories.push(nextValue);
    if (summary) {
      summary.appendedSubcategories += 1;
    }
  }

  function normalizeImportTransactionType(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "income" || normalized === "transfer") {
      return normalized;
    }
    return "expense";
  }

  function normalizeImportAccountType(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["cash", "bank", "savings", "card", "wallet"].includes(normalized)) {
      return normalized;
    }
    return "cash";
  }

  function normalizeImportCategoryType(value) {
    return String(value || "").trim().toLowerCase() === "income" ? "income" : "expense";
  }

  function inferImportedAccountType(name) {
    const normalized = String(name || "").toLowerCase();
    if (normalized.includes("bank")) {
      return "bank";
    }
    if (normalized.includes("save")) {
      return "savings";
    }
    if (normalized.includes("card")) {
      return "card";
    }
    if (normalized.includes("wallet")) {
      return "wallet";
    }
    return "cash";
  }

  function getImportedAccountIcon(type) {
    const normalized = normalizeImportAccountType(type);
    return normalized === "bank" ? "bank" : normalized === "savings" ? "safe" : normalized === "card" ? "card" : normalized === "wallet" ? "wallet" : "cash";
  }

  function getImportedAccountColor(type) {
    const normalized = normalizeImportAccountType(type);
    return normalized === "bank" ? "#7db8ff" : normalized === "savings" ? "#ffb84d" : normalized === "card" ? "#9f86ff" : normalized === "wallet" ? "#00a6c7" : "#19c6a7";
  }

  function getImportedCategoryIcon(type) {
    return normalizeImportCategoryType(type) === "income" ? "briefcase" : "cart";
  }

  function getImportedCategoryColor(type) {
    return normalizeImportCategoryType(type) === "income" ? "#19c6a7" : "#ffb84d";
  }

  function upsertById(collection, payload) {
    const index = collection.findIndex((item) => item.id === payload.id);
    if (index >= 0) {
      collection[index] = { ...collection[index], ...payload };
    } else {
      collection.push(payload);
    }
  }

  return {
    exportTransactionsCsv,
    exportAccountsCsv,
    exportCategoriesCsv,
    exportImportTemplate,
    getImportTemplateMessage,
    toCsv,
    findAccountId,
    ensureImportedAccount,
    findCategoryId,
    ensureImportedCategory,
    appendImportedSubcategory,
    normalizeImportTransactionType,
    normalizeImportAccountType,
    normalizeImportCategoryType,
  };
}
