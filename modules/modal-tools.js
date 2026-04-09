export function createModalTools(api) {
  const {
    state,
    uiState,
    categoryKeywordMap,
    iconRegistry,
    renderSelectOptions,
    renderSubcategoryOptions,
    syncTransactionTemplateUi,
    getTransaction,
    getAccount,
    getCategory,
    findAccountId,
    findCategoryId,
    ensureImportedAccount,
    ensureImportedCategory,
    appendImportedSubcategory,
    normalizeImportTransactionType,
    downloadCsv,
    slugify,
    uid,
    splitTags,
    normalizeDateInput,
    titleCase,
    escapeHtml,
    escapeRegExp,
    calculateTransactionAmountFromDetails,
    todayIso,
    shiftIsoDate,
    showToast,
    uploadTransactionSlip,
    deleteTransactionSlip,
    resolveTransactionSlipPreviewUrl,
    clearTransactionSlipPreviewCache,
    persistAndRefresh,
  } = api;

  const TRANSACTION_IMPORT_SOFT_LIMIT = 1000;
  const TRANSACTION_IMPORT_HARD_LIMIT = 5000;
  const IMPORT_CHUNK_SIZE = 200;
  let importReconciliationState = null;
  let transactionSubmitMode = "save";
  let transactionSlipState = createEmptyTransactionSlipState();

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
    if (id === "transaction-modal") {
      resetTransactionSlipState();
    }
  }

  function setImportProgress(visible, message = "", percent = 0) {
    const progress = document.getElementById("import-progress");
    const text = document.getElementById("import-progress-text");
    const fill = document.getElementById("import-progress-fill");
    if (!progress || !text || !fill) {
      return;
    }
    progress.classList.toggle("hidden", !visible);
    text.textContent = message || "";
    fill.style.width = `${Math.max(0, Math.min(100, percent || 0))}%`;
  }

  function setImportBusy(isBusy) {
    const submitButton = document.getElementById("import-submit-button");
    const targetField = document.getElementById("import-target");
    const fileField = document.getElementById("import-file");
    const templateButton = document.getElementById("download-import-template-button");
    if (submitButton) {
      submitButton.disabled = isBusy;
      submitButton.textContent = isBusy ? "Importing..." : "Import CSV";
    }
    if (targetField) {
      targetField.disabled = isBusy;
    }
    if (fileField) {
      fileField.disabled = isBusy;
    }
    if (templateButton) {
      templateButton.disabled = isBusy;
    }
  }

  function yieldToUi() {
    return new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  function createEmptyTransactionSlipState() {
    return {
      file: null,
      localPreviewUrl: "",
      existingPath: "",
      existingResolution: "720",
      existingMimeType: "",
      removeExisting: false,
    };
  }

  function revokeTransactionSlipPreviewUrl() {
    if (transactionSlipState.localPreviewUrl) {
      URL.revokeObjectURL(transactionSlipState.localPreviewUrl);
    }
  }

  function resetTransactionSlipState() {
    revokeTransactionSlipPreviewUrl();
    transactionSlipState = createEmptyTransactionSlipState();
    const fileField = document.getElementById("transaction-slip-file");
    const resolutionField = document.getElementById("transaction-slip-resolution");
    if (fileField) {
      fileField.value = "";
    }
    if (resolutionField) {
      resolutionField.value = "720";
    }
    updateTransactionSlipMeta("Choose a slip image to store with this transaction.");
    renderTransactionSlipPreview();
  }

  function getSlipResolutionLabel(value) {
    const numeric = String(value || "720").trim() || "720";
    return `${numeric}p`;
  }

  function updateTransactionSlipMeta(message) {
    const meta = document.getElementById("transaction-slip-meta");
    if (meta) {
      meta.textContent = message;
    }
  }

  function renderTransactionSlipPreview(previewUrl = "") {
    const empty = document.getElementById("transaction-slip-preview-empty");
    const image = document.getElementById("transaction-slip-preview-image");
    const removeButton = document.getElementById("transaction-slip-remove-button");
    if (!empty || !image || !removeButton) {
      return;
    }
    const hasPreview = Boolean(previewUrl);
    image.classList.toggle("hidden", !hasPreview);
    empty.classList.toggle("hidden", hasPreview);
    removeButton.classList.toggle(
      "hidden",
      !hasPreview && !transactionSlipState.file && !transactionSlipState.existingPath
    );
    if (hasPreview) {
      image.src = previewUrl;
    } else {
      image.removeAttribute("src");
    }
  }

  async function loadTransactionSlipPreview(path) {
    if (!path || transactionSlipState.removeExisting) {
      renderTransactionSlipPreview("");
      updateTransactionSlipMeta("Choose a slip image to store with this transaction.");
      return;
    }
    updateTransactionSlipMeta(`Attached slip | ${getSlipResolutionLabel(transactionSlipState.existingResolution)}`);
    try {
      const signedUrl = await resolveTransactionSlipPreviewUrl(path);
      if (transactionSlipState.existingPath === path && !transactionSlipState.file && !transactionSlipState.removeExisting) {
        renderTransactionSlipPreview(signedUrl);
      }
    } catch (error) {
      console.error(error);
      renderTransactionSlipPreview("");
      updateTransactionSlipMeta("Attached slip could not be previewed right now.");
    }
  }

  function applyTransactionSlipStateFromTransaction(transaction) {
    revokeTransactionSlipPreviewUrl();
    transactionSlipState = {
      file: null,
      localPreviewUrl: "",
      existingPath: String(transaction?.slipPath || "").trim(),
      existingResolution: String(transaction?.slipResolution || "720"),
      existingMimeType: String(transaction?.slipMimeType || "").trim(),
      removeExisting: false,
    };
    const resolutionField = document.getElementById("transaction-slip-resolution");
    const fileField = document.getElementById("transaction-slip-file");
    if (resolutionField) {
      resolutionField.value = transactionSlipState.existingResolution || "720";
    }
    if (fileField) {
      fileField.value = "";
    }
    if (transactionSlipState.existingPath) {
      renderTransactionSlipPreview("");
      void loadTransactionSlipPreview(transactionSlipState.existingPath);
      return;
    }
    renderTransactionSlipPreview("");
    updateTransactionSlipMeta("Choose a slip image to store with this transaction.");
  }

  function handleTransactionSlipFileChange(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    revokeTransactionSlipPreviewUrl();
    transactionSlipState.file = file || null;
    transactionSlipState.localPreviewUrl = file ? URL.createObjectURL(file) : "";
    transactionSlipState.removeExisting = false;
    if (file) {
      renderTransactionSlipPreview(transactionSlipState.localPreviewUrl);
      updateTransactionSlipMeta(`Ready to compress and upload | ${getSlipResolutionLabel(document.getElementById("transaction-slip-resolution")?.value || "720")}`);
    } else if (transactionSlipState.existingPath) {
      renderTransactionSlipPreview("");
      void loadTransactionSlipPreview(transactionSlipState.existingPath);
    } else {
      renderTransactionSlipPreview("");
      updateTransactionSlipMeta("Choose a slip image to store with this transaction.");
    }
  }

  function handleTransactionSlipRemove() {
    const fileField = document.getElementById("transaction-slip-file");
    const hadExistingPath = Boolean(transactionSlipState.existingPath);
    if (fileField) {
      fileField.value = "";
    }
    revokeTransactionSlipPreviewUrl();
    transactionSlipState.file = null;
    transactionSlipState.localPreviewUrl = "";
    transactionSlipState.removeExisting = hadExistingPath;
    renderTransactionSlipPreview("");
    updateTransactionSlipMeta(hadExistingPath ? "Slip image will be removed when you save." : "Slip image cleared.");
  }

  function getTargetSlipDimension(resolutionValue) {
    const parsed = Number(resolutionValue || 720);
    if ([360, 480, 720, 1080].includes(parsed)) {
      return parsed;
    }
    return 720;
  }

  async function compressTransactionSlipFile(file, resolutionValue) {
    const targetMaxEdge = getTargetSlipDimension(resolutionValue);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Unable to read the selected image."));
        img.src = objectUrl;
      });
      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      if (!width || !height) {
        throw new Error("Selected image has invalid dimensions.");
      }
      const scale = Math.min(1, targetMaxEdge / Math.max(width, height));
      const outputWidth = Math.max(1, Math.round(width * scale));
      const outputHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Image compression is not available in this browser.");
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.drawImage(image, 0, 0, outputWidth, outputHeight);
      const preferredType = typeof canvas.toDataURL === "function" && canvas.toDataURL("image/webp").startsWith("data:image/webp")
        ? "image/webp"
        : "image/jpeg";
      const quality = targetMaxEdge >= 1080 ? 0.8 : targetMaxEdge >= 720 ? 0.76 : 0.72;
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) {
              resolve(result);
              return;
            }
            reject(new Error("Unable to compress the selected image."));
          },
          preferredType,
          quality
        );
      });
      return {
        blob,
        mimeType: preferredType,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function openTransactionModal(transactionId, parserResult) {
    const form = document.getElementById("transaction-form");
    form.reset();
    document.getElementById("transaction-date").value = todayIso();
    document.getElementById("transaction-id").value = transactionId || "";
    document.getElementById("transaction-modal-title").textContent = transactionId ? "Edit Transaction" : "Add Transaction";
    document.getElementById("transaction-delete-button").classList.toggle("hidden", !transactionId);
    document.getElementById("transaction-duplicate-button").classList.remove("hidden");
    document.getElementById("transaction-duplicate-button").textContent = "Save and New";
    transactionSubmitMode = "save";
    document.getElementById("transaction-parser-notice").classList.add("hidden");
    resetTransactionSlipState();
    renderSelectOptions();
    if (!transactionId && !parserResult) {
      document.getElementById("transaction-type").value = "expense";
      document.getElementById("transaction-amount").value = "";
      document.getElementById("transaction-account").value = "";
      document.getElementById("transaction-from-account").value = "";
      document.getElementById("transaction-to-account").value = "";
      document.getElementById("transaction-category").value = "";
      renderSubcategoryOptions();
      document.getElementById("transaction-subcategory").value = "";
      document.getElementById("transaction-counterparty").value = "";
      document.getElementById("transaction-project").value = "";
      document.getElementById("transaction-tags").value = "";
      document.getElementById("transaction-details").value = "";
      document.getElementById("transaction-template-select").value = "";
    }
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
    syncTransactionTemplateUi();
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
    applyTransactionSlipStateFromTransaction(transaction);
  }

  function setTransactionSubmitMode(mode = "save") {
    transactionSubmitMode = mode === "save-new" ? "save-new" : "save";
  }

  function prepareNewTransactionFromSavedPayload(transaction) {
    applyTransactionToForm(transaction);
    document.getElementById("transaction-id").value = "";
    document.getElementById("transaction-modal-title").textContent = "Add Transaction";
    document.getElementById("transaction-delete-button").classList.add("hidden");
    document.getElementById("transaction-duplicate-button").classList.remove("hidden");
    document.getElementById("transaction-duplicate-button").textContent = "Save and New";
    document.getElementById("transaction-parser-notice").classList.add("hidden");
    document.getElementById("transaction-template-select").value = "";
    syncTransactionTemplateUi();
    document.getElementById("transaction-amount").value = "";
    window.setTimeout(() => {
      const amountField = document.getElementById("transaction-amount");
      amountField?.focus();
      amountField?.select();
    }, 20);
  }

  async function handleTransactionSubmit(event) {
    event.preventDefault();
    const saveAndNew = transactionSubmitMode === "save-new";
    transactionSubmitMode = "save";
    const type = document.getElementById("transaction-type").value;
    const details = document.getElementById("transaction-details").value.trim();
    const derivedAmount = Number(calculateTransactionAmountFromDetails ? calculateTransactionAmountFromDetails(details) : 0);
    const amount = derivedAmount > 0 ? derivedAmount : Number(document.getElementById("transaction-amount").value);
    const rawSubcategory = document.getElementById("transaction-subcategory").value.trim();
    const transactionId = document.getElementById("transaction-id").value || uid("tx");
    const payload = {
      id: transactionId,
      type,
      amount,
      date: document.getElementById("transaction-date").value,
      accountId: type === "transfer" ? "" : document.getElementById("transaction-account").value,
      fromAccountId: type === "transfer" ? document.getElementById("transaction-from-account").value : "",
      toAccountId: type === "transfer" ? document.getElementById("transaction-to-account").value : "",
      categoryId: type === "transfer" ? "" : document.getElementById("transaction-category").value,
      subcategory: type === "transfer" ? "" : rawSubcategory,
      counterparty: document.getElementById("transaction-counterparty").value.trim(),
      project: document.getElementById("transaction-project").value.trim(),
      tags: splitTags(document.getElementById("transaction-tags").value),
      details,
      slipPath: transactionSlipState.removeExisting ? "" : transactionSlipState.existingPath || "",
      slipResolution: String(document.getElementById("transaction-slip-resolution").value || transactionSlipState.existingResolution || "720"),
      slipMimeType: transactionSlipState.removeExisting ? "" : transactionSlipState.existingMimeType || "",
      slipUpdatedAt: transactionSlipState.removeExisting ? "" : "",
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

    if (payload.categoryId && payload.subcategory) {
      ensureTransactionSubcategory(payload.categoryId, payload.subcategory);
    }

    const existingIndex = state.transactions.findIndex((tx) => tx.id === payload.id);
    const previousTransaction = existingIndex >= 0 ? state.transactions[existingIndex] : null;
    const previousSlipPath = String(previousTransaction?.slipPath || "").trim();
    if (!transactionSlipState.file && !transactionSlipState.removeExisting && previousTransaction) {
      payload.slipPath = previousTransaction.slipPath || "";
      payload.slipResolution = String(previousTransaction.slipResolution || payload.slipResolution || "720");
      payload.slipMimeType = previousTransaction.slipMimeType || "";
      payload.slipUpdatedAt = previousTransaction.slipUpdatedAt || "";
    }
    const hasNewSlipFile = Boolean(transactionSlipState.file);
    let nextSlipPath = payload.slipPath;
    let replacedOldSlip = false;
    if (hasNewSlipFile) {
      try {
        const compressed = await compressTransactionSlipFile(transactionSlipState.file, payload.slipResolution);
        const uploadResult = await uploadTransactionSlip(compressed.blob, {
          transactionId: payload.id,
          resolution: payload.slipResolution,
          contentType: compressed.mimeType,
        });
        payload.slipPath = uploadResult.path;
        payload.slipResolution = String(uploadResult.resolution || payload.slipResolution || "720");
        payload.slipMimeType = uploadResult.contentType || compressed.mimeType || "";
        payload.slipUpdatedAt = new Date().toISOString();
        nextSlipPath = payload.slipPath;
        replacedOldSlip = Boolean(previousSlipPath && previousSlipPath !== nextSlipPath);
      } catch (error) {
        console.error(error);
        showToast(error.message || "Slip image upload failed.");
        return;
      }
    } else if (transactionSlipState.removeExisting) {
      nextSlipPath = "";
      payload.slipPath = "";
      payload.slipMimeType = "";
      payload.slipUpdatedAt = "";
      replacedOldSlip = Boolean(previousSlipPath);
    }

    let savedTransaction = null;
    if (existingIndex >= 0) {
      savedTransaction = {
        ...state.transactions[existingIndex],
        ...payload,
      };
      state.transactions[existingIndex] = savedTransaction;
      showToast(saveAndNew ? "Transaction updated. Ready for a new one." : "Transaction updated.");
    } else {
      savedTransaction = {
        ...payload,
        createdAt: new Date().toISOString(),
      };
      state.transactions.push(savedTransaction);
      showToast(saveAndNew ? "Transaction saved. Ready for a new one." : "Transaction saved.");
    }
    if (replacedOldSlip && previousSlipPath && previousSlipPath !== nextSlipPath) {
      clearTransactionSlipPreviewCache(previousSlipPath);
      try {
        await deleteTransactionSlip(previousSlipPath);
      } catch (error) {
        console.error(error);
      }
    }
    if (nextSlipPath) {
      clearTransactionSlipPreviewCache(nextSlipPath);
    }
    persistAndRefresh();
    if (saveAndNew && savedTransaction) {
      prepareNewTransactionFromSavedPayload(savedTransaction);
      return;
    }
    closeModal("transaction-modal");
  }

  function ensureTransactionSubcategory(categoryId, subcategory) {
    const category = getCategory(categoryId);
    const trimmed = String(subcategory || "").trim();
    if (!category || !trimmed) {
      return;
    }
    const existing = (category.subcategories || []).find((item) => item.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      return;
    }
    category.subcategories = [...(category.subcategories || []), titleCase(trimmed)];
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
    setImportBusy(true);
    setImportProgress(true, "Reading CSV file...", 4);
    try {
      const text = await file.text();
      setImportProgress(true, "Parsing CSV rows...", 10);
      const rows = parseCsv(text);
      if (!rows.length) {
        showToast("The CSV file appears to be empty.");
        return;
      }
      if (target === "transactions" && rows.length > TRANSACTION_IMPORT_HARD_LIMIT) {
        showToast(`Please split large transaction imports into files of ${TRANSACTION_IMPORT_HARD_LIMIT} rows or fewer.`);
        return;
      }
      if (target === "transactions") {
        const reconciliation = buildTransactionReconciliation(rows);
        if (reconciliation.exactDuplicates.length || reconciliation.probableDuplicates.length) {
          importReconciliationState = reconciliation;
          renderImportReconciliationModal();
          closeModal("import-modal");
          openModal("import-reconciliation-modal");
          return;
        }
      }
      let importSummary = null;
      if (target === "transactions") {
        importSummary = await importTransactionsInChunks(rows);
      }
      if (target === "accounts") {
        importSummary = await importAccountsInChunks(rows);
      }
      if (target === "categories") {
        importSummary = await importCategoriesInChunks(rows);
      }
      setImportProgress(true, "Saving imported data and starting sync...", 100);
      persistAndRefresh();
      closeModal("import-modal");
      showToast(buildImportToast(rows.length, target, importSummary));
    } finally {
      setImportBusy(false);
      setImportProgress(false, "", 0);
    }
  }

  function normalizeTransactionReconciliationCandidate(row, index) {
    const type = normalizeImportTransactionType(row.type);
    const amount = Number(row.amount || 0);
    const date = normalizeDateInput(row.date) || todayIso();
    const accountId = type === "transfer" ? "" : findAccountId(row.accountId, row.accountName);
    const fromAccountId = type === "transfer" ? findAccountId(row.fromAccountId, row.fromAccountName) : "";
    const toAccountId = type === "transfer" ? findAccountId(row.toAccountId, row.toAccountName) : "";
    const categoryId = type === "transfer" ? "" : findCategoryId(row.categoryId, row.categoryName);
    const accountLabel =
      type === "transfer"
        ? [row.fromAccountName || getAccount(fromAccountId)?.name || "", row.toAccountName || getAccount(toAccountId)?.name || ""]
            .filter(Boolean)
            .join(" -> ")
        : row.accountName || getAccount(accountId)?.name || "";
    const categoryLabel = row.categoryName || getCategory(categoryId)?.name || "";
    const subcategory = String(row.subcategory || "").trim();
    const counterparty = String(row.payeeOrPayer || row.counterparty || "").trim();
    const project = String(row.project || "").trim();
    const accountKey =
      type === "transfer"
        ? `${fromAccountId || String(row.fromAccountName || "").trim().toLowerCase()}|${toAccountId || String(row.toAccountName || "").trim().toLowerCase()}`
        : accountId || String(accountLabel || "").trim().toLowerCase();
    const categoryKey = categoryId || String(categoryLabel || "").trim().toLowerCase();
    const fingerprintParts =
      type === "transfer"
        ? [type, amount, date, fromAccountId || String(row.fromAccountName || "").trim().toLowerCase(), toAccountId || String(row.toAccountName || "").trim().toLowerCase()]
        : [
            type,
            amount,
            date,
            accountKey,
            categoryKey,
            subcategory.toLowerCase(),
            counterparty.toLowerCase(),
            project.toLowerCase(),
          ];
    return {
      row,
      index,
      id: String(row.id || "").trim(),
      type,
      amount,
      date,
      accountKey,
      categoryKey,
      subcategory: subcategory.toLowerCase(),
      counterparty: counterparty.toLowerCase(),
      project: project.toLowerCase(),
      fingerprint: fingerprintParts.join("|"),
      preview: [date, accountLabel, categoryLabel, subcategory, counterparty, project, amount ? String(amount) : ""].filter(Boolean).join(" | "),
    };
  }

  function normalizeExistingTransactionProfile(transaction) {
    const account = getAccount(transaction.accountId);
    const fromAccount = getAccount(transaction.fromAccountId);
    const toAccount = getAccount(transaction.toAccountId);
    const category = getCategory(transaction.categoryId);
    const type = transaction.type || "expense";
    const amount = Number(transaction.amount || 0);
    const date = normalizeDateInput(transaction.date) || todayIso();
    const accountKey =
      type === "transfer"
        ? `${transaction.fromAccountId || String(fromAccount?.name || "").trim().toLowerCase()}|${
            transaction.toAccountId || String(toAccount?.name || "").trim().toLowerCase()
          }`
        : transaction.accountId || String(account?.name || account?.id || account?.title || account?.label || account?.accountName || "").trim().toLowerCase() ||
          String(account?.name || "").trim().toLowerCase();
    const categoryKey = transaction.categoryId || String(category?.name || "").trim().toLowerCase();
    const counterparty = String(transaction.counterparty || "").trim().toLowerCase();
    const project = String(transaction.project || "").trim().toLowerCase();
    const subcategory = String(transaction.subcategory || "").trim().toLowerCase();
    const fingerprintParts =
      type === "transfer"
        ? [type, amount, date, transaction.fromAccountId || String(fromAccount?.name || "").trim().toLowerCase(), transaction.toAccountId || String(toAccount?.name || "").trim().toLowerCase()]
        : [type, amount, date, accountKey, categoryKey, subcategory, counterparty, project];
    return {
      id: String(transaction.id || "").trim(),
      type,
      amount,
      date,
      accountKey,
      categoryKey,
      subcategory,
      counterparty,
      project,
      fingerprint: fingerprintParts.join("|"),
    };
  }

  function diffDays(leftDate, rightDate) {
    const left = new Date(`${leftDate}T12:00:00`);
    const right = new Date(`${rightDate}T12:00:00`);
    return Math.round((left.getTime() - right.getTime()) / 86400000);
  }

  function isProbableDuplicate(candidate, reference) {
    if (!reference || candidate.type !== reference.type || candidate.amount !== reference.amount) {
      return false;
    }
    if (Math.abs(diffDays(candidate.date, reference.date)) > 3) {
      return false;
    }
    if (candidate.type === "transfer") {
      return candidate.accountKey && candidate.accountKey === reference.accountKey;
    }
    if (!candidate.accountKey || candidate.accountKey !== reference.accountKey) {
      return false;
    }
    if (candidate.categoryKey && reference.categoryKey && candidate.categoryKey === reference.categoryKey) {
      return true;
    }
    if (candidate.counterparty && reference.counterparty && candidate.counterparty === reference.counterparty) {
      return true;
    }
    if (candidate.project && reference.project && candidate.project === reference.project) {
      return true;
    }
    return false;
  }

  function buildDuplicateExportRow(item, kind) {
    const row = item.row || {};
    return {
      duplicateType: kind,
      reason: item.reason || "",
      matchTransactionId: item.matchId || "",
      id: row.id || "",
      type: row.type || "",
      amount: row.amount || "",
      date: row.date || "",
      accountName: row.accountName || "",
      fromAccountName: row.fromAccountName || "",
      toAccountName: row.toAccountName || "",
      categoryName: row.categoryName || "",
      subcategory: row.subcategory || "",
      payeeOrPayer: row.payeeOrPayer || row.counterparty || "",
      project: row.project || "",
      tags: row.tags || "",
      details: row.details || "",
    };
  }

  function buildTransactionReconciliation(rows) {
    const existingProfiles = state.transactions.map(normalizeExistingTransactionProfile);
    const seenIds = new Map(existingProfiles.filter((item) => item.id).map((item) => [item.id, item]));
    const seenFingerprints = new Map(existingProfiles.map((item) => [item.fingerprint, item]));
    const referenceProfiles = [...existingProfiles];
    const safeRows = [];
    const exactDuplicates = [];
    const probableDuplicates = [];

    rows.forEach((row, index) => {
      const candidate = normalizeTransactionReconciliationCandidate(row, index);
      let exactMatch = null;
      if (candidate.id && seenIds.has(candidate.id)) {
        exactMatch = seenIds.get(candidate.id);
      }
      if (!exactMatch && seenFingerprints.has(candidate.fingerprint)) {
        exactMatch = seenFingerprints.get(candidate.fingerprint);
      }
      if (exactMatch) {
        exactDuplicates.push({
          ...candidate,
          matchId: exactMatch.id || "",
          reason: candidate.id && candidate.id === exactMatch.id ? "Matching transaction ID already exists." : "Matching transaction fingerprint already exists.",
        });
      } else {
        const probableMatch = referenceProfiles.find((reference) => isProbableDuplicate(candidate, reference));
        if (probableMatch) {
          probableDuplicates.push({
            ...candidate,
            matchId: probableMatch.id || "",
            reason: "Same type, amount, and ledger context found within a +/-3 day window.",
          });
        } else {
          safeRows.push(row);
        }
      }
      if (candidate.id) {
        seenIds.set(candidate.id, candidate);
      }
      seenFingerprints.set(candidate.fingerprint, candidate);
      referenceProfiles.push(candidate);
    });

    return {
      rows,
      safeRows,
      exactDuplicates,
      probableDuplicates,
      duplicateCsvRows: [
        ...exactDuplicates.map((item) => buildDuplicateExportRow(item, "exact")),
        ...probableDuplicates.map((item) => buildDuplicateExportRow(item, "probable")),
      ],
    };
  }

  function renderImportReconciliationModal() {
    const stateSnapshot = importReconciliationState;
    if (!stateSnapshot) {
      return;
    }
    document.getElementById("import-reconciliation-message").textContent =
      `${stateSnapshot.safeRows.length} safe transaction rows are ready. ${stateSnapshot.exactDuplicates.length} exact and ${stateSnapshot.probableDuplicates.length} probable duplicates need a decision before import.`;
    document.getElementById("import-reconciliation-summary").innerHTML = [
      renderReconciliationSummaryCard("CSV Rows", stateSnapshot.rows.length, "Rows parsed from the selected file"),
      renderReconciliationSummaryCard("Safe New", stateSnapshot.safeRows.length, "Rows ready to import immediately"),
      renderReconciliationSummaryCard(
        "Flagged",
        stateSnapshot.exactDuplicates.length + stateSnapshot.probableDuplicates.length,
        "Potential duplicates requiring review"
      ),
    ].join("");
    document.getElementById("import-reconciliation-exact-title").textContent = `${stateSnapshot.exactDuplicates.length} exact match${
      stateSnapshot.exactDuplicates.length === 1 ? "" : "es"
    }`;
    document.getElementById("import-reconciliation-probable-title").textContent = `${stateSnapshot.probableDuplicates.length} probable match${
      stateSnapshot.probableDuplicates.length === 1 ? "" : "es"
    }`;
    document.getElementById("import-reconciliation-exact-list").innerHTML = renderReconciliationList(
      stateSnapshot.exactDuplicates,
      "No exact duplicates were found."
    );
    document.getElementById("import-reconciliation-probable-list").innerHTML = renderReconciliationList(
      stateSnapshot.probableDuplicates,
      "No probable duplicates were found."
    );
  }

  function renderReconciliationSummaryCard(label, value, note) {
    return `
      <div class="reconciliation-summary-card">
        <p class="eyebrow">${label}</p>
        <strong>${value}</strong>
        <span class="supporting-text">${note}</span>
      </div>
    `;
  }

  function renderReconciliationList(items, emptyMessage) {
    if (!items.length) {
      return `<div class="empty-state compact-empty">${emptyMessage}</div>`;
    }
    return items
      .slice(0, 18)
      .map(
        (item) => `
          <article class="reconciliation-item">
            <div class="reconciliation-item-head">
              <strong>${escapeHtml(item.preview || "Imported row")}</strong>
              <span class="meta-pill neutral">${escapeHtml(item.matchId ? `Match: ${item.matchId}` : "Review")}</span>
            </div>
            <p class="reconciliation-reason">${escapeHtml(item.reason || "")}</p>
          </article>
        `
      )
      .join("");
  }

  async function commitReconciledTransactionImport(rows, toastMessage, downloadDuplicates = false) {
    if (!importReconciliationState) {
      return;
    }
    const rowsToImport = Array.isArray(rows) ? rows : [];
    setImportBusy(true);
    setImportProgress(true, "Saving reconciled transactions...", 12);
    try {
      const importSummary = await importTransactionsInChunks(rowsToImport);
      if (downloadDuplicates && importReconciliationState.duplicateCsvRows.length) {
        downloadCsv("duplicate-transactions-found.csv", importReconciliationState.duplicateCsvRows, false);
      }
      persistAndRefresh();
      closeModal("import-reconciliation-modal");
      showToast(
        `${toastMessage} ${buildImportToast(rowsToImport.length, "transactions", importSummary)}${
          downloadDuplicates && importReconciliationState.duplicateCsvRows.length ? " Duplicate rows CSV downloaded." : ""
        }`
      );
      importReconciliationState = null;
    } finally {
      setImportBusy(false);
      setImportProgress(false, "", 0);
    }
  }

  async function handleImportReconciliationImportAll() {
    if (!importReconciliationState) {
      return;
    }
    await commitReconciledTransactionImport(importReconciliationState.rows, "Imported all CSV rows after reconciliation.");
  }

  async function handleImportReconciliationImportSafeOnly() {
    if (!importReconciliationState) {
      return;
    }
    await commitReconciledTransactionImport(importReconciliationState.safeRows, "Imported only safe new rows.");
  }

  async function handleImportReconciliationSkipDuplicates() {
    if (!importReconciliationState) {
      return;
    }
    await commitReconciledTransactionImport(
      importReconciliationState.safeRows,
      "Skipped flagged duplicate rows.",
      true
    );
  }

  async function importTransactionsInChunks(rows) {
    const summary = {
      createdAccounts: 0,
      createdCategories: 0,
      appendedSubcategories: 0,
    };
    if (rows.length > TRANSACTION_IMPORT_SOFT_LIMIT) {
      setImportProgress(true, `Large file detected. Processing ${rows.length} transactions in batches...`, 12);
      await yieldToUi();
    }
    for (let index = 0; index < rows.length; index += IMPORT_CHUNK_SIZE) {
      const chunk = rows.slice(index, index + IMPORT_CHUNK_SIZE);
      chunk.forEach((row) => {
        importTransactionRow(row, summary);
      });
      const processed = Math.min(index + chunk.length, rows.length);
      const percent = 12 + (processed / Math.max(rows.length, 1)) * 78;
      setImportProgress(true, `Imported ${processed} of ${rows.length} transactions...`, percent);
      await yieldToUi();
    }
    return summary;
  }

  function importTransactionRow(row, summary) {
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
  }

  async function importAccountsInChunks(rows) {
    const summary = { createdAccounts: 0, createdCategories: 0, appendedSubcategories: 0 };
    for (let index = 0; index < rows.length; index += IMPORT_CHUNK_SIZE) {
      const chunk = rows.slice(index, index + IMPORT_CHUNK_SIZE);
      chunk.forEach((row) => {
        importAccountRow(row, summary);
      });
      const processed = Math.min(index + chunk.length, rows.length);
      const percent = 12 + (processed / Math.max(rows.length, 1)) * 78;
      setImportProgress(true, `Imported ${processed} of ${rows.length} accounts...`, percent);
      await yieldToUi();
    }
    return summary;
  }

  function importAccountRow(row, summary) {
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
  }

  async function importCategoriesInChunks(rows) {
    const summary = { createdAccounts: 0, createdCategories: 0, appendedSubcategories: 0 };
    for (let index = 0; index < rows.length; index += IMPORT_CHUNK_SIZE) {
      const chunk = rows.slice(index, index + IMPORT_CHUNK_SIZE);
      chunk.forEach((row) => {
        importCategoryRow(row, summary);
      });
      const processed = Math.min(index + chunk.length, rows.length);
      const percent = 12 + (processed / Math.max(rows.length, 1)) * 78;
      setImportProgress(true, `Imported ${processed} of ${rows.length} categories...`, percent);
      await yieldToUi();
    }
    return summary;
  }

  function importCategoryRow(row, summary) {
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
    setTransactionSubmitMode,
    handleAccountSubmit,
    handleCategorySubmit,
    handleImportSubmit,
    handleImportReconciliationImportAll,
    handleImportReconciliationImportSafeOnly,
    handleImportReconciliationSkipDuplicates,
    handleParseStatement,
    handleTransactionSlipFileChange,
    handleTransactionSlipRemove,
    resetTransactionSlipState,
    initializeSpeechRecognition,
    toggleListening,
    refreshListeningUi,
  };
}
