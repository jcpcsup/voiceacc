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
  } = api;
  let lastBreakdownDataset = null;

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
    const target = new Date(`${date}T00:00:00`);
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
    const rows = [...map.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 6);
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
          };
          current.value += Number(transaction.amount || 0);
          current.count += 1;
          transferMap.set(key, current);
        });
      return buildPieDataset([...transferMap.values()], "Transfer Routes", "Selected transfers", symbol);
    }

    if (selectedTypes.length === 1 && (selectedTypes[0] === "income" || selectedTypes[0] === "expense")) {
      const categoryMap = new Map();
      const reportType = selectedTypes[0];
      const fallbackColor = reportType === "income" ? "#1ca866" : "#d35a5a";
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
          };
          current.value += Number(transaction.amount || 0);
          current.count += 1;
          categoryMap.set(key, current);
        });
      return buildPieDataset(
        [...categoryMap.values()],
        reportType === "income" ? "Income Mix" : "Expense Mix",
        reportType === "income" ? "Selected income categories" : "Selected expense categories",
        symbol
      );
    }

    const typeSegments = selectedTypes
      .map((type) => ({
        label: titleCase(type === "expense" ? "expenses" : type),
        value: sumAmounts(transactions.filter((transaction) => transaction.type === type)),
        count: transactions.filter((transaction) => transaction.type === type).length,
        color: type === "income" ? "#1ca866" : type === "expense" ? "#d35a5a" : "#2f86ff",
      }))
      .filter((segment) => segment.value > 0);

    return buildPieDataset(typeSegments, "Type Mix", "Selected report totals", symbol);
  }

  function renderReportBreakdown(transactions) {
    const dataset = getReportBreakdownDataset(transactions);
    lastBreakdownDataset = dataset;
    const chartStyle = uiState.reports.chartStyle || "pie";
    if (!dataset.segments.length || dataset.total <= 0) {
      return `
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Distribution</p>
            <h3>Filtered Breakdown</h3>
          </div>
        </div>
        ${renderBreakdownSwitcher(chartStyle)}
        ${renderEmpty("No filtered values available for a pie chart yet.")}
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
        ${renderBreakdownVisual(dataset, chartStyle)}
        <div class="report-pie-legend">
          ${dataset.segments
            .map(
              (segment, index) => `
                <button class="report-pie-legend-item report-legend-button" type="button" data-action="open-report-segment" data-index="${index}">
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
      </div>
    `;
  }

  function renderBreakdownSwitcher(activeStyle) {
    const options = [
      { value: "pie", label: "Pie" },
      { value: "donut", label: "Donut" },
      { value: "polar", label: "Polar" },
      { value: "bars", label: "Bars" },
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

  function renderBreakdownVisual(dataset, chartStyle) {
    if (chartStyle === "bars") {
      return renderBreakdownBars(dataset);
    }
    if (chartStyle === "polar") {
      return renderBreakdownPolar(dataset);
    }
    return renderBreakdownCircular(dataset, chartStyle === "donut");
  }

  function renderBreakdownCircular(dataset, isDonut) {
    let currentAngle = -90;
    const outerRadius = 100;
    const innerRadius = isDonut ? 46 : 0;
    const segmentsMarkup = dataset.segments
      .map((segment, index) => {
        const sliceAngle = (segment.value / dataset.total) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + sliceAngle;
        currentAngle = endAngle;
        return `<path class="report-chart-slice" d="${buildArcPath(110, 110, outerRadius, startAngle, endAngle, innerRadius)}" fill="${escapeHtml(
          segment.color
        )}" data-action="open-report-segment" data-index="${index}"></path>`;
      })
      .join("");
    return `
      <div class="report-pie-visual-wrap">
        <div class="report-breakdown-visual ${isDonut ? "report-breakdown-visual-donut" : "report-breakdown-visual-pie"}">
          <svg class="report-chart-svg" viewBox="0 0 220 220" aria-label="${escapeHtml(dataset.title)}">
            ${segmentsMarkup}
          </svg>
          <div class="report-pie-center">
            <span>${escapeHtml(dataset.title)}</span>
            <strong>${formatMoney(dataset.total, dataset.symbol)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function renderBreakdownPolar(dataset) {
    const maxValue = Math.max(...dataset.segments.map((segment) => segment.value), 1);
    const angleStep = 360 / dataset.segments.length;
    const markup = dataset.segments
      .map((segment, index) => {
        const startAngle = -90 + index * angleStep;
        const endAngle = startAngle + angleStep - 4;
        const radius = 42 + (segment.value / maxValue) * 58;
        return `<path class="report-chart-slice" d="${buildArcPath(110, 110, radius, startAngle, endAngle, 28)}" fill="${escapeHtml(
          segment.color
        )}" data-action="open-report-segment" data-index="${index}"></path>`;
      })
      .join("");
    return `
      <div class="report-pie-visual-wrap">
        <div class="report-breakdown-visual report-breakdown-visual-polar">
          <svg class="report-chart-svg" viewBox="0 0 220 220" aria-label="${escapeHtml(dataset.title)}">
            ${markup}
          </svg>
          <div class="report-pie-center">
            <span>${escapeHtml(dataset.title)}</span>
            <strong>${formatMoney(dataset.total, dataset.symbol)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function renderBreakdownBars(dataset) {
    const maxValue = Math.max(...dataset.segments.map((segment) => segment.value), 1);
    return `
      <div class="report-pie-visual-wrap">
        <div class="report-breakdown-bars">
          ${dataset.segments
            .map(
              (segment, index) => `
                <button class="report-breakdown-bar-button" type="button" data-action="open-report-segment" data-index="${index}">
                  <span class="report-breakdown-bar-label">${escapeHtml(segment.label)}</span>
                  <span class="report-breakdown-bar-track">
                    <span class="report-breakdown-bar-fill" style="width:${(segment.value / maxValue) * 100}%; background:${escapeHtml(
                      segment.color
                    )}"></span>
                  </span>
                </button>
              `
            )
            .join("")}
        </div>
      </div>
    `;
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

    const rows = [...map.values()].sort((a, b) => b.value - a.value).slice(0, 5);
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
          <div class="ranking-icon" style="--rank-color:${escapeHtml(row.color)}">${iconRegistry[row.icon] || iconRegistry.cart}</div>
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

    return `
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">Ranking</p>
          <h3>Category Ranking</h3>
        </div>
        <span class="meta-pill neutral">${escapeHtml(titleCase(targetType))}</span>
      </div>
      <div class="ranking-list">
        ${rows.map((row, index) => renderCategoryRankingItem(row, index + 1)).join("")}
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

    const topRows = cleaned.slice(0, 5).map((row) => ({
      label: row.label,
      value: Number(row.value || 0),
      color: row.color || "#00a6c7",
      count: Number(row.count || 0),
    }));
    const remainder = cleaned.slice(5).reduce((sum, row) => sum + Number(row.value || 0), 0);
    const remainderCount = cleaned.slice(5).reduce((sum, row) => sum + Number(row.count || 0), 0);
    if (remainder > 0) {
      topRows.push({
        label: "Others",
        value: remainder,
        color: "#8aa8b3",
        count: remainderCount,
      });
    }

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
    const dataset = lastBreakdownDataset;
    const segment = dataset?.segments?.[index];
    if (!segment || !dataset) {
      return null;
    }
    return {
      eyebrow: dataset.title,
      label: segment.label,
      color: segment.color,
      value: formatMoney(segment.value, dataset.symbol),
      percent: `${segment.percent}% share`,
      meta: [
        { label: "Chart", value: uiState.reports.chartStyle || "pie" },
        { label: "Entries", value: String(segment.count || 0) },
        { label: "Scope", value: dataset.subtitle },
      ],
    };
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
      (transaction.tags || []).forEach((tag) => {
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
                      ? (transaction.tags || []).includes(key.replace("tag:", ""))
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
    const latest = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
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
  };
}
