export function createCalendarTools(api) {
  const {
    state,
    uiState,
    iconRegistry,
    getAccount,
    getCategory,
    getPrimaryCurrencySymbol,
    sumAmounts,
    formatMoney,
    formatCalendarDisplayMoney,
    formatCompactPlainAmount,
    toLocalIsoDate,
    switchScreen,
    renderTransactions,
  } = api;

  function renderCalendarOverview() {
    const year = uiState.calendarCursor.getFullYear();
    const month = uiState.calendarCursor.getMonth();
    const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(uiState.calendarCursor);
    const baseSymbol = getPrimaryCurrencySymbol();
    document.getElementById("calendar-month-label").textContent = monthLabel;

    const firstDay = new Date(year, month, 1);
    const leading = (firstDay.getDay() + 1) % 7;
    const totalCells = 42;
    const cells = [];

    for (let index = 0; index < totalCells; index += 1) {
      const dayNumber = index - leading + 1;
      const cellDate = new Date(year, month, dayNumber);
      const iso = toLocalIsoDate(cellDate);
      const inMonth = cellDate.getMonth() === month;
      const dayTransactions = inMonth ? state.transactions.filter((transaction) => transaction.date === iso) : [];
      const income = sumAmounts(dayTransactions.filter((transaction) => transaction.type === "income"));
      const expense = sumAmounts(dayTransactions.filter((transaction) => transaction.type === "expense"));
      const transfer = sumAmounts(dayTransactions.filter((transaction) => transaction.type === "transfer"));
      const hasActivity = income || expense || transfer;
      cells.push(`
        <button class="calendar-cell ${inMonth ? "" : "calendar-muted"}" type="button" ${
          inMonth ? `data-action="show-calendar-tooltip" data-date="${iso}" data-calendar-tooltip="true"` : "disabled"
        }>
          <span class="calendar-day-number">${cellDate.getDate()}</span>
          ${
            hasActivity
              ? `<div class="calendar-cell-flow">
                  ${
                    income
                      ? `<span class="calendar-pill icon-income">
                          <span class="calendar-pill-icon">${iconRegistry["arrow-up"]}</span>
                          <span class="calendar-pill-text">${formatCalendarDisplayMoney(income, baseSymbol)}</span>
                          <span class="calendar-pill-mobile-text">${formatCompactPlainAmount(income)}</span>
                        </span>`
                      : ""
                  }
                  ${
                    expense
                      ? `<span class="calendar-pill icon-expense">
                          <span class="calendar-pill-icon">${iconRegistry["arrow-down"]}</span>
                          <span class="calendar-pill-text">${formatCalendarDisplayMoney(expense, baseSymbol)}</span>
                          <span class="calendar-pill-mobile-text">${formatCompactPlainAmount(expense)}</span>
                        </span>`
                      : ""
                  }
                  ${
                    transfer
                      ? `<span class="calendar-pill icon-transfer">
                          <span class="calendar-pill-icon">${iconRegistry.swap}</span>
                          <span class="calendar-pill-text">${formatCalendarDisplayMoney(transfer, baseSymbol)}</span>
                          <span class="calendar-pill-mobile-text">${formatCompactPlainAmount(transfer)}</span>
                        </span>`
                      : ""
                  }
                </div>`
              : `<span class="calendar-empty">No activity</span>`
          }
        </button>
      `);
    }

    document.getElementById("overview-calendar").innerHTML = cells.join("");
  }

  function getCalendarPrimaryAccounts() {
    const preferredNames = ["cash", "bkash", "citybank"];
    const selected = [];
    preferredNames.forEach((name) => {
      const match = state.accounts.find((account) => String(account.name || "").trim().toLowerCase() === name);
      if (match && !selected.some((item) => item.id === match.id)) {
        selected.push(match);
      }
    });
    state.accounts.forEach((account) => {
      if (selected.length >= 3) {
        return;
      }
      if (!selected.some((item) => item.id === account.id)) {
        selected.push(account);
      }
    });
    return selected.slice(0, 3);
  }

  function getHistoricalAccountBalance(accountId, date) {
    const account = getAccount(accountId);
    if (!account) {
      return 0;
    }
    let balance = Number(account.openingBalance || 0);
    state.transactions.forEach((transaction) => {
      if (!transaction.date || transaction.date > date) {
        return;
      }
      const amount = Number(transaction.amount || 0);
      if (transaction.type === "transfer") {
        if (transaction.fromAccountId === accountId) {
          balance -= amount;
        }
        if (transaction.toAccountId === accountId) {
          balance += amount;
        }
        return;
      }
      if (transaction.accountId === accountId) {
        balance += transaction.type === "income" ? amount : -amount;
      }
    });
    return balance;
  }

  function buildCalendarTransactionSummary(transaction, baseSymbol) {
    const accountLabel =
      transaction.type === "transfer"
        ? [getAccount(transaction.fromAccountId)?.name, getAccount(transaction.toAccountId)?.name].filter(Boolean).join(" -> ")
        : getAccount(transaction.accountId)?.name || "Unknown";
    const categoryLabel =
      transaction.type === "transfer" ? "Transfer" : getCategory(transaction.categoryId)?.name || "Uncategorized";
    const parts = [
      accountLabel,
      categoryLabel,
      String(transaction.subcategory || "").trim(),
      String(transaction.counterparty || "").trim(),
      String(transaction.project || "").trim(),
    ].filter(Boolean);
    return {
      id: transaction.id,
      text: `${parts.join(" | ")} -> ${formatMoney(transaction.amount || 0, getAccount(transaction.accountId || transaction.toAccountId || transaction.fromAccountId)?.currencySymbol || baseSymbol)}`,
      amount: formatMoney(transaction.amount || 0, getAccount(transaction.accountId || transaction.toAccountId || transaction.fromAccountId)?.currencySymbol || baseSymbol),
    };
  }

  function getCalendarDayDetail(date) {
    const baseSymbol = getPrimaryCurrencySymbol();
    const transactions = state.transactions
      .filter((transaction) => transaction.date === date)
      .map((transaction) => ({
        ...transaction,
        summary: buildCalendarTransactionSummary(transaction, baseSymbol),
      }));
    const groupConfig = [
      { type: "expense", label: "Expenses", color: "#d35a5a" },
      { type: "income", label: "Income", color: "#1ca866" },
      { type: "transfer", label: "Transfers", color: "#2f86ff" },
    ];
    const groups = groupConfig
      .map((group) => {
        const items = transactions.filter((transaction) => transaction.type === group.type);
        return {
          ...group,
          total: sumAmounts(items),
          items: items.map((transaction) => transaction.summary),
        };
      })
      .filter((group) => group.items.length);

    const balances = getCalendarPrimaryAccounts().map((account) => ({
      id: account.id,
      name: account.name,
      color: account.color || "#19c6a7",
      value: formatMoney(getHistoricalAccountBalance(account.id, date), account.currencySymbol || baseSymbol),
    }));

    return {
      date,
      label: new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`)),
      groups,
      balances,
      hasTransactions: transactions.length > 0,
    };
  }

  function shiftCalendarMonth(direction) {
    uiState.calendarCursor = new Date(uiState.calendarCursor.getFullYear(), uiState.calendarCursor.getMonth() + direction, 1);
    renderCalendarOverview();
  }

  function applyDateFilter(date) {
    uiState.filters.startDate = date;
    uiState.filters.endDate = date;
    uiState.transactionPage = 1;
    document.getElementById("filter-start-date").value = date;
    document.getElementById("filter-end-date").value = date;
    switchScreen("transactions");
    renderTransactions();
  }

  return {
    renderCalendarOverview,
    shiftCalendarMonth,
    applyDateFilter,
    getCalendarDayDetail,
  };
}
