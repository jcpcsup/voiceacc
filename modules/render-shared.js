export function createRenderSharedTools(api) {
  const {
    toastEl,
    uiState,
    escapeHtml,
    titleCase,
    iconRegistry,
    withAlpha,
    getPrimaryCurrencySymbol,
    formatMoney,
  } = api;

  function renderMiniTrendChart(series, color, label, valueLabel) {
    const points = series.map((item) => Number(item.value || 0));
    const hasActivity = points.some((value) => value !== 0);
    const safeColor = color || "#19c6a7";
    const baseSymbol = getPrimaryCurrencySymbol();
    if (!hasActivity) {
      return `
        <div class="mini-trend-card">
          <div class="mini-trend-copy">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(valueLabel)}</strong>
          </div>
          <div class="mini-trend-empty">No 12M history yet</div>
        </div>
      `;
    }
    const width = 220;
    const height = 56;
    const padding = 4;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const middleLabel = series[Math.floor((series.length - 1) / 2)]?.label || "";
    const range = max - min || 1;
    const coords = points.map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
      const normalized = (value - min) / range;
      const y = height - padding - normalized * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const areaPath = [`M ${padding} ${height - padding}`, ...coords.map((point) => `L ${point.replace(",", " ")}`), `L ${width - padding} ${height - padding}`, "Z"].join(" ");
    return `
      <div class="mini-trend-card">
        <div class="mini-trend-copy">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(valueLabel)}</strong>
        </div>
        <div class="mini-trend-scale">
          <span>${escapeHtml(formatMoney(max, baseSymbol))}</span>
          <span>${escapeHtml(formatMoney(min, baseSymbol))}</span>
        </div>
        <svg class="mini-trend-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
          <path d="${areaPath}" fill="${escapeHtml(withAlpha(safeColor, 0.18))}"></path>
          <polyline points="${coords.join(" ")}" fill="none" stroke="${escapeHtml(safeColor)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
        </svg>
        <div class="mini-trend-axis">
          <span>${escapeHtml(series[0].label)}</span>
          <span>${escapeHtml(middleLabel)}</span>
          <span>${escapeHtml(series[series.length - 1].label)}</span>
        </div>
      </div>
    `;
  }

  function renderBudgetCard(item) {
    const baseSymbol = getPrimaryCurrencySymbol();
    const periodIcon = item.category.budgetPeriod === "weekly" ? iconRegistry.week : iconRegistry.month;
    return `
      <article class="budget-item">
        <div class="budget-card-head">
          <div class="budget-copy">
            <strong>${escapeHtml(item.category.name)}</strong>
            <p>${escapeHtml(titleCase(item.category.budgetPeriod))} budget</p>
          </div>
          <div class="budget-legend">
            <span class="meta-pill neutral meta-pill-icon icon-expense">${iconRegistry["arrow-down"]}<span>${formatMoney(item.spent, baseSymbol)}</span></span>
            <span class="meta-pill neutral meta-pill-icon">${periodIcon}<span>${formatMoney(item.limit, baseSymbol)}</span></span>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-bar ${item.over ? "over-limit" : ""}" style="width:${Math.max(item.progress, 6)}%"></div>
        </div>
      </article>
    `;
  }

  function metricCard(label, value, note, chart = "") {
    return `
      <article class="metric-card">
        <p class="eyebrow">${escapeHtml(label)}</p>
        <strong class="money">${escapeHtml(value)}</strong>
        <p>${escapeHtml(note)}</p>
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
        <div class="report-row-graph">
          ${chart}
          <div class="bar-fill"><span style="width:${(value / max) * 100}%; ${color ? `background:${escapeHtml(color)};` : ""}"></span></div>
          <div class="bar-scale">
            <span>${escapeHtml(formatMoney(0, baseSymbol))}</span>
            <span>${escapeHtml(formatMoney(max, baseSymbol))}</span>
          </div>
        </div>
      </div>
    `;
  }

  function insightCard(title, copy) {
    return `
      <article class="insight-card">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(copy)}</p>
      </article>
    `;
  }

  function renderEmpty(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    window.clearTimeout(uiState.toastTimer);
    uiState.toastTimer = window.setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 2600);
  }

  return {
    renderMiniTrendChart,
    renderBudgetCard,
    metricCard,
    renderBarItem,
    insightCard,
    renderEmpty,
    showToast,
  };
}
