export function createSearchTools(api) {
  const {
    state,
    uiState,
    iconRegistry,
    getAccount,
    getCategory,
    getAccountBalance,
    titleCase,
    formatMoney,
    formatCurrency,
    formatTransactionAmount,
    escapeHtml,
    switchScreen,
    openTransactionModal,
    openAccountModal,
    openCategoryModal,
    renderTransactions,
    renderEmpty,
  } = api;

  function getFilteredTransactions() {
    return [...state.transactions]
      .filter(matchesTransactionFilters)
      .sort(compareTransactionsBySelectedSort);
  }

  function compareTextDate(left, right, ascending = true) {
    return ascending ? left.localeCompare(right) : right.localeCompare(left);
  }

  function compareTransactionsBySelectedSort(a, b) {
    const sortOrder = uiState.filters.sort || "dateDesc";
    const createdA = String(a.createdAt || a.date || "");
    const createdB = String(b.createdAt || b.date || "");
    const updatedA = String(a.updatedAt || a.createdAt || a.date || "");
    const updatedB = String(b.updatedAt || b.createdAt || b.date || "");
    const dateA = String(a.date || "");
    const dateB = String(b.date || "");

    if (sortOrder === "dateAsc") {
      return compareTextDate(dateA, dateB, true) || compareTextDate(createdA, createdB, true);
    }
    if (sortOrder === "addedAsc") {
      return compareTextDate(createdA, createdB, true) || compareTextDate(dateA, dateB, true);
    }
    if (sortOrder === "addedDesc") {
      return compareTextDate(createdA, createdB, false) || compareTextDate(dateA, dateB, false);
    }
    if (sortOrder === "editedAsc") {
      return compareTextDate(updatedA, updatedB, true) || compareTextDate(dateA, dateB, true);
    }
    if (sortOrder === "editedDesc") {
      return compareTextDate(updatedA, updatedB, false) || compareTextDate(dateA, dateB, false);
    }
    return compareTextDate(dateA, dateB, false) || compareTextDate(createdA, createdB, false);
  }

  function matchesTransactionFilters(transaction) {
    const accountNames = [getAccount(transaction.accountId)?.name, getAccount(transaction.fromAccountId)?.name, getAccount(transaction.toAccountId)?.name]
      .filter(Boolean)
      .join(" ");
    const categoryName = getCategory(transaction.categoryId)?.name || "";
    const haystack = [
      transaction.details,
      transaction.counterparty,
      transaction.project,
      transaction.subcategory,
      accountNames,
      categoryName,
      ...(transaction.tags || []),
      transaction.type,
      transaction.date,
    ]
      .join(" ")
      .toLowerCase();

    if (uiState.filters.search && !haystack.includes(uiState.filters.search.toLowerCase())) {
      return false;
    }
    if (uiState.filters.type !== "all" && transaction.type !== uiState.filters.type) {
      return false;
    }
    if (
      uiState.filters.account !== "all" &&
      ![transaction.accountId, transaction.fromAccountId, transaction.toAccountId].includes(uiState.filters.account)
    ) {
      return false;
    }
    if (uiState.filters.category !== "all" && transaction.categoryId !== uiState.filters.category) {
      return false;
    }
    if (
      uiState.filters.tag &&
      !(transaction.tags || []).some((tag) => tag.toLowerCase().includes(uiState.filters.tag.toLowerCase()))
    ) {
      return false;
    }
    if (uiState.filters.startDate && transaction.date < uiState.filters.startDate) {
      return false;
    }
    if (uiState.filters.endDate && transaction.date > uiState.filters.endDate) {
      return false;
    }
    return true;
  }

  function clearFilters() {
    uiState.filters = {
      search: "",
      type: "all",
      account: "all",
      category: "all",
      tag: "",
      startDate: "",
      endDate: "",
      sort: "dateDesc",
    };
    uiState.transactionPage = 1;
    document.getElementById("search-input").value = "";
    document.getElementById("filter-type").value = "all";
    document.getElementById("filter-account").value = "all";
    document.getElementById("filter-category").value = "all";
    document.getElementById("filter-tag").value = "";
    document.getElementById("filter-start-date").value = "";
    document.getElementById("filter-end-date").value = "";
    document.getElementById("filter-sort").value = "dateDesc";
    renderTransactions();
  }

  function renderGlobalSearchResults() {
    const panel = document.getElementById("global-search-results");
    const query = uiState.globalSearch.trim().toLowerCase();
    if (!query) {
      hideGlobalSearchResults();
      return;
    }

    const results = getGlobalSearchResults(query);
    panel.innerHTML = results.length
      ? results
          .map(
            (result) => `
              <button class="global-search-item" type="button" data-action="open-search-result" data-kind="${escapeHtml(
                result.kind
              )}" data-id="${escapeHtml(result.id || "")}" data-query="${escapeHtml(result.query || "")}">
                <span class="global-search-item-icon">${result.icon}</span>
                <span class="global-search-item-copy">
                  <strong>${escapeHtml(result.label)}</strong>
                  <span>${escapeHtml(result.meta)}</span>
                </span>
              </button>
            `
          )
          .join("")
      : `<div class="empty-state compact-empty">No matches for "${escapeHtml(uiState.globalSearch.trim())}".</div>`;
    panel.classList.remove("hidden");
  }

  function hideGlobalSearchResults() {
    document.getElementById("global-search-results").classList.add("hidden");
  }

  function openGlobalSearchResult(kind, id, query) {
    hideGlobalSearchResults();
    if (kind === "transaction") {
      switchScreen("transactions");
      openTransactionModal(id);
      return;
    }
    if (kind === "account") {
      switchScreen("accounts");
      openAccountModal(id);
      return;
    }
    if (kind === "category") {
      switchScreen("more");
      openCategoryModal(id);
      return;
    }
    if (kind === "query") {
      applyGlobalQueryToTransactions(query);
    }
  }

  function applyGlobalQueryToTransactions(query) {
    uiState.filters.search = query;
    uiState.transactionPage = 1;
    document.getElementById("search-input").value = query;
    switchScreen("transactions");
    renderTransactions();
    hideGlobalSearchResults();
  }

  function getGlobalSearchResults(query) {
    const results = [];
    state.transactions.forEach((transaction) => {
      const categoryName = getCategory(transaction.categoryId)?.name || transaction.type;
      const accountName =
        transaction.type === "transfer"
          ? `${getAccount(transaction.fromAccountId)?.name || "Unknown"} -> ${getAccount(transaction.toAccountId)?.name || "Unknown"}`
          : getAccount(transaction.accountId)?.name || "Unknown Account";
      const haystack = [
        transaction.counterparty,
        transaction.project,
        transaction.details,
        categoryName,
        accountName,
        ...(transaction.tags || []),
        transaction.date,
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          kind: "transaction",
          id: transaction.id,
          icon:
            transaction.type === "income" ? iconRegistry["arrow-up"] : transaction.type === "expense" ? iconRegistry["arrow-down"] : iconRegistry.swap,
          label: transaction.counterparty || categoryName,
          meta: `${transaction.date} | ${accountName} | ${formatTransactionAmount(transaction.amount, transaction)}`,
        });
      }
    });

    state.accounts.forEach((account) => {
      if (`${account.name} ${account.type} ${account.notes || ""}`.toLowerCase().includes(query)) {
        results.push({
          kind: "account",
          id: account.id,
          icon: iconRegistry[account.icon] || iconRegistry.wallet,
          label: account.name,
          meta: `${titleCase(account.type)} | ${formatMoney(getAccountBalance(account.id), account.currencySymbol || "$")}`,
        });
      }
    });

    state.categories.forEach((category) => {
      const haystack = `${category.name} ${category.type} ${(category.subcategories || []).join(" ")}`.toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          kind: "category",
          id: category.id,
          icon: iconRegistry[category.icon] || iconRegistry.cart,
          label: category.name,
          meta: `${titleCase(category.type)} | ${category.budgetLimit ? formatCurrency(category.budgetLimit) : "No budget limit"}`,
        });
      }
    });

    results.push({
      kind: "query",
      id: "",
      query,
      icon: iconRegistry.search,
      label: `Search transactions for "${uiState.globalSearch.trim()}"`,
      meta: "Open the Transactions tab with this query applied",
    });

    return results.slice(0, 8);
  }

  return {
    getFilteredTransactions,
    matchesTransactionFilters,
    clearFilters,
    renderGlobalSearchResults,
    hideGlobalSearchResults,
    openGlobalSearchResult,
    applyGlobalQueryToTransactions,
    getGlobalSearchResults,
  };
}
