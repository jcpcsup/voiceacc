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
      type: account.type,
      currencySymbol: account.currencySymbol || "$",
      openingBalance: account.openingBalance || 0,
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

  function downloadCsv(filename, rows) {
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
    showToast(`${filename} downloaded.`);
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
      type: normalizedType,
      currencySymbol: String(row.currencySymbol || "$").trim() || "$",
      openingBalance: Number(row.openingBalance || 0),
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
