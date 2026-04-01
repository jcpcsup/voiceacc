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
    document.getElementById("account-include-in-total-balance").checked = true;
    if (accountId) {
      const account = getAccount(accountId);
      if (!account) {
        return;
      }
      document.getElementById("account-name").value = account.name;
      document.getElementById("account-type").value = account.type;
      document.getElementById("account-currency-symbol").value = account.currencySymbol || "$";
      document.getElementById("account-opening-balance").value = account.openingBalance ?? 0;
      document.getElementById("account-include-in-total-balance").checked = account.includeInTotalBalance !== false;
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
    const existingAccount = getAccount(document.getElementById("account-id").value);
    const payload = {
      id: document.getElementById("account-id").value || uid("acc"),
      name: document.getElementById("account-name").value.trim(),
      sortOrder: existingAccount?.sortOrder ?? state.accounts.length,
      type: document.getElementById("account-type").value,
      currencySymbol: document.getElementById("account-currency-symbol").value.trim() || "$",
      openingBalance: Number(document.getElementById("account-opening-balance").value || 0),
      includeInTotalBalance: document.getElementById("account-include-in-total-balance").checked,
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
      state.accounts[existingIndex] = {
        ...state.accounts[existingIndex],
        ...payload,
      };
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
        sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : state.accounts.length,
        type: row.type || "cash",
        currencySymbol: row.currencySymbol || "$",
        openingBalance: Number(row.openingBalance || 0),
        includeInTotalBalance: String(row.includeInTotalBalance ?? "true").toLowerCase() !== "false",
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
    const tokens = tokenizeStatement(statement);
    const transaction = {
      id: "",
      type: detectTransactionType(normalized),
      amount: extractAmount(statement),
      date: todayIso(),
      accountId: "",
      fromAccountId: "",
      toAccountId: "",
      categoryId: "",
      subcategory: "",
      counterparty: "",
      project: "",
      tags: [],
      details: statement,
    };

    const parsed = parseStatementSegments(tokens, statement, transaction.type);
    transaction.date = parsed.date || todayIso();
    transaction.project = parsed.project || "";
    transaction.tags = parsed.tags || [];

    if (transaction.type === "transfer") {
      transaction.fromAccountId = parsed.fromAccountId || "";
      transaction.toAccountId = parsed.toAccountId || "";
    } else {
      transaction.accountId = parsed.accountId || "";
      transaction.counterparty = parsed.counterparty || "";
      transaction.categoryId = parsed.categoryId || "";
      transaction.subcategory = parsed.subcategory || "";
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
      if (!transaction.categoryId) {
        missing.push("category");
      }
    }

    return { transaction, missing };
  }

  const RESERVED_STATEMENT_MARKERS = new Set(["with", "on", "from", "to", "project", "tag", "tags"]);

  function detectTransactionType(text) {
    if (/\b(?:transfer|moved?|sent|shifted)\b/.test(text)) {
      return "transfer";
    }
    if (/\b(?:received|got|income|earned|salary|sold|bonus|got paid|deposit)\b/.test(text)) {
      return "income";
    }
    if (/\b(?:spent|paid)\b/.test(text)) {
      return "expense";
    }
    return "expense";
  }

  function tokenizeStatement(statement) {
    return String(statement || "")
      .trim()
      .match(/\S+/g)
      ?.map((raw) => ({
        raw,
        normalized: normalizeStatementToken(raw),
      })) || [];
  }

  function normalizeStatementToken(token) {
    return String(token || "")
      .trim()
      .replace(/^[,.;:!?()"“”]+|[,.;:!?()"“”]+$/g, "")
      .toLowerCase();
  }

  function cleanStatementToken(token) {
    return String(token || "")
      .trim()
      .replace(/^[,.;:!?()"“”]+|[,.;:!?()"“”]+$/g, "");
  }

  function normalizeStatementMarker(token) {
    return token === "tag" ? "tags" : token;
  }

  function isSegmentMarker(token) {
    return RESERVED_STATEMENT_MARKERS.has(normalizeStatementMarker(token));
  }

  function matchRelativeDate(tokens, index) {
    if (tokens[index]?.normalized === "day" && tokens[index + 1]?.normalized === "before" && tokens[index + 2]?.normalized === "yesterday") {
      return { value: shiftIsoDate(todayIso(), -2), length: 3 };
    }
    if (tokens[index]?.normalized === "today") {
      return { value: todayIso(), length: 1 };
    }
    if (tokens[index]?.normalized === "yesterday") {
      return { value: shiftIsoDate(todayIso(), -1), length: 1 };
    }
    if (tokens[index]?.normalized === "tomorrow") {
      return { value: shiftIsoDate(todayIso(), 1), length: 1 };
    }
    return null;
  }

  function normalizeExplicitDateToken(token) {
    const cleaned = cleanStatementToken(token);
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned;
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
      return normalizeDateInput(cleaned);
    }
    return "";
  }

  function tokenLooksLikeDate(token) {
    return Boolean(normalizeExplicitDateToken(token));
  }

  function consumeSegment(tokens, startIndex) {
    const words = [];
    let index = startIndex;
    while (index < tokens.length) {
      if (matchRelativeDate(tokens, index) || tokenLooksLikeDate(tokens[index].raw) || isSegmentMarker(tokens[index].normalized)) {
        break;
      }
      words.push(tokens[index]);
      index += 1;
    }
    return {
      words,
      nextIndex: index,
      original: words.map((token) => cleanStatementToken(token.raw)).join(" ").trim(),
      normalized: words.map((token) => token.normalized).join(" ").trim(),
    };
  }

  function resolveAccountSegment(segmentText) {
    const normalized = String(segmentText || "").trim().toLowerCase();
    if (!normalized) {
      return "";
    }
    const accounts = [...state.accounts]
      .map((account) => ({
        id: account.id,
        name: account.name.toLowerCase(),
      }))
      .sort((left, right) => right.name.length - left.name.length);
    const match = accounts.find((account) => new RegExp(`(^|\\b)${escapeRegExp(account.name)}(\\b|$)`, "i").test(normalized));
    return match ? match.id : "";
  }

  function resolveCategoryToken(token, type) {
    if (!token || type === "transfer") {
      return null;
    }
    const normalized = normalizeStatementToken(token);
    const exact = state.categories.find(
      (category) => category.type === type && normalizeStatementToken(category.name) === normalized
    );
    if (exact) {
      return exact;
    }
    const leadingWord = state.categories.find(
      (category) => category.type === type && normalizeStatementToken(category.name).split(" ")[0] === normalized
    );
    if (leadingWord) {
      return leadingWord;
    }
    for (const [categoryId, keywords] of Object.entries(categoryKeywordMap)) {
      if (keywords.some((keyword) => normalizeStatementToken(keyword) === normalized)) {
        const category = getCategory(categoryId);
        if (category && category.type === type) {
          return category;
        }
      }
    }
    return null;
  }

  function resolveSubcategoryText(text, category) {
    const cleaned = String(text || "").trim();
    if (!cleaned) {
      return "";
    }
    const exact = (category?.subcategories || []).find((item) => item.toLowerCase() === cleaned.toLowerCase());
    return exact || titleCase(cleaned);
  }

  function extractAmount(statement) {
    const tokens = String(statement || "").match(/\S+/g) || [];
    for (const token of tokens) {
      const cleaned = String(token || "")
        .trim()
        .replace(/^[^\d]+/, "")
        .replace(/[^\d.,/-]+$/, "");
      if (!cleaned || cleaned.includes("/") || /^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
        continue;
      }
      if (/^\d[\d,]*(?:\.\d{1,2})?$/.test(cleaned)) {
        return Number(cleaned.replace(/,/g, ""));
      }
    }
    return 0;
  }

  function extractHashTags(statement) {
    return [...new Set((statement.match(/#([a-zA-Z0-9_-]+)/g) || []).map((item) => item.replace("#", "").toLowerCase()))];
  }

  function extractSegmentTags(segmentText) {
    return [...new Set(
      String(segmentText || "")
        .split(/[,\s]+/)
        .map((item) => item.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
    )];
  }

  function pickCounterparty(parsed, transactionType) {
    if (transactionType === "income") {
      return parsed.counterpartyFrom || parsed.counterpartyTo || "";
    }
    if (transactionType === "expense") {
      return parsed.counterpartyTo || parsed.counterpartyFrom || "";
    }
    return "";
  }

  function parseStatementSegments(tokens, statement, transactionType) {
    const parsed = {
      date: "",
      accountId: "",
      fromAccountId: "",
      toAccountId: "",
      counterpartyFrom: "",
      counterpartyTo: "",
      categoryId: "",
      subcategory: "",
      project: "",
      tags: [],
    };

    let index = 0;
    while (index < tokens.length) {
      const relativeDate = matchRelativeDate(tokens, index);
      if (relativeDate) {
        parsed.date = relativeDate.value;
        index += relativeDate.length;
        continue;
      }

      const explicitDate = normalizeExplicitDateToken(tokens[index].raw);
      if (explicitDate) {
        parsed.date = explicitDate;
        index += 1;
        continue;
      }

      const token = normalizeStatementMarker(tokens[index].normalized);
      if (token === "with") {
        const segment = consumeSegment(tokens, index + 1);
        parsed.accountId = resolveAccountSegment(segment.normalized) || parsed.accountId;
        index = segment.nextIndex;
        continue;
      }

      if (token === "on") {
        const relativeDateAfterOn = matchRelativeDate(tokens, index + 1);
        if (relativeDateAfterOn) {
          parsed.date = relativeDateAfterOn.value;
          index += 1 + relativeDateAfterOn.length;
          continue;
        }
        const explicitDateAfterOn = tokens[index + 1] ? normalizeExplicitDateToken(tokens[index + 1].raw) : "";
        if (explicitDateAfterOn) {
          parsed.date = explicitDateAfterOn;
          index += 2;
          continue;
        }
        const segment = consumeSegment(tokens, index + 1);
        if (segment.words.length && transactionType !== "transfer") {
          const [categoryToken, ...subcategoryTokens] = segment.words;
          const category = resolveCategoryToken(categoryToken.normalized, transactionType);
          if (category) {
            parsed.categoryId = category.id;
            parsed.subcategory = resolveSubcategoryText(
              subcategoryTokens.map((item) => cleanStatementToken(item.raw)).join(" "),
              category
            );
          }
        }
        index = segment.nextIndex;
        continue;
      }

      if (token === "from" || token === "to") {
        const segment = consumeSegment(tokens, index + 1);
        const segmentText = segment.original;
        if (transactionType === "transfer") {
          const accountId = resolveAccountSegment(segment.normalized);
          if (accountId) {
            if (token === "from") {
              parsed.fromAccountId = accountId;
            } else {
              parsed.toAccountId = accountId;
            }
          }
        } else if (segmentText) {
          if (token === "from") {
            parsed.counterpartyFrom = titleCase(segmentText);
          } else {
            parsed.counterpartyTo = titleCase(segmentText);
          }
        }
        index = segment.nextIndex;
        continue;
      }

      if (token === "project") {
        const segment = consumeSegment(tokens, index + 1);
        parsed.project = titleCase(segment.original);
        index = segment.nextIndex;
        continue;
      }

      if (token === "tags") {
        const segment = consumeSegment(tokens, index + 1);
        parsed.tags = [...new Set([...parsed.tags, ...extractSegmentTags(segment.original)])];
        index = segment.nextIndex;
        continue;
      }

      index += 1;
    }

    parsed.tags = [...new Set([...parsed.tags, ...extractHashTags(statement)])];
    parsed.counterparty = pickCounterparty(parsed, transactionType);
    return parsed;
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
