import { createDefaultState } from "./modules/default-state.js";
import { iconRegistry } from "./modules/icons.js";
import { createCalendarTools } from "./modules/calendar-tools.js";
import { createAccountsCategoriesTools } from "./modules/accounts-categories-tools.js";
import { createCsvTools } from "./modules/csv-tools.js";
import { createFormatterTools } from "./modules/formatters.js";
import { createModalTools } from "./modules/modal-tools.js";
import { captureFields, categoryKeywordMap, dictationExampleGroups } from "./modules/reference-data.js";
import { createReportsTools } from "./modules/reports-tools.js";
import { createRenderSharedTools } from "./modules/render-shared.js";
import { createSearchTools } from "./modules/search-tools.js";
import { createStateTools } from "./modules/state-tools.js";
import { createSupabaseTools } from "./modules/supabase-tools.js";
import { escapeAttribute, escapeHtml, escapeRegExp, normalizeDateInput, slugify, splitTags, titleCase, uid } from "./modules/utils.js";

(function () {
  "use strict";

  // Fill these values to enable Supabase auth and cloud sync.
  const SUPABASE_URL = "https://rcpilsxyrswwhjyaenxt.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjcGlsc3h5cnN3d2hqeWFlbnh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDc3MzEsImV4cCI6MjA4OTY4MzczMX0.kxQhwsH1InTmLCrKIhBw93pI2ALf_iVcTowqvR_zYco";
  const SUPABASE_ACCOUNTS_TABLE = "accounts";
  const SUPABASE_CATEGORIES_TABLE = "categories";
  const SUPABASE_TRANSACTIONS_TABLE = "transactions";
  const SUPABASE_LEGACY_STATE_TABLE = "ledger_state";
  const STORAGE_KEY = "ledgerflow-voice-v1";
  const TEMPLATE_STORAGE_KEY = `${STORAGE_KEY}-templates`;
  const TRANSACTIONS_PAGE_SIZE = 20;
  const SUPABASE_CONFIGURED = SUPABASE_URL.trim() !== "" && SUPABASE_ANON_KEY.trim() !== "";
  const SUPABASE_AVAILABLE =
    SUPABASE_CONFIGURED && typeof window.supabase?.createClient === "function";
  const toastEl = document.getElementById("toast");
  const defaultState = createDefaultState();
  const SCREEN_ORDER = ["overview", "transactions", "accounts", "reports", "more"];
  const initialNow = new Date();

  const cloudState = {
    client: null,
    session: null,
    authSubscription: null,
    isSyncing: false,
    pendingSync: false,
    lastSyncedAt: "",
  };
  const state = {
    accounts: [],
    categories: [],
    transactions: [],
  };
  let pendingConfirmAction = null;
  let pendingConfirmText = "";
  let activeReportDetailFilters = null;
  let swipeGesture = null;
  let reportChartTooltipState = {
    index: "",
    pinned: false,
  };
  let smartFieldPickerState = {
    field: "",
    targetId: "",
    options: [],
    selectedValue: "",
    lastTapValue: "",
    lastTapAt: 0,
  };
  let uiState;
  let transactionTemplates = loadTransactionTemplates();

  const { loadLocalState, normalizeState, replaceState, getUserCacheKey, persistState } = createStateTools({
    storageKey: STORAGE_KEY,
    defaultState,
    state,
    getCurrentUserId: () => uiState?.currentUserId || "",
  });
  replaceState(loadLocalState());

  uiState = {
    screen: "overview",
    authView: "signin",
    requiresLogin: true,
    isAuthenticated: false,
    currentUserId: "",
    currentUserEmail: "",
    syncStatus: SUPABASE_CONFIGURED
      ? SUPABASE_AVAILABLE
        ? "Waiting for Supabase sign in."
        : "Supabase client failed to load."
      : "Local-only mode is active.",
    globalSearch: "",
    calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    filters: {
      search: "",
      type: "all",
      account: "all",
      category: "all",
      subcategory: "",
      counterparty: "",
      project: "",
      tag: "",
      startDate: "",
      endDate: "",
      sort: "dateDesc",
    },
    reports: {
      range: "thisMonth",
      account: "all",
      types: ["expense"],
      chartStyle: "donut",
      anchorDate: `${initialNow.getFullYear()}-${String(initialNow.getMonth() + 1).padStart(2, "0")}-${String(initialNow.getDate()).padStart(2, "0")}`,
      customStartDate: "",
      customEndDate: "",
    },
    toastTimer: null,
    recognition: null,
    isListening: false,
    transactionsFiltersExpanded: false,
    transactionPage: 1,
  };

  const {
    sumAmounts,
    getPrimaryCurrencySymbol,
    getTransactionCurrencySymbol,
    formatMoney,
    formatCurrency,
    formatCompactMoney,
    formatCalendarDisplayMoney,
    formatCompactPlainAmount,
    withAlpha,
    formatTransactionAmount,
    toLocalIsoDate,
    toLocalMonthKey,
    parseIsoDate,
    todayIso,
    shiftIsoDate,
    formatShortDateTime,
  } = createFormatterTools({
    state,
    getAccount,
  });

  const {
    renderMiniTrendChart,
    renderBudgetCard,
    metricCard,
    renderBarItem,
    insightCard,
    renderEmpty,
    showToast,
  } = createRenderSharedTools({
    toastEl,
    uiState,
    escapeHtml,
    titleCase,
    iconRegistry,
    withAlpha,
    getPrimaryCurrencySymbol,
    formatMoney,
  });

  let getBudgetStatus = () => [];
  let renderReports = () => {};
  let getReportChartSegmentDetail = () => null;
  let renderReportDrilldown = () => "";

  const {
    getAccountBalance,
    getAccountFlow,
    getTrailingMonths,
    getGlobalMetrics,
    renderAccountCard,
    renderCategoryGroup,
    renderHeroAccountPill,
  } = createAccountsCategoriesTools({
    state,
    iconRegistry,
    getAccount,
    getCategory,
    getCategoryUsage: (categoryId) => getBudgetStatus().find((item) => item.category.id === categoryId),
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
  });

  const {
    exportTransactionsCsv,
    exportAccountsCsv,
    exportCategoriesCsv,
    exportImportTemplate,
    getImportTemplateMessage,
    findAccountId,
    ensureImportedAccount,
    findCategoryId,
    ensureImportedCategory,
    appendImportedSubcategory,
    normalizeImportTransactionType,
  } = createCsvTools({
    state,
    showToast,
    getAccount,
    getCategory,
    uid,
    slugify,
  });

  const { renderCalendarOverview, shiftCalendarMonth, applyDateFilter } = createCalendarTools({
    state,
    uiState,
    iconRegistry,
    getPrimaryCurrencySymbol,
    sumAmounts,
    formatCalendarDisplayMoney,
    formatCompactPlainAmount,
    toLocalIsoDate,
    switchScreen,
    renderTransactions,
  });

  ({ renderReports, getBudgetStatus, getReportChartSegmentDetail, renderReportDrilldown } = createReportsTools({
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
  }));

  const {
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
  } = createModalTools({
    state,
    uiState,
    categoryKeywordMap,
    iconRegistry,
    renderSelectOptions,
    renderSubcategoryOptions,
    syncTransactionTemplateUi: () => {
      renderTransactionTemplateOptions();
      syncTransactionTemplateControls();
      setTransactionTemplatePanelExpanded(false);
    },
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
    calculateTransactionAmountFromDetails,
    todayIso,
    shiftIsoDate,
    showToast,
    persistAndRefresh,
  });

  const {
    getFilteredTransactions,
    clearFilters,
    renderGlobalSearchResults,
    hideGlobalSearchResults,
    openGlobalSearchResult,
    applyGlobalQueryToTransactions,
  } = createSearchTools({
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
  });

  const {
    initializeSupabase,
    handleSupabaseSession,
    syncStateToSupabase,
    handleSignOut,
    renderCloudStatus,
    getAppRedirectUrl,
  } = createSupabaseTools({
    constants: {
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      SUPABASE_ACCOUNTS_TABLE,
      SUPABASE_CATEGORIES_TABLE,
      SUPABASE_TRANSACTIONS_TABLE,
      SUPABASE_LEGACY_STATE_TABLE,
      SUPABASE_CONFIGURED,
      SUPABASE_AVAILABLE,
    },
    cloudState,
    state,
    uiState,
    defaultState,
    normalizeState,
    loadLocalState,
    getUserCacheKey,
    persistState,
    replaceState,
    renderAll,
    initializeLockScreen,
    formatShortDateTime,
    showToast,
    todayIso,
  });

  wireStaticIcons();
  seedStaticContent();
  syncImportTemplateUi();
  syncCustomReportRangeUi();
  renderTransactionTemplateOptions();
  initializeSpeechRecognition();
  bindEvents();
  renderAll();
  syncTransactionFiltersPanel();
  initializeLockScreen();
  void initializeSupabase();

  function bindEvents() {
    document.querySelectorAll("[data-screen-target]").forEach((button) => {
      button.addEventListener("click", () => switchScreen(button.dataset.screenTarget));
    });

    document.getElementById("quick-add-button")?.addEventListener("click", () => openTransactionModal());
    document.getElementById("add-transaction-button").addEventListener("click", () => openTransactionModal());
    document.getElementById("topbar-add-button").addEventListener("click", () => openTransactionModal());
    document.getElementById("topbar-mic-button").addEventListener("click", handleTopBarMic);
    document.getElementById("listen-button").addEventListener("click", toggleListening);
    document.getElementById("parse-button").addEventListener("click", handleParseStatement);
    document.getElementById("clear-filters-button").addEventListener("click", () => {
      clearFilters();
      setTransactionFiltersExpanded(false);
    });
    document.getElementById("transaction-page-prev-button").addEventListener("click", () => changeTransactionPage(-1));
    document.getElementById("transaction-page-next-button").addEventListener("click", () => changeTransactionPage(1));
    document.getElementById("add-category-button").addEventListener("click", () => openCategoryModal());
    document.getElementById("toggle-transaction-filters-button").addEventListener("click", toggleTransactionFiltersPanel);
    document.getElementById("open-import-button").addEventListener("click", () => {
      syncImportTemplateUi();
      openModal("import-modal");
    });
    document.getElementById("export-transactions-button").addEventListener("click", exportTransactionsCsv);
    document.getElementById("export-accounts-button").addEventListener("click", exportAccountsCsv);
    document.getElementById("export-categories-button").addEventListener("click", exportCategoriesCsv);
    document.getElementById("clear-transactions-button").addEventListener("click", clearAllTransactions);

    document.querySelectorAll("[data-open-account-modal]").forEach((button) => {
      button.addEventListener("click", () => openAccountModal());
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => closeModal(button.dataset.closeModal));
    });

    document.getElementById("transaction-type").addEventListener("change", () => {
      syncTransactionTypeFields();
      renderTransactionSmartFieldOptions();
    });
    document.getElementById("transaction-category").addEventListener("change", renderTransactionSmartFieldOptions);
    document.getElementById("filter-category").addEventListener("change", renderTransactionFilterSubcategoryOptions);
    document.getElementById("filter-type").addEventListener("change", renderTransactionFilterValueSuggestions);
    document.getElementById("filter-subcategory").addEventListener("input", renderTransactionFilterValueSuggestions);
    document.getElementById("filter-subcategory").addEventListener("change", renderTransactionFilterValueSuggestions);
    document.getElementById("transaction-subcategory").addEventListener("input", renderTransactionLinkedSuggestions);
    document.getElementById("transaction-subcategory").addEventListener("change", renderTransactionLinkedSuggestions);
    document.getElementById("transaction-details").addEventListener("input", syncTransactionAmountFromDetails);
    document.getElementById("transaction-details").addEventListener("change", syncTransactionAmountFromDetails);
    document.querySelectorAll("[data-smart-picker-field]").forEach((input) => {
      input.addEventListener("click", () => openSmartFieldPicker(input.dataset.smartPickerField || ""));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
          event.preventDefault();
          openSmartFieldPicker(input.dataset.smartPickerField || "");
        }
      });
    });
    document.getElementById("category-type").addEventListener("change", syncCategoryBudgetState);
    document.getElementById("import-target").addEventListener("change", syncImportTemplateUi);
    document.getElementById("download-import-template-button").addEventListener("click", handleDownloadImportTemplate);
    document.getElementById("confirm-modal-submit").addEventListener("click", handleConfirmModalSubmit);
    document.getElementById("confirm-modal-text-input").addEventListener("input", syncConfirmModalState);
    document.querySelectorAll('[data-close-modal="confirm-modal"]').forEach((button) => {
      button.addEventListener("click", resetConfirmModal);
    });

    document.getElementById("transaction-form").addEventListener("submit", handleTransactionSubmit);
    document.getElementById("account-form").addEventListener("submit", handleAccountSubmit);
    document.getElementById("category-form").addEventListener("submit", handleCategorySubmit);
    document.getElementById("import-form").addEventListener("submit", handleImportSubmit);
    document.getElementById("transaction-delete-button").addEventListener("click", handleTransactionModalDelete);
    document.getElementById("transaction-duplicate-button").addEventListener("click", handleTransactionModalDuplicate);
    document.getElementById("apply-transaction-template-button").addEventListener("click", applySelectedTransactionTemplate);
    document.getElementById("save-transaction-template-button").addEventListener("click", saveCurrentTransactionTemplate);
    document.getElementById("delete-transaction-template-button").addEventListener("click", deleteSelectedTransactionTemplate);
    document.getElementById("transaction-template-select").addEventListener("change", syncTransactionTemplateControls);
    document.getElementById("toggle-transaction-templates-button").addEventListener("click", toggleTransactionTemplatePanel);
    document.getElementById("smart-field-picker-input").addEventListener("input", renderSmartFieldPickerOptions);
    document.getElementById("smart-field-picker-apply-button").addEventListener("click", () => applySmartFieldPickerValue());
    document.getElementById("smart-field-picker-clear-button").addEventListener("click", clearSmartFieldPickerValue);
    document.getElementById("smart-field-picker-list").addEventListener("dblclick", (event) => {
      const option = event.target.closest('[data-action="select-smart-field-option"]');
      if (!option) {
        return;
      }
      applySmartFieldPickerValue(option.dataset.value || "");
    });
    document.querySelectorAll('[data-close-modal="smart-field-picker-modal"]').forEach((button) => {
      button.addEventListener("click", resetSmartFieldPicker);
    });
    document.addEventListener("mouseover", (event) => {
      if (reportChartTooltipState.pinned) {
        return;
      }
      const hit = findReportChartHitTarget(event.target);
      if (!hit) {
        return;
      }
      showReportChartTooltip(hit.dataset.index || "", hit, false, event.clientX, event.clientY);
    });
    document.addEventListener("mousemove", (event) => {
      if (reportChartTooltipState.pinned) {
        return;
      }
      const hit = findReportChartHitTarget(event.target);
      if (!hit) {
        return;
      }
      positionReportChartTooltip(hit, event.clientX, event.clientY);
    });
    document.addEventListener("mouseout", (event) => {
      if (reportChartTooltipState.pinned) {
        return;
      }
      const hit = findReportChartHitTarget(event.target);
      if (!hit) {
        return;
      }
      const next = event.relatedTarget;
      if (next && (hit.contains?.(next) || (typeof next.closest === "function" && next.closest(".report-chart-tooltip")))) {
        return;
      }
      hideReportChartTooltip(true);
    });
    document.addEventListener("click", (event) => {
      const hit = findReportChartHitTarget(event.target);
      if (hit || (typeof event.target.closest === "function" && event.target.closest(".report-chart-tooltip"))) {
        return;
      }
      hideReportChartTooltip(true);
    });

    bindFilterInput("search-input", "search");
    bindFilterInput("filter-type", "type");
    bindFilterInput("filter-account", "account");
    bindFilterInput("filter-category", "category");
    bindFilterInput("filter-subcategory", "subcategory");
    bindFilterInput("filter-counterparty", "counterparty");
    bindFilterInput("filter-project", "project");
    bindFilterInput("filter-tag", "tag");
    bindFilterInput("filter-start-date", "startDate");
    bindFilterInput("filter-end-date", "endDate");
    bindFilterInput("filter-sort", "sort");

    document.getElementById("report-range").addEventListener("change", (event) => {
      uiState.reports.range = event.target.value;
      if (uiState.reports.range !== "custom") {
        uiState.reports.anchorDate = todayIso();
      }
      syncCustomReportRangeUi();
      syncReportRangeOptionLabels();
      syncReportRangeNavigator();
      renderReports();
    });
    document.getElementById("report-custom-start").addEventListener("change", syncCustomReportRangeFromInputs);
    document.getElementById("report-custom-end").addEventListener("change", syncCustomReportRangeFromInputs);
    document.getElementById("report-account").addEventListener("change", (event) => {
      uiState.reports.account = event.target.value;
      renderReports();
    });
    document.getElementById("report-range-prev-button").addEventListener("click", () => shiftReportRange(-1));
    document.getElementById("report-range-next-button").addEventListener("click", () => shiftReportRange(1));
    document.querySelectorAll("[data-report-type-value]").forEach((button) => {
      button.addEventListener("click", () => toggleReportType(button.dataset.reportTypeValue || ""));
    });

    document.getElementById("calendar-prev-button").addEventListener("click", () => shiftCalendarMonth(-1));
    document.getElementById("calendar-next-button").addEventListener("click", () => shiftCalendarMonth(1));

    document.getElementById("global-search-input").addEventListener("input", (event) => {
      uiState.globalSearch = event.target.value;
      renderGlobalSearchResults();
    });
    document.getElementById("global-search-input").addEventListener("focus", renderGlobalSearchResults);
    document.getElementById("global-search-input").addEventListener("keydown", handleGlobalSearchKeydown);
    document.getElementById("lock-form").addEventListener("submit", handleLockSubmit);
    document.getElementById("sync-now-button").addEventListener("click", () => {
      void syncStateToSupabase(true);
    });
    document.getElementById("sign-out-button").addEventListener("click", () => {
      void handleSignOut();
    });
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setAuthView(button.dataset.authMode || "signin"));
    });

    const appShell = document.querySelector(".app-shell");
    if (appShell) {
      appShell.addEventListener("touchstart", handleAppTouchStart, { passive: true });
      appShell.addEventListener("touchmove", handleAppTouchMove, { passive: true });
      appShell.addEventListener("touchend", handleAppTouchEnd, { passive: true });
      appShell.addEventListener("touchcancel", resetSwipeGesture, { passive: true });
    }

    document.addEventListener("click", handleDelegatedClick);
  }

  function syncImportTemplateUi() {
    const target = document.getElementById("import-target").value || "transactions";
    document.getElementById("download-import-template-button").textContent = `Download ${titleCase(target)} Template`;
    document.getElementById("import-template-help").textContent = getImportTemplateMessage(target);
    const limitNote = document.getElementById("import-limit-note");
    if (limitNote) {
      limitNote.textContent =
        target === "transactions"
          ? "For best results, import transactions in batches of about 500 to 1000 rows. Very large files are processed in chunks."
          : "Large imports are processed in chunks to keep the app responsive while data is being added.";
    }
  }

  function handleDownloadImportTemplate() {
    exportImportTemplate(document.getElementById("import-target").value || "transactions");
  }

  function syncCustomReportRangeUi() {
    const wrapper = document.getElementById("report-custom-range-fields");
    if (!wrapper) {
      return;
    }
    const isCustom = uiState.reports.range === "custom";
    wrapper.classList.toggle("hidden", !isCustom);
    setInputDateValue("report-custom-start", uiState.reports.customStartDate || "");
    setInputDateValue("report-custom-end", uiState.reports.customEndDate || "");
  }

  function syncCustomReportRangeFromInputs() {
    const startValue = normalizeDateInput(document.getElementById("report-custom-start").value || "");
    const endValue = normalizeDateInput(document.getElementById("report-custom-end").value || "");
    let startDate = startValue;
    let endDate = endValue;
    if (startDate && endDate && startDate > endDate) {
      [startDate, endDate] = [endDate, startDate];
    }
    uiState.reports.customStartDate = startDate;
    uiState.reports.customEndDate = endDate;
    setInputDateValue("report-custom-start", startDate);
    setInputDateValue("report-custom-end", endDate);
    syncReportRangeOptionLabels();
    renderReports();
  }

  function syncReportTypeButtons() {
    document.querySelectorAll("[data-report-type-value]").forEach((button) => {
      const value = button.dataset.reportTypeValue || "";
      const active = uiState.reports.types.includes(value);
      button.classList.toggle("report-type-chip-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function formatReportRangeDate(iso) {
    return String(iso || "").replace(/-/g, "/");
  }

  function getReportRangeLabel(range, anchorIso = uiState.reports.anchorDate || todayIso()) {
    const reference = parseIsoDate(anchorIso, 12);
    if (range === "custom") {
      const start = uiState.reports.customStartDate || "";
      const end = uiState.reports.customEndDate || "";
      if (start && end) {
        return `${formatReportRangeDate(start)} - ${formatReportRangeDate(end)}`;
      }
      if (start) {
        return `${formatReportRangeDate(start)} - ${formatReportRangeDate(start)}`;
      }
      if (end) {
        return `${formatReportRangeDate(end)} - ${formatReportRangeDate(end)}`;
      }
      return "Custom Range";
    }
    if (range === "thisMonth") {
      return reference.toLocaleDateString("en-US", { month: "long" });
    }
    if (range === "last30") {
      const { start, end } = getDateRange("last30", anchorIso);
      return `${formatReportRangeDate(start)} - ${formatReportRangeDate(end)}`;
    }
    if (range === "thisQuarter") {
      const quarterStartMonth = Math.floor(reference.getMonth() / 3) * 3;
      const startMonth = new Date(reference.getFullYear(), quarterStartMonth, 1).toLocaleDateString("en-US", { month: "short" });
      const endMonth = new Date(reference.getFullYear(), quarterStartMonth + 2, 1).toLocaleDateString("en-US", { month: "short" });
      return `${startMonth} - ${endMonth}`;
    }
    if (range === "thisYear") {
      return String(reference.getFullYear());
    }
    return "All Time";
  }

  function syncReportRangeOptionLabels() {
    const reportRange = document.getElementById("report-range");
    if (!reportRange) {
      return;
    }
    [
      ["thisMonth", getReportRangeLabel("thisMonth")],
      ["last30", getReportRangeLabel("last30")],
      ["thisQuarter", getReportRangeLabel("thisQuarter")],
      ["thisYear", getReportRangeLabel("thisYear")],
      ["custom", getReportRangeLabel("custom")],
      ["all", "All Time"],
    ].forEach(([value, label]) => {
      const option = reportRange.querySelector(`option[value="${value}"]`);
      if (option) {
        option.textContent = label;
      }
    });
  }

  function syncReportRangeNavigator() {
    const prevButton = document.getElementById("report-range-prev-button");
    const nextButton = document.getElementById("report-range-next-button");
    if (!prevButton || !nextButton) {
      return;
    }
    const disabled = uiState.reports.range === "all" || uiState.reports.range === "custom";
    prevButton.disabled = disabled;
    nextButton.disabled = disabled || isReportRangeAtLatest();
  }

  function isReportRangeAtLatest() {
    const range = uiState.reports.range;
    const anchor = parseIsoDate(uiState.reports.anchorDate, 12);
    const now = new Date();
    if (range === "last30") {
      return toLocalIsoDate(anchor) >= todayIso();
    }
    if (range === "thisMonth") {
      return anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();
    }
    if (range === "thisQuarter") {
      return (
        anchor.getFullYear() === now.getFullYear() &&
        Math.floor(anchor.getMonth() / 3) === Math.floor(now.getMonth() / 3)
      );
    }
    if (range === "thisYear") {
      return anchor.getFullYear() === now.getFullYear();
    }
    return true;
  }

  function shiftReportRange(direction) {
    const range = uiState.reports.range;
    if (range === "all" || range === "custom") {
      return;
    }
    const anchor = parseIsoDate(uiState.reports.anchorDate, 12);
    if (range === "last30") {
      anchor.setDate(anchor.getDate() + direction * 30);
    } else if (range === "thisMonth") {
      anchor.setMonth(anchor.getMonth() + direction);
    } else if (range === "thisQuarter") {
      anchor.setMonth(anchor.getMonth() + direction * 3);
    } else if (range === "thisYear") {
      anchor.setFullYear(anchor.getFullYear() + direction);
    }
    const today = parseIsoDate(todayIso(), 12);
    if (anchor > today) {
      uiState.reports.anchorDate = todayIso();
    } else {
      uiState.reports.anchorDate = toLocalIsoDate(anchor);
    }
    syncReportRangeOptionLabels();
    syncReportRangeNavigator();
    renderReports();
  }

  function toggleReportType(value) {
    if (!value) {
      return;
    }
    const current = new Set(uiState.reports.types || []);
    if (current.has(value)) {
      if (current.size === 1) {
        return;
      }
      current.delete(value);
    } else {
      current.add(value);
    }
    uiState.reports.types = ["expense", "income", "transfer"].filter((type) => current.has(type));
    syncReportTypeButtons();
    renderReports();
  }

  function openReportDetailModal(detail) {
    if (!detail) {
      return;
    }
    hideReportChartTooltip(true);
    activeReportDetailFilters = detail.filters || null;
    document.getElementById("report-detail-eyebrow").textContent = detail.eyebrow || "Chart Detail";
    document.getElementById("report-detail-title").textContent = detail.label || "Segment";
    document.getElementById("report-detail-value").textContent = detail.value || "";
    document.getElementById("report-detail-percent").textContent = detail.percent || "";
    document.getElementById("report-detail-swatch").style.background = detail.color || "#19c6a7";
    document.getElementById("report-detail-meta").innerHTML = (detail.meta || [])
      .map(
        (item) => `
          <${
            item.action === "open-report-entries" && activeReportDetailFilters ? "button" : "div"
          } class="report-detail-meta-row ${item.action === "open-report-entries" && activeReportDetailFilters ? "report-detail-meta-button" : ""}" ${
            item.action === "open-report-entries" && activeReportDetailFilters ? 'type="button" data-action="open-report-detail-entries"' : ""
          }>
            <span>${escapeHtml(item.label || "")}</span>
            <strong>${escapeHtml(item.value || "")}</strong>
          </${item.action === "open-report-entries" && activeReportDetailFilters ? "button" : "div"}>
        `
      )
      .join("");
    const drilldownMarkup = renderReportDrilldown(detail.drilldownKey || "");
    const drilldownShell = document.getElementById("report-detail-chart-shell");
    if (drilldownMarkup) {
      drilldownShell.innerHTML = drilldownMarkup;
      drilldownShell.classList.remove("hidden");
    } else {
      drilldownShell.innerHTML = "";
      drilldownShell.classList.add("hidden");
    }
    openModal("report-detail-modal");
  }

  function buildReportChartTooltipMarkup(index, detail) {
    if (!detail) {
      return "";
    }
    return `
      <div class="report-chart-tooltip-card">
        <div class="report-chart-tooltip-head">
          <span class="report-chart-tooltip-swatch" style="background:${escapeAttribute(detail.color || "#19c6a7")}"></span>
          <div class="report-chart-tooltip-copy">
            <p class="eyebrow">${escapeHtml(detail.eyebrow || "Chart Detail")}</p>
            <strong>${escapeHtml(detail.label || "Segment")}</strong>
          </div>
        </div>
        <div class="report-chart-tooltip-value">${escapeHtml(detail.value || "")}</div>
        <div class="report-chart-tooltip-percent">${escapeHtml(detail.percent || "")}</div>
        <div class="report-chart-tooltip-meta">
          ${(detail.meta || [])
            .map(
              (item) => `
                <${
                  item.action === "open-report-entries" && detail.filters ? "button" : "div"
                } class="report-chart-tooltip-row ${
                  item.action === "open-report-entries" && detail.filters ? "report-chart-tooltip-row-button" : ""
                }" ${
                  item.action === "open-report-entries" && detail.filters
                    ? `type="button" data-action="open-report-tooltip-entries" data-index="${escapeAttribute(index)}"`
                    : ""
                }>
                  <span>${escapeHtml(item.label || "")}</span>
                  <strong>${escapeHtml(item.value || "")}</strong>
                </${item.action === "open-report-entries" && detail.filters ? "button" : "div"}>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function positionReportChartTooltip(anchor, preferredClientX = null, preferredClientY = null) {
    const shell = anchor.closest?.(".report-pie-layout");
    const tooltip = shell?.querySelector(".report-chart-tooltip");
    if (!tooltip || !shell || !anchor) {
      return;
    }
    const shellRect = shell.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const targetX = preferredClientX ?? anchorRect.left + anchorRect.width / 2;
    const targetY = preferredClientY ?? anchorRect.top + anchorRect.height / 2;
    const rightCandidate = targetX - shellRect.left + 14;
    const leftCandidate = targetX - shellRect.left - tooltipRect.width - 14;
    const preferredLeft = rightCandidate + tooltipRect.width <= shellRect.width - 12 ? rightCandidate : leftCandidate;
    const clampedLeft = Math.max(12, Math.min(shellRect.width - tooltipRect.width - 12, preferredLeft));
    const preferredTop = targetY - shellRect.top - tooltipRect.height / 2;
    const clampedTop = Math.max(12, Math.min(shellRect.height - tooltipRect.height - 12, preferredTop));
    tooltip.style.left = `${clampedLeft}px`;
    tooltip.style.top = `${clampedTop}px`;
  }

  function showReportChartTooltip(index, anchor, pinned = false, clientX = null, clientY = null) {
    const shell = anchor.closest?.(".report-pie-layout");
    const tooltip = shell?.querySelector(".report-chart-tooltip");
    const detail = getReportChartSegmentDetail(index);
    if (!tooltip || !detail || !anchor) {
      return;
    }
    reportChartTooltipState = {
      index,
      pinned,
    };
    tooltip.innerHTML = buildReportChartTooltipMarkup(index, detail);
    tooltip.classList.toggle("report-chart-tooltip-pinned", pinned);
    tooltip.classList.remove("hidden");
    positionReportChartTooltip(anchor, clientX, clientY);
  }

  function hideReportChartTooltip(force = false) {
    if (!force && reportChartTooltipState.pinned) {
      return;
    }
    document.querySelectorAll(".report-chart-tooltip").forEach((tooltip) => {
      tooltip.classList.add("hidden");
      tooltip.classList.remove("report-chart-tooltip-pinned");
      tooltip.innerHTML = "";
      tooltip.style.left = "";
      tooltip.style.top = "";
    });
    reportChartTooltipState = {
      index: "",
      pinned: false,
    };
  }

  function findReportChartHitTarget(target) {
    let node = target;
    while (node) {
      if (node.classList?.contains("report-chart-hit")) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function findActionTarget(target) {
    let node = target;
    while (node) {
      if (typeof node.getAttribute === "function" && node.getAttribute("data-action")) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function openReportEntriesFromFilters(filters) {
    if (!filters) {
      return;
    }
    const fallbackRange = getDateRange(uiState.reports.range);
    const startDate = normalizeDateInput(filters.startDate || fallbackRange.start || "");
    const endDate = normalizeDateInput(filters.endDate || fallbackRange.end || startDate || "");
    uiState.filters.search = filters.search || "";
    uiState.filters.type = filters.type || "all";
    uiState.filters.account = filters.accountId || "all";
    uiState.filters.category = filters.categoryId || "all";
    uiState.filters.subcategory = filters.subcategory || "";
    uiState.filters.counterparty = filters.counterparty || "";
    uiState.filters.project = filters.project || "";
    uiState.filters.tag = filters.tag || "";
    uiState.filters.startDate = startDate;
    uiState.filters.endDate = endDate;
    uiState.transactionPage = 1;

    hideReportChartTooltip(true);
    closeModal("report-detail-modal");
    activeReportDetailFilters = filters;
    setTransactionFiltersExpanded(true);
    switchScreen("transactions");
    syncTransactionFilterInputs();
    window.requestAnimationFrame(() => syncTransactionFilterInputs());
    renderTransactions();
  }

  function openReportEntriesFromDetail() {
    if (!activeReportDetailFilters) {
      return;
    }
    openReportEntriesFromFilters(activeReportDetailFilters);
  }

  function openReportEntriesFromTooltip(index) {
    const detail = getReportChartSegmentDetail(index);
    if (!detail?.filters) {
      return;
    }
    openReportEntriesFromFilters(detail.filters);
  }

  function setInputDateValue(id, value) {
    const input = document.getElementById(id);
    if (!input) {
      return;
    }
    input.value = value || "";
    if (value) {
      input.setAttribute("value", value);
    } else {
      input.removeAttribute("value");
    }
  }

  function formatDateFilterDisplay(value) {
    const normalized = normalizeDateInput(value || "");
    if (!normalized) {
      return "";
    }
    const [year, month, day] = normalized.split("-");
    return `${month}/${day}/${year}`;
  }

  function syncTransactionFilterInputs() {
    document.getElementById("search-input").value = uiState.filters.search || "";
    document.getElementById("filter-type").value = uiState.filters.type || "all";
    document.getElementById("filter-account").value = uiState.filters.account || "all";
    document.getElementById("filter-category").value = uiState.filters.category || "all";
    renderTransactionFilterSubcategoryOptions();
    document.getElementById("filter-subcategory").value = uiState.filters.subcategory || "";
    renderTransactionFilterValueSuggestions();
    document.getElementById("filter-counterparty").value = uiState.filters.counterparty || "";
    document.getElementById("filter-project").value = uiState.filters.project || "";
    document.getElementById("filter-tag").value = uiState.filters.tag || "";
    document.getElementById("filter-sort").value = uiState.filters.sort || "dateDesc";
    setInputDateValue("filter-start-date", formatDateFilterDisplay(uiState.filters.startDate || ""));
    setInputDateValue("filter-end-date", formatDateFilterDisplay(uiState.filters.endDate || ""));
  }

  function setTransactionTemplatePanelExpanded(expanded) {
    const body = document.getElementById("transaction-template-body");
    const button = document.getElementById("toggle-transaction-templates-button");
    const shell = document.querySelector(".transaction-template-tools");
    if (!body || !button || !shell) {
      return;
    }
    body.classList.toggle("hidden", !expanded);
    shell.classList.toggle("is-expanded", expanded);
    button.textContent = expanded ? "Hide Templates" : "Show Templates";
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function toggleTransactionTemplatePanel() {
    const body = document.getElementById("transaction-template-body");
    setTransactionTemplatePanelExpanded(body?.classList.contains("hidden"));
  }

  function loadTransactionTemplates() {
    try {
      const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          id: item.id || uid("tpl"),
          name: String(item.name || "").trim(),
          type: item.type || "expense",
          amount: Number(item.amount || 0),
          accountId: item.accountId || "",
          fromAccountId: item.fromAccountId || "",
          toAccountId: item.toAccountId || "",
          categoryId: item.categoryId || "",
          subcategory: item.subcategory || "",
          counterparty: item.counterparty || "",
          project: item.project || "",
          tags: Array.isArray(item.tags) ? item.tags : splitTags(item.tags || ""),
          details: item.details || "",
          updatedAt: item.updatedAt || item.createdAt || "",
        }))
        .filter((item) => item.name);
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  function persistTransactionTemplates() {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(transactionTemplates));
  }

  function renderTransactionTemplateOptions() {
    const select = document.getElementById("transaction-template-select");
    if (!select) {
      return;
    }
    const current = select.value;
    const options = ['<option value="">Choose template</option>'];
    transactionTemplates
      .slice()
      .sort((left, right) => {
        if ((right.updatedAt || "") !== (left.updatedAt || "")) {
          return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
        }
        return left.name.localeCompare(right.name);
      })
      .forEach((template) => {
        options.push(`<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`);
      });
    select.innerHTML = options.join("");
    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    }
    syncTransactionTemplateControls();
  }

  function calculateTransactionAmountFromDetails(detailsText = "") {
    const pattern = /=\s*([0-9]+)\s*(?:,|$)/gm;
    let total = 0;
    let hasMatch = false;
    const source = String(detailsText || "");
    let match = pattern.exec(source);
    while (match) {
      hasMatch = true;
      total += Number(match[1] || 0);
      match = pattern.exec(source);
    }
    return hasMatch ? total : 0;
  }

  function syncTransactionAmountFromDetails() {
    const detailsField = document.getElementById("transaction-details");
    const amountField = document.getElementById("transaction-amount");
    if (!detailsField || !amountField) {
      return;
    }
    const derivedAmount = calculateTransactionAmountFromDetails(detailsField.value);
    if (derivedAmount > 0) {
      amountField.value = String(derivedAmount);
    }
  }

  function syncTransactionTemplateControls() {
    const selectedId = document.getElementById("transaction-template-select").value || "";
    const selected = transactionTemplates.find((template) => template.id === selectedId);
    document.getElementById("transaction-template-name").value = selected?.name || "";
    document.getElementById("delete-transaction-template-button").classList.toggle("hidden", !selected);
  }

  function getTransactionFormDraft() {
    const type = document.getElementById("transaction-type").value || "expense";
    return {
      type,
      amount: Number(document.getElementById("transaction-amount").value || 0),
      accountId: type === "transfer" ? "" : document.getElementById("transaction-account").value || "",
      fromAccountId: type === "transfer" ? document.getElementById("transaction-from-account").value || "" : "",
      toAccountId: type === "transfer" ? document.getElementById("transaction-to-account").value || "" : "",
      categoryId: type === "transfer" ? "" : document.getElementById("transaction-category").value || "",
      subcategory: type === "transfer" ? "" : document.getElementById("transaction-subcategory").value.trim(),
      counterparty: document.getElementById("transaction-counterparty").value.trim(),
      project: document.getElementById("transaction-project").value.trim(),
      tags: splitTags(document.getElementById("transaction-tags").value),
      details: document.getElementById("transaction-details").value.trim(),
    };
  }

  function applyTransactionDraftToForm(draft, options = {}) {
    const preserveDate = options.preserveDate !== false;
    const currentDate = document.getElementById("transaction-date").value || todayIso();
    document.getElementById("transaction-id").value = "";
    document.getElementById("transaction-modal-title").textContent = options.title || "Add Transaction";
    document.getElementById("transaction-delete-button").classList.add("hidden");
    document.getElementById("transaction-duplicate-button").classList.add("hidden");
    document.getElementById("transaction-type").value = draft.type || "expense";
    document.getElementById("transaction-amount").value = draft.amount ? String(draft.amount) : "";
    document.getElementById("transaction-date").value = preserveDate ? currentDate : todayIso();
    document.getElementById("transaction-account").value = draft.accountId || "";
    document.getElementById("transaction-from-account").value = draft.fromAccountId || "";
    document.getElementById("transaction-to-account").value = draft.toAccountId || "";
    document.getElementById("transaction-category").value = draft.categoryId || "";
    document.getElementById("transaction-subcategory").value = draft.subcategory || "";
    document.getElementById("transaction-counterparty").value = draft.counterparty || "";
    document.getElementById("transaction-project").value = draft.project || "";
    document.getElementById("transaction-tags").value = Array.isArray(draft.tags) ? draft.tags.join(", ") : "";
    document.getElementById("transaction-details").value = draft.details || "";
    syncTransactionTypeFields();
    renderTransactionSmartFieldOptions();
    if (!draft.amount && draft.details) {
      syncTransactionAmountFromDetails();
    }
    setTransactionTemplatePanelExpanded(false);
  }

  function saveCurrentTransactionTemplate() {
    const name = document.getElementById("transaction-template-name").value.trim();
    if (!name) {
      showToast("Give the template a name first.");
      return;
    }
    const draft = getTransactionFormDraft();
    if (draft.type === "transfer") {
      if (!draft.fromAccountId || !draft.toAccountId) {
        showToast("Transfer templates need both accounts.");
        return;
      }
    } else {
      if (!draft.accountId) {
        showToast("Transaction templates need an account.");
        return;
      }
      if (!draft.categoryId) {
        showToast("Transaction templates need a category.");
        return;
      }
    }
    const selectedId = document.getElementById("transaction-template-select").value || "";
    const existing =
      transactionTemplates.find((template) => template.id === selectedId) ||
      transactionTemplates.find((template) => template.name.toLowerCase() === name.toLowerCase());
    const payload = {
      id: existing?.id || uid("tpl"),
      name,
      ...draft,
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      transactionTemplates = transactionTemplates.map((template) => (template.id === existing.id ? payload : template));
      showToast("Template updated.");
    } else {
      transactionTemplates.push(payload);
      showToast("Template saved.");
    }
    persistTransactionTemplates();
    renderTransactionTemplateOptions();
    document.getElementById("transaction-template-select").value = payload.id;
    syncTransactionTemplateControls();
  }

  function applySelectedTransactionTemplate() {
    const selectedId = document.getElementById("transaction-template-select").value || "";
    const selected = transactionTemplates.find((template) => template.id === selectedId);
    if (!selected) {
      showToast("Choose a template first.");
      return;
    }
    applyTransactionDraftToForm(selected, { preserveDate: true, title: "Add Transaction" });
    document.getElementById("transaction-template-select").value = selected.id;
    syncTransactionTemplateControls();
    showToast(`Applied template: ${selected.name}.`);
  }

  function deleteSelectedTransactionTemplate() {
    const selectedId = document.getElementById("transaction-template-select").value || "";
    const selected = transactionTemplates.find((template) => template.id === selectedId);
    if (!selected) {
      return;
    }
    openConfirmModal({
      eyebrow: "Template",
      title: "Delete this template?",
      message: `The template "${selected.name}" will be removed from this browser.`,
      submitLabel: "Delete",
      onConfirm: () => {
        transactionTemplates = transactionTemplates.filter((template) => template.id !== selected.id);
        persistTransactionTemplates();
        renderTransactionTemplateOptions();
        document.getElementById("transaction-template-name").value = "";
        showToast("Template deleted.");
      },
    });
  }

  function getSmartFieldPickerConfig(field) {
    const categoryId = document.getElementById("transaction-category").value || "";
    const type = document.getElementById("transaction-type").value || "expense";
    const subcategory = document.getElementById("transaction-subcategory").value.trim();
    if (field === "subcategory") {
      const category = getCategory(categoryId);
      return {
        title: "Choose Subcategory",
        label: "Subcategory",
        targetId: "transaction-subcategory",
        currentValue: document.getElementById("transaction-subcategory").value.trim(),
        options: getRankedSubcategorySuggestions(categoryId),
        placeholder: category ? "Type a new subcategory or choose a ranked one" : "Type a new subcategory",
        note: category
          ? "Ranked by usage for the selected category. You can still type a new one."
          : "Select a category first for ranked suggestions, or type a new subcategory.",
      };
    }
    if (field === "counterparty") {
      return {
        title: type === "income" ? "Choose Payer" : "Choose Payee",
        label: type === "income" ? "Payer" : "Payee",
        targetId: "transaction-counterparty",
        currentValue: document.getElementById("transaction-counterparty").value.trim(),
        options: getRankedTransactionValueSuggestions("counterparty", type, categoryId, subcategory),
        placeholder: "Type a new payee / payer or choose a ranked one",
        note: "Shows all matching payees or payers, ranked by usage frequency with the closest matches first.",
      };
    }
    if (field === "project") {
      return {
        title: "Choose Project",
        label: "Project",
        targetId: "transaction-project",
        currentValue: document.getElementById("transaction-project").value.trim(),
        options: getRankedTransactionValueSuggestions("project", type, categoryId, subcategory),
        placeholder: "Type a new project or choose a ranked one",
        note: "Shows all matching projects, ranked by usage frequency with the closest matches first.",
      };
    }
    return null;
  }

  function openSmartFieldPicker(field) {
    const config = getSmartFieldPickerConfig(field);
    if (!config) {
      return;
    }
    smartFieldPickerState = {
      field,
      targetId: config.targetId,
      options: config.options,
      selectedValue: config.currentValue || "",
      lastTapValue: "",
      lastTapAt: 0,
    };
    document.getElementById("smart-field-picker-title").textContent = config.title;
    document.getElementById("smart-field-picker-label").textContent = config.label;
    document.getElementById("smart-field-picker-note").textContent = `${config.note} Single tap selects, then double tap the same value or use "Use Value" to apply it.`;
    document.getElementById("smart-field-picker-input").value = config.currentValue || "";
    document.getElementById("smart-field-picker-input").placeholder = config.placeholder;
    renderSmartFieldPickerOptions();
    openModal("smart-field-picker-modal");
    window.setTimeout(() => {
      document.getElementById("smart-field-picker-input").focus();
      document.getElementById("smart-field-picker-input").select();
    }, 20);
  }

  function renderSmartFieldPickerOptions() {
    const input = document.getElementById("smart-field-picker-input");
    const list = document.getElementById("smart-field-picker-list");
    const count = document.getElementById("smart-field-picker-count");
    const query = String(input.value || "").trim().toLowerCase();
    const filteredOptions = smartFieldPickerState.options.filter((option) => option.toLowerCase().includes(query));
    count.textContent = `${filteredOptions.length} ranked value${filteredOptions.length === 1 ? "" : "s"}`;
    if (!filteredOptions.length) {
      list.innerHTML = `
        <div class="empty-state compact-empty suggestion-picker-empty">
          No ranked matches. Use the typed value above to save something new.
        </div>
      `;
      return;
    }
    list.innerHTML = filteredOptions
      .map(
        (option) => `
          <button class="suggestion-picker-option ${option === smartFieldPickerState.selectedValue ? "active" : ""}" type="button" data-action="select-smart-field-option" data-value="${escapeAttribute(option)}" aria-pressed="${option === smartFieldPickerState.selectedValue ? "true" : "false"}">
            ${escapeHtml(option)}
          </button>
        `
      )
      .join("");
  }

  function syncSmartFieldPickerActiveOption(activeValue = "") {
    document.querySelectorAll("#smart-field-picker-list .suggestion-picker-option").forEach((button) => {
      const isActive = (button.dataset.value || "") === activeValue;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function applySmartFieldPickerValue(valueOverride = null) {
    const field = smartFieldPickerState.field;
    const target = document.getElementById(smartFieldPickerState.targetId);
    if (!field || !target) {
      return;
    }
    const value = String(valueOverride ?? document.getElementById("smart-field-picker-input").value ?? "").trim();
    target.value = value;
    target.setAttribute("value", value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    closeModal("smart-field-picker-modal");
    resetSmartFieldPicker();
    if (field === "subcategory") {
      renderTransactionLinkedSuggestions();
    }
  }

  function clearSmartFieldPickerValue() {
    const input = document.getElementById("smart-field-picker-input");
    const target = document.getElementById(smartFieldPickerState.targetId);
    if (!input || !target) {
      return;
    }
    input.value = "";
    smartFieldPickerState.selectedValue = "";
    smartFieldPickerState.lastTapValue = "";
    smartFieldPickerState.lastTapAt = 0;
    target.value = "";
    target.setAttribute("value", "");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    syncSmartFieldPickerActiveOption("");
    renderSmartFieldPickerOptions();
    if (smartFieldPickerState.field === "subcategory") {
      renderTransactionLinkedSuggestions();
    }
    window.setTimeout(() => input.focus(), 20);
  }

  function resetSmartFieldPicker() {
    smartFieldPickerState = {
      field: "",
      targetId: "",
      options: [],
      selectedValue: "",
      lastTapValue: "",
      lastTapAt: 0,
    };
    document.getElementById("smart-field-picker-input").value = "";
    document.getElementById("smart-field-picker-list").innerHTML = "";
  }

  function shouldCommitSmartFieldDoubleTap(value) {
    const now = Date.now();
    const sameValue = smartFieldPickerState.lastTapValue === value;
    const withinWindow = now - Number(smartFieldPickerState.lastTapAt || 0) <= 420;
    smartFieldPickerState.lastTapValue = value;
    smartFieldPickerState.lastTapAt = now;
    return sameValue && withinWindow;
  }

  function isSwipeNavigationAllowed(target) {
    const elementTarget = target instanceof Element ? target : null;
    if (!window.matchMedia("(max-width: 720px)").matches) {
      return false;
    }
    if (document.getElementById("lock-screen")?.classList.contains("hidden") === false) {
      return false;
    }
    if (document.querySelector(".modal:not(.hidden)")) {
      return false;
    }
    if (elementTarget?.closest("input, textarea, select, button, label, .bottom-nav, .top-bar")) {
      return false;
    }
    return !findHorizontalScrollParent(elementTarget);
  }

  function findHorizontalScrollParent(target) {
    let node = target instanceof Element ? target : null;
    const boundary = document.querySelector(".app-shell");
    while (node && node !== boundary) {
      const style = window.getComputedStyle(node);
      const canScrollX =
        (style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 8;
      if (canScrollX) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function handleAppTouchStart(event) {
    const touch = event.changedTouches?.[0];
    if (!touch || !isSwipeNavigationAllowed(event.target)) {
      swipeGesture = null;
      return;
    }
    swipeGesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      endX: touch.clientX,
      endY: touch.clientY,
    };
  }

  function handleAppTouchMove(event) {
    if (!swipeGesture) {
      return;
    }
    const touch = event.changedTouches?.[0];
    if (!touch) {
      return;
    }
    swipeGesture.endX = touch.clientX;
    swipeGesture.endY = touch.clientY;
  }

  function handleAppTouchEnd(event) {
    if (!swipeGesture) {
      return;
    }
    const touch = event.changedTouches?.[0];
    if (touch) {
      swipeGesture.endX = touch.clientX;
      swipeGesture.endY = touch.clientY;
    }
    const deltaX = swipeGesture.endX - swipeGesture.startX;
    const deltaY = swipeGesture.endY - swipeGesture.startY;
    resetSwipeGesture();
    if (Math.abs(deltaX) < 64 || Math.abs(deltaY) > 42 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }
    const currentIndex = SCREEN_ORDER.indexOf(uiState.screen);
    if (currentIndex === -1) {
      return;
    }
    const nextIndex = deltaX > 0 ? currentIndex - 1 : currentIndex + 1;
    const nextScreen = SCREEN_ORDER[nextIndex];
    if (nextScreen) {
      switchScreen(nextScreen);
    }
  }

  function resetSwipeGesture() {
    swipeGesture = null;
  }

  function setTransactionFiltersExpanded(expanded) {
    uiState.transactionsFiltersExpanded = Boolean(expanded);
    syncTransactionFiltersPanel();
  }

  function toggleTransactionFiltersPanel() {
    setTransactionFiltersExpanded(!uiState.transactionsFiltersExpanded);
  }

  function syncTransactionFiltersPanel() {
    const body = document.getElementById("transaction-search-body");
    const button = document.getElementById("toggle-transaction-filters-button");
    const panel = document.getElementById("transaction-search-panel");
    if (!body || !button || !panel) {
      return;
    }
    body.classList.toggle("hidden", !uiState.transactionsFiltersExpanded);
    panel.classList.toggle("is-expanded", uiState.transactionsFiltersExpanded);
    button.textContent = uiState.transactionsFiltersExpanded ? "Hide Filters" : "Show Filters";
    button.setAttribute("aria-expanded", uiState.transactionsFiltersExpanded ? "true" : "false");
  }

  function openConfirmModal({
    eyebrow = "Confirm",
    title = "Continue?",
    message = "",
    submitLabel = "Confirm",
    confirmationText = "",
    onConfirm,
  }) {
    pendingConfirmAction = typeof onConfirm === "function" ? onConfirm : null;
    pendingConfirmText = String(confirmationText || "").trim();
    document.getElementById("confirm-modal-eyebrow").textContent = eyebrow;
    document.getElementById("confirm-modal-title").textContent = title;
    document.getElementById("confirm-modal-message").textContent = message;
    document.getElementById("confirm-modal-submit").textContent = submitLabel;
    const textShell = document.getElementById("confirm-modal-text-shell");
    const textLabel = document.getElementById("confirm-modal-text-label");
    const textHelp = document.getElementById("confirm-modal-text-help");
    const textInput = document.getElementById("confirm-modal-text-input");
    textShell.classList.toggle("hidden", !pendingConfirmText);
    textInput.value = "";
    if (pendingConfirmText) {
      textLabel.textContent = `Type "${pendingConfirmText}" to continue`;
      textHelp.textContent = "Use the exact uppercase phrase.";
    } else {
      textLabel.textContent = "Type confirmation text";
      textHelp.textContent = "Enter the exact phrase to continue.";
    }
    syncConfirmModalState();
    openModal("confirm-modal");
  }

  function syncConfirmModalState() {
    const submitButton = document.getElementById("confirm-modal-submit");
    const textInput = document.getElementById("confirm-modal-text-input");
    if (!submitButton || !textInput) {
      return;
    }
    if (!pendingConfirmText) {
      submitButton.disabled = false;
      return;
    }
    submitButton.disabled = textInput.value.trim() !== pendingConfirmText;
  }

  function resetConfirmModal() {
    pendingConfirmAction = null;
    pendingConfirmText = "";
    const textShell = document.getElementById("confirm-modal-text-shell");
    const textInput = document.getElementById("confirm-modal-text-input");
    const submitButton = document.getElementById("confirm-modal-submit");
    if (textShell) {
      textShell.classList.add("hidden");
    }
    if (textInput) {
      textInput.value = "";
    }
    if (submitButton) {
      submitButton.disabled = false;
    }
  }

  function handleConfirmModalSubmit() {
    if (pendingConfirmText) {
      const typedValue = document.getElementById("confirm-modal-text-input").value.trim();
      if (typedValue !== pendingConfirmText) {
        syncConfirmModalState();
        return;
      }
    }
    const callback = pendingConfirmAction;
    pendingConfirmAction = null;
    pendingConfirmText = "";
    closeModal("confirm-modal");
    if (typeof callback === "function") {
      callback();
    }
  }

  function handleTransactionModalDelete() {
    const transactionId = document.getElementById("transaction-id").value;
    if (!transactionId) {
      return;
    }
    closeModal("transaction-modal");
    deleteTransaction(transactionId);
  }

  function handleTransactionModalDuplicate() {
    const transactionId = document.getElementById("transaction-id").value;
    if (!transactionId) {
      return;
    }
    const draft = getTransactionFormDraft();
    applyTransactionDraftToForm(draft, { preserveDate: false, title: "Duplicate Transaction" });
    document.getElementById("transaction-parser-notice").classList.add("hidden");
    document.getElementById("transaction-template-select").value = "";
    syncTransactionTemplateControls();
    showToast("Transaction duplicated. Review and save.");
  }

  function changeTransactionPage(direction) {
    uiState.transactionPage = Math.max(1, Number(uiState.transactionPage || 1) + direction);
    renderTransactions();
  }

  function bindFilterInput(id, key) {
    const input = document.getElementById(id);
    if (!input) {
      return;
    }
    if (key === "startDate" || key === "endDate") {
      const commitDateFilter = () => {
        uiState.filters[key] = normalizeDateInput(input.value);
        uiState.transactionPage = 1;
        renderTransactions();
      };
      input.addEventListener("change", commitDateFilter);
      input.addEventListener("blur", commitDateFilter);
      return;
    }
    const eventName = input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(eventName, (event) => {
      uiState.filters[key] = event.target.value;
      uiState.transactionPage = 1;
      renderTransactions();
    });
  }

  function initializeLockScreen() {
    const lockScreen = document.getElementById("lock-screen");
    const title = document.getElementById("lock-title");
    const modeLabel = document.getElementById("lock-mode-label");
    const hint = document.getElementById("lock-hint");
    const emailGroup = document.getElementById("lock-email-group");
    const confirmGroup = document.getElementById("lock-confirm-group");
    const toggle = document.getElementById("auth-mode-toggle");
    const passwordInput = document.getElementById("lock-password");
    const emailInput = document.getElementById("lock-email");
    const confirmInput = document.getElementById("lock-password-confirm");
    const submitButton = document.getElementById("lock-submit-button");
    const error = document.getElementById("lock-error");
    const status = document.getElementById("lock-status");

    error.classList.add("hidden");
    status.classList.add("hidden");

    modeLabel.textContent = "Supabase Cloud";
    title.textContent = "Sign in to LedgerFlow Voice";
    hint.textContent = !SUPABASE_CONFIGURED
      ? "Supabase credentials are required before anyone can sign in."
      : !SUPABASE_AVAILABLE
        ? "The Supabase client is unavailable right now. Reload after the browser client loads."
        : uiState.authView === "signup"
          ? "Create your email account to unlock cloud sync across devices."
          : "Use your Supabase email and password to open your ledger.";
    hint.classList.remove("hidden");
    toggle.classList.remove("hidden");
    emailGroup.classList.remove("hidden");
    confirmGroup.classList.toggle("hidden", uiState.authView !== "signup");
    emailInput.required = true;
    passwordInput.required = true;
    passwordInput.autocomplete = uiState.authView === "signup" ? "new-password" : "current-password";
    confirmInput.required = uiState.authView === "signup";
    submitButton.textContent = uiState.authView === "signup" ? "Create Account" : "Sign In";
    const authReady = SUPABASE_AVAILABLE;
    emailInput.disabled = !authReady;
    passwordInput.disabled = !authReady;
    confirmInput.disabled = !authReady;
    submitButton.disabled = !authReady;
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.disabled = !authReady;
    });
    updateAuthToggleButtons();

    if (!uiState.requiresLogin) {
      lockScreen.classList.add("hidden");
      lockScreen.setAttribute("aria-hidden", "true");
      document.body.classList.remove("app-locked");
      return;
    }
    lockScreen.classList.remove("hidden");
    lockScreen.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-locked");
    if (authReady) {
      emailInput.focus();
    }
  }

  async function handleLockSubmit(event) {
    event.preventDefault();
    if (!uiState.requiresLogin) {
      return;
    }
    const error = document.getElementById("lock-error");
    const status = document.getElementById("lock-status");
    const input = document.getElementById("lock-password");
    error.classList.add("hidden");
    status.classList.add("hidden");

    const email = document.getElementById("lock-email").value.trim();
    const passwordConfirm = document.getElementById("lock-password-confirm").value;
    if (!email) {
      error.textContent = "Enter your email address.";
      error.classList.remove("hidden");
      document.getElementById("lock-email").focus();
      return;
    }
    if (!input.value) {
      error.textContent = "Enter your password.";
      error.classList.remove("hidden");
      input.focus();
      return;
    }
    if (uiState.authView === "signup" && input.value !== passwordConfirm) {
      error.textContent = "Passwords do not match.";
      error.classList.remove("hidden");
      document.getElementById("lock-password-confirm").focus();
      return;
    }
    if (!cloudState.client) {
      error.textContent = "Supabase client is not ready yet.";
      error.classList.remove("hidden");
      return;
    }
    submitAuthStatus("Working...");
    try {
      if (uiState.authView === "signup") {
        const { data, error: signUpError } = await cloudState.client.auth.signUp({
          email,
          password: input.value,
          options: {
            emailRedirectTo: getAppRedirectUrl(),
          },
        });
        if (signUpError) {
          throw signUpError;
        }
        if (data.session) {
          showToast("Supabase account created.");
          clearLockInputs();
          hideAuthStatus();
          await handleSupabaseSession(data.session, false);
          return;
        }
        submitAuthStatus("Check your email to confirm the account, then sign in.");
        return;
      }

      const { data, error: signInError } = await cloudState.client.auth.signInWithPassword({
        email,
        password: input.value,
      });
      if (signInError) {
        throw signInError;
      }
      clearLockInputs();
      hideAuthStatus();
      showToast("Signed in.");
      await handleSupabaseSession(data.session, false);
      return;
    } catch (authError) {
      console.error(authError);
      hideAuthStatus();
      error.textContent = authError.message || "Unable to authenticate with Supabase.";
      error.classList.remove("hidden");
      input.select();
      return;
    }
  }

  function handleTopBarMic() {
    switchScreen("overview");
    document.getElementById("dictation-input").focus();
    toggleListening();
  }

  function handleGlobalSearchKeydown(event) {
    if (event.key === "Enter" && uiState.globalSearch.trim()) {
      event.preventDefault();
      applyGlobalQueryToTransactions(uiState.globalSearch.trim());
    }
    if (event.key === "Escape") {
      hideGlobalSearchResults();
    }
  }

  function handleDelegatedClick(event) {
    if (!event.target.closest(".top-bar")) {
      hideGlobalSearchResults();
    }
    const actionTarget = findActionTarget(event.target);
    if (!actionTarget) {
      return;
    }
    const { action, id } = actionTarget.dataset;
    if (action === "edit-transaction") {
      openTransactionModal(id);
    }
    if (action === "edit-transaction-card") {
      if (window.matchMedia("(min-width: 721px)").matches && !event.target.closest("button, a, input, select, textarea, label")) {
        openTransactionModal(id);
      }
    }
    if (action === "delete-transaction") {
      deleteTransaction(id);
    }
    if (action === "edit-account") {
      openAccountModal(id);
    }
    if (action === "delete-account") {
      deleteAccount(id);
    }
    if (action === "move-account-up") {
      moveAccount(id, -1);
    }
    if (action === "move-account-down") {
      moveAccount(id, 1);
    }
    if (action === "edit-category") {
      openCategoryModal(id);
    }
    if (action === "delete-category") {
      deleteCategory(id);
    }
    if (action === "use-example") {
      document.getElementById("dictation-input").value = actionTarget.dataset.statement || "";
      switchScreen("overview");
      document.getElementById("dictation-input").focus();
    }
    if (action === "open-calendar-day") {
      applyDateFilter(actionTarget.dataset.date || "");
    }
    if (action === "open-search-result") {
      openGlobalSearchResult(actionTarget.dataset.kind, id, actionTarget.dataset.query || "");
    }
    if (action === "set-report-chart-style") {
      uiState.reports.chartStyle = actionTarget.dataset.style || "donut";
      renderReports();
      return;
    }
    if (action === "open-report-segment") {
      openReportDetailModal(getReportChartSegmentDetail(actionTarget.dataset.index || ""));
    }
    if (action === "show-report-chart-tooltip") {
      const index = actionTarget.dataset.index || "";
      if (reportChartTooltipState.pinned && reportChartTooltipState.index === index) {
        hideReportChartTooltip(true);
        return;
      }
      showReportChartTooltip(index, actionTarget, true);
    }
    if (action === "open-report-detail-entries") {
      openReportEntriesFromDetail();
    }
    if (action === "open-report-tooltip-entries") {
      openReportEntriesFromTooltip(actionTarget.dataset.index || "");
    }
    if (action === "select-smart-field-option") {
      const value = actionTarget.dataset.value || "";
      const wasSelected = smartFieldPickerState.selectedValue === value;
      smartFieldPickerState.selectedValue = value;
      document.getElementById("smart-field-picker-input").value = value;
      syncSmartFieldPickerActiveOption(value);
      if (wasSelected && shouldCommitSmartFieldDoubleTap(value)) {
        applySmartFieldPickerValue(value);
        return;
      }
    }
    if (action === "remove-transaction-filter") {
      removeTransactionFilter(actionTarget.dataset.key || "");
    }
  }

  function setAuthView(mode) {
    uiState.authView = mode === "signup" ? "signup" : "signin";
    clearLockInputs();
    hideAuthStatus();
    initializeLockScreen();
  }

  function updateAuthToggleButtons() {
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.classList.toggle("lock-toggle-active", button.dataset.authMode === uiState.authView);
    });
  }

  function clearLockInputs() {
    document.getElementById("lock-email").value = "";
    document.getElementById("lock-password").value = "";
    document.getElementById("lock-password-confirm").value = "";
  }

  function submitAuthStatus(message) {
    const status = document.getElementById("lock-status");
    status.textContent = message;
    status.classList.remove("hidden");
  }

  function hideAuthStatus() {
    const status = document.getElementById("lock-status");
    const error = document.getElementById("lock-error");
    status.classList.add("hidden");
    error.classList.add("hidden");
  }

  function renderAll() {
    renderSelectOptions();
    renderOverview();
    renderTransactions();
    renderAccounts();
    renderCategories();
    renderReports();
    syncReportTypeButtons();
    syncReportRangeOptionLabels();
    syncReportRangeNavigator();
    renderCalendarOverview();
    renderGlobalSearchResults();
    renderCloudStatus();
  }

  function renderOverview() {
    const totals = getGlobalMetrics();
    const baseSymbol = getPrimaryCurrencySymbol();
    document.getElementById("total-balance").textContent = formatMoney(totals.balance, baseSymbol);
    document.getElementById("month-income").textContent = formatMoney(totals.monthIncome, baseSymbol);
    document.getElementById("month-expense").textContent = formatMoney(totals.monthExpense, baseSymbol);
    document.getElementById("week-income").textContent = formatMoney(totals.weekIncome, baseSymbol);
    document.getElementById("week-expense").textContent = formatMoney(totals.weekExpense, baseSymbol);
    document.getElementById("day-income").textContent = formatMoney(totals.dayIncome, baseSymbol);
    document.getElementById("day-expense").textContent = formatMoney(totals.dayExpense, baseSymbol);

    const accountsContainer = document.getElementById("overview-accounts");
    accountsContainer.innerHTML = state.accounts.length
      ? state.accounts.map((account) => renderAccountCard(account)).join("")
      : renderEmpty("No accounts yet. Add an account to start tracking balances.");

    const heroAccounts = state.accounts.slice(0, 3);
    document.getElementById("hero-account-strip").innerHTML = heroAccounts.length
      ? heroAccounts.map(renderHeroAccountPill).join("")
      : "";
  }

  function renderTransactions() {
    syncTransactionFilterInputs();
    const matches = getFilteredTransactions();
    const totalPages = Math.max(1, Math.ceil(matches.length / TRANSACTIONS_PAGE_SIZE));
    uiState.transactionPage = Math.min(Math.max(1, uiState.transactionPage || 1), totalPages);
    const startIndex = (uiState.transactionPage - 1) * TRANSACTIONS_PAGE_SIZE;
    const visibleMatches = matches.slice(startIndex, startIndex + TRANSACTIONS_PAGE_SIZE);
    document.getElementById("transaction-result-count").textContent = `${matches.length} matching transaction${
      matches.length === 1 ? "" : "s"
    }`;
    document.getElementById("transaction-filter-snapshot").innerHTML = renderTransactionFilterSnapshot(matches);
    renderTransactionFilterChips();
    document.getElementById("transaction-list").innerHTML = matches.length
      ? visibleMatches.map(renderTransactionItem).join("")
      : renderEmpty("No transactions match your search yet.");
    const pagination = document.getElementById("transaction-pagination");
    const pageLabel = document.getElementById("transaction-page-label");
    const prevButton = document.getElementById("transaction-page-prev-button");
    const nextButton = document.getElementById("transaction-page-next-button");
    pagination.classList.toggle("hidden", matches.length <= TRANSACTIONS_PAGE_SIZE);
    pageLabel.textContent = `Page ${uiState.transactionPage} of ${totalPages}`;
    prevButton.disabled = uiState.transactionPage <= 1;
    nextButton.disabled = uiState.transactionPage >= totalPages;
  }

  function renderTransactionFilterChips() {
    const container = document.getElementById("transaction-filter-chips");
    if (!container) {
      return;
    }
    const chips = [];
    if (uiState.filters.search) {
      chips.push(renderTransactionFilterChip("search", `Search: ${uiState.filters.search}`));
    }
    if (uiState.filters.type && uiState.filters.type !== "all") {
      chips.push(renderTransactionFilterChip("type", `Type: ${titleCase(uiState.filters.type)}`));
    }
    if (uiState.filters.account && uiState.filters.account !== "all") {
      const account = getAccount(uiState.filters.account);
      chips.push(renderTransactionFilterChip("account", `Account: ${account?.name || "Unknown"}`));
    }
    if (uiState.filters.category && uiState.filters.category !== "all") {
      const category = getCategory(uiState.filters.category);
      chips.push(renderTransactionFilterChip("category", `Category: ${category?.name || "Unknown"}`));
    }
    if (uiState.filters.subcategory) {
      chips.push(renderTransactionFilterChip("subcategory", `Subcategory: ${uiState.filters.subcategory}`));
    }
    if (uiState.filters.counterparty) {
      chips.push(renderTransactionFilterChip("counterparty", `Payee/Payer: ${uiState.filters.counterparty}`));
    }
    if (uiState.filters.project) {
      chips.push(renderTransactionFilterChip("project", `Project: ${uiState.filters.project}`));
    }
    if (uiState.filters.tag) {
      chips.push(renderTransactionFilterChip("tag", `Tag: ${uiState.filters.tag}`));
    }
    if (uiState.filters.startDate || uiState.filters.endDate) {
      const start = formatDateFilterDisplay(uiState.filters.startDate || "");
      const end = formatDateFilterDisplay(uiState.filters.endDate || "");
      const label =
        start && end ? `Date: ${start} - ${end}` : start ? `From: ${start}` : `To: ${end}`;
      chips.push(renderTransactionFilterChip("date", label));
    }

    container.classList.toggle("hidden", chips.length === 0);
    container.innerHTML = chips.length ? `<div class="transaction-filter-chip-list">${chips.join("")}</div>` : "";
  }

  function renderTransactionFilterChip(key, label) {
    return `
      <button class="meta-pill neutral transaction-filter-chip" type="button" data-action="remove-transaction-filter" data-key="${escapeAttribute(key)}">
        <span>${escapeHtml(label)}</span>
        <strong aria-hidden="true">X</strong>
      </button>
    `;
  }

  function removeTransactionFilter(key) {
    if (!key) {
      return;
    }
    if (key === "search") {
      uiState.filters.search = "";
    }
    if (key === "type") {
      uiState.filters.type = "all";
    }
    if (key === "account") {
      uiState.filters.account = "all";
    }
    if (key === "category") {
      uiState.filters.category = "all";
    }
    if (key === "subcategory") {
      uiState.filters.subcategory = "";
    }
    if (key === "counterparty") {
      uiState.filters.counterparty = "";
    }
    if (key === "project") {
      uiState.filters.project = "";
    }
    if (key === "tag") {
      uiState.filters.tag = "";
    }
    if (key === "date") {
      uiState.filters.startDate = "";
      uiState.filters.endDate = "";
    }
    uiState.transactionPage = 1;
    renderTransactions();
  }

  function renderTransactionFilterSnapshot(transactions) {
    const baseSymbol = getPrimaryCurrencySymbol();
    const income = sumAmounts(transactions.filter((transaction) => transaction.type === "income"));
    const expense = sumAmounts(transactions.filter((transaction) => transaction.type === "expense"));
    const transfer = sumAmounts(transactions.filter((transaction) => transaction.type === "transfer"));
    const net = income - expense;
    const average = transactions.length ? sumAmounts(transactions) / transactions.length : 0;
    const largest = transactions.reduce((best, transaction) => (!best || Number(transaction.amount || 0) > Number(best.amount || 0) ? transaction : best), null);
    const trendSeries = buildTransactionSnapshotSeries(transactions);
    const topCategories = getTransactionSnapshotTopCategories(transactions);

    return `
      <div class="snapshot-shell">
        <div class="section-heading compact transaction-snapshot-heading">
          <div>
            <p class="eyebrow">Filtered Snapshot</p>
            <h4>Live Search Summary</h4>
          </div>
          <span class="meta-pill neutral">${transactions.length} match${transactions.length === 1 ? "" : "es"}</span>
        </div>
        <div class="transaction-snapshot-grid">
          ${renderTransactionSnapshotCard("Matches", String(transactions.length), "Current filtered rows")}
          ${renderTransactionSnapshotCard("Income", formatMoney(income, baseSymbol), "Filtered income", "income")}
          ${renderTransactionSnapshotCard("Expenses", formatMoney(expense, baseSymbol), "Filtered expense", "expense")}
          ${renderTransactionSnapshotCard("Transfers", formatMoney(transfer, baseSymbol), "Transfer volume", "transfer")}
          ${renderTransactionSnapshotCard("Net", formatMoney(net, baseSymbol), "Income minus expense", net >= 0 ? "income" : "expense")}
          ${renderTransactionSnapshotCard(
            "Average",
            formatMoney(average, baseSymbol),
            largest ? `Largest ${formatTransactionAmount(largest.amount, largest)}` : "No transactions yet"
          )}
        </div>
        <div class="transaction-snapshot-analysis">
          <article class="transaction-snapshot-panel">
            <div class="transaction-snapshot-panel-head">
              <strong>Daily Trend</strong>
              <span>${escapeHtml(trendSeries[0]?.label || "")}${trendSeries.length > 1 ? ` - ${escapeHtml(trendSeries[trendSeries.length - 1]?.label || "")}` : ""}</span>
            </div>
            ${renderTransactionSnapshotTrend(trendSeries)}
          </article>
          <article class="transaction-snapshot-panel">
            <div class="transaction-snapshot-panel-head">
              <strong>Top Categories</strong>
              <span>${topCategories.length ? "By filtered amount" : "Waiting for categorized entries"}</span>
            </div>
            ${renderTransactionSnapshotCategories(topCategories, baseSymbol)}
          </article>
        </div>
      </div>
    `;
  }

  function renderTransactionSnapshotCard(label, value, note, tone = "") {
    return `
      <article class="transaction-snapshot-card ${tone ? `transaction-snapshot-card-${tone}` : ""}">
        <p class="eyebrow">${escapeHtml(label)}</p>
        <strong class="money">${escapeHtml(value)}</strong>
        <p>${escapeHtml(note)}</p>
      </article>
    `;
  }

  function buildTransactionSnapshotSeries(transactions) {
    const grouped = new Map();
    transactions.forEach((transaction) => {
      const key = String(transaction.date || "").trim();
      if (!key) {
        return;
      }
      const current = grouped.get(key) || { income: 0, expense: 0, transfer: 0 };
      current[transaction.type] += Number(transaction.amount || 0);
      grouped.set(key, current);
    });
    const rows = [...grouped.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .slice(-14)
      .map(([date, totals]) => ({
        key: date,
        label: date.slice(5).replace("-", "/"),
        value: Number(totals.income || 0) - Number(totals.expense || 0),
        income: Number(totals.income || 0),
        expense: Number(totals.expense || 0),
        transfer: Number(totals.transfer || 0),
      }));
    return rows.length ? rows : [{ key: "", label: "No data", value: 0, income: 0, expense: 0, transfer: 0 }];
  }

  function renderTransactionSnapshotTrend(series) {
    const points = series.map((item) => Number(item.value || 0));
    const hasActivity = points.some((value) => value !== 0);
    if (!hasActivity) {
      return `<div class="mini-trend-empty transaction-snapshot-empty">No filtered movement yet</div>`;
    }
    const width = 320;
    const height = 78;
    const padding = 6;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const coords = points.map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
      const normalized = (value - min) / range;
      const y = height - padding - normalized * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const areaPath = [`M ${padding} ${height - padding}`, ...coords.map((point) => `L ${point.replace(",", " ")}`), `L ${width - padding} ${height - padding}`, "Z"].join(" ");
    return `
      <svg class="transaction-snapshot-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <path d="${areaPath}" fill="rgba(18, 200, 164, 0.14)"></path>
        <polyline points="${coords.join(" ")}" fill="none" stroke="#12c8a4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>
    `;
  }

  function getTransactionSnapshotTopCategories(transactions) {
    const map = new Map();
    transactions
      .filter((transaction) => transaction.type !== "transfer")
      .forEach((transaction) => {
        const category = getCategory(transaction.categoryId);
        const key = category?.id || `uncategorized-${transaction.type}`;
        const current = map.get(key) || {
          label: category?.name || "Uncategorized",
          color: category?.color || (transaction.type === "income" ? "#1ca866" : "#d35a5a"),
          value: 0,
        };
        current.value += Number(transaction.amount || 0);
        map.set(key, current);
      });
    return [...map.values()]
      .sort((left, right) => right.value - left.value)
      .slice(0, 3);
  }

  function renderTransactionSnapshotCategories(rows, baseSymbol) {
    if (!rows.length) {
      return `<div class="mini-trend-empty transaction-snapshot-empty">No categorized entries in this filtered set</div>`;
    }
    const max = Math.max(...rows.map((row) => row.value), 1);
    return `
      <div class="transaction-snapshot-bars">
        ${rows
          .map(
            (row) => `
              <div class="transaction-snapshot-bar-row">
                <div class="transaction-snapshot-bar-meta">
                  <strong>${escapeHtml(row.label)}</strong>
                  <span>${formatMoney(row.value, baseSymbol)}</span>
                </div>
                <div class="bar-fill transaction-snapshot-bar-fill">
                  <span style="width:${(row.value / max) * 100}%; background:${escapeHtml(row.color)};"></span>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderAccounts() {
    const baseSymbol = getPrimaryCurrencySymbol();
    const balances = state.accounts.map((account) => ({
      account,
      balance: getAccountBalance(account.id),
      incoming: getAccountFlow(account.id).incoming,
      outgoing: getAccountFlow(account.id).outgoing,
    }));
    document.getElementById("account-metrics").innerHTML = [
      metricCard("Active Accounts", String(state.accounts.length), "Track cash, bank, wallet, and savings"),
      metricCard(
        "Largest Balance",
        balances.length ? formatMoney(Math.max(...balances.map((entry) => entry.balance)), baseSymbol) : formatMoney(0, baseSymbol),
        "Top current account balance"
      ),
      metricCard(
        "Incoming Flow",
        formatMoney(balances.reduce((sum, entry) => sum + entry.incoming, 0), baseSymbol),
        "Income plus transfers in"
      ),
      metricCard(
        "Outgoing Flow",
        formatMoney(balances.reduce((sum, entry) => sum + entry.outgoing, 0), baseSymbol),
        "Expenses plus transfers out"
      ),
    ].join("");

    document.getElementById("account-list").innerHTML = state.accounts.length
      ? state.accounts.map((account) => renderAccountCard(account, true)).join("")
      : renderEmpty("Create your first account to unlock transfers and balance tracking.");
  }

  function renderCategories() {
    const container = document.getElementById("category-list");
    const expenses = state.categories
      .filter((category) => category.type === "expense")
      .sort((a, b) => a.name.localeCompare(b.name));
    const income = state.categories
      .filter((category) => category.type === "income")
      .sort((a, b) => a.name.localeCompare(b.name));
    const groupedMarkup = [];
    if (expenses.length) {
      groupedMarkup.push(renderCategoryGroup("Expenses", expenses));
    }
    if (income.length) {
      groupedMarkup.push(renderCategoryGroup("Income", income));
    }
    container.innerHTML = groupedMarkup.length
      ? groupedMarkup.join("")
      : renderEmpty("No categories available yet.");
  }

  function renderSelectOptions() {
    populateAccountSelect(document.getElementById("filter-account"), true);
    populateCategorySelect(document.getElementById("filter-category"), true);
    populateAccountSelect(document.getElementById("report-account"), true);

    populateAccountSelect(document.getElementById("transaction-account"), false, "Select account");
    populateAccountSelect(document.getElementById("transaction-from-account"), false, "Select source");
    populateAccountSelect(document.getElementById("transaction-to-account"), false, "Select destination");
    populateCategorySelect(document.getElementById("transaction-category"), false, "Optional category");

    renderTransactionSmartFieldOptions();
  }

  function populateAccountSelect(select, includeAll, placeholder) {
    if (!select) {
      return;
    }
    const current = select.value;
    const options = [];
    if (includeAll) {
      options.push('<option value="all">All Accounts</option>');
    } else if (placeholder) {
      options.push(`<option value="">${placeholder}</option>`);
    }
    state.accounts.forEach((account) => {
      options.push(`<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`);
    });
    select.innerHTML = options.join("");
    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    }
  }

  function populateCategorySelect(select, includeAll, placeholder) {
    if (!select) {
      return;
    }
    const current = select.value;
    const options = [];
    if (includeAll) {
      options.push('<option value="all">All Categories</option>');
    } else if (placeholder) {
      options.push(`<option value="">${placeholder}</option>`);
    }
    const transactionType = document.getElementById("transaction-type")?.value || "expense";
    const categories =
      select.id === "transaction-category" && !includeAll
        ? getRankedTransactionCategorySuggestions(transactionType)
        : state.categories;
    categories.forEach((category) => {
      options.push(`<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`);
    });
    select.innerHTML = options.join("");
    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    }
  }

  function renderTransactionSmartFieldOptions() {
    populateCategorySelect(document.getElementById("transaction-category"), false, "Optional category");
    renderSubcategoryOptions();
  }

  function renderTransactionFilterSubcategoryOptions() {
    const categoryId = document.getElementById("filter-category")?.value || "all";
    const input = document.getElementById("filter-subcategory");
    const datalist = document.getElementById("filter-subcategory-options");
    if (!input || !datalist) {
      return;
    }
    const current = input.value;
    const normalizedCategoryId = categoryId === "all" ? "" : categoryId;
    const category = normalizedCategoryId ? getCategory(normalizedCategoryId) : null;
    const ranked = normalizedCategoryId ? getRankedSubcategorySuggestions(normalizedCategoryId) : [];
    const options = [];
    if (ranked.length) {
      ranked.forEach((subcategory) => {
        options.push(`<option value="${escapeHtml(subcategory)}"></option>`);
      });
    } else if (category && Array.isArray(category.subcategories)) {
      category.subcategories.forEach((subcategory) => {
        options.push(`<option value="${escapeHtml(subcategory)}"></option>`);
      });
    }
    datalist.innerHTML = options.join("");
    input.placeholder = category
      ? "Ranked subcategories for selected category"
      : "Select a category for ranked subcategories";
    if (!normalizedCategoryId && uiState.filters.subcategory) {
      uiState.filters.subcategory = "";
    }
    const allowedValues = new Set(ranked.length ? ranked : category?.subcategories || []);
    if (current && (!normalizedCategoryId || !allowedValues.size || allowedValues.has(current))) {
      input.value = current;
    } else if (current && normalizedCategoryId) {
      input.value = "";
      if (uiState.filters.subcategory === current) {
        uiState.filters.subcategory = "";
      }
    }
    renderTransactionFilterValueSuggestions();
  }

  function renderTransactionFilterValueSuggestions() {
    const categoryId = document.getElementById("filter-category")?.value || "all";
    const type = document.getElementById("filter-type")?.value || "all";
    const subcategory = document.getElementById("filter-subcategory")?.value.trim() || "";
    populateRankedDatalist(
      document.getElementById("filter-counterparty-options"),
      getRankedFilterTransactionValueSuggestions("counterparty", type, categoryId, subcategory)
    );
    populateRankedDatalist(
      document.getElementById("filter-project-options"),
      getRankedFilterTransactionValueSuggestions("project", type, categoryId, subcategory)
    );
    populateRankedDatalist(
      document.getElementById("filter-tag-options"),
      getRankedFilterTagSuggestions(type, categoryId, subcategory)
    );
  }

  function renderSubcategoryOptions() {
    const categoryId = document.getElementById("transaction-category").value;
    const input = document.getElementById("transaction-subcategory");
    const datalist = document.getElementById("transaction-subcategory-options");
    const current = input.value;
    const category = getCategory(categoryId);
    const ranked = getRankedSubcategorySuggestions(categoryId);
    const options = [];
    if (ranked.length) {
      ranked.forEach((subcategory) => {
        options.push(`<option value="${escapeHtml(subcategory)}"></option>`);
      });
    } else if (category && Array.isArray(category.subcategories)) {
      category.subcategories.forEach((subcategory) => {
        options.push(`<option value="${escapeHtml(subcategory)}"></option>`);
      });
    }
    datalist.innerHTML = options.join("");
    input.placeholder = category ? "Choose or type a subcategory" : "Select category first or type a subcategory";
    if (current) {
      input.value = current;
    }
    renderTransactionLinkedSuggestions();
  }

  function renderTransactionLinkedSuggestions() {
    const type = document.getElementById("transaction-type").value || "expense";
    const categoryId = document.getElementById("transaction-category").value || "";
    const subcategory = document.getElementById("transaction-subcategory").value.trim();
    populateRankedDatalist(
      document.getElementById("transaction-counterparty-options"),
      getRankedTransactionValueSuggestions("counterparty", type, categoryId, subcategory)
    );
    populateRankedDatalist(
      document.getElementById("transaction-project-options"),
      getRankedTransactionValueSuggestions("project", type, categoryId, subcategory)
    );
  }

  function populateRankedDatalist(datalist, values) {
    if (!datalist) {
      return;
    }
    datalist.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  }

  function getRankedSubcategorySuggestions(categoryId) {
    const category = getCategory(categoryId);
    if (!category) {
      return [];
    }
    const counts = new Map();
    const lastUsed = new Map();
    state.transactions.forEach((transaction) => {
      if (transaction.categoryId !== categoryId) {
        return;
      }
      const value = String(transaction.subcategory || "").trim();
      if (!value) {
        return;
      }
      const key = value.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
      lastUsed.set(key, transaction.updatedAt || transaction.createdAt || transaction.date || "");
    });

    const entries = new Map();
    (category.subcategories || []).forEach((subcategory) => {
      const value = String(subcategory || "").trim();
      if (!value) {
        return;
      }
      const key = value.toLowerCase();
      entries.set(key, {
        value,
        count: counts.get(key) || 0,
        lastUsed: lastUsed.get(key) || "",
      });
    });
    state.transactions.forEach((transaction) => {
      if (transaction.categoryId !== categoryId) {
        return;
      }
      const value = String(transaction.subcategory || "").trim();
      if (!value) {
        return;
      }
      const key = value.toLowerCase();
      if (!entries.has(key)) {
        entries.set(key, {
          value,
          count: counts.get(key) || 0,
          lastUsed: lastUsed.get(key) || "",
        });
      }
    });

    return [...entries.values()]
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        if ((right.lastUsed || "") !== (left.lastUsed || "")) {
          return String(right.lastUsed || "").localeCompare(String(left.lastUsed || ""));
        }
        return left.value.localeCompare(right.value);
      })
      .map((entry) => entry.value);
  }

  function getRankedTransactionCategorySuggestions(type) {
    const normalizedType = type === "income" ? "income" : "expense";
    const counts = new Map();
    const lastUsed = new Map();
    state.transactions.forEach((transaction) => {
      if (transaction.type !== normalizedType || !transaction.categoryId) {
        return;
      }
      const key = String(transaction.categoryId);
      counts.set(key, (counts.get(key) || 0) + 1);
      lastUsed.set(key, String(transaction.updatedAt || transaction.createdAt || transaction.date || ""));
    });
    return state.categories
      .filter((category) => category.type === normalizedType)
      .map((category) => ({
        category,
        count: counts.get(category.id) || 0,
        lastUsed: lastUsed.get(category.id) || "",
      }))
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        if ((right.lastUsed || "") !== (left.lastUsed || "")) {
          return String(right.lastUsed || "").localeCompare(String(left.lastUsed || ""));
        }
        return left.category.name.localeCompare(right.category.name);
      })
      .map((entry) => entry.category);
  }

  function getRankedTransactionValueSuggestions(field, type, categoryId, subcategory) {
    if (type === "transfer") {
      return [];
    }
    const normalizedCategoryId = String(categoryId || "").trim();
    const normalizedSubcategory = String(subcategory || "").trim().toLowerCase();
    const exact = new Map();
    const fallback = new Map();
    state.transactions.forEach((transaction) => {
      if (transaction.type !== type) {
        return;
      }
      if (normalizedCategoryId && transaction.categoryId !== normalizedCategoryId) {
        return;
      }
      const rawValue = String(transaction[field] || "").trim();
      if (!rawValue) {
        return;
      }
      const key = rawValue.toLowerCase();
      const targetMap =
        normalizedSubcategory && String(transaction.subcategory || "").trim().toLowerCase() === normalizedSubcategory ? exact : fallback;
      const existing = targetMap.get(key) || { value: rawValue, count: 0, lastUsed: "" };
      existing.count += 1;
      existing.lastUsed = String(transaction.updatedAt || transaction.createdAt || transaction.date || existing.lastUsed || "");
      targetMap.set(key, existing);
    });

    const ranked = [...exact.values(), ...[...fallback.values()].filter((entry) => !exact.has(entry.value.toLowerCase()))];
    return ranked
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        if ((right.lastUsed || "") !== (left.lastUsed || "")) {
          return String(right.lastUsed || "").localeCompare(String(left.lastUsed || ""));
        }
        return left.value.localeCompare(right.value);
      })
      .map((entry) => entry.value)
      ;
  }

  function getRankedFilterTransactionValueSuggestions(field, type, categoryId, subcategory) {
    const normalizedType = type && type !== "all" ? type : "";
    const normalizedCategoryId = categoryId && categoryId !== "all" ? categoryId : "";
    const normalizedSubcategory = String(subcategory || "").trim().toLowerCase();
    const exact = new Map();
    const fallback = new Map();
    state.transactions.forEach((transaction) => {
      if (normalizedType && transaction.type !== normalizedType) {
        return;
      }
      if (normalizedCategoryId && transaction.categoryId !== normalizedCategoryId) {
        return;
      }
      const rawValue = String(transaction[field] || "").trim();
      if (!rawValue) {
        return;
      }
      const key = rawValue.toLowerCase();
      const targetMap =
        normalizedSubcategory && String(transaction.subcategory || "").trim().toLowerCase() === normalizedSubcategory ? exact : fallback;
      const existing = targetMap.get(key) || { value: rawValue, count: 0, lastUsed: "" };
      existing.count += 1;
      existing.lastUsed = String(transaction.updatedAt || transaction.createdAt || transaction.date || existing.lastUsed || "");
      targetMap.set(key, existing);
    });

    const ranked = [...exact.values(), ...[...fallback.values()].filter((entry) => !exact.has(entry.value.toLowerCase()))];
    return ranked
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        if ((right.lastUsed || "") !== (left.lastUsed || "")) {
          return String(right.lastUsed || "").localeCompare(String(left.lastUsed || ""));
        }
        return left.value.localeCompare(right.value);
      })
      .map((entry) => entry.value)
      ;
  }

  function getRankedFilterTagSuggestions(type, categoryId, subcategory) {
    const normalizedType = type && type !== "all" ? type : "";
    const normalizedCategoryId = categoryId && categoryId !== "all" ? categoryId : "";
    const normalizedSubcategory = String(subcategory || "").trim().toLowerCase();
    const exact = new Map();
    const fallback = new Map();
    state.transactions.forEach((transaction) => {
      if (normalizedType && transaction.type !== normalizedType) {
        return;
      }
      if (normalizedCategoryId && transaction.categoryId !== normalizedCategoryId) {
        return;
      }
      (transaction.tags || []).forEach((tag) => {
        const rawValue = String(tag || "").trim();
        if (!rawValue) {
          return;
        }
        const key = rawValue.toLowerCase();
        const targetMap =
          normalizedSubcategory && String(transaction.subcategory || "").trim().toLowerCase() === normalizedSubcategory ? exact : fallback;
        const existing = targetMap.get(key) || { value: rawValue, count: 0, lastUsed: "" };
        existing.count += 1;
        existing.lastUsed = String(transaction.updatedAt || transaction.createdAt || transaction.date || existing.lastUsed || "");
        targetMap.set(key, existing);
      });
    });

    const ranked = [...exact.values(), ...[...fallback.values()].filter((entry) => !exact.has(entry.value.toLowerCase()))];
    return ranked
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        if ((right.lastUsed || "") !== (left.lastUsed || "")) {
          return String(right.lastUsed || "").localeCompare(String(left.lastUsed || ""));
        }
        return left.value.localeCompare(right.value);
      })
      .map((entry) => entry.value)
      ;
  }

  function switchScreen(screen) {
    uiState.screen = screen;
    document.querySelectorAll(".screen").forEach((section) => {
      section.classList.toggle("screen-active", section.dataset.screen === screen);
    });
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("nav-item-active", button.dataset.screenTarget === screen);
    });
  }

  function getDateRange(range, anchorOverride = "") {
    const anchorIso = anchorOverride || uiState.reports.anchorDate || todayIso();
    const reference = range === "all" ? new Date() : parseIsoDate(anchorIso, 12);
    const now = new Date();
    const today = todayIso();
    if (range === "all") {
      return { start: "", end: "" };
    }
    if (range === "custom") {
      let start = normalizeDateInput(uiState.reports.customStartDate || "");
      let end = normalizeDateInput(uiState.reports.customEndDate || "");
      if (start && end && start > end) {
        [start, end] = [end, start];
      }
      if (start && !end) {
        end = start;
      }
      if (end && !start) {
        start = end;
      }
      return { start, end };
    }
    if (range === "last30") {
      const end = reference > now ? today : toLocalIsoDate(reference);
      return { start: shiftIsoDate(end, -29), end };
    }
    if (range === "thisMonth") {
      const endOfMonth = toLocalIsoDate(new Date(reference.getFullYear(), reference.getMonth() + 1, 0));
      return {
        start: `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-01`,
        end:
          reference.getFullYear() === now.getFullYear() && reference.getMonth() === now.getMonth()
            ? today
            : endOfMonth,
      };
    }
    if (range === "thisQuarter") {
      const quarterStartMonth = Math.floor(reference.getMonth() / 3) * 3;
      const quarterEnd = toLocalIsoDate(new Date(reference.getFullYear(), quarterStartMonth + 3, 0));
      return {
        start: `${reference.getFullYear()}-${String(quarterStartMonth + 1).padStart(2, "0")}-01`,
        end:
          reference.getFullYear() === now.getFullYear() && Math.floor(reference.getMonth() / 3) === Math.floor(now.getMonth() / 3)
            ? today
            : quarterEnd,
      };
    }
    if (range === "thisYear") {
      const yearEnd = `${reference.getFullYear()}-12-31`;
      return {
        start: `${reference.getFullYear()}-01-01`,
        end: reference.getFullYear() === now.getFullYear() ? today : yearEnd,
      };
    }
    return { start: "", end: "" };
  }

  function deleteTransaction(id) {
    openConfirmModal({
      eyebrow: "Delete",
      title: "Delete this transaction?",
      message: "This transaction will be removed from your ledger.",
      submitLabel: "Delete",
      onConfirm: () => {
        state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
        persistAndRefresh();
        showToast("Transaction deleted.");
      },
    });
  }

  function clearAllTransactions() {
    openConfirmModal({
      eyebrow: "Reset",
      title: "Clear all transactions?",
      message: "This will remove every transaction from your ledger and Supabase, but it will keep your accounts and categories.",
      submitLabel: "Clear All",
      confirmationText: "CLEAR ALL TRANSACTIONS",
      onConfirm: () => {
        state.transactions = [];
        uiState.transactionPage = 1;
        clearFilters();
        persistAndRefresh();
        showToast("All transactions cleared.");
      },
    });
  }

  function deleteAccount(id) {
    const linked = state.transactions.some(
      (transaction) => transaction.accountId === id || transaction.fromAccountId === id || transaction.toAccountId === id
    );
    if (linked) {
      showToast("This account is used by transactions. Edit the transactions first.");
      return;
    }
    openConfirmModal({
      eyebrow: "Delete",
      title: "Delete this account?",
      message: "This account will be removed permanently.",
      submitLabel: "Delete",
      onConfirm: () => {
        state.accounts = state.accounts.filter((account) => account.id !== id);
        persistAndRefresh();
        showToast("Account deleted.");
      },
    });
  }

  function deleteCategory(id) {
    const linked = state.transactions.some((transaction) => transaction.categoryId === id);
    if (linked) {
      showToast("This category is already used by transactions.");
      return;
    }
    openConfirmModal({
      eyebrow: "Delete",
      title: "Delete this category?",
      message: "This category will be removed permanently.",
      submitLabel: "Delete",
      onConfirm: () => {
        state.categories = state.categories.filter((category) => category.id !== id);
        persistAndRefresh();
        showToast("Category deleted.");
      },
    });
  }

  function persistAndRefresh() {
    persistState();
    renderAll();
    if (uiState.isAuthenticated) {
      void syncStateToSupabase(false);
    }
  }


  function renderTransactionItem(transaction) {
    const category = getCategory(transaction.categoryId);
    const transactionSymbol = getTransactionCurrencySymbol(transaction);
    const typeLabel = titleCase(transaction.type);
    const typeColor =
      transaction.type === "expense" ? "#ef6461" : transaction.type === "income" ? "#12c8a4" : "#00a6c7";
    const cardColor = category?.color || typeColor;
    const headerPills = `
      <div class="transaction-category-box">
        <span class="tag-pill transaction-theme-pill">${escapeHtml(category?.name || typeLabel)}</span>
        ${
          transaction.subcategory
            ? `<span class="transaction-category-arrow" aria-hidden="true">➜</span><span class="meta-pill transaction-subcategory-pill">${escapeHtml(
                transaction.subcategory
              )}</span>`
            : ""
        }
      </div>
    `;
    const tagPills = (transaction.tags || []).map((tag) => `<span class="meta-pill neutral">#${escapeHtml(tag)}</span>`).join("");
    const accountPills =
      transaction.type === "transfer"
        ? [getAccount(transaction.fromAccountId), getAccount(transaction.toAccountId)]
            .filter(Boolean)
            .map(
              (account) =>
                `<span class="account-theme-pill" style="--account-pill-color:${escapeHtml(account.color || "#19c6a7")}">${escapeHtml(
                  account.name
                )}</span>`
            )
            .join("")
        : (() => {
            const account = getAccount(transaction.accountId);
            if (!account) {
              return '<span class="account-theme-pill" style="--account-pill-color:#5f7380">Unknown</span>';
            }
            return `<span class="account-theme-pill" style="--account-pill-color:${escapeHtml(account.color || "#19c6a7")}">${escapeHtml(
              account.name
            )}</span>`;
          })();
    const renderCategoryIcon = (icon) => {
      const value = String(icon || "").trim();
      if (value && iconRegistry[value]) {
        return iconRegistry[value];
      }
      if (value) {
        return `<span class="custom-icon-text">${escapeHtml(value)}</span>`;
      }
      return transaction.type === "expense"
        ? iconRegistry["arrow-down"]
        : transaction.type === "income"
          ? iconRegistry["arrow-up"]
          : iconRegistry.swap;
    };
    const leadingIcon =
      category ? renderCategoryIcon(category.icon) : renderCategoryIcon("");
    const counterpartyLabel = transaction.type === "income" ? "Payer" : "Payee";
    const detailPillParts = [
      transaction.counterparty
        ? `<span class="meta-pill transaction-pill-payee">${escapeHtml(counterpartyLabel)}: ${escapeHtml(transaction.counterparty)}</span>`
        : "",
      transaction.project ? `<span class="meta-pill transaction-pill-project">${escapeHtml(transaction.project)}</span>` : "",
      tagPills ? `<span class="transaction-inline-tags">${tagPills}</span>` : "",
    ]
      .filter(Boolean);
    const detailPillsInline = detailPillParts.join('<span class="transaction-header-separator transaction-inline-separator">|</span>');
    const detailPills = detailPillParts.join("");
    return `
      <article class="transaction-item ${escapeHtml(transaction.type)}" style="--card-color:${escapeHtml(cardColor)}" data-action="edit-transaction-card" data-id="${escapeHtml(
        transaction.id
      )}">
        <div class="transaction-top">
          <div class="transaction-main">
            <div class="transaction-rail">
              <div class="transaction-badge">${leadingIcon}</div>
              <div class="transaction-mobile-actions">
                <button class="icon-button transaction-icon-action" type="button" data-action="edit-transaction" data-id="${escapeHtml(transaction.id)}" aria-label="Edit transaction">
                  ${iconRegistry.pen}
                </button>
                <button class="icon-button transaction-icon-action delete" type="button" data-action="delete-transaction" data-id="${escapeHtml(transaction.id)}" aria-label="Delete transaction">
                  ${iconRegistry.bin}
                </button>
              </div>
            </div>
            <div class="transaction-details">
              <div class="transaction-header-line">
                <div class="transaction-header-copy">
                  <div class="transaction-top-meta">
                    <span class="transaction-date-inline">${escapeHtml(transaction.date)}</span>
                    <span class="transaction-header-separator">|</span>
                    <div class="transaction-tags transaction-tags-primary transaction-tags-header">
                      ${headerPills}
                    </div>
                    ${
                      detailPillsInline
                        ? `<span class="transaction-header-separator transaction-inline-separator">|</span><div class="transaction-tags transaction-inline-meta">${detailPillsInline}</div>`
                        : ""
                    }
                  </div>
                </div>
                <div class="transaction-header-side">
                  <strong class="money transaction-amount transaction-amount-inline transaction-amount-${escapeHtml(transaction.type)}">${formatMoney(
                    transaction.amount,
                    transactionSymbol
                  )}</strong>
                  <div class="transaction-account-strip transaction-account-strip-mobile">${accountPills}</div>
                </div>
              </div>
              ${detailPills ? `<div class="transaction-tags transaction-tags-secondary transaction-secondary-meta-mobile">${detailPills}</div>` : ""}
              ${
                transaction.details
                  ? `<div class="transaction-details-note">${escapeHtml(transaction.details)}</div>`
                  : ""
              }
            </div>
          </div>
          <div class="item-actions transaction-card-actions">
            <strong class="money transaction-amount transaction-amount-desktop transaction-amount-${escapeHtml(transaction.type)}">${formatMoney(
              transaction.amount,
              transactionSymbol
            )}</strong>
            <div class="transaction-account-strip transaction-account-strip-desktop">${accountPills}</div>
          </div>
        </div>
      </article>
    `;
  }

  function moveAccount(id, direction) {
    const currentIndex = state.accounts.findIndex((account) => account.id === id);
    if (currentIndex === -1) {
      return;
    }
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= state.accounts.length) {
      return;
    }
    const nextAccounts = [...state.accounts];
    const [movedAccount] = nextAccounts.splice(currentIndex, 1);
    nextAccounts.splice(targetIndex, 0, movedAccount);
    state.accounts = nextAccounts.map((account, index) => ({
      ...account,
      sortOrder: index,
    }));
    persistAndRefresh();
    showToast(`Moved ${movedAccount.name} ${direction < 0 ? "up" : "down"}.`);
  }


  function seedStaticContent() {
    document.getElementById("voice-examples").innerHTML = renderDictationExampleGroups("chips");
    document.getElementById("more-examples").innerHTML = renderDictationExampleGroups("cards");
    document.getElementById("capture-fields").innerHTML = captureFields
      .map(
        (field) => `
          <article class="chip-card">
            <strong>${escapeHtml(field)}</strong>
            <p>Available in manual entry and supported by the dictation parser.</p>
          </article>
        `
      )
      .join("");
  }

  function renderDictationExampleGroups(variant) {
    return dictationExampleGroups
      .map((group) => {
        const items =
          variant === "cards"
            ? `<div class="example-list example-list--group">${group.examples
                .map(
                  (example) => `
                    <button class="example-card ghost-button" type="button" data-action="use-example" data-statement="${escapeAttribute(example)}">
                      <strong>${escapeHtml(example)}</strong>
                      <span class="supporting-text">Tap to load this example into voice dictation.</span>
                    </button>
                  `
                )
                .join("")}</div>`
            : `<div class="example-chips example-chips--group">${group.examples
                .map(
                  (example) =>
                    `<button class="example-chip" type="button" data-action="use-example" data-statement="${escapeAttribute(example)}">${escapeHtml(
                      example
                    )}</button>`
                )
                .join("")}</div>`;
        return `
          <section class="example-group example-group--${escapeAttribute(group.id)}">
            <div class="example-group-head">
              <span class="example-group-title">${escapeHtml(group.title)}</span>
              <span class="example-group-cue">${escapeHtml(group.cue)}</span>
            </div>
            ${items}
          </section>
        `;
      })
      .join("");
  }

  function wireStaticIcons() {
    document.querySelectorAll("[data-icon]").forEach((node) => {
      node.innerHTML = iconRegistry[node.dataset.icon] || "";
    });
  }

  function getAccount(id) {
    return state.accounts.find((account) => account.id === id);
  }

  function getCategory(id) {
    return state.categories.find((category) => category.id === id);
  }

  function getTransaction(id) {
    return state.transactions.find((transaction) => transaction.id === id);
  }

})();
