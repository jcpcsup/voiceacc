export function createAccountsCategoriesTools(api) {
  const {
    state,
    iconRegistry,
    getAccount,
    getCategoryUsage,
    getPrimaryCurrencySymbol,
    formatMoney,
    escapeHtml,
    titleCase,
    renderMiniTrendChart,
    sumAmounts,
    getDateRange,
    toLocalIsoDate,
    toLocalMonthKey,
    parseIsoDate,
    todayIso,
  } = api;

  let aggregateCacheKey = "";
  let aggregateCache = null;

  function getTrailingMonths(count = 12) {
    const months = [];
    const now = new Date();
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      months.push({
        key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
        label: monthDate.toLocaleDateString("en-US", { month: "short" }),
        year: monthDate.getFullYear(),
        month: monthDate.getMonth(),
      });
    }
    return months;
  }

  function buildMonthSequence(startDate, endDate) {
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const months = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      months.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        label: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  function getCurrentWeekRange() {
    const now = new Date();
    const start = new Date(now);
    const dayOffset = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - dayOffset);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return {
      start: toLocalIsoDate(start),
      end: toLocalIsoDate(end),
    };
  }

  function getTransactionsForPreset(preset) {
    const today = todayIso();
    if (preset === "today") {
      return state.transactions.filter((transaction) => transaction.date === today);
    }
    if (preset === "thisWeek") {
      const range = getCurrentWeekRange();
      return state.transactions.filter((transaction) => transaction.date >= range.start && transaction.date <= range.end);
    }
    const range = getDateRange(preset);
    return state.transactions.filter((transaction) => transaction.date >= range.start && transaction.date <= range.end);
  }

  function getAggregateCacheSignature() {
    const monthAnchor = toLocalMonthKey(new Date());
    const accountPart = state.accounts
      .map((account) => `${account.id}:${Number(account.openingBalance || 0)}:${account.includeInTotalBalance !== false ? 1 : 0}`)
      .join("|");
    const transactionPart = state.transactions
      .map(
        (transaction) =>
          `${transaction.id}:${transaction.updatedAt || transaction.createdAt || ""}:${transaction.type}:${transaction.amount}:${transaction.date}:${
            transaction.accountId || ""
          }:${transaction.fromAccountId || ""}:${transaction.toAccountId || ""}:${transaction.categoryId || ""}`
      )
      .join("|");
    return `${monthAnchor}::${accountPart}::${transactionPart}`;
  }

  function primeAccountMaps(snapshot, accountId, openingBalance) {
    if (!accountId) {
      return;
    }
    if (!snapshot.balanceByAccount.has(accountId)) {
      const opening = Number(openingBalance || 0);
      snapshot.balanceByAccount.set(accountId, opening);
      snapshot.carryBalanceByAccount.set(accountId, opening);
      snapshot.incomingByAccount.set(accountId, 0);
      snapshot.outgoingByAccount.set(accountId, 0);
      snapshot.monthDeltaByAccount.set(accountId, Array.from({ length: snapshot.months.length }, () => 0));
      snapshot.currentMonthStartingBalanceByAccount.set(accountId, opening);
      snapshot.currentMonthDeltaByAccount.set(accountId, Array.from({ length: snapshot.currentMonthDays.length }, () => 0));
      snapshot.allTimeMonthDeltaByAccount.set(accountId, Array.from({ length: snapshot.allTimeMonths.length }, () => 0));
    }
  }

  function applyAccountAggregate(snapshot, accountId, delta, direction, transactionDate) {
    if (!accountId) {
      return;
    }
    primeAccountMaps(snapshot, accountId, getAccount(accountId)?.openingBalance || 0);
    snapshot.balanceByAccount.set(accountId, Number(snapshot.balanceByAccount.get(accountId) || 0) + delta);

    if (direction === "incoming") {
      snapshot.incomingByAccount.set(accountId, Number(snapshot.incomingByAccount.get(accountId) || 0) + Math.abs(delta));
    }
    if (direction === "outgoing") {
      snapshot.outgoingByAccount.set(accountId, Number(snapshot.outgoingByAccount.get(accountId) || 0) + Math.abs(delta));
    }

    if (!transactionDate) {
      return;
    }
    const monthIndex = snapshot.monthIndexByKey.get(transactionDate.slice(0, 7));
    if (monthIndex !== undefined) {
      const monthDelta = snapshot.monthDeltaByAccount.get(accountId);
      monthDelta[monthIndex] += delta;
      return;
    }
    if (transactionDate < snapshot.firstTrackedMonthIso) {
      snapshot.carryBalanceByAccount.set(accountId, Number(snapshot.carryBalanceByAccount.get(accountId) || 0) + delta);
    }
  }

  function addCategoryMonthlyAmount(snapshot, categoryId, amount, transactionDate) {
    if (!categoryId || !transactionDate) {
      return;
    }
    const monthIndex = snapshot.monthIndexByKey.get(transactionDate.slice(0, 7));
    if (monthIndex === undefined) {
      return;
    }
    if (!snapshot.monthlyByCategory.has(categoryId)) {
      snapshot.monthlyByCategory.set(
        categoryId,
        snapshot.months.map((month) => ({
          label: month.label,
          value: 0,
        }))
      );
    }
    snapshot.monthlyByCategory.get(categoryId)[monthIndex].value += Number(amount || 0);
  }

  function addCategoryCurrentMonthAmount(snapshot, categoryId, amount, transactionDate, rangeEnd) {
    if (!categoryId || !transactionDate || !rangeEnd || transactionDate > rangeEnd) {
      return;
    }
    const dayIndex = snapshot.currentMonthDayIndexByKey.get(transactionDate.slice(8, 10));
    if (dayIndex === undefined) {
      return;
    }
    if (!snapshot.currentMonthByCategory.has(categoryId)) {
      snapshot.currentMonthByCategory.set(
        categoryId,
        snapshot.currentMonthDays.map((day) => ({
          label: day.label,
          value: 0,
        }))
      );
    }
    snapshot.currentMonthByCategory.get(categoryId)[dayIndex].value += Number(amount || 0);
  }

  function buildAggregateSnapshot() {
    const months = getTrailingMonths(12);
    const now = new Date();
    const today = todayIso();
    const currentMonthDays = Array.from({ length: now.getDate() }, (_, index) => ({
      key: `${String(index + 1).padStart(2, "0")}`,
      label: String(index + 1),
    }));
    const earliestTransactionDate = state.transactions
      .map((transaction) => transaction.date)
      .filter(Boolean)
      .sort()[0];
    const allTimeMonths = buildMonthSequence(earliestTransactionDate ? parseIsoDate(earliestTransactionDate, 12) : now, now);
    const snapshot = {
      months,
      currentMonthDays,
      allTimeMonths,
      monthIndexByKey: new Map(months.map((month, index) => [month.key, index])),
      currentMonthDayIndexByKey: new Map(currentMonthDays.map((day, index) => [day.key, index])),
      allTimeMonthIndexByKey: new Map(allTimeMonths.map((month, index) => [month.key, index])),
      firstTrackedMonthIso: `${months[0].key}-01`,
      balanceByAccount: new Map(),
      carryBalanceByAccount: new Map(),
      incomingByAccount: new Map(),
      outgoingByAccount: new Map(),
      monthDeltaByAccount: new Map(),
      monthlySeriesByAccount: new Map(),
      currentMonthStartingBalanceByAccount: new Map(),
      currentMonthDeltaByAccount: new Map(),
      currentMonthSeriesByAccount: new Map(),
      allTimeMonthDeltaByAccount: new Map(),
      allTimeSeriesByAccount: new Map(),
      monthlyByCategory: new Map(),
      currentMonthByCategory: new Map(),
      totals: {
        balance: 0,
        monthIncome: 0,
        monthExpense: 0,
        weekIncome: 0,
        weekExpense: 0,
        dayIncome: 0,
        dayExpense: 0,
      },
    };

    state.accounts.forEach((account) => {
      primeAccountMaps(snapshot, account.id, account.openingBalance || 0);
    });

    const thisWeek = getCurrentWeekRange();
    const thisMonth = getDateRange("thisMonth");

    state.transactions.forEach((transaction) => {
      const amount = Number(transaction.amount || 0);
      if (!amount) {
        return;
      }

       const applyCurrentMonthDelta = (accountId, delta) => {
        if (!accountId) {
          return;
        }
        primeAccountMaps(snapshot, accountId, getAccount(accountId)?.openingBalance || 0);
        if (transaction.date < thisMonth.start) {
          snapshot.currentMonthStartingBalanceByAccount.set(
            accountId,
            Number(snapshot.currentMonthStartingBalanceByAccount.get(accountId) || 0) + delta
          );
          return;
        }
        if (transaction.date >= thisMonth.start && transaction.date <= today) {
          const dayIndex = snapshot.currentMonthDayIndexByKey.get(transaction.date.slice(8, 10));
          if (dayIndex !== undefined) {
            snapshot.currentMonthDeltaByAccount.get(accountId)[dayIndex] += delta;
          }
        }
      };

      const applyAllTimeDelta = (accountId, delta) => {
        if (!accountId) {
          return;
        }
        primeAccountMaps(snapshot, accountId, getAccount(accountId)?.openingBalance || 0);
        const monthIndex = snapshot.allTimeMonthIndexByKey.get(transaction.date.slice(0, 7));
        if (monthIndex !== undefined) {
          snapshot.allTimeMonthDeltaByAccount.get(accountId)[monthIndex] += delta;
        }
      };

      if (transaction.type === "income") {
        applyAccountAggregate(snapshot, transaction.accountId, amount, "incoming", transaction.date);
        applyCurrentMonthDelta(transaction.accountId, amount);
        applyAllTimeDelta(transaction.accountId, amount);
      }
      if (transaction.type === "expense") {
        applyAccountAggregate(snapshot, transaction.accountId, -amount, "outgoing", transaction.date);
        applyCurrentMonthDelta(transaction.accountId, -amount);
        applyAllTimeDelta(transaction.accountId, -amount);
      }
      if (transaction.type === "transfer") {
        applyAccountAggregate(snapshot, transaction.fromAccountId, -amount, "outgoing", transaction.date);
        applyAccountAggregate(snapshot, transaction.toAccountId, amount, "incoming", transaction.date);
        applyCurrentMonthDelta(transaction.fromAccountId, -amount);
        applyCurrentMonthDelta(transaction.toAccountId, amount);
        applyAllTimeDelta(transaction.fromAccountId, -amount);
        applyAllTimeDelta(transaction.toAccountId, amount);
      }

      addCategoryMonthlyAmount(snapshot, transaction.categoryId, amount, transaction.date);
      if (transaction.date >= thisMonth.start && transaction.date <= today) {
        addCategoryCurrentMonthAmount(snapshot, transaction.categoryId, amount, transaction.date, today);
      }

      if (transaction.date === today) {
        if (transaction.type === "income") {
          snapshot.totals.dayIncome += amount;
        }
        if (transaction.type === "expense") {
          snapshot.totals.dayExpense += amount;
        }
      }
      if (transaction.date >= thisWeek.start && transaction.date <= thisWeek.end) {
        if (transaction.type === "income") {
          snapshot.totals.weekIncome += amount;
        }
        if (transaction.type === "expense") {
          snapshot.totals.weekExpense += amount;
        }
      }
      if (transaction.date >= thisMonth.start && transaction.date <= thisMonth.end) {
        if (transaction.type === "income") {
          snapshot.totals.monthIncome += amount;
        }
        if (transaction.type === "expense") {
          snapshot.totals.monthExpense += amount;
        }
      }
    });

    state.accounts.forEach((account) => {
      const accountId = account.id;
      const running = Number(snapshot.carryBalanceByAccount.get(accountId) || 0);
      let current = running;
      const deltas = snapshot.monthDeltaByAccount.get(accountId) || Array.from({ length: months.length }, () => 0);
      const series = months.map((month, index) => {
        current += Number(deltas[index] || 0);
        return {
          label: month.label,
          value: current,
        };
      });
      snapshot.monthlySeriesByAccount.set(accountId, series);

      let currentMonthBalance = Number(snapshot.currentMonthStartingBalanceByAccount.get(accountId) || 0);
      const currentMonthDeltas = snapshot.currentMonthDeltaByAccount.get(accountId) || Array.from({ length: snapshot.currentMonthDays.length }, () => 0);
      snapshot.currentMonthSeriesByAccount.set(
        accountId,
        snapshot.currentMonthDays.map((day, index) => {
          currentMonthBalance += Number(currentMonthDeltas[index] || 0);
          return {
            label: day.label,
            value: currentMonthBalance,
          };
        })
      );

      let allTimeBalance = Number(account.openingBalance || 0);
      const allTimeDeltas = snapshot.allTimeMonthDeltaByAccount.get(accountId) || Array.from({ length: snapshot.allTimeMonths.length }, () => 0);
      snapshot.allTimeSeriesByAccount.set(
        accountId,
        snapshot.allTimeMonths.map((month, index) => {
          allTimeBalance += Number(allTimeDeltas[index] || 0);
          return {
            label: month.label,
            value: allTimeBalance,
          };
        })
      );

      if (account.includeInTotalBalance !== false) {
        snapshot.totals.balance += Number(snapshot.balanceByAccount.get(accountId) || 0);
      }
    });

    return snapshot;
  }

  function getAggregateSnapshot() {
    const nextKey = getAggregateCacheSignature();
    if (aggregateCache && aggregateCacheKey === nextKey) {
      return aggregateCache;
    }
    aggregateCacheKey = nextKey;
    aggregateCache = buildAggregateSnapshot();
    return aggregateCache;
  }

  function getAccountBalance(accountId) {
    return Number(getAggregateSnapshot().balanceByAccount.get(accountId) || 0);
  }

  function getAccountFlow(accountId) {
    const snapshot = getAggregateSnapshot();
    return {
      incoming: Number(snapshot.incomingByAccount.get(accountId) || 0),
      outgoing: Number(snapshot.outgoingByAccount.get(accountId) || 0),
    };
  }

  function getAccountBalanceAtDate(accountId, date) {
    const target = toLocalMonthKey(date);
    const snapshot = getAggregateSnapshot();
    const series = snapshot.monthlySeriesByAccount.get(accountId);
    if (!series || !series.length) {
      return Number(getAccount(accountId)?.openingBalance || 0);
    }
    const monthIndex = snapshot.monthIndexByKey.get(target);
    if (monthIndex === undefined) {
      return monthIndex === 0 ? series[0].value : series[series.length - 1].value;
    }
    return Number(series[monthIndex]?.value || 0);
  }

  function getAccountMonthlyBalanceSeries(accountId) {
    const snapshot = getAggregateSnapshot();
    return (
      snapshot.monthlySeriesByAccount.get(accountId) ||
      snapshot.months.map((month) => ({
        label: month.label,
        value: Number(getAccount(accountId)?.openingBalance || 0),
      }))
    );
  }

  function getAccountCurrentMonthBalanceSeries(accountId) {
    const snapshot = getAggregateSnapshot();
    return (
      snapshot.currentMonthSeriesByAccount.get(accountId) ||
      snapshot.currentMonthDays.map((day) => ({
        label: day.label,
        value: Number(getAccount(accountId)?.openingBalance || 0),
      }))
    );
  }

  function getAccountAllTimeBalanceSeries(accountId) {
    const snapshot = getAggregateSnapshot();
    return (
      snapshot.allTimeSeriesByAccount.get(accountId) ||
      snapshot.allTimeMonths.map((month) => ({
        label: month.label,
        value: Number(getAccount(accountId)?.openingBalance || 0),
      }))
    );
  }

  function getCategoryMonthlySeries(categoryId) {
    const snapshot = getAggregateSnapshot();
    return (
      snapshot.monthlyByCategory.get(categoryId) ||
      snapshot.months.map((month) => ({
        label: month.label,
        value: 0,
      }))
    );
  }

  function getCategoryCurrentMonthSeries(categoryId) {
    const snapshot = getAggregateSnapshot();
    return (
      snapshot.currentMonthByCategory.get(categoryId) ||
      snapshot.currentMonthDays.map((day) => ({
        label: day.label,
        value: 0,
      }))
    );
  }

  function getGlobalMetrics() {
    return { ...getAggregateSnapshot().totals };
  }

  function renderAccountCard(account, manageMode) {
    const balance = getAccountBalance(account.id);
    const flow = getAccountFlow(account.id);
    const accountSymbol = account.currencySymbol || "$";
    const monthSeries = getAccountCurrentMonthBalanceSeries(account.id);
    const accountSeries = getAccountMonthlyBalanceSeries(account.id);
    const allTimeSeries = getAccountAllTimeBalanceSeries(account.id);
    return `
      <article class="account-card" style="--card-color:${escapeHtml(account.color || "#19c6a7")}">
        <div class="flash-card-top">
          <div class="card-icon">${iconRegistry[account.icon] || iconRegistry.wallet}</div>
          <span class="meta-pill neutral">${escapeHtml(accountSymbol)} | ${escapeHtml(titleCase(account.type))}</span>
        </div>
        <h3>${escapeHtml(account.name)}</h3>
        <strong class="money account-balance">${formatMoney(balance, accountSymbol)}</strong>
        ${
          manageMode
            ? `<div class="account-chart-trio">
                ${renderMiniTrendChart(monthSeries, account.color || "#19c6a7", "Monthly Balance", formatMoney(monthSeries[monthSeries.length - 1]?.value || 0, accountSymbol))}
                ${renderMiniTrendChart(accountSeries, account.color || "#19c6a7", "12M Balance", formatMoney(accountSeries[accountSeries.length - 1]?.value || 0, accountSymbol))}
                ${renderMiniTrendChart(allTimeSeries, account.color || "#19c6a7", "All Time Historical", formatMoney(allTimeSeries[allTimeSeries.length - 1]?.value || 0, accountSymbol))}
              </div>`
            : renderMiniTrendChart(
                accountSeries,
                account.color || "#19c6a7",
                "12M Balance",
                formatMoney(accountSeries[accountSeries.length - 1]?.value || 0, accountSymbol)
              )
        }
        <div class="account-card-footer">
          <div class="transaction-tags compact-tags">
            <span class="meta-pill neutral meta-pill-icon icon-income">${iconRegistry["arrow-up"]}<span>${formatMoney(flow.incoming, accountSymbol)}</span></span>
            <span class="meta-pill neutral meta-pill-icon icon-expense">${iconRegistry["arrow-down"]}<span>${formatMoney(flow.outgoing, accountSymbol)}</span></span>
          </div>
          ${
            manageMode
              ? `<div class="card-actions compact-actions account-button-row">
                  <button class="ghost-button" type="button" data-action="edit-account" data-id="${escapeHtml(account.id)}">Edit</button>
                  <button class="secondary-button" type="button" data-action="delete-account" data-id="${escapeHtml(account.id)}">Delete</button>
                </div>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderCategoryIcon(icon) {
    const value = String(icon || "").trim();
    if (value && iconRegistry[value]) {
      return iconRegistry[value];
    }
    if (value) {
      return `<span class="custom-icon-text">${escapeHtml(value)}</span>`;
    }
    return iconRegistry.cart;
  }

  function renderCategoryItem(category) {
    const usage = getCategoryUsage ? getCategoryUsage(category.id) : null;
    const baseSymbol = getPrimaryCurrencySymbol();
    const monthSeries = getCategoryCurrentMonthSeries(category.id);
    const categorySeries = getCategoryMonthlySeries(category.id);
    return `
      <article class="category-item" style="--card-color:${escapeHtml(category.color || "#19c6a7")}">
        <div class="category-main">
          <div class="category-copy">
            <div class="flash-card-top">
              <div class="category-icon">${renderCategoryIcon(category.icon)}</div>
              <span class="meta-pill neutral">${escapeHtml(titleCase(category.type))}</span>
            </div>
            <h3>${escapeHtml(category.name)}</h3>
            <div class="category-subs">
              ${(category.subcategories || []).slice(0, 2).map((item) => `<span class="meta-pill neutral">${escapeHtml(item)}</span>`).join("")}
            </div>
            <div class="category-chart-row">
              ${renderMiniTrendChart(monthSeries, category.color || "#19c6a7", "Monthly Activity", formatMoney(monthSeries[monthSeries.length - 1]?.value || 0, baseSymbol))}
              ${renderMiniTrendChart(categorySeries, category.color || "#19c6a7", "12M Activity", formatMoney(categorySeries[categorySeries.length - 1]?.value || 0, baseSymbol))}
            </div>
          </div>
          <div class="category-side">
            <div class="category-meta-row">
              ${
                category.type === "expense" && Number(category.budgetLimit) > 0
                  ? `<span class="meta-pill meta-pill-icon">${category.budgetPeriod === "weekly" ? iconRegistry.week : iconRegistry.month}<span>${formatMoney(category.budgetLimit, baseSymbol)}</span></span>`
                  : `<span class="meta-pill neutral">No budget limit</span>`
              }
              ${usage ? `<span class="meta-pill neutral meta-pill-icon icon-expense">${iconRegistry["arrow-down"]}<span>${formatMoney(usage.spent, baseSymbol)}</span></span>` : ""}
            </div>
            <div class="category-button-row">
              <button class="ghost-button" type="button" data-action="edit-category" data-id="${escapeHtml(category.id)}">Edit</button>
              <button class="secondary-button" type="button" data-action="delete-category" data-id="${escapeHtml(category.id)}">Delete</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderCategoryGroup(title, categories) {
    return `
      <section class="category-group">
        <div class="category-group-header">
          <p class="eyebrow">${escapeHtml(title)}</p>
        </div>
        <div class="category-group-list">
          ${categories.map(renderCategoryItem).join("")}
        </div>
      </section>
    `;
  }

  function renderHeroAccountPill(account) {
    const balance = getAccountBalance(account.id);
    const color = account.color || "#19c6a7";
    const symbol = account.currencySymbol || "$";
    return `
      <article class="hero-account-pill" style="--account-pill-color:${escapeHtml(color)}">
        <strong class="money">${formatMoney(balance, symbol)}</strong>
        <span>${escapeHtml(account.name)}</span>
      </article>
    `;
  }

  return {
    getAccountBalance,
    getAccountFlow,
    getTrailingMonths,
    getAccountMonthlyBalanceSeries,
    getAccountBalanceAtDate,
    getCategoryMonthlySeries,
    getCategoryCurrentMonthSeries,
    getCurrentWeekRange,
    getTransactionsForPreset,
    getGlobalMetrics,
    renderAccountCard,
    renderCategoryItem,
    renderCategoryGroup,
    renderHeroAccountPill,
  };
}
