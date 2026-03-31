export function createModalTools(api) {
  const {
    state,
    uiState,
    categoryKeywordMap,
    iconRegistry,
    renderSelectOptions,
    renderSubcategoryOptions,
    getTransaction,
    getAccount,
    getCategory,
    findAccountId,
    findCategoryId,
    ensureImportedAccount,
    ensureImportedCategory,
    appendImportedSubcategory,
    normalizeImportTransactionType,
    slugify,
    uid,
    splitTags,
    normalizeDateInput,
    titleCase,
    escapeRegExp,
    todayIso,
    shiftIsoDate,
    showToast,
    persistAndRefresh,
  } = api;

  function syncTransactionTypeFields() {
    const type = document.getElementById("transaction-type").value;
    const isTransfer = type === "transfer";
    document.getElementById("field-from-account").classList.toggle("hidden", !isTransfer);
    document.getElementById("field-to-account").classList.toggle("hidden", !isTransfer);
    document.getElementById("transaction-account").closest(".field-group").classList.toggle("hidden", isTransfer);
    document.getElementById("transaction-category").closest(".field-group").classList.toggle("hidden", isTransfer);
    document.getElementById("transaction-subcategory").closest(".field-group").classList.toggle("hidden", isTransfer);
  }

  function syncCategoryBudgetState() {
    const isIncome = document.getElementById("category-type").value === "income";
    document.getElementById("category-budget-limit").disabled = isIncome;
    document.getElementById("category-budget-period").disabled = isIncome;
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function openTransactionModal(transactionId, parserResult) {
    const form = document.getElementById("transaction-form");
    form.reset();
    document.getElementById("transaction-date").value = todayIso();
    document.getElementById("transaction-id").value = transactionId || "";
    document.getElementById("transaction-modal-title").textContent = transactionId ? "Edit Transaction" : "Add Transaction";
    document.getElementById("transaction-delete-button").classList.toggle("hidden", !transactionId);
    document.getElementById("transaction-parser-notice").classList.add("hidden");
    renderSelectOptions();
    if (transactionId) {
      const transaction = getTransaction(transactionId);
      if (!transaction) {
        return;
      }
      applyTransactionToForm(transaction);
    }
    if (parserResult) {
      applyTransactionToForm(parserResult.transaction);
      if (parserResult.missing.length) {
        const notice = document.getElementById("transaction-parser-notice");
        notice.textContent = `Captured from dictation. Please confirm: ${parserResult.missing.join(", ")}.`;
        notice.classList.remove("hidden");
      }
    }
    syncTransactionTypeFields();
    openModal("transaction-modal");
  }

  function openAccountModal(accountId) {
    const form = document.getElementById("account-form");
    form.reset();
    document.getElementById("account-id").value = accountId || "";
    document.getElementById("account-modal-title").textContent = accountId ? "Edit Account" : "Add Account";
    document.getElementById("account-color").value = "#19c6a7";
    document.getElementById("account-currency-symbol").value = "$";
    if (accountId) {
      const account = getAccount(accountId);
      if (!account) {
        return;
      }
      document.getElementById("account-name").value = account.name;
      document.getElementById("account-type").value = account.type;
      document.getElementById("account-currency-symbol").value = account.currencySymbol || "$";
      document.getElementById("account-opening-balance").value = account.openingBalance ?? 0;
      document.getElementById("account-color").value = account.color || "#19c6a7";
      document.getElementById("account-icon").value = account.icon || "wallet";
      document.getElementById("account-notes").value = account.notes || "";
    }
    openModal("account-modal");
  }

  function openCategoryModal(categoryId) {
    const form = document.getElementById("category-form");
    form.reset();
    document.getElementById("category-id").value = categoryId || "";
    document.getElementById("category-modal-title").textContent = categoryId ? "Edit Category" : "Add Category";
    document.getElementById("category-color").value = "#19c6a7";
    if (categoryId) {
      const category = getCategory(categoryId);
      if (!category) {
        return;
      }
      document.getElementById("category-name").value = category.name;
      document.getElementById("category-type").value = category.type;
      document.getElementById("category-icon").value = category.icon || "cart";
      document.getElementById("category-color").value = category.color || "#19c6a7";
      document.getElementById("category-subcategories").value = (category.subcategories || []).join(", ");
      document.getElementById("category-budget-limit").value = category.budgetLimit || "";
      document.getElementById("category-budget-period").value = category.budgetPeriod || "monthly";
    }
    syncCategoryBudgetState();
    openModal("category-modal");
  }

  function applyTransactionToForm(transaction) {
    document.getElementById("transaction-type").value = transaction.type || "expense";
    document.getElementById("transaction-amount").value = transaction.amount ?? "";
    document.getElementById("transaction-date").value = transaction.date || todayIso();
    document.getElementById("transaction-account").value = transaction.accountId || "";
    document.getElementById("transaction-from-account").value = transaction.fromAccountId || "";
    document.getElementById("transaction-to-account").value = transaction.toAccountId || "";
    document.getElementById("transaction-category").value = transaction.categoryId || "";
    renderSubcategoryOptions();
    document.getElementById("transaction-subcategory").value = transaction.subcategory || "";
    document.getElementById("transaction-counterparty").value = transaction.counterparty || "";
    document.getElementById("transaction-project").value = transaction.project || "";
    document.getElementById("transaction-tags").value = (transaction.tags || []).join(", ");
    document.getElementById("transaction-details").value = transaction.details || "";
  }

  function handleTransactionSubmit(event) {
    event.preventDefault();
    const type = document.getElementById("transaction-type").value;
    const amount = Number(document.getElementById("transaction-amount").value);
    const payload = {
      id: document.getElementById("transaction-id").value || uid("tx"),
      type,
      amount,
      date: document.getElementById("transaction-date").value,
      accountId: type === "transfer" ? "" : document.getElementById("transaction-account").value,
      fromAccountId: type === "transfer" ? document.getElementById("transaction-from-account").value : "",
      toAccountId: type === "transfer" ? document.getElementById("transaction-to-account").value : "",
      categoryId: type === "transfer" ? "" : document.getElementById("transaction-category").value,
      subcategory: type === "transfer" ? "" : document.getElementById("transaction-subcategory").value,
      counterparty: document.getElementById("transaction-counterparty").value.trim(),
      project: document.getElementById("transaction-project").value.trim(),
      tags: splitTags(document.getElementById("transaction-tags").value),
      details: document.getElementById("transaction-details").value.trim(),
      updatedAt: new Date().toISOString(),
    };

    if (!amount || amount <= 0) {
      showToast("Enter a valid amount.");
      return;
    }
    if (!payload.date) {
      showToast("Pick a transaction date.");
      return;
    }
    if (type === "transfer") {
      if (!payload.fromAccountId || !payload.toAccountId) {
        showToast("Transfers need both source and destination accounts.");
        return;
      }
      if (payload.fromAccountId === payload.toAccountId) {
        showToast("Transfer accounts must be different.");
        return;
      }
    } else if (!payload.accountId) {
      showToast("Choose an account for this transaction.");
      return;
    }

    const existingIndex = state.transactions.findIndex((tx) => tx.id === payload.id);
    if (existingIndex >= 0) {
      state.transactions[existingIndex] = {
        ...state.transactions[existingIndex],
        ...payload,
      };
      showToast("Transaction updated.");
    } else {
      state.transactions.push({
        ...payload,
        createdAt: new Date().toISOString(),
      });
      showToast("Transaction saved.");
    }
    persistAndRefresh();
    closeModal("transaction-modal");
  }

  function handleAccountSubmit(event) {
    event.preventDefault();
    const payload = {
      id: document.getElementById("account-id").value || uid("acc"),
      name: document.getElementById("account-name").value.trim(),
      type: document.getElementById("account-type").value,
      currencySymbol: document.getElementById("account-currency-symbol").value.trim() || "$",
      openingBalance: Number(document.getElementById("account-opening-balance").value || 0),
      color: document.getElementById("account-color").value,
      icon: document.getElementById("account-icon").value,
      notes: document.getElementById("account-notes").value.trim(),
    };
    if (!payload.name) {
      showToast("Account name is required.");
      return;
    }
    const existingIndex = state.accounts.findIndex((account) => account.id === payload.id);
    if (existingIndex >= 0) {
      state.accounts[existingIndex] = payload;
      showToast("Account updated.");
    } else {
      state.accounts.push(payload);
      showToast("Account created.");
    }
    persistAndRefresh();
    closeModal("account-modal");
  }

  function handleCategorySubmit(event) {
    event.preventDefault();
    const type = document.getElementById("category-type").value;
    const rawName = document.getElementById("category-name").value.trim();
    const categoryId = document.getElementById("category-id").value;
    const payload = {
      id: categoryId || slugify(rawName) || uid("cat"),
      name: rawName,
      type,
      icon: document.getElementById("category-icon").value.trim(),
      color: document.getElementById("category-color").value,
      subcategories: document
        .getElementById("category-subcategories")
        .value.split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      budgetLimit: type === "income" ? 0 : Number(document.getElementById("category-budget-limit").value || 0),
      budgetPeriod: document.getElementById("category-budget-period").value,
    };
    if (!payload.name) {
      showToast("Category name is required.");
      return;
    }
    const existingIndex = state.categories.findIndex((category) => category.id === categoryId);
    if (existingIndex >= 0) {
      state.categories[existingIndex] = payload;
      showToast("Category updated.");
    } else {
      state.categories.push(payload);
      showToast("Category created.");
    }
    persistAndRefresh();
    closeModal("category-modal");
  }

  async function handleImportSubmit(event) {
    event.preventDefault();
    const target = document.getElementById("import-target").value;
    const file = document.getElementById("import-file").files[0];
    if (!file) {
      showToast("Select a CSV file first.");
      return;
    }
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      showToast("The CSV file appears to be empty.");
      return;
    }
    let importSummary = null;
    if (target === "transactions") {
      importSummary = importTransactions(rows);
    }
    if (target === "accounts") {
      importSummary = importAccounts(rows);
    }
    if (target === "categories") {
      importSummary = importCategories(rows);
    }
    persistAndRefresh();
    closeModal("import-modal");
    showToast(buildImportToast(rows.length, target, importSummary));
  }

  function importTransactions(rows) {
    const summary = {
      createdAccounts: 0,
      createdCategories: 0,
      appendedSubcategories: 0,
    };
    rows.forEach((row) => {
      const type = normalizeImportTransactionType(row.type);
      const accountId =
        type === "transfer"
          ? ""
          : ensureImportedAccount(
              {
                id: row.accountId,
                name: row.accountName,
                type: row.accountType,
                currencySymbol: row.accountCurrencySymbol || row.currencySymbol,
                color: row.accountColor,
                icon: row.accountIcon,
              },
              summary
            );
      const fromAccountId =
        type === "transfer"
          ? ensureImportedAccount(
              {
                id: row.fromAccountId,
                name: row.fromAccountName,
                type: row.fromAccountType,
                currencySymbol: row.fromAccountCurrencySymbol || row.currencySymbol,
                color: row.fromAccountColor,
                icon: row.fromAccountIcon,
              },
              summary
            )
          : "";
      const toAccountId =
        type === "transfer"
          ? ensureImportedAccount(
              {
                id: row.toAccountId,
                name: row.toAccountName,
                type: row.toAccountType,
                currencySymbol: row.toAccountCurrencySymbol || row.currencySymbol,
                color: row.toAccountColor,
                icon: row.toAccountIcon,
              },
              summary
            )
          : "";
      const categoryId =
        type === "transfer"
          ? ""
          : ensureImportedCategory(
              {
                id: row.categoryId,
                name: row.categoryName,
                type: row.categoryType || type,
                icon: row.categoryIcon,
                color: row.categoryColor,
                budgetLimit: row.categoryBudgetLimit,
                budgetPeriod: row.categoryBudgetPeriod,
              },
              summary
            );
      const subcategory = String(row.subcategory || "").trim();
      if (categoryId && subcategory) {
        appendImportedSubcategory(categoryId, subcategory, summary);
      }

      const payload = {
        id: row.id || uid("tx"),
        type,
        amount: Number(row.amount || 0),
        date: normalizeDateInput(row.date) || todayIso(),
        accountId,
        fromAccountId,
        toAccountId,
        categoryId,
        subcategory,
        counterparty: row.payeeOrPayer || row.counterparty || "",
        project: row.project || "",
        tags: splitTags(row.tags || ""),
        details: row.details || "",
        createdAt: row.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      upsertById(state.transactions, payload);
    });
    return summary;
  }

  function importAccounts(rows) {
    const summary = { createdAccounts: 0, createdCategories: 0, appendedSubcategories: 0 };
    rows.forEach((row) => {
      const payload = {
        id: row.id || uid("acc"),
        name: row.name || "Imported Account",
        type: row.type || "cash",
        currencySymbol: row.currencySymbol || "$",
        openingBalance: Number(row.openingBalance || 0),
        color: row.color || "#19c6a7",
        icon: row.icon || "wallet",
        notes: row.notes || "",
      };
      if (!getAccount(payload.id)) {
        summary.createdAccounts += 1;
      }
      upsertById(state.accounts, payload);
    });
    return summary;
  }

  function importCategories(rows) {
    const summary = { createdAccounts: 0, createdCategories: 0, appendedSubcategories: 0 };
    rows.forEach((row) => {
      const payload = {
        id: row.id || slugify(row.name || "") || uid("cat"),
        name: row.name || "Imported Category",
        type: row.type || "expense",
        icon: row.icon || "cart",
        color: row.color || "#19c6a7",
        subcategories: splitTags(row.subcategories || ""),
        budgetLimit: Number(row.budgetLimit || 0),
        budgetPeriod: row.budgetPeriod || "monthly",
      };
      if (!getCategory(payload.id)) {
        summary.createdCategories += 1;
      }
      upsertById(state.categories, payload);
    });
    return summary;
  }

  function buildImportToast(rowCount, target, summary) {
    const extras = [];
    if (summary?.createdAccounts) {
      extras.push(`${summary.createdAccounts} ${summary.createdAccounts === 1 ? "account" : "accounts"}`);
    }
    if (summary?.createdCategories) {
      extras.push(`${summary.createdCategories} ${summary.createdCategories === 1 ? "category" : "categories"}`);
    }
    if (summary?.appendedSubcategories) {
      extras.push(`${summary.appendedSubcategories} ${summary.appendedSubcategories === 1 ? "subcategory" : "subcategories"}`);
    }
    if (!extras.length) {
      return `Imported ${rowCount} ${target}.`;
    }
    return `Imported ${rowCount} ${target}. Auto-added ${extras.join(", ")}.`;
  }

  function upsertById(collection, payload) {
    const index = collection.findIndex((item) => item.id === payload.id);
    if (index >= 0) {
      collection[index] = { ...collection[index], ...payload };
    } else {
      collection.push(payload);
    }
  }

  function handleParseStatement() {
    const statement = document.getElementById("dictation-input").value.trim();
    if (!statement) {
      showToast("Type or dictate a statement first.");
      return;
    }
    const parserResult = parseStatement(statement);
    openTransactionModal(null, parserResult);
  }

  function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      document.getElementById("listen-button").disabled = true;
      document.getElementById("listen-button").textContent = "Voice Not Supported";
      document.getElementById("dictation-input").placeholder =
        "This browser does not support speech recognition. You can still type statements manually.";
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      document.getElementById("dictation-input").value = transcript.trim();
    };
    recognition.onstart = () => {
      uiState.isListening = true;
      refreshListeningUi();
    };
    recognition.onend = () => {
      uiState.isListening = false;
      refreshListeningUi();
    };
    recognition.onerror = () => {
      uiState.isListening = false;
      refreshListeningUi();
      showToast("Voice dictation ran into a browser permission issue.");
    };
    uiState.recognition = recognition;
    refreshListeningUi();
  }

  function toggleListening() {
    if (!uiState.recognition) {
      return;
    }
    if (uiState.isListening) {
      uiState.recognition.stop();
    } else {
      uiState.recognition.start();
    }
  }

  function refreshListeningUi() {
    document.getElementById("listen-button").textContent = uiState.isListening ? "Stop Listening" : "Start Listening";
    document.getElementById("dictation-status-icon").innerHTML = iconRegistry.microphone;
    document.getElementById("dictation-status-icon").style.background = uiState.isListening
      ? "linear-gradient(135deg, rgba(239,100,97,0.16), rgba(255,184,77,0.16))"
      : "linear-gradient(135deg, rgba(18,200,164,0.16), rgba(0,166,199,0.16))";
    document.getElementById("dictation-status-icon").style.color = uiState.isListening ? "#ef6461" : "#12c8a4";
  }

  function parseStatement(statement) {
    const normalized = statement.toLowerCase();
    const transaction = {
      id: "",
      type: detectTransactionType(normalized),
      amount: extractAmount(normalized),
      date: extractDate(normalized) || todayIso(),
      accountId: "",
      fromAccountId: "",
      toAccountId: "",
      categoryId: "",
      subcategory: "",
      counterparty: extractCounterparty(normalized),
      project: extractProject(normalized),
      tags: extractTags(statement),
      details: statement,
    };

    const accountHints = extractAccounts(normalized);
    if (transaction.type === "transfer") {
      transaction.fromAccountId = accountHints.from || "";
      transaction.toAccountId = accountHints.to || "";
    } else {
      transaction.accountId = accountHints.primary || accountHints.from || accountHints.to || "";
    }

    const category = detectCategory(normalized, transaction.type);
    if (category) {
      transaction.categoryId = category.id;
      transaction.subcategory = detectSubcategory(normalized, category) || "";
    }

    const missing = [];
    if (!transaction.amount) {
      missing.push("amount");
    }
    if (transaction.type === "transfer") {
      if (!transaction.fromAccountId) {
        missing.push("source account");
      }
      if (!transaction.toAccountId) {
        missing.push("destination account");
      }
    } else {
      if (!transaction.accountId) {
        missing.push("account");
      }
      if (!transaction.categoryId && transaction.type !== "income") {
        missing.push("category");
      }
    }

    return { transaction, missing };
  }

  function detectTransactionType(text) {
    if (/(transfer|moved?|sent|shifted)/.test(text)) {
      return "transfer";
    }
    if (/(received|income|earned|salary|sold|bonus|got paid|deposit)/.test(text)) {
      return "income";
    }
    return "expense";
  }

  function extractAmount(text) {
    const match = text.match(/(?:\$|usd\s*)?(\d+(?:\.\d{1,2})?)/);
    return match ? Number(match[1]) : 0;
  }

  function extractDate(text) {
    if (text.includes("today")) {
      return todayIso();
    }
    if (text.includes("yesterday")) {
      return shiftIsoDate(todayIso(), -1);
    }
    if (text.includes("tomorrow")) {
      return shiftIsoDate(todayIso(), 1);
    }
    const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoMatch) {
      return isoMatch[1];
    }
    const usMatch = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    if (usMatch) {
      return normalizeDateInput(usMatch[1]);
    }
    return "";
  }

  function extractCounterparty(text) {
    const expenseMatch = text.match(/\b(?:at|to)\s+([a-z0-9&.' -]+?)(?=\s+(?:from|on|for|category|project|tag|tags)\b|$)/i);
    const incomeMatch = text.match(/\bfrom\s+([a-z0-9&.' -]+?)(?=\s+(?:into|on|project|tag|tags)\b|$)/i);
    const match = incomeMatch || expenseMatch;
    return match ? titleCase(match[1].trim()) : "";
  }

  function extractProject(text) {
    const match = text.match(/\bproject\s+([a-z0-9&.' -]+?)(?=\s+(?:tag|tags|from|to|on|into)\b|$)/i);
    return match ? titleCase(match[1].trim()) : "";
  }

  function extractTags(statement) {
    const explicit = [];
    const lower = statement.toLowerCase();
    const tagPhraseMatch = lower.match(/\btags?\s+([a-z0-9,\s-]+)/);
    if (tagPhraseMatch) {
      explicit.push(...splitTags(tagPhraseMatch[1]));
    }
    const hashTags = statement.match(/#([a-zA-Z0-9_-]+)/g) || [];
    hashTags.forEach((item) => explicit.push(item.replace("#", "").toLowerCase()));
    return [...new Set(explicit)];
  }

  function extractAccounts(text) {
    const loweredAccounts = state.accounts.map((account) => ({
      id: account.id,
      name: account.name.toLowerCase(),
    }));
    const matches = { primary: "", from: "", to: "" };
    loweredAccounts.forEach((account) => {
      if (!matches.primary && text.includes(account.name)) {
        matches.primary = account.id;
      }
      if (!matches.from && new RegExp(`\\b(?:from|via|using)\\s+${escapeRegExp(account.name)}\\b`, "i").test(text)) {
        matches.from = account.id;
      }
      if (!matches.to && new RegExp(`\\b(?:to|into|in)\\s+${escapeRegExp(account.name)}\\b`, "i").test(text)) {
        matches.to = account.id;
      }
    });
    return matches;
  }

  function detectCategory(text, type) {
    if (type === "transfer") {
      return null;
    }
    const exact = state.categories.find((category) => text.includes(category.name.toLowerCase()) && category.type === type);
    if (exact) {
      return exact;
    }
    for (const [categoryId, keywords] of Object.entries(categoryKeywordMap)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        const category = getCategory(categoryId);
        if (category && category.type === type) {
          return category;
        }
      }
    }
    return state.categories.find((category) => category.type === type) || null;
  }

  function detectSubcategory(text, category) {
    return (category.subcategories || []).find((subcategory) => text.includes(subcategory.toLowerCase())) || "";
  }

  function parseCsv(text) {
    const rows = [];
    let current = "";
    let row = [];
    let inQuotes = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(current);
        current = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          index += 1;
        }
        row.push(current);
        if (row.some((cell) => cell !== "")) {
          rows.push(row);
        }
        row = [];
        current = "";
      } else {
        current += char;
      }
    }
    if (current || row.length) {
      row.push(current);
      rows.push(row);
    }
    if (!rows.length) {
      return [];
    }
    const headers = rows[0].map((cell) => cell.trim());
    return rows.slice(1).map((cells) => {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = (cells[index] || "").trim();
      });
      return entry;
    });
  }

  return {
    syncTransactionTypeFields,
    syncCategoryBudgetState,
    openModal,
    closeModal,
    openTransactionModal,
    openAccountModal,
    openCategoryModal,
    handleTransactionSubmit,
    handleAccountSubmit,
    handleCategorySubmit,
    handleImportSubmit,
    handleParseStatement,
    initializeSpeechRecognition,
    toggleListening,
    refreshListeningUi,
  };
}
