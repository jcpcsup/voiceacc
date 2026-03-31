export function createCalendarTools(api) {
  const {
    state,
    uiState,
    iconRegistry,
    getPrimaryCurrencySymbol,
    sumAmounts,
    formatCalendarDisplayMoney,
    formatCompactPlainAmount,
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
      const iso = cellDate.toISOString().slice(0, 10);
      const inMonth = cellDate.getMonth() === month;
      const dayTransactions = inMonth ? state.transactions.filter((transaction) => transaction.date === iso) : [];
      const income = sumAmounts(dayTransactions.filter((transaction) => transaction.type === "income"));
      const expense = sumAmounts(dayTransactions.filter((transaction) => transaction.type === "expense"));
      const transfer = sumAmounts(dayTransactions.filter((transaction) => transaction.type === "transfer"));
      const hasActivity = income || expense || transfer;
      cells.push(`
        <button class="calendar-cell ${inMonth ? "" : "calendar-muted"}" type="button" ${
          inMonth ? `data-action="open-calendar-day" data-date="${iso}"` : "disabled"
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
  };
}
