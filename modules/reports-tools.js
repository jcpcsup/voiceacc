export function createReportsTools(api) {
  const {
    state,
    uiState,
    iconRegistry,
    getDateRange,
    getPrimaryCurrencySymbol,
    getAccount,
    getCategory,
    getTrailingMonths,
    sumAmounts,
    formatMoney,
    formatCurrency,
    formatTransactionAmount,
    escapeHtml,
    titleCase,
    renderEmpty,
    renderBudgetCard,
    insightCard,
    parseIsoDate,
    toLocalIsoDate,
  } = api;
  let lastBreakdownDataset = null;
  let lastDrilldownDataset = null;
  const DRILLDOWN_PREFIX = "drill:";
  const drilldownPalette = ["#19c6a7", "#31b3ff", "#ff9d2f", "#8e6cff", "#ff6b6b", "#26b37b", "#f37eb7", "#5d83ff", "#9b7c52", "#00a6c7"];

  function renderCategoryIcon(icon, fallback) {
    const value = String(icon || "").trim();
    if (value && iconRegistry[value]) {
      return iconRegistry[value];
    }
    if (value) {
      return `<span class="custom-icon-text">${escapeHtml(value)}</span>`;
    }
    return fallback;
  }

  function renderReports() {
    const transactions = getReportTransactions();
    const baseSymbol = getPrimaryCurrencySymbol();
    const income = sumAmounts(transactions.filter((tx) => tx.type === "income"));
    const expense = sumAmounts(transactions.filter((tx) => tx.type === "expense"));
    const transfer = sumAmounts(transactions.filter((tx) => tx.type === "transfer"));
    const largest = transactions.reduce((best, tx) => (!best || tx.amount > best.amount ? tx : best), null);
    const incomeSeries = buildMonthlySeries(transactions, (transaction) => (transaction.type === "income" ? transaction.amount : 0));
    const expenseSeries = buildMonthlySeries(transactions, (transaction) => (transaction.type === "expense" ? transaction.amount : 0));
    const netSeries = buildMonthlySeries(
      transactions,
      (transaction) => (transaction.type === "income" ? transaction.amount : transaction.type === "expense" ? -Number(transaction.amount || 0) : 0)
    );
    const transferSeries = buildMonthlySeries(transactions, (transaction) => (transaction.type === "transfer" ? transaction.amount : 0));
    const volumeSeries = buildMonthlySeries(transactions, (transaction) => transaction.amount || 0);

    document.getElementById("report-metrics").innerHTML = [
      metricCard("Income", formatMoney(income, baseSymbol), "Filtered income", renderInlineSparkline(incomeSeries, "#1ca866")),
      metricCard("Expenses", formatMoney(expense, baseSymbol), "Filtered expense", renderInlineSparkline(expenseSeries, "#d35a5a")),
      metricCard("Net", formatMoney(income - expense, baseSymbol), "Income minus expense", renderInlineSparkline(netSeries, "#00a6c7")),
      metricCard("Transfers", formatMoney(transfer, baseSymbol), "Transfer volume", renderInlineSparkline(transferSeries, "#2f86ff")),
      metricCard(
        "Largest Entry",
        largest ? formatTransactionAmount(largest.amount, largest) : formatMoney(0, baseSymbol),
        largest ? largest.details || largest.counterparty || largest.type : "No transactions",
        renderInlineSparkline(volumeSeries, "#ffb84d")
      ),
    ].join("");

    const budgetStatus = getBudgetStatus(transactions);
    document.getElementById("report-pie").innerHTML = renderReportBreakdown(transactions);
    document.getElementById("report-ranking").innerHTML = renderCategoryRanking(transactions);
    document.getElementById("timeline-chart").innerHTML = renderTimeline(transactions);
    document.getElementById("category-report").innerHTML = renderCategoryBreakdown(transactions);
    document.getElementById("account-report").innerHTML = renderAccountBreakdown(transactions);
    document.getElementById("report-budgets").innerHTML = budgetStatus.length
      ? budgetStatus.map(renderBudgetCard).join("")
      : renderEmpty("No active budgets in the selected range.");
    document.getElementById("project-report").innerHTML = renderProjectTable(transactions);
    document.getElementById("report-insights").innerHTML = renderInsights(transactions);
  }

  function getBudgetStatus(transactionsInput) {
    const transactions = Array.isArray(transactionsInput) ? transactionsInput : state.transactions;
    return state.categories
      .filter((category) => category.type === "expense" && Number(category.budgetLimit) > 0)
      .map((category) => {
        const relevant = transactions.filter((transaction) => {
          if (transaction.type !== "expense" || transaction.categoryId !== category.id) {
            return false;
          }
          return isWithinBudgetPeriod(transaction.date, category.budgetPeriod);
        });
        const spent = sumAmounts(relevant);
        const limit = Number(category.budgetLimit || 0);
        return {
          category,
          spent,
          limit,
          progress: limit ? Math.min((spent / limit) * 100, 100) : 0,
          over: spent > limit,
        };
      })
      .sort((a, b) => b.progress - a.progress);
  }

  function getReportTransactions() {
    const { start, end } = getDateRange(uiState.reports.range);
    const selectedTypes = getSelectedReportTypes();
    return state.transactions.filter((transaction) => {
      if (!selectedTypes.includes(transaction.type)) {
        return false;
      }
      if (
        uiState.reports.account !== "all" &&
        ![transaction.accountId, transaction.fromAccountId, transaction.toAccountId].includes(uiState.reports.account)
      ) {
        return false;
      }
      if (start && transaction.date < start) {
        return false;
      }
      if (end && transaction.date > end) {
        return false;
      }
      return true;
    });
  }

  function getSelectedReportTypes() {
    const selected = Array.isArray(uiState.reports.types) && uiState.reports.types.length ? uiState.reports.types : ["expense"];
    return ["expense", "income", "transfer"].filter((type) => selected.includes(type));
  }

  function shiftLocalIsoDate(isoDate, days) {
    const reference = parseIsoDate(isoDate, 12);
    reference.setDate(reference.getDate() + Number(days || 0));
    return toLocalIsoDate(reference);
  }

  function getInclusiveDaySpan(start, end) {
    if (!start || !end) {
      return 0;
    }
    const startDate = parseIsoDate(start, 12);
    const endDate = parseIsoDate(end, 12);
    return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  }

  function getPreviousReportRangeMeta() {
    const range = uiState.reports.range;
    const current = getDateRange(range);
    if (!current.start || !current.end || range === "all") {
      return null;
    }
    if (range === "thisMonth") {
      const currentStart = parseIsoDate(current.start, 12);
      const previousStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);
      const previousEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0);
      return {
        start: toLocalIsoDate(previousStart),
        end: toLocalIsoDate(previousEnd),
        label: "Last Month",
      };
    }
    if (range === "last30") {
      const span = getInclusiveDaySpan(current.start, current.end);
      const previousEnd = shiftLocalIsoDate(current.start, -1);
      return {
        start: shiftLocalIsoDate(previousEnd, -(span - 1)),
        end: previousEnd,
        label: "Previous 30 Days",
      };
    }
    if (range === "thisQuarter") {
      const currentStart = parseIsoDate(current.start, 12);
      const previousStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 3, 1);
      const previousEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0);
      return {
        start: toLocalIsoDate(previousStart),
        end: toLocalIsoDate(previousEnd),
        label: "Last Quarter",
      };
    }
    if (range === "thisYear") {
      const currentStart = parseIsoDate(current.start, 12);
      return {
        start: `${currentStart.getFullYear() - 1}-01-01`,
        end: `${currentStart.getFullYear() - 1}-12-31`,
        label: "Last Year",
      };
    }
    if (range === "custom") {
      const span = getInclusiveDaySpan(current.start, current.end);
      const previousEnd = shiftLocalIsoDate(current.start, -1);
      return {
        start: shiftLocalIsoDate(previousEnd, -(span - 1)),
        end: previousEnd,
        label: "Previous Range",
      };
    }
    return null;
  }

  function getTransactionsForReportWindow(start, end) {
    const selectedTypes = getSelectedReportTypes();
    return state.transactions.filter((transaction) => {
      if (!selectedTypes.includes(transaction.type)) {
        return false;
      }
      if (
        uiState.reports.account !== "all" &&
        ![transaction.accountId, transaction.fromAccountId, transaction.toAccountId].includes(uiState.reports.account)
      ) {
        return false;
      }
      if (start && transaction.date < start) {
        return false;
      }
      if (end && transaction.date > end) {
        return false;
      }
      return true;
    });
  }

  function getBaseReportFilters() {
    const { start, end } = getDateRange(uiState.reports.range);
    return {
      search: "",
      type: "all",
      accountId: uiState.reports.account !== "all" ? uiState.reports.account : "",
      categoryId: "",
      tag: "",
      startDate: start || "",
      endDate: end || "",
    };
  }

  function mergeDateSpan(filters, date) {
    if (!date) {
      return filters;
    }
    return {
      ...filters,
      startDate: !filters.startDate || date < filters.startDate ? date : filters.startDate,
      endDate: !filters.endDate || date > filters.endDate ? date : filters.endDate,
    };
  }

  function buildMonthlySeries(transactions, resolver, count = 12) {
    const buckets = new Map(getTrailingMonths(count).map((month) => [month.key, { label: month.label, value: 0 }]));
    transactions.forEach((transaction) => {
      if (!transaction.date) {
        return;
      }
      const key = transaction.date.slice(0, 7);
      if (!buckets.has(key)) {
        return;
      }
      buckets.get(key).value += Number(resolver(transaction) || 0);
    });
    return [...buckets.values()];
  }

  function renderInlineSparkline(series, color) {
    const points = series.map((item) => Number(item.value || 0));
    if (!points.some((value) => value !== 0)) {
      return `<div class="inline-sparkline inline-sparkline-empty"></div>`;
    }
    const width = 120;
    const height = 28;
    const padding = 3;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const coords = points.map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
      const normalized = (value - min) / range;
      const y = height - padding - normalized * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return `
      <svg class="inline-sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <polyline points="${coords.join(" ")}" fill="none" stroke="${escapeHtml(color || "#19c6a7")}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>
    `;
  }

  function renderAmountScale(maxValue, symbol, minValue = 0) {
    const midpoint = minValue + (maxValue - minValue) / 2;
    return `
      <div class="report-breakdown-scale" aria-hidden="true">
        <span>${escapeHtml(formatMoney(maxValue, symbol))}</span>
        <span>${escapeHtml(formatMoney(midpoint, symbol))}</span>
        <span>${escapeHtml(formatMoney(minValue, symbol))}</span>
      </div>
    `;
  }

  function renderTimelineOverviewChart(transactions) {
    const incomeSeries = buildMonthlySeries(transactions, (transaction) => (transaction.type === "income" ? transaction.amount : 0), 6);
    const expenseSeries = buildMonthlySeries(transactions, (transaction) => (transaction.type === "expense" ? transaction.amount : 0), 6);
    const incomePoints = incomeSeries.map((item) => Number(item.value || 0));
    const expensePoints = expenseSeries.map((item) => Number(item.value || 0));
    if (![...incomePoints, ...expensePoints].some((value) => value !== 0)) {
      return "";
    }
    const width = 280;
    const height = 96;
    const padding = 8;
    const max = Math.max(...incomePoints, ...expensePoints, 1);
    const buildCoords = (points) =>
      points.map((value, index) => {
        const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
        const y = height - padding - (value / max) * (height - padding * 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      });
    const incomeCoords = buildCoords(incomePoints);
    const expenseCoords = buildCoords(expensePoints);
    const axisLabels = incomeSeries.map((item) => `<span>${escapeHtml(item.label)}</span>`).join("");
    return `
      <div class="timeline-overview">
        <div class="timeline-overview-scale">
          <span>${escapeHtml(formatMoney(max, getPrimaryCurrencySymbol()))}</span>
          <span>${escapeHtml(formatMoney(0, getPrimaryCurrencySymbol()))}</span>
        </div>
        <svg class="timeline-overview-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
          <polyline points="${incomeCoords.join(" ")}" fill="none" stroke="#1ca866" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
          <polyline points="${expenseCoords.join(" ")}" fill="none" stroke="#d35a5a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
        </svg>
        <div class="timeline-overview-legend">
          <span class="meta-pill neutral meta-pill-icon icon-income">${iconRegistry["arrow-up"]}<span>Income trend</span></span>
          <span class="meta-pill neutral meta-pill-icon icon-expense">${iconRegistry["arrow-down"]}<span>Expense trend</span></span>
        </div>
        <div class="timeline-overview-axis">${axisLabels}</div>
      </div>
    `;
  }

  function renderInsightSummary(metrics) {
    const active = metrics.filter((item) => item.value > 0);
    if (!active.length) {
      return "";
    }
    const max = Math.max(...active.map((item) => item.value), 1);
    return `
      <div class="insight-summary">
        ${active
          .map(
            (item) => `
              <div class="insight-summary-row">
                <div class="bar-meta">
                  <strong>${escapeHtml(item.label)}</strong>
                  <span>${escapeHtml(item.display)}</span>
                </div>
                <div class="bar-fill insight-bar">
                  <span style="width:${(item.value / max) * 100}%; background:${escapeHtml(item.color)}"></span>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function isWithinBudgetPeriod(date, period) {
    const target = parseIsoDate(date, 12);
    const now = new Date();
    if (period === "weekly") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return target >= start && target <= end;
    }
    return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
  }

  function renderTimeline(transactions) {
    const grouped = new Map();
    transactions.forEach((transaction) => {
      const key = transaction.date.slice(0, 7);
      if (!grouped.has(key)) {
        grouped.set(key, { income: 0, expense: 0 });
      }
      const entry = grouped.get(key);
      if (transaction.type === "income") {
        entry.income += Number(transaction.amount || 0);
      }
      if (transaction.type === "expense") {
        entry.expense += Number(transaction.amount || 0);
      }
    });
    const rows = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    if (!rows.length) {
      return renderEmpty("Add transactions to unlock cashflow timelines.");
    }
    const maxValue = Math.max(...rows.map(([, value]) => Math.max(value.income, value.expense)), 1);
    return `${renderTimelineOverviewChart(transactions)}${rows
      .map(([month, value]) => {
        const net = value.income - value.expense;
        return `
          <div class="timeline-item">
            <div class="bar-meta">
              <strong>${escapeHtml(month)}</strong>
              <span class="meta-pill neutral">Net ${formatCurrency(net)}</span>
            </div>
            <div class="bar-fill"><span style="width:${(value.income / maxValue) * 100}%"></span></div>
            <p class="supporting-text">Income ${formatCurrency(value.income)}</p>
            <div class="bar-fill" style="margin-top:10px"><span style="width:${(value.expense / maxValue) * 100}%; background:linear-gradient(90deg,#ef6461,#ffb84d)"></span></div>
            <p class="supporting-text">Expense ${formatCurrency(value.expense)}</p>
          </div>
        `;
      })
      .join("")}`;
  }

  function renderCategoryBreakdown(transactions) {
    const map = new Map();
    transactions
      .filter((transaction) => transaction.type === "expense")
      .forEach((transaction) => {
        const category = getCategory(transaction.categoryId);
        const key = category?.id || "uncategorized";
        const current = map.get(key) || {
          label: category ? category.name : "Uncategorized",
          value: 0,
          color: category?.color || "#d35a5a",
        };
        current.value += Number(transaction.amount || 0);
        map.set(key, current);
      });
    const rows = [...map.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 10);
    if (!rows.length) {
      return renderEmpty("No expense data for this report selection.");
    }
    const max = Math.max(...rows.map((row) => row[1].value), 1);
    return rows
      .map(([categoryId, row]) =>
        renderBarItem(
          row.label,
          row.value,
          max,
          renderInlineSparkline(
            buildMonthlySeries(
              transactions.filter((transaction) => transaction.type === "expense" && (transaction.categoryId || "uncategorized") === categoryId),
              (transaction) => transaction.amount || 0
            ),
            row.color
          ),
          row.color
        )
      )
      .join("");
  }

  function getReportBreakdownDataset(transactions) {
    const symbol = getPrimaryCurrencySymbol();
    const selectedTypes = getSelectedReportTypes();
    if (selectedTypes.length === 1 && selectedTypes[0] === "transfer") {
      const baseFilters = getBaseReportFilters();
      const transferMap = new Map();
      transactions
        .filter((transaction) => transaction.type === "transfer")
        .forEach((transaction) => {
          const from = getAccount(transaction.fromAccountId)?.name || "Unknown";
          const to = getAccount(transaction.toAccountId)?.name || "Unknown";
          const key = `${transaction.fromAccountId || from}:${transaction.toAccountId || to}`;
          const current = transferMap.get(key) || {
            label: `${from} -> ${to}`,
            value: 0,
            color: "#2f86ff",
            count: 0,
            filters: {
              ...baseFilters,
              type: "transfer",
              search: `${from} ${to}`.trim(),
            },
          };
          current.value += Number(transaction.amount || 0);
          current.count += 1;
          current.filters = mergeDateSpan(current.filters, transaction.date);
          transferMap.set(key, current);
        });
      return buildPieDataset([...transferMap.values()], "Transfer Routes", "Selected transfers", symbol);
    }

    if (selectedTypes.length === 1 && (selectedTypes[0] === "income" || selectedTypes[0] === "expense")) {
      const categoryMap = new Map();
      const reportType = selectedTypes[0];
      const fallbackColor = reportType === "income" ? "#1ca866" : "#d35a5a";
      const baseFilters = getBaseReportFilters();
      transactions
        .filter((transaction) => transaction.type === reportType)
        .forEach((transaction) => {
          const category = getCategory(transaction.categoryId);
          const key = category?.id || "uncategorized";
          const current = categoryMap.get(key) || {
            label: category?.name || "Uncategorized",
            value: 0,
            color: category?.color || fallbackColor,
            count: 0,
            canDrilldown: true,
            accounts: new Map(),
            filters: {
              ...baseFilters,
              type: reportType,
              categoryId: category?.id || "",
            },
          };
          current.value += Number(transaction.amount || 0);
          current.count += 1;
          current.filters = mergeDateSpan(current.filters, transaction.date);
          const account = getAccount(transaction.accountId);
          const accountKey = transaction.accountId || account?.name || "unknown-account";
          const accountCurrent = current.accounts.get(accountKey) || {
            label: account?.name || "Unknown Account",
            value: 0,
            color: account?.color || "#5f7380",
            count: 0,
            filters: {
              ...baseFilters,
              type: reportType,
              categoryId: category?.id || "",
              accountId: account?.id || transaction.accountId || "",
            },
          };
          accountCurrent.value += Number(transaction.amount || 0);
          accountCurrent.count += 1;
          accountCurrent.filters = mergeDateSpan(accountCurrent.filters, transaction.date);
          current.accounts.set(accountKey, accountCurrent);
          categoryMap.set(key, current);
        });
      return buildPieDataset(
        [...categoryMap.values()].map((row) => ({
          ...row,
          accounts: [...row.accounts.values()].sort((a, b) => b.value - a.value),
        })),
        reportType === "income" ? "Income Mix" : "Expense Mix",
        reportType === "income" ? "Selected income categories" : "Selected expense categories",
        symbol
      );
    }

    const typeSegments = selectedTypes
      .map((type) => {
        const matching = transactions.filter((transaction) => transaction.type === type);
        const filters = matching.reduce(
          (current, transaction) => mergeDateSpan(current, transaction.date),
          {
            ...getBaseReportFilters(),
            type,
          }
        );
        return {
          label: titleCase(type === "expense" ? "expenses" : type),
          value: sumAmounts(matching),
          count: matching.length,
          color: type === "income" ? "#1ca866" : type === "expense" ? "#d35a5a" : "#2f86ff",
          filters,
        };
      })
      .filter((segment) => segment.value > 0);

    return buildPieDataset(typeSegments, "Type Mix", "Selected report totals", symbol);
  }

  function renderReportBreakdown(transactions) {
    const dataset = getReportBreakdownDataset(transactions);
    const chartStyle = uiState.reports.chartStyle || "donut";
    if (!dataset.segments.length || dataset.total <= 0) {
      return `
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Distribution</p>
            <h3>Filtered Breakdown</h3>
          </div>
        </div>
        ${renderBreakdownSwitcher(chartStyle)}
        ${renderEmpty("No filtered values available for this chart yet.")}
      `;
    }

    return `
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">Distribution</p>
          <h3>Filtered Breakdown</h3>
        </div>
        <span class="meta-pill neutral">${escapeHtml(dataset.subtitle)}</span>
      </div>
      ${renderBreakdownSwitcher(chartStyle)}
      <div class="report-pie-layout">
        ${renderBreakdownVisual(dataset, chartStyle, transactions)}
        <div class="report-pie-legend">
          ${dataset.segments
            .map(
              (segment, index) => `
                <button class="report-pie-legend-item report-legend-button" type="button" data-action="open-report-segment" data-index="segment:${index}">
                  <div class="report-pie-legend-main">
                    <span class="report-pie-swatch" style="background:${escapeHtml(segment.color)}"></span>
                    <strong>${escapeHtml(segment.label)}</strong>
                  </div>
                  <div class="report-pie-legend-meta">
                    <span>${formatMoney(segment.value, dataset.symbol)}</span>
                    <span>${segment.percent}%</span>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
        <div class="report-chart-tooltip hidden" aria-live="polite"></div>
      </div>
    `;
  }

  function renderBreakdownSwitcher(activeStyle) {
    const options = [
      { value: "donut", label: "Donut" },
      { value: "line", label: "Line" },
      { value: "bars", label: "Bar" },
      { value: "column", label: "Column" },
      { value: "stacked", label: "Stacked Bar" },
    ];
    return `
      <div class="report-chart-switcher">
        ${options
          .map(
            (option) => `
              <button
                class="report-chart-switcher-button ${activeStyle === option.value ? "report-chart-switcher-button-active" : ""}"
                type="button"
                data-action="set-report-chart-style"
                data-style="${option.value}"
              >
                ${escapeHtml(option.label)}
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderBreakdownVisual(dataset, chartStyle, transactions) {
    const detailMap = new Map();
    lastBreakdownDataset = { dataset, detailMap };
    return renderBreakdownVisualWithMap(dataset, chartStyle, transactions, detailMap);
  }

  function renderBreakdownVisualWithMap(dataset, chartStyle, transactions, detailMap, indexPrefix = "") {
    if (chartStyle === "line") {
      return renderBreakdownLine(dataset, transactions, detailMap, indexPrefix);
    }
    if (chartStyle === "bars") {
      return renderBreakdownBars(dataset, detailMap, indexPrefix);
    }
    if (chartStyle === "column") {
      return renderBreakdownColumns(dataset, detailMap, indexPrefix);
    }
    if (chartStyle === "stacked") {
      return renderBreakdownStacked(transactions, detailMap, indexPrefix);
    }
    return renderBreakdownDonut(dataset, detailMap, indexPrefix);
  }

  function buildBreakdownLinePeriods(transactions) {
    const activeRange = getDateRange(uiState.reports.range);
    if (uiState.reports.range === "all") {
      const years = [...new Set(transactions.map((transaction) => String(transaction.date || "").slice(0, 4)).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      );
      return years.map((year) => ({
        key: year,
        label: year,
        start: `${year}-01-01`,
        end: `${year}-12-31`,
      }));
    }

    if (!activeRange.start || !activeRange.end) {
      return [];
    }

    const startDate = parseIsoDate(activeRange.start, 12);
    const endDate = parseIsoDate(activeRange.end, 12);
    const daySpan = Math.max(1, Math.floor((endDate - startDate) / 86400000) + 1);

    if (uiState.reports.range === "thisMonth" || uiState.reports.range === "last30" || daySpan <= 45) {
      const periods = [];
      const cursor = new Date(startDate);
      while (cursor <= endDate) {
        const iso = toLocalIsoDate(cursor);
        periods.push({
          key: iso,
          label:
            daySpan > 12
              ? cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : cursor.toLocaleDateString("en-US", { day: "numeric" }),
          start: iso,
          end: iso,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      return periods;
    }

    if (uiState.reports.range === "thisQuarter" || uiState.reports.range === "thisYear" || daySpan <= 550) {
      const periods = [];
      const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const finalMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      while (cursor <= finalMonth) {
        const monthStart = new Date(cursor);
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const periodStart = monthStart < startDate ? startDate : monthStart;
        const periodEnd = monthEnd > endDate ? endDate : monthEnd;
        periods.push({
          key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
          label: cursor.toLocaleDateString("en-US", { month: "short" }),
          start: toLocalIsoDate(periodStart),
          end: toLocalIsoDate(periodEnd),
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return periods;
    }

    const periods = [];
    for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); year += 1) {
      const yearStart = parseIsoDate(`${year}-01-01`, 12);
      const yearEnd = parseIsoDate(`${year}-12-31`, 12);
      periods.push({
        key: String(year),
        label: String(year),
        start: toLocalIsoDate(yearStart < startDate ? startDate : yearStart),
        end: toLocalIsoDate(yearEnd > endDate ? endDate : yearEnd),
      });
    }
    return periods;
  }

  function buildLinePointDetail(dataset, series, point, period) {
    const periodTotal = Number(point.periodTotal || 0);
    const periodShare = periodTotal ? ((point.value / periodTotal) * 100).toFixed(2) : "0.00";
    return {
      eyebrow: period.label,
      label: series.label,
      color: series.color,
      value: formatMoney(point.value, dataset.symbol),
      percent: `${periodShare}% of ${period.label}`,
      filters: point.filters || getBaseReportFilters(),
      drilldownKey: "",
      meta: [
        { label: "Entries", value: String(point.count || 0), action: "open-report-entries" },
        { label: "Period Total", value: formatMoney(periodTotal, dataset.symbol) },
      ],
    };
  }

  function buildBreakdownLineTicks(maxValue, symbol, paddingTop, chartHeight) {
    const tickValues = [maxValue, maxValue * (2 / 3), maxValue * (1 / 3), 0];
    return tickValues.map((value) => ({
      value,
      label: formatMoney(value, symbol),
      y: paddingTop + chartHeight - (Number(value || 0) / Math.max(maxValue, 1)) * chartHeight,
    }));
  }

  function buildSmoothSvgPath(points) {
    if (!Array.isArray(points) || !points.length) {
      return "";
    }
    if (points.length === 1) {
      return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    }
    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[index - 1] || points[index];
      const current = points[index];
      const next = points[index + 1];
      const afterNext = points[index + 2] || next;
      const controlPoint1X = current.x + (next.x - previous.x) / 6;
      const controlPoint1Y = current.y + (next.y - previous.y) / 6;
      const controlPoint2X = next.x - (afterNext.x - current.x) / 6;
      const controlPoint2Y = next.y - (afterNext.y - current.y) / 6;
      path += ` C ${controlPoint1X.toFixed(2)} ${controlPoint1Y.toFixed(2)}, ${controlPoint2X.toFixed(2)} ${controlPoint2Y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    }
    return path;
  }

  function buildBreakdownLineSeries(dataset, transactions, periods, periodTotals) {
    const baseFilters = getBaseReportFilters();
    const selectedTypes = getSelectedReportTypes();
    const categoryMap = new Map();

    transactions
      .filter((transaction) => transaction.type !== "transfer")
      .forEach((transaction) => {
        const category = getCategory(transaction.categoryId);
        const key = category?.id || `uncategorized-${transaction.type}`;
        const current = categoryMap.get(key) || {
          id: key,
          label: category?.name || "Uncategorized",
          color: category?.color || (transaction.type === "income" ? "#1ca866" : "#d35a5a"),
          type: category?.type || transaction.type,
          total: 0,
        };
        current.total += Number(transaction.amount || 0);
        categoryMap.set(key, current);
      });

    const categorySeries = [...categoryMap.values()]
      .sort((left, right) => right.total - left.total)
      .slice(0, Math.min(dataset.segments.length || 10, 10))
      .map((entry) => ({
        label: entry.label,
        color: entry.color,
        strokeWidth: 2.4,
        points: periods.map((period) => {
          const matching = transactions.filter(
            (transaction) =>
              transaction.type !== "transfer" &&
              (getCategory(transaction.categoryId)?.id || `uncategorized-${transaction.type}`) === entry.id &&
              transaction.date >= period.start &&
              transaction.date <= period.end
          );
          return {
            value: sumAmounts(matching),
            count: matching.length,
            filters: {
              ...baseFilters,
              type: entry.type,
              categoryId: entry.id.startsWith("uncategorized-") ? "" : entry.id,
              startDate: period.start,
              endDate: period.end,
            },
          };
        }),
      }))
      .filter((series) => series.points.some((point) => point.value > 0));

    const typeSeries =
      selectedTypes.length > 1 || (selectedTypes.length === 1 && selectedTypes[0] === "transfer")
        ? selectedTypes.map((type) => ({
            label: titleCase(type === "expense" ? "expenses" : type),
            color: type === "income" ? "#1ca866" : type === "expense" ? "#d35a5a" : "#2f86ff",
            strokeWidth: 4.6,
            points: periods.map((period) => {
              const matching = transactions.filter(
                (transaction) => transaction.type === type && transaction.date >= period.start && transaction.date <= period.end
              );
              return {
                value: sumAmounts(matching),
                count: matching.length,
                filters: {
                  ...baseFilters,
                  type,
                  startDate: period.start,
                  endDate: period.end,
                },
              };
            }),
          }))
        : [];

    const combined = [...typeSeries, ...categorySeries];
    combined.forEach((series) => {
      series.points.forEach((point, index) => {
        point.periodTotal = Number(periodTotals[index] || 0);
      });
    });
    return combined;
  }

  function renderBreakdownLine(dataset, transactions, detailMap, indexPrefix = "") {
    const periods = buildBreakdownLinePeriods(transactions);
    const selectedTypes = getSelectedReportTypes();
    if (!periods.length) {
      return `<div class="report-pie-visual-wrap report-pie-visual-wrap-wide">${renderEmpty("No timeline data is available for this filtered range yet.")}</div>`;
    }
    const periodTotals = periods.map((period) =>
      sumAmounts(transactions.filter((transaction) => transaction.date >= period.start && transaction.date <= period.end))
    );
    const series = buildBreakdownLineSeries(dataset, transactions, periods, periodTotals);
    if (!series.length) {
      return `<div class="report-pie-visual-wrap report-pie-visual-wrap-wide">${renderEmpty("No line data is available for this filtered range yet.")}</div>`;
    }
    const pointSpacing = periods.length > 24 ? 56 : periods.length > 12 ? 68 : 84;
    const width = Math.max(720, periods.length * pointSpacing);
    const isMobileViewport = typeof window !== "undefined" && window.matchMedia?.("(max-width: 720px)").matches;
    const height = isMobileViewport ? 320 : 430;
    const paddingLeft = 26;
    const paddingRight = 26;
    const paddingTop = 18;
    const paddingBottom = 28;
    const maxValue = Math.max(...series.flatMap((item) => item.points.map((point) => Number(point.value || 0))), 1);
    const chartHeight = height - paddingTop - paddingBottom;
    const chartWidth = width - paddingLeft - paddingRight;
    const xForIndex = (index) => paddingLeft + (index * chartWidth) / Math.max(periods.length - 1, 1);
    const yForValue = (value) => paddingTop + chartHeight - (Number(value || 0) / maxValue) * chartHeight;
    const yTicks = buildBreakdownLineTicks(maxValue, dataset.symbol, paddingTop, chartHeight);
    const axes = periods
      .map(
        (period, index) => `
          <span
            class="report-breakdown-line-axis-label"
            style="left:${((xForIndex(index) / width) * 100).toFixed(4)}%"
          >${escapeHtml(period.label)}</span>
        `
      )
      .join("");
    const gridLines = yTicks
      .map(
        (tick, index) => `
          <line
            x1="${paddingLeft}"
            y1="${tick.y.toFixed(2)}"
            x2="${width - paddingRight}"
            y2="${tick.y.toFixed(2)}"
            stroke="rgba(18, 59, 70, ${index === yTicks.length - 1 ? "0.18" : "0.10"})"
            stroke-width="${index === yTicks.length - 1 ? "1.15" : "1"}"
            stroke-dasharray="${index === yTicks.length - 1 ? "" : "4 6"}"
          ></line>
        `
      )
      .join("");

    const paths = series
      .map((item, seriesIndex) => {
        const pathPoints = item.points.map((point, index) => ({
          x: xForIndex(index),
          y: yForValue(point.value),
        }));
        const smoothPath = buildSmoothSvgPath(pathPoints);
        return `
          <path
            class="report-line-series ${item.strokeWidth > 4 ? "report-line-series-type" : "report-line-series-category"}"
            d="${smoothPath}"
            fill="none"
            stroke="${escapeHtml(item.color)}"
            stroke-width="${item.strokeWidth}"
            stroke-linecap="round"
            stroke-linejoin="round"
          ></path>
          ${item.points
            .map((point, pointIndex) => {
              const detailIndex = `${indexPrefix}line:${seriesIndex}:${pointIndex}`;
              detailMap.set(detailIndex, buildLinePointDetail(dataset, item, point, periods[pointIndex]));
              const pointX = xForIndex(pointIndex).toFixed(2);
              const pointY = yForValue(point.value).toFixed(2);
              return `
                <circle
                  class="report-line-point-visual ${item.strokeWidth > 4 ? "report-line-point-type" : ""}"
                  cx="${pointX}"
                  cy="${pointY}"
                  r="${item.strokeWidth > 4 ? 5.4 : 4.2}"
                  fill="${escapeHtml(item.color)}"
                ></circle>
                <circle
                  class="report-line-point-hit report-chart-hit"
                  cx="${pointX}"
                  cy="${pointY}"
                  r="${item.strokeWidth > 4 ? 14 : 12}"
                  fill="transparent"
                  stroke="transparent"
                  data-action="show-report-chart-tooltip"
                  data-index="${detailIndex}"
                ></circle>
              `;
            })
            .join("")}
        `;
      })
      .join("");

    return `
      <div class="report-pie-visual-wrap report-pie-visual-wrap-wide">
        <div class="report-breakdown-line-shell">
          <div class="report-breakdown-line-frame">
            <div class="report-breakdown-line-yaxis" style="height:${height}px">
              ${yTicks
                .map(
                  (tick) => `
                    <span class="report-breakdown-line-yaxis-label" style="top:${tick.y.toFixed(2)}px">
                      ${escapeHtml(tick.label)}
                    </span>
                  `
                )
                .join("")}
            </div>
            <div class="report-breakdown-line-viewport">
              <div class="report-breakdown-line-content" style="--line-chart-width:${width}px">
                <svg class="report-breakdown-line-chart" viewBox="0 0 ${width} ${height}" aria-label="${escapeHtml(dataset.title)} timeline">
                  ${gridLines}
                  <line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}" stroke="rgba(18, 59, 70, 0.16)" stroke-width="1"></line>
                  ${paths}
                </svg>
                <div class="report-breakdown-line-axis">${axes}</div>
              </div>
            </div>
          </div>
          ${
            selectedTypes.length > 1
              ? `<div class="report-breakdown-line-legend">
                  ${selectedTypes
                    .map((type) => {
                      const color = type === "income" ? "#1ca866" : type === "expense" ? "#d35a5a" : "#2f86ff";
                      return `<span class="meta-pill neutral report-line-chip"><span class="report-line-chip-swatch" style="background:${escapeHtml(color)}"></span>${escapeHtml(titleCase(type === "expense" ? "expenses" : type))}</span>`;
                    })
                    .join("")}
                </div>`
              : ""
          }
        </div>
      </div>
    `;
  }

  function renderBreakdownDonut(dataset, detailMap, indexPrefix = "") {
    const categoryGap = 2.6;
    let currentAngle = -90;
    const innerSegments = dataset.segments
      .map((segment, index) => {
        const sliceAngle = (segment.value / dataset.total) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + sliceAngle;
        const padding = Math.min(categoryGap / 2, sliceAngle / 3);
        const visibleStart = startAngle + padding;
        const visibleEnd = endAngle - padding;
        detailMap.set(`${indexPrefix}segment:${index}`, buildSegmentDetail(dataset, segment, dataset.title));
        currentAngle = endAngle;
        return `<path class="report-chart-slice report-chart-hit" d="${buildArcPath(110, 110, 92, visibleStart, visibleEnd, 24)}" fill="${escapeHtml(
          segment.color
        )}" data-action="show-report-chart-tooltip" data-index="${indexPrefix}segment:${index}"></path>`;
      })
      .join("");
    currentAngle = -90;
    const outerSegments = dataset.segments
      .map((segment, segmentIndex) => {
        const sliceAngle = (segment.value / dataset.total) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + sliceAngle;
        const padding = Math.min(categoryGap / 2, sliceAngle / 3);
        const visibleStart = startAngle + padding;
        const visibleEnd = endAngle - padding;
        const visibleSliceAngle = Math.max(visibleEnd - visibleStart, 0);
        currentAngle = endAngle;
        if (!Array.isArray(segment.accounts) || !segment.accounts.length) {
          return "";
        }
        let childAngle = visibleStart;
        return segment.accounts
          .map((account, accountIndex) => {
            const accountAngle = (account.value / segment.value) * visibleSliceAngle;
            const accountStart = childAngle;
            const accountEnd = childAngle + accountAngle;
            childAngle = accountEnd;
            detailMap.set(`${indexPrefix}account:${segmentIndex}:${accountIndex}`, buildAccountDetail(dataset, segment, account));
            return `<path class="report-chart-slice report-chart-slice-secondary report-chart-hit" d="${buildArcPath(
              110,
              110,
              106,
              accountStart,
              accountEnd,
              94
            )}" fill="${escapeHtml(account.color)}" data-action="show-report-chart-tooltip" data-index="${indexPrefix}account:${segmentIndex}:${accountIndex}"></path>`;
          })
          .join("");
      })
      .join("");
    return `
      <div class="report-pie-visual-wrap">
        <div class="report-breakdown-visual report-breakdown-visual-donut">
          <svg class="report-chart-svg" viewBox="0 0 220 220" aria-label="${escapeHtml(dataset.title)}">
            ${innerSegments}
            ${outerSegments}
          </svg>
          <div class="report-pie-center">
            <span>${escapeHtml(dataset.title)}</span>
            <strong>${formatMoney(dataset.total, dataset.symbol)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function renderBreakdownBars(dataset, detailMap, indexPrefix = "") {
    const maxValue = Math.max(...dataset.segments.map((segment) => segment.value), 1);
    return `
      <div class="report-pie-visual-wrap report-pie-visual-wrap-wide">
        <div class="report-breakdown-bars-shell">
          ${renderAmountScale(maxValue, dataset.symbol)}
          <div class="report-breakdown-bars">
          ${dataset.segments
            .map((segment, index) => {
              detailMap.set(`${indexPrefix}segment:${index}`, buildSegmentDetail(dataset, segment, dataset.title));
              return `
                <div class="report-breakdown-bar-group">
                  <button class="report-breakdown-bar-button report-chart-hit" type="button" data-action="show-report-chart-tooltip" data-index="${indexPrefix}segment:${index}">
                    <span class="report-breakdown-bar-label">${escapeHtml(segment.label)}</span>
                    <span class="report-breakdown-bar-track">
                      <span class="report-breakdown-bar-fill" style="width:${(segment.value / maxValue) * 100}%; background:${escapeHtml(
                        segment.color
                      )}"></span>
                    </span>
                  </button>
                  ${
                    Array.isArray(segment.accounts) && segment.accounts.length
                      ? `<div class="report-breakdown-bar-accounts" role="group" aria-label="${escapeHtml(segment.label)} account breakdown">
                          ${segment.accounts
                            .map((account, accountIndex) => {
                              const accountShare = segment.value > 0 ? (account.value / segment.value) * 100 : 0;
                              detailMap.set(`${indexPrefix}account:${index}:${accountIndex}`, buildAccountDetail(dataset, segment, account));
                              return `
                                <button
                                  class="report-breakdown-account-button report-chart-hit"
                                  type="button"
                                  data-action="show-report-chart-tooltip"
                                  data-index="${indexPrefix}account:${index}:${accountIndex}"
                                  aria-label="${escapeHtml(`${account.label} ${formatMoney(account.value, dataset.symbol)} ${accountShare.toFixed(2)}%`)}"
                                  style="width:${accountShare}%; background:${escapeHtml(account.color)}"
                                >
                                </button>
                              `;
                            })
                            .join("")}
                        </div>`
                      : ""
                  }
                </div>
              `;
            })
            .join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderBreakdownColumns(dataset, detailMap, indexPrefix = "") {
    const maxValue = Math.max(...dataset.segments.map((segment) => segment.value), 1);
    const columnWidth = Array.isArray(dataset.segments) && dataset.segments.length > 6 ? 72 : 88;
    const chartWidth = Math.max(560, dataset.segments.length * columnWidth);
    return `
      <div class="report-pie-visual-wrap report-pie-visual-wrap-wide">
        <div class="report-breakdown-columns-shell">
          ${renderAmountScale(maxValue, dataset.symbol)}
          <div class="report-breakdown-columns-viewport">
            <div class="report-breakdown-columns-content" style="--column-chart-width:${chartWidth}px">
              <div class="report-breakdown-columns">
              ${dataset.segments
                .map((segment, index) => {
                  detailMap.set(`${indexPrefix}segment:${index}`, buildSegmentDetail(dataset, segment, dataset.title));
                  return `
                    <div class="report-breakdown-column-group">
                      <div class="report-breakdown-column-cluster">
                        <button class="report-breakdown-column-button report-chart-hit" type="button" data-action="show-report-chart-tooltip" data-index="${indexPrefix}segment:${index}">
                          <span class="report-breakdown-column-fill" style="height:${(segment.value / maxValue) * 100}%; background:${escapeHtml(
                            segment.color
                          )}"></span>
                        </button>
                        ${
                          Array.isArray(segment.accounts) && segment.accounts.length
                            ? segment.accounts
                                .map((account, accountIndex) => {
                                  detailMap.set(`${indexPrefix}account:${index}:${accountIndex}`, buildAccountDetail(dataset, segment, account));
                                  return `
                                    <button class="report-breakdown-column-button report-breakdown-column-button-sub report-chart-hit" type="button" data-action="show-report-chart-tooltip" data-index="${indexPrefix}account:${index}:${accountIndex}">
                                      <span class="report-breakdown-column-fill" style="height:${(account.value / maxValue) * 100}%; background:${escapeHtml(
                                        account.color
                                      )}"></span>
                                    </button>
                                  `;
                                })
                                .join("")
                            : ""
                        }
                      </div>
                      <span class="report-breakdown-column-label">${escapeHtml(segment.label)}</span>
                    </div>
                  `;
                })
                .join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderBreakdownStacked(transactions, detailMap, indexPrefix = "") {
    const periods = buildStackedPeriods(transactions);
    if (!periods.length) {
      return `<div class="report-pie-visual-wrap report-pie-visual-wrap-wide">${renderEmpty("No stacked data is available for this filtered range yet.")}</div>`;
    }
    return `
      <div class="report-pie-visual-wrap report-pie-visual-wrap-wide">
        <div class="report-stacked-breakdown">
          ${periods
            .map(
              (period, periodIndex) => `
                <div class="report-stacked-row">
                  <div class="report-stacked-row-meta">
                    <strong>${escapeHtml(period.label)}</strong>
                    <span>${formatMoney(period.total, getPrimaryCurrencySymbol())}</span>
                  </div>
                  <div class="report-stacked-row-track">
                    ${period.segments
                      .map((segment, segmentIndex) => {
                        const segmentWidth = period.total > 0 ? (segment.value / period.total) * 100 : 0;
                        detailMap.set(`${indexPrefix}stack:${periodIndex}:${segmentIndex}`, buildStackedDetail(period, segment));
                        return `
                          <button
                            class="report-stacked-segment report-chart-hit"
                            type="button"
                            data-action="show-report-chart-tooltip"
                            data-index="${indexPrefix}stack:${periodIndex}:${segmentIndex}"
                            style="width:${segmentWidth}%; background:${escapeHtml(segment.color)}"
                          ></button>
                        `;
                      })
                      .join("")}
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function buildStackedPeriods(transactions) {
    const selectedTypes = getSelectedReportTypes();
    const activeRange = getDateRange(uiState.reports.range);
    if (uiState.reports.range === "custom") {
      const { start, end } = getDateRange("custom");
      if (!start || !end) {
        return [];
      }
      const startDate = parseIsoDate(start, 12);
      const endDate = parseIsoDate(end, 12);
      const daySpan = Math.max(1, Math.floor((endDate - startDate) / 86400000) + 1);
      if (daySpan <= 45) {
        const buckets = [];
        let cursor = new Date(startDate);
        let weekIndex = 1;
        while (cursor <= endDate) {
          const bucketStart = new Date(cursor);
          const bucketEnd = new Date(cursor);
          bucketEnd.setDate(bucketEnd.getDate() + 6);
          if (bucketEnd > endDate) {
            bucketEnd.setTime(endDate.getTime());
          }
          buckets.push(buildStackedPeriodBucket(transactions, bucketStart, bucketEnd, `Week ${weekIndex}`, selectedTypes));
          cursor.setDate(cursor.getDate() + 7);
          weekIndex += 1;
        }
        return buckets;
      }
      if (startDate.getFullYear() === endDate.getFullYear() && daySpan <= 366) {
        const buckets = [];
        let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const finalMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        while (cursor <= finalMonth) {
          const monthStart = new Date(cursor);
          const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
          buckets.push(
            buildStackedPeriodBucket(
              transactions,
              monthStart < startDate ? startDate : monthStart,
              monthEnd > endDate ? endDate : monthEnd,
              cursor.toLocaleDateString("en-US", { month: "short" }),
              selectedTypes
            )
          );
          cursor.setMonth(cursor.getMonth() + 1);
        }
        return buckets;
      }
      const buckets = [];
      for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); year += 1) {
        const yearStart = parseIsoDate(`${year}-01-01`, 12);
        const yearEnd = parseIsoDate(`${year}-12-31`, 12);
        buckets.push(
          buildStackedPeriodBucket(
            transactions,
            yearStart < startDate ? startDate : yearStart,
            yearEnd > endDate ? endDate : yearEnd,
            String(year),
            selectedTypes
          )
        );
      }
      return buckets;
    }
    if (uiState.reports.range === "thisMonth") {
      const startOfMonth = parseIsoDate(activeRange.start, 12);
      const endOfMonth = parseIsoDate(activeRange.end, 12);
      const weeks = [];
      let cursor = new Date(startOfMonth);
      while (cursor <= endOfMonth) {
        const weekStart = new Date(cursor);
        const weekEnd = new Date(cursor);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > endOfMonth) {
          weekEnd.setTime(endOfMonth.getTime());
        }
        weeks.push(buildStackedPeriodBucket(transactions, weekStart, weekEnd, `Week ${weeks.length + 1}`, selectedTypes));
        cursor.setDate(cursor.getDate() + 7);
      }
      return weeks;
    }
    if (uiState.reports.range === "last30") {
      const { start, end } = getDateRange("last30");
      const buckets = [];
      let cursor = parseIsoDate(start, 12);
      let weekIndex = 1;
      while (toLocalIsoDate(cursor) <= end) {
        const bucketStart = new Date(cursor);
        const bucketEnd = new Date(cursor);
        bucketEnd.setDate(bucketEnd.getDate() + 6);
        buckets.push(buildStackedPeriodBucket(transactions, bucketStart, bucketEnd, `Week ${weekIndex}`, selectedTypes));
        cursor.setDate(cursor.getDate() + 7);
        weekIndex += 1;
      }
      return buckets;
    }
    if (uiState.reports.range === "thisQuarter") {
      const startDate = parseIsoDate(activeRange.start, 12);
      return Array.from({ length: 3 }, (_, offset) => {
        const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + offset, 1);
        const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
        return buildStackedPeriodBucket(
          transactions,
          `${key}-01`,
          `${key}-${String(endDate.getDate()).padStart(2, "0")}`,
          monthDate.toLocaleDateString("en-US", { month: "short" }),
          selectedTypes
        );
      });
    }
    if (uiState.reports.range === "all") {
      const years = [...new Set(transactions.map((transaction) => String(transaction.date || "").slice(0, 4)).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      );
      return years
        .map((year) => buildStackedPeriodBucket(transactions, `${year}-01-01`, `${year}-12-31`, year, selectedTypes))
        .filter((period) => period.segments.length);
    }
    if (uiState.reports.range === "thisYear") {
      const startDate = parseIsoDate(activeRange.start, 12);
      return Array.from({ length: 12 }, (_, monthIndex) => {
        const monthDate = new Date(startDate.getFullYear(), monthIndex, 1);
        const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
        const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        return buildStackedPeriodBucket(
          transactions,
          `${key}-01`,
          `${key}-${String(endDate.getDate()).padStart(2, "0")}`,
          monthDate.toLocaleDateString("en-US", { month: "short" }),
          selectedTypes
        );
      });
    }
    return getTrailingMonths(12)
      .map((month) => {
        const start = `${month.key}-01`;
        const endDate = new Date(month.year, month.month + 1, 0);
        const end = `${month.key}-${String(endDate.getDate()).padStart(2, "0")}`;
        return buildStackedPeriodBucket(transactions, start, end, month.label, selectedTypes);
      })
      .filter((period) => period.segments.length);
  }

  function buildStackedPeriodBucket(transactions, start, end, label, selectedTypes) {
    const startIso = typeof start === "string" ? start : toLocalIsoDate(start);
    const endIso = typeof end === "string" ? end : toLocalIsoDate(end);
    const baseFilters = getBaseReportFilters();
    const categoryMap = new Map();
    transactions
      .filter((transaction) => transaction.date >= startIso && transaction.date <= endIso && selectedTypes.includes(transaction.type))
      .forEach((transaction) => {
        if (transaction.type === "transfer") {
          const currentTransfer = categoryMap.get("transfer") || {
            label: "Transfers",
            color: "#2f86ff",
            value: 0,
            count: 0,
            filters: {
              ...baseFilters,
              type: "transfer",
              startDate: startIso,
              endDate: endIso,
            },
          };
          currentTransfer.value += Number(transaction.amount || 0);
          currentTransfer.count += 1;
          currentTransfer.filters = mergeDateSpan(currentTransfer.filters, transaction.date);
          categoryMap.set("transfer", currentTransfer);
          return;
        }
        const category = getCategory(transaction.categoryId);
        const key = category?.id || `uncategorized-${transaction.type}`;
        const current = categoryMap.get(key) || {
          label: category?.name || "Uncategorized",
          color: category?.color || (transaction.type === "income" ? "#1ca866" : "#d35a5a"),
          value: 0,
          count: 0,
          filters: {
            ...baseFilters,
            type: category?.type || transaction.type,
            categoryId: category?.id || "",
            startDate: startIso,
            endDate: endIso,
          },
        };
        current.value += Number(transaction.amount || 0);
        current.count += 1;
        current.filters = mergeDateSpan(current.filters, transaction.date);
        categoryMap.set(key, current);
      });
    const segments = [...categoryMap.values()].sort((a, b) => b.value - a.value);
    return {
      label,
      total: segments.reduce((sum, segment) => sum + segment.value, 0),
      segments,
    };
  }

  function getTransactionsMatchingReportFilters(filters) {
    return state.transactions.filter((transaction) => {
      if (filters.type && filters.type !== "all" && transaction.type !== filters.type) {
        return false;
      }
      if (filters.accountId) {
        const matchesAccount =
          transaction.accountId === filters.accountId ||
          transaction.fromAccountId === filters.accountId ||
          transaction.toAccountId === filters.accountId;
        if (!matchesAccount) {
          return false;
        }
      }
      if (filters.categoryId && transaction.categoryId !== filters.categoryId) {
        return false;
      }
      if (filters.startDate && transaction.date < filters.startDate) {
        return false;
      }
      if (filters.endDate && transaction.date > filters.endDate) {
        return false;
      }
      return true;
    });
  }

  function buildSubcategoryDrilldownDataset(filters) {
    if (!filters?.categoryId) {
      return null;
    }
    const category = getCategory(filters.categoryId);
    const sourceTransactions = getTransactionsMatchingReportFilters(filters).filter(
      (transaction) => transaction.categoryId === filters.categoryId && transaction.type !== "transfer"
    );
    if (!sourceTransactions.length) {
      return null;
    }
    const subcategoryMap = new Map();
    sourceTransactions.forEach((transaction, index) => {
      const subcategory = String(transaction.subcategory || "").trim() || "General";
      const key = subcategory.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `subcategory-${index}`;
      const current = subcategoryMap.get(key) || {
        label: subcategory,
        value: 0,
        color: drilldownPalette[subcategoryMap.size % drilldownPalette.length],
        count: 0,
        accounts: new Map(),
        filters: {
          ...filters,
          startDate: filters.startDate || "",
          endDate: filters.endDate || "",
        },
      };
      current.value += Number(transaction.amount || 0);
      current.count += 1;
      current.filters = mergeDateSpan(
        {
          ...current.filters,
          subcategory,
        },
        transaction.date
      );
      const account = getAccount(transaction.accountId);
      const accountKey = transaction.accountId || account?.name || "unknown-account";
      const accountCurrent = current.accounts.get(accountKey) || {
        label: account?.name || "Unknown Account",
        value: 0,
        color: account?.color || "#5f7380",
        count: 0,
        filters: {
          ...current.filters,
          accountId: account?.id || transaction.accountId || "",
        },
      };
      accountCurrent.value += Number(transaction.amount || 0);
      accountCurrent.count += 1;
      accountCurrent.filters = mergeDateSpan(accountCurrent.filters, transaction.date);
      current.accounts.set(accountKey, accountCurrent);
      subcategoryMap.set(key, current);
    });
    return buildPieDataset(
      [...subcategoryMap.values()].map((row) => ({
        ...row,
        accounts: [...row.accounts.values()].sort((a, b) => b.value - a.value),
      })),
      `${category?.name || "Category"} Subcategories`,
      `Subcategory mix for ${category?.name || "selected category"}`,
      getPrimaryCurrencySymbol()
    );
  }

  function renderReportDrilldown(index) {
    const topDetail = lastBreakdownDataset?.detailMap?.get(index);
    if (!topDetail?.drilldownFilters) {
      lastDrilldownDataset = null;
      return "";
    }
    const drilldownDataset = buildSubcategoryDrilldownDataset(topDetail.drilldownFilters);
    if (!drilldownDataset?.segments?.length) {
      lastDrilldownDataset = null;
      return "";
    }
    const detailMap = new Map();
    lastDrilldownDataset = { dataset: drilldownDataset, detailMap };
    const chartStyle = uiState.reports.chartStyle || "donut";
    const chart = renderBreakdownVisualWithMap(
      drilldownDataset,
      chartStyle,
      getTransactionsMatchingReportFilters(topDetail.drilldownFilters),
      detailMap,
      DRILLDOWN_PREFIX
    );
    return `
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">Subcategories</p>
          <h3>${escapeHtml(drilldownDataset.title)}</h3>
        </div>
        <span class="meta-pill neutral">${escapeHtml(drilldownDataset.subtitle)}</span>
      </div>
      <div class="report-pie-layout report-pie-layout-drilldown">
        ${chart}
        <div class="report-pie-legend">
          ${drilldownDataset.segments
            .map(
              (segment, index) => `
                <button class="report-pie-legend-item report-legend-button" type="button" data-action="open-report-segment" data-index="${DRILLDOWN_PREFIX}segment:${index}">
                  <div class="report-pie-legend-main">
                    <span class="report-pie-swatch" style="background:${escapeHtml(segment.color)}"></span>
                    <strong>${escapeHtml(segment.label)}</strong>
                  </div>
                  <div class="report-pie-legend-meta">
                    <span>${formatMoney(segment.value, drilldownDataset.symbol)}</span>
                    <span>${segment.percent}%</span>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
        <div class="report-chart-tooltip hidden" aria-live="polite"></div>
      </div>
    `;
  }

  function buildSegmentDetail(dataset, segment, eyebrow) {
    return {
      eyebrow,
      label: segment.label,
      color: segment.color,
      value: formatMoney(segment.value, dataset.symbol),
      percent: `${segment.percent}% share`,
      filters: segment.filters || getBaseReportFilters(),
      drilldownKey: segment.canDrilldown ? `segment:${segment.index ?? 0}` : "",
      drilldownFilters: segment.canDrilldown ? segment.filters : null,
      meta: [
        { label: "Entries", value: String(segment.count || 0), action: "open-report-entries" },
      ],
    };
  }

  function buildAccountDetail(dataset, segment, account) {
    const categoryShare = segment.value ? ((account.value / segment.value) * 100).toFixed(2) : "0.00";
    const totalShare = dataset.total ? ((account.value / dataset.total) * 100).toFixed(2) : "0.00";
    return {
      eyebrow: segment.label,
      label: account.label,
      color: account.color,
      value: formatMoney(account.value, dataset.symbol),
      percent: `${categoryShare}% of ${segment.label}`,
      filters: account.filters || segment.filters || getBaseReportFilters(),
      drilldownKey: "",
      meta: [
        { label: "Overall Share", value: `${totalShare}%` },
        { label: "Entries", value: String(account.count || 0), action: "open-report-entries" },
      ],
    };
  }

  function buildStackedDetail(period, segment) {
    const periodShare = period.total ? ((segment.value / period.total) * 100).toFixed(2) : "0.00";
    return {
      eyebrow: period.label,
      label: segment.label,
      color: segment.color,
      value: formatMoney(segment.value, getPrimaryCurrencySymbol()),
      percent: `${periodShare}% of ${period.label}`,
      filters: segment.filters || getBaseReportFilters(),
      drilldownKey: "",
      meta: [
        { label: "Entries", value: String(segment.count || 0), action: "open-report-entries" },
        { label: "Period Total", value: formatMoney(period.total, getPrimaryCurrencySymbol()) },
      ],
    };
  }

  function getCategoryRankingRows(transactions, type) {
    const map = new Map();
    transactions
      .filter((transaction) => transaction.type === type)
      .forEach((transaction) => {
        const category = getCategory(transaction.categoryId);
        const key = category?.id || "uncategorized";
        const current = map.get(key) || {
          id: key,
          label: category?.name || "Uncategorized",
          color: category?.color || (type === "income" ? "#1ca866" : "#ffb84d"),
          icon: category?.icon || (type === "income" ? "briefcase" : "cart"),
          value: 0,
          count: 0,
        };
        current.value += Number(transaction.amount || 0);
        current.count += 1;
        map.set(key, current);
      });

    const rows = [...map.values()]
      .filter((row) => Number(row.value || 0) >= 1)
      .sort((a, b) => b.value - a.value);
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return rows.map((row) => ({
      ...row,
      percent: total ? ((row.value / total) * 100).toFixed(1) : "0.0",
    }));
  }

  function renderCategoryRankingItem(row, rank) {
    const baseSymbol = getPrimaryCurrencySymbol();
    const barWidth = Math.max(12, Math.min(100, Number(row.percent)));
    return `
      <article class="ranking-item">
        <div class="ranking-item-main">
          <div class="ranking-icon" style="--rank-color:${escapeHtml(row.color)}">${renderCategoryIcon(row.icon, iconRegistry.cart)}</div>
          <div class="ranking-copy">
            <div class="ranking-topline">
              <strong>${rank} ${escapeHtml(row.label)}</strong>
              <span>${escapeHtml(row.percent)}%</span>
            </div>
            <div class="ranking-bar">
              <span style="width:${barWidth}%; background:${escapeHtml(row.color)}"></span>
            </div>
          </div>
        </div>
        <div class="ranking-meta">
          <strong>${formatMoney(row.value, baseSymbol)}</strong>
          <span>${row.count} ${row.count === 1 ? "bill" : "bills"}</span>
        </div>
      </article>
    `;
  }

  function renderCategoryRankingComparisonItem(currentRow, comparisonRow, rank, compact = false) {
    const baseSymbol = getPrimaryCurrencySymbol();
    const previousValue = Number(comparisonRow?.value || 0);
    const comparisonPercent = Number(comparisonRow?.percent || 0);
    const barWidth = Math.max(8, Math.min(100, comparisonPercent || 0));
    const comparisonCount = Number(comparisonRow?.count || 0);
    return `
      <article class="ranking-item ranking-item-compare ${compact ? "ranking-item-compare-compact" : ""}">
        <div class="ranking-item-main">
          <div class="ranking-icon" style="--rank-color:${escapeHtml(currentRow.color)}">${renderCategoryIcon(currentRow.icon, iconRegistry.cart)}</div>
          <div class="ranking-copy">
            <div class="ranking-topline">
              <strong>${rank} ${escapeHtml(comparisonRow?.label || currentRow.label)}</strong>
              <span>${escapeHtml((comparisonRow?.percent ?? "0.0").toString())}%</span>
            </div>
            <div class="ranking-bar">
              <span style="width:${barWidth}%; background:${escapeHtml(currentRow.color)}"></span>
            </div>
          </div>
        </div>
        <div class="ranking-meta">
          <strong>${formatMoney(previousValue, baseSymbol)}</strong>
          <span>${comparisonCount} ${comparisonCount === 1 ? "bill" : "bills"}</span>
        </div>
      </article>
    `;
  }

  function renderMobileCategoryRankingPair(row, comparisonRow, rank) {
    return `
      <div class="ranking-mobile-pair">
        ${renderCategoryRankingItem(row, rank)}
        <div class="ranking-mobile-previous">
          ${renderCategoryRankingComparisonItem(row, comparisonRow, rank, true)}
        </div>
      </div>
    `;
  }

  function renderCategoryRanking(transactions) {
    const selectedTypes = getSelectedReportTypes();
    if (selectedTypes.length === 1 && selectedTypes[0] === "transfer") {
      return `
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Ranking</p>
            <h3>Category Ranking</h3>
          </div>
          <span class="meta-pill neutral">Transfers only</span>
        </div>
        ${renderEmpty("Category ranking is unavailable for transfer-only reports.")}
      `;
    }

    const targetType = selectedTypes.includes("expense") ? "expense" : "income";
    const rows = getCategoryRankingRows(transactions, targetType);
    const previousRange = getPreviousReportRangeMeta();
    if (!rows.length) {
      return `
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Ranking</p>
            <h3>Category Ranking</h3>
          </div>
          <span class="meta-pill neutral">${escapeHtml(titleCase(targetType))}</span>
        </div>
        ${renderEmpty(`No ${targetType} categories available for this report selection.`)}
      `;
    }

    const previousRows = previousRange
      ? getCategoryRankingRows(getTransactionsForReportWindow(previousRange.start, previousRange.end), targetType)
      : [];
    const previousRowsMap = new Map(previousRows.map((row) => [row.id, row]));
    const comparisonItems = rows.map((row, index) => renderCategoryRankingComparisonItem(row, previousRowsMap.get(row.id) || null, index + 1, false));
    const mobilePairs = rows.map((row, index) => renderMobileCategoryRankingPair(row, previousRowsMap.get(row.id) || null, index + 1));

    return `
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">Ranking</p>
          <h3>Category Ranking</h3>
        </div>
        <span class="meta-pill neutral">${escapeHtml(titleCase(targetType))}</span>
      </div>
      <div class="ranking-layout ranking-layout-desktop">
        <section class="ranking-panel ranking-panel-current">
          <div class="ranking-panel-header">
            <div>
              <p class="eyebrow">Current Period</p>
              <h4>Category Ranking</h4>
            </div>
          </div>
          <div class="ranking-list">
            ${rows.map((row, index) => renderCategoryRankingItem(row, index + 1)).join("")}
          </div>
        </section>
        <aside class="ranking-panel ranking-panel-last-period">
          <div class="ranking-side-header">
            <div>
              <p class="eyebrow">Last Period</p>
              <h4>${escapeHtml(previousRange?.label || "No comparison")}</h4>
            </div>
          </div>
          ${
            previousRange
              ? `<div class="ranking-list ranking-list-compare">${comparisonItems.join("")}</div>`
              : renderEmpty("Last Period comparison is unavailable for All Time.")
          }
        </aside>
      </div>
      <div class="ranking-layout-mobile">
        ${
          previousRange
            ? `<div class="ranking-list ranking-list-mobile">${mobilePairs.join("")}</div>`
            : `<div class="ranking-list ranking-list-mobile">${rows.map((row, index) => renderCategoryRankingItem(row, index + 1)).join("")}</div>`
        }
      </div>
    `;
  }

  function buildPieDataset(rows, title, subtitle, symbol) {
    const cleaned = rows
      .filter((row) => Number(row.value || 0) > 0)
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
    if (!cleaned.length) {
      return { title, subtitle, symbol, total: 0, segments: [] };
    }

    const topRows = cleaned.slice(0, 10).map((row, index) => ({
      index,
      label: row.label,
      value: Number(row.value || 0),
      color: row.color || "#00a6c7",
      count: Number(row.count || 0),
      canDrilldown: Boolean(row.canDrilldown),
      filters: row.filters || null,
      accounts: Array.isArray(row.accounts) ? row.accounts : [],
    }));

    const total = topRows.reduce((sum, row) => sum + row.value, 0);
    return {
      title,
      subtitle,
      symbol,
      total,
      segments: topRows.map((row) => ({
        ...row,
        percent: Math.max(1, Math.round((row.value / total) * 100)),
      })),
    };
  }

  function buildArcPath(cx, cy, outerRadius, startAngle, endAngle, innerRadius = 0) {
    const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
    const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    if (!innerRadius) {
      return [
        `M ${cx} ${cy}`,
        `L ${startOuter.x} ${startOuter.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`,
        "Z",
      ].join(" ");
    }
    const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
    const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);
    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`,
      `L ${startInner.x} ${startInner.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${endInner.x} ${endInner.y}`,
      "Z",
    ].join(" ");
  }

  function polarToCartesian(cx, cy, radius, angleInDegrees) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleInRadians),
      y: cy + radius * Math.sin(angleInRadians),
    };
  }

  function getReportChartSegmentDetail(index) {
    const detailMap = index.startsWith(DRILLDOWN_PREFIX) ? lastDrilldownDataset?.detailMap : lastBreakdownDataset?.detailMap;
    return detailMap?.get(index) || null;
  }

  function renderAccountBreakdown(transactions) {
    const map = new Map();
    transactions.forEach((transaction) => {
      if (transaction.type === "transfer") {
        const from = getAccount(transaction.fromAccountId)?.name || "Unknown";
        const to = getAccount(transaction.toAccountId)?.name || "Unknown";
        const key = `transfer:${transaction.fromAccountId || from}:${transaction.toAccountId || to}`;
        const current = map.get(key) || { label: `${from} -> ${to}`, value: 0, color: "#2f86ff" };
        current.value += Number(transaction.amount || 0);
        map.set(key, current);
        return;
      }
      const account = getAccount(transaction.accountId);
      const key = transaction.accountId || "unknown-account";
      const current = map.get(key) || {
        label: account?.name || "Unknown Account",
        value: 0,
        color: account?.color || "#00a6c7",
      };
      current.value += Number(transaction.amount || 0);
      map.set(key, current);
    });
    const rows = [...map.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 6);
    if (!rows.length) {
      return renderEmpty("No account activity available for the selected filters.");
    }
    const max = Math.max(...rows.map((row) => row[1].value), 1);
    return rows
      .map(([key, row]) =>
        renderBarItem(
          row.label,
          row.value,
          max,
          renderInlineSparkline(
            buildMonthlySeries(
              transactions.filter((transaction) => {
                if (key.startsWith("transfer:")) {
                  const transferKey = `transfer:${transaction.fromAccountId || (getAccount(transaction.fromAccountId)?.name || "Unknown")}:${transaction.toAccountId || (getAccount(transaction.toAccountId)?.name || "Unknown")}`;
                  return transaction.type === "transfer" && transferKey === key;
                }
                return transaction.type !== "transfer" && (transaction.accountId || "unknown-account") === key;
              }),
              (transaction) => transaction.amount || 0
            ),
            row.color
          ),
          row.color
        )
      )
      .join("");
  }

  function renderProjectTable(transactions) {
    const map = new Map();
    transactions.forEach((transaction) => {
      const tags = Array.isArray(transaction.tags)
        ? transaction.tags
        : String(transaction.tags || "")
            .split(",")
            .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
            .filter(Boolean);
      tags.forEach((tag) => {
        const key = `tag:${tag}`;
        const current = map.get(key) || { label: `#${tag}`, value: 0, color: "#00a6c7" };
        current.value += Number(transaction.amount || 0);
        map.set(key, current);
      });
      if (transaction.project) {
        const key = `project:${transaction.project}`;
        const current = map.get(key) || { label: transaction.project, value: 0, color: "#19c6a7" };
        current.value += Number(transaction.amount || 0);
        map.set(key, current);
      }
    });
    const rows = [...map.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 8);
    if (!rows.length) {
      return renderEmpty("Use tags and projects to unlock deeper reporting.");
    }
    const max = Math.max(...rows.map((row) => row[1].value), 1);
    return rows
      .map(
        ([key, row]) => `
          <div class="mini-row">
            <div class="bar-meta">
              <strong>${escapeHtml(row.label)}</strong>
              <span>${formatCurrency(row.value)}</span>
            </div>
            <div class="report-row-graph">
              ${renderInlineSparkline(
                buildMonthlySeries(
                  transactions.filter((transaction) =>
                    key.startsWith("tag:")
                      ? (
                          Array.isArray(transaction.tags)
                            ? transaction.tags
                            : String(transaction.tags || "")
                                .split(",")
                                .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
                                .filter(Boolean)
                        ).includes(key.replace("tag:", ""))
                      : transaction.project === key.replace("project:", "")
                  ),
                  (transaction) => transaction.amount || 0
                ),
                row.color
              )}
              <div class="bar-fill">
                <span style="width:${(row.value / max) * 100}%; background:${escapeHtml(row.color)}"></span>
              </div>
            </div>
          </div>
        `
      )
      .join("");
  }

  function renderInsights(transactions) {
    if (!transactions.length) {
      return renderEmpty("Insights will appear as soon as transactions are recorded.");
    }
    const sortedExpenses = transactions.filter((transaction) => transaction.type === "expense").sort((a, b) => b.amount - a.amount);
    const topExpense = sortedExpenses[0];
    const latest = [...transactions].sort(
      (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    )[0];
    const byPayee = new Map();
    transactions.forEach((transaction) => {
      if (transaction.counterparty) {
        byPayee.set(transaction.counterparty, (byPayee.get(transaction.counterparty) || 0) + Number(transaction.amount || 0));
      }
    });
    const topCounterparty = [...byPayee.entries()].sort((a, b) => b[1] - a[1])[0];

    return [
      renderInsightSummary([
        topExpense ? { label: "Largest Expense", value: Number(topExpense.amount || 0), display: formatCurrency(topExpense.amount), color: "#d35a5a" } : null,
        latest ? { label: "Latest Entry", value: Number(latest.amount || 0), display: formatCurrency(latest.amount), color: "#00a6c7" } : null,
        topCounterparty
          ? { label: "Top Counterparty", value: Number(topCounterparty[1] || 0), display: formatCurrency(topCounterparty[1]), color: "#19c6a7" }
          : null,
      ].filter(Boolean)),
      topExpense
        ? insightCard(
            "Largest Expense",
            `${formatCurrency(topExpense.amount)} in ${getCategory(topExpense.categoryId)?.name || "Uncategorized"} on ${topExpense.date}`
          )
        : "",
      latest ? insightCard("Latest Activity", `${titleCase(latest.type)} on ${latest.date} for ${formatCurrency(latest.amount)}`) : "",
      topCounterparty ? insightCard("Top Counterparty", `${escapeHtml(topCounterparty[0])} with ${formatCurrency(topCounterparty[1])}`) : "",
      insightCard("Voice Workflow", "Dictation pre-fills the transaction form so missing accounting details can be confirmed before saving."),
    ].join("");
  }

  function metricCard(label, value, note, chart = "") {
    return `
      <article class="metric-card">
        <p class="eyebrow">${escapeHtml(label)}</p>
        <strong>${escapeHtml(value)}</strong>
        <p class="supporting-text">${escapeHtml(note)}</p>
        ${chart}
      </article>
    `;
  }

  function renderBarItem(label, value, max, chart = "", color = "") {
    const baseSymbol = getPrimaryCurrencySymbol();
    return `
      <div class="bar-item">
        <div class="bar-meta">
          <strong>${escapeHtml(label)}</strong>
          <span>${formatMoney(value, baseSymbol)}</span>
        </div>
        ${chart ? `<div class="report-row-graph">${chart}</div>` : ""}
        <div class="bar-fill"><span style="width:${(value / max) * 100}%; ${color ? `background:${escapeHtml(color)}` : ""}"></span></div>
      </div>
    `;
  }

  return {
    renderReports,
    getBudgetStatus,
    getReportChartSegmentDetail,
    renderReportDrilldown,
  };
}
