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
  const SUPABASE_COUNTERPARTIES_TABLE = "counterparties";
  const SUPABASE_LOOKUP_ENTRIES_TABLE = "lookup_entries";
  const SUPABASE_TRANSACTIONS_TABLE = "transactions";
  const SUPABASE_LEGACY_STATE_TABLE = "ledger_state";
  const SUPABASE_TRANSACTION_SLIPS_BUCKET = "transaction-slips";
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
    counterparties: [],
    lookupEntries: [],
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
  let calendarTooltipState = {
    date: "",
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
  let transactionSelectionAutofillLock = false;
  let uiState;
  let transactionTemplates = loadTransactionTemplates();
  const transactionSlipUrlCache = new Map();

  const { loadLocalState, normalizeState, replaceState, getUserCacheKey, persistState } = createStateTools({
    storageKey: STORAGE_KEY,
    defaultState,
    state,
    getCurrentUserId: () => uiState?.currentUserId || "",
  });
  replaceState(loadLocalState());
  const initialDuplicateRepairCount = ensureUniqueTransactionIds();

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
  if (initialDuplicateRepairCount > 0) {
    persistState();
  }

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
    getCounterpartyLedgerStats,
    getCounterpartyLedgerMetrics,
    renderCounterpartyCard,
    renderCategoryGroup,
    renderHeroAccountPill,
  } = createAccountsCategoriesTools({
    state,
    iconRegistry,
    getAccount,
    getCounterparty,
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
    downloadCsv,
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

  const { renderCalendarOverview, shiftCalendarMonth, applyDateFilter, getCalendarDayDetail } = createCalendarTools({
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
    openCounterpartyModal,
    openCategoryModal,
    handleTransactionSubmit,
    setTransactionSubmitMode,
    handleAccountSubmit,
    handleCounterpartySubmit,
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
    getCounterparty,
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
    uploadTransactionSlip: (...args) => uploadTransactionSlip(...args),
    deleteTransactionSlip: (...args) => deleteTransactionSlip(...args),
    resolveTransactionSlipPreviewUrl: (...args) => resolveTransactionSlipPreviewUrl(...args),
    clearTransactionSlipPreviewCache: (...args) => clearTransactionSlipPreviewCache(...args),
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
    uploadTransactionSlip,
    getTransactionSlipSignedUrl,
    deleteTransactionSlip,
    deleteTransactionSlips,
  } = createSupabaseTools({
    constants: {
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      SUPABASE_ACCOUNTS_TABLE,
      SUPABASE_CATEGORIES_TABLE,
      SUPABASE_COUNTERPARTIES_TABLE,
      SUPABASE_LOOKUP_ENTRIES_TABLE,
      SUPABASE_TRANSACTIONS_TABLE,
      SUPABASE_LEGACY_STATE_TABLE,
      SUPABASE_TRANSACTION_SLIPS_BUCKET,
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
    ensureUniqueTransactionIds,
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
    document.querySelectorAll("[data-open-counterparty-modal]").forEach((button) => {
      button.addEventListener("click", () => openCounterpartyModal());
    });
    document.querySelectorAll("[data-open-managed-value-modal]").forEach((button) => {
      button.addEventListener("click", () => openManagedValueModal(button.dataset.openManagedValueModal || "counterparty"));
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => closeModal(button.dataset.closeModal));
    });

    document.getElementById("transaction-type").addEventListener("change", () => {
      syncTransactionTypeFields();
      renderTransactionSmartFieldOptions();
    });
    document.getElementById("transaction-account").addEventListener("change", (event) => {
      applyLatestTransactionSelection("account", event.target.value);
    });
    document.getElementById("transaction-category").addEventListener("change", (event) => {
      renderTransactionSmartFieldOptions();
      applyLatestTransactionSelection("category", event.target.value);
    });
    document.getElementById("filter-category").addEventListener("change", renderTransactionFilterSubcategoryOptions);
    document.getElementById("filter-type").addEventListener("change", renderTransactionFilterValueSuggestions);
    document.getElementById("filter-subcategory").addEventListener("input", renderTransactionFilterValueSuggestions);
    document.getElementById("filter-subcategory").addEventListener("change", renderTransactionFilterValueSuggestions);
    document.getElementById("transaction-subcategory").addEventListener("input", renderTransactionLinkedSuggestions);
    document.getElementById("transaction-subcategory").addEventListener("change", (event) => {
      renderTransactionLinkedSuggestions();
      applyLatestTransactionSelection("subcategory", event.target.value);
    });
    document.getElementById("transaction-counterparty").addEventListener("change", (event) => {
      syncTrackedCounterpartySelection();
      applyLatestTransactionSelection("counterparty", event.target.value);
    });
    document.getElementById("transaction-tracked-counterparty").addEventListener("change", syncTrackedCounterpartySelection);
    document.getElementById("transaction-project").addEventListener("change", (event) => {
      applyLatestTransactionSelection("project", event.target.value);
    });
    document.getElementById("transaction-slip-file").addEventListener("change", handleTransactionSlipFileChange);
    document.getElementById("transaction-slip-remove-button").addEventListener("click", handleTransactionSlipRemove);
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
    document.getElementById("counterparty-form").addEventListener("submit", handleCounterpartySubmit);
    document.getElementById("category-form").addEventListener("submit", handleCategorySubmit);
    document.getElementById("managed-value-form")?.addEventListener("submit", handleManagedValueSubmit);
    document.getElementById("managed-value-merge-form")?.addEventListener("submit", handleManagedValueMergeSubmit);
    document.getElementById("managed-value-merge-button")?.addEventListener("click", handleManagedValueMergeButton);
    document.getElementById("import-form").addEventListener("submit", handleImportSubmit);
    document.getElementById("reconciliation-import-all-button")?.addEventListener("click", handleImportReconciliationImportAll);
    document.getElementById("reconciliation-import-safe-button")?.addEventListener("click", handleImportReconciliationImportSafeOnly);
    document.getElementById("reconciliation-skip-duplicates-button")?.addEventListener("click", handleImportReconciliationSkipDuplicates);
    document.getElementById("transaction-delete-button").addEventListener("click", handleTransactionModalDelete);
    document.getElementById("transaction-duplicate-button").addEventListener("click", handleTransactionModalDuplicate);
    document.getElementById("apply-transaction-template-button").addEventListener("click", applySelectedTransactionTemplate);
    document.getElementById("save-transaction-template-button").addEventListener("click", saveCurrentTransactionTemplate);
    document.getElementById("delete-transaction-template-button").addEventListener("click", deleteSelectedTransactionTemplate);
    document.getElementById("transaction-template-select").addEventListener("change", syncTransactionTemplateControls);
    document.getElementById("toggle-transaction-templates-button").addEventListener("click", toggleTransactionTemplatePanel);
    document.getElementById("smart-field-picker-input").addEventListener("input", renderSmartFieldPickerOptions);
    document.getElementById("smart-field-picker-apply-button").addEventListener("click", handleSmartFieldPickerApply);
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
        if (!calendarTooltipState.pinned) {
          const calendarHit = findCalendarTooltipHitTarget(event.target);
          if (calendarHit) {
            showCalendarTooltip(calendarHit.dataset.date || "", calendarHit, false, event.clientX, event.clientY);
          }
        }
        return;
      }
      const hit = findReportChartHitTarget(event.target);
      if (!hit) {
        if (!calendarTooltipState.pinned) {
          const calendarHit = findCalendarTooltipHitTarget(event.target);
          if (calendarHit) {
            showCalendarTooltip(calendarHit.dataset.date || "", calendarHit, false, event.clientX, event.clientY);
          }
        }
        return;
      }
      showReportChartTooltip(hit.dataset.index || "", hit, false, event.clientX, event.clientY);
    });
    document.addEventListener("mousemove", (event) => {
      if (reportChartTooltipState.pinned) {
        if (!calendarTooltipState.pinned) {
          const calendarHit = findCalendarTooltipHitTarget(event.target);
          if (!calendarHit) {
            hideCalendarTooltip();
          } else {
            positionCalendarTooltip(calendarHit, event.clientX, event.clientY);
          }
        }
        return;
      }
      const hit = findReportChartHitTarget(event.target);
      if (!hit) {
        if (!calendarTooltipState.pinned) {
          const calendarHit = findCalendarTooltipHitTarget(event.target);
          if (!calendarHit) {
            hideCalendarTooltip();
          } else {
            showCalendarTooltip(calendarHit.dataset.date || "", calendarHit, false, event.clientX, event.clientY);
          }
        }
        return;
      }
      positionReportChartTooltip(hit, event.clientX, event.clientY);
    });
    document.addEventListener("mouseout", (event) => {
      if (reportChartTooltipState.pinned) {
        if (!calendarTooltipState.pinned) {
          const calendarHit = findCalendarTooltipHitTarget(event.target);
          if (!calendarHit) {
            return;
          }
          const next = event.relatedTarget;
          if (next && (calendarHit.contains?.(next) || (typeof next.closest === "function" && next.closest(".calendar-tooltip")))) {
            return;
          }
          hideCalendarTooltip();
        }
        return;
      }
      const hit = findReportChartHitTarget(event.target);
      if (!hit) {
        if (!calendarTooltipState.pinned) {
          const calendarHit = findCalendarTooltipHitTarget(event.target);
          if (!calendarHit) {
            return;
          }
          const next = event.relatedTarget;
          if (next && (calendarHit.contains?.(next) || (typeof next.closest === "function" && next.closest(".calendar-tooltip")))) {
            return;
          }
          hideCalendarTooltip();
        }
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
      const calendarHit = findCalendarTooltipHitTarget(event.target);
      if (calendarHit || (typeof event.target.closest === "function" && event.target.closest(".calendar-tooltip"))) {
        return;
      }
      hideCalendarTooltip(true);
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
    ["filter-start-date", "filter-end-date"].forEach((id) => {
      const input = document.getElementById(id);
      input?.addEventListener("click", () => {
        if (typeof input.showPicker === "function") {
          try {
            input.showPicker();
          } catch (error) {
            // Ignore browsers that restrict showPicker outside a trusted gesture.
          }
        }
      });
    });

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

  function buildCalendarTooltipMarkup(date, detail) {
    if (!detail) {
      return "";
    }
    return `
      <div class="calendar-tooltip-card">
        <div class="calendar-tooltip-head">
          <div class="calendar-tooltip-copy">
            <p class="eyebrow">Daily Flow</p>
            <strong>${escapeHtml(detail.label || date || "Selected Day")}</strong>
          </div>
          <button class="ghost-button compact-button" type="button" data-action="open-calendar-tooltip-day" data-date="${escapeAttribute(date)}">Open Ledger</button>
        </div>
        <div class="calendar-tooltip-balance-grid">
          ${(detail.balances || [])
            .map(
              (account) => `
                <div class="calendar-tooltip-balance-card">
                  <span class="calendar-tooltip-balance-name" style="color:${escapeAttribute(account.color || "#19c6a7")}">${escapeHtml(account.name || "")}</span>
                  <strong>${escapeHtml(account.value || "")}</strong>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="calendar-tooltip-groups">
          ${(detail.groups || []).length
            ? (detail.groups || [])
            .map(
              (group) => `
                <section class="calendar-tooltip-group">
                  <div class="calendar-tooltip-group-head">
                    <span class="calendar-tooltip-group-label" style="color:${escapeAttribute(group.color || "#19c6a7")}">${escapeHtml(group.label || "")}</span>
                    <strong>${escapeHtml(formatMoney(group.total || 0, getPrimaryCurrencySymbol()))}</strong>
                  </div>
                  <div class="calendar-tooltip-lines">
                    ${group.items
                      .map(
                        (item) => `
                          <div class="calendar-tooltip-line">
                            <div class="calendar-tooltip-line-main">
                              ${(item.segments || [])
                                .map(
                                  (segment, index) => `
                                    ${index ? '<span class="calendar-tooltip-separator">|</span>' : ""}
                                    <span class="calendar-tooltip-entity calendar-tooltip-entity-${escapeAttribute(segment.type || "text")}" style="color:${escapeAttribute(
                                      segment.color || "#5f7380"
                                    )}">${escapeHtml(segment.label || "")}</span>
                                  `
                                )
                                .join("")}
                              <span class="calendar-tooltip-arrow" aria-hidden="true">-></span>
                              <strong class="calendar-tooltip-line-amount" style="color:${escapeAttribute(item.amountColor || group.color || "#19c6a7")}">${escapeHtml(
                                item.amount || ""
                              )}</strong>
                            </div>
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                </section>
              `
            )
            .join("")
            : `<div class="calendar-tooltip-empty">No transactions recorded for this day yet.</div>`}
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

  function positionCalendarTooltip(anchor, preferredClientX = null, preferredClientY = null) {
    const shell = anchor.closest?.(".calendar-panel");
    const tooltip = shell?.querySelector(".calendar-tooltip");
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
    if (
      !pinned &&
      !reportChartTooltipState.pinned &&
      reportChartTooltipState.index === index &&
      !tooltip.classList.contains("hidden")
    ) {
      positionReportChartTooltip(anchor, clientX, clientY);
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

  function showCalendarTooltip(date, anchor, pinned = false, clientX = null, clientY = null) {
    const shell = anchor.closest?.(".calendar-panel");
    const tooltip = shell?.querySelector(".calendar-tooltip");
    const detail = getCalendarDayDetail(date);
    if (!tooltip || !detail || !anchor) {
      return;
    }
    calendarTooltipState = {
      date,
      pinned,
    };
    tooltip.innerHTML = buildCalendarTooltipMarkup(date, detail);
    tooltip.classList.toggle("calendar-tooltip-pinned", pinned);
    tooltip.classList.remove("hidden");
    positionCalendarTooltip(anchor, clientX, clientY);
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

  function hideCalendarTooltip(force = false) {
    if (!force && calendarTooltipState.pinned) {
      return;
    }
    document.querySelectorAll(".calendar-tooltip").forEach((tooltip) => {
      tooltip.classList.add("hidden");
      tooltip.classList.remove("calendar-tooltip-pinned");
      tooltip.innerHTML = "";
      tooltip.style.left = "";
      tooltip.style.top = "";
    });
    calendarTooltipState = {
      date: "",
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

  function findCalendarTooltipHitTarget(target) {
    let node = target;
    while (node) {
      if (node.dataset?.calendarTooltip === "true") {
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
    setInputDateValue("filter-start-date", normalizeDateInput(uiState.filters.startDate || ""));
    setInputDateValue("filter-end-date", normalizeDateInput(uiState.filters.endDate || ""));
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

  function ensureUniqueTransactionIds() {
    const seen = new Set();
    let repairedCount = 0;
    state.transactions = state.transactions.map((transaction) => {
      const currentId = String(transaction?.id || "").trim();
      if (!currentId || seen.has(currentId)) {
        repairedCount += 1;
        const nextId = uid("tx");
        seen.add(nextId);
        return {
          ...transaction,
          id: nextId,
          updatedAt: new Date().toISOString(),
        };
      }
      seen.add(currentId);
      return transaction;
    });
    return repairedCount;
  }

  async function resolveTransactionSlipPreviewUrl(path, forceRefresh = false) {
    const normalizedPath = String(path || "").trim();
    if (!normalizedPath) {
      return "";
    }
    const cached = transactionSlipUrlCache.get(normalizedPath);
    const now = Date.now();
    if (!forceRefresh && cached && cached.expiresAt > now + 15000) {
      return cached.url;
    }
    const signedUrl = await getTransactionSlipSignedUrl(normalizedPath);
    if (!signedUrl) {
      return "";
    }
    transactionSlipUrlCache.set(normalizedPath, {
      url: signedUrl,
      expiresAt: now + 55 * 60 * 1000,
    });
    return signedUrl;
  }

  function clearTransactionSlipPreviewCache(path = "") {
    const normalizedPath = String(path || "").trim();
    if (!normalizedPath) {
      return;
    }
    transactionSlipUrlCache.delete(normalizedPath);
  }

  async function hydrateTransactionSlipPreviews(root = document) {
    const container = root instanceof Element || root instanceof Document ? root : document;
    const slots = [...container.querySelectorAll("[data-transaction-slip-path]")];
    const uniquePaths = [...new Set(slots.map((slot) => String(slot.dataset.transactionSlipPath || "").trim()).filter(Boolean))];
    if (!uniquePaths.length) {
      return;
    }
    const urlEntries = await Promise.all(
      uniquePaths.map(async (path) => {
        try {
          const url = await resolveTransactionSlipPreviewUrl(path);
          return [path, url];
        } catch (error) {
          console.error(error);
          return [path, ""];
        }
      })
    );
    const urlMap = new Map(urlEntries);
    slots.forEach((slot) => {
      const path = String(slot.dataset.transactionSlipPath || "").trim();
      const image = slot.querySelector(".transaction-badge-image");
      const fallback = slot.querySelector(".transaction-badge-fallback");
      const url = urlMap.get(path) || "";
      if (!(image instanceof HTMLImageElement) || !(fallback instanceof HTMLElement)) {
        return;
      }
      if (url) {
        image.src = url;
        image.classList.remove("hidden");
        fallback.classList.add("hidden");
        slot.classList.add("transaction-badge-has-image");
      } else {
        image.removeAttribute("src");
        image.classList.add("hidden");
        fallback.classList.remove("hidden");
        slot.classList.remove("transaction-badge-has-image");
      }
    });
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
      counterpartyId: type === "transfer" ? "" : document.getElementById("transaction-tracked-counterparty").value || "",
      counterpartyEffect: type === "transfer" ? "" : document.getElementById("transaction-counterparty-effect").value || "",
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
    document.getElementById("transaction-duplicate-button").classList.remove("hidden");
    document.getElementById("transaction-duplicate-button").textContent = "Save and New";
    document.getElementById("transaction-type").value = draft.type || "expense";
    document.getElementById("transaction-amount").value = draft.amount ? String(draft.amount) : "";
    document.getElementById("transaction-date").value = preserveDate ? currentDate : todayIso();
    document.getElementById("transaction-account").value = draft.accountId || "";
    document.getElementById("transaction-from-account").value = draft.fromAccountId || "";
    document.getElementById("transaction-to-account").value = draft.toAccountId || "";
    document.getElementById("transaction-category").value = draft.categoryId || "";
    document.getElementById("transaction-subcategory").value = draft.subcategory || "";
    document.getElementById("transaction-counterparty").value = draft.counterparty || "";
    document.getElementById("transaction-tracked-counterparty").value = draft.counterpartyId || "";
    document.getElementById("transaction-counterparty-effect").value = draft.counterpartyEffect || "";
    document.getElementById("transaction-project").value = draft.project || "";
    document.getElementById("transaction-tags").value = Array.isArray(draft.tags) ? draft.tags.join(", ") : "";
    document.getElementById("transaction-details").value = draft.details || "";
    resetTransactionSlipState();
    syncTransactionTypeFields();
    renderTransactionSmartFieldOptions();
    if (!draft.amount && draft.details) {
      syncTransactionAmountFromDetails();
    }
    syncTrackedCounterpartySelection();
    setTransactionTemplatePanelExpanded(false);
  }

  function isCreateTransactionMode() {
    return !String(document.getElementById("transaction-id")?.value || "").trim();
  }

  function getTransactionRecencyValue(transaction) {
    return String(transaction.updatedAt || transaction.createdAt || transaction.date || "");
  }

  function hasMeaningfulTransactionFormData(ignoreField = "") {
    const ignored = String(ignoreField || "").trim();
    const type = document.getElementById("transaction-type")?.value || "expense";
    const values = {
      amount: String(document.getElementById("transaction-amount")?.value || "").trim(),
      account: type === "transfer" ? "" : String(document.getElementById("transaction-account")?.value || "").trim(),
      fromAccount: type === "transfer" ? String(document.getElementById("transaction-from-account")?.value || "").trim() : "",
      toAccount: type === "transfer" ? String(document.getElementById("transaction-to-account")?.value || "").trim() : "",
      category: type === "transfer" ? "" : String(document.getElementById("transaction-category")?.value || "").trim(),
      subcategory: type === "transfer" ? "" : String(document.getElementById("transaction-subcategory")?.value || "").trim(),
      counterparty: String(document.getElementById("transaction-counterparty")?.value || "").trim(),
      trackedCounterparty: String(document.getElementById("transaction-tracked-counterparty")?.value || "").trim(),
      counterpartyEffect: String(document.getElementById("transaction-counterparty-effect")?.value || "").trim(),
      project: String(document.getElementById("transaction-project")?.value || "").trim(),
      tags: String(document.getElementById("transaction-tags")?.value || "").trim(),
      details: String(document.getElementById("transaction-details")?.value || "").trim(),
      slip: String(document.getElementById("transaction-slip-file")?.value || "").trim(),
    };
    const fieldKeyMap = {
      account: ["account"],
      category: ["category"],
      subcategory: ["subcategory"],
      counterparty: ["counterparty"],
      trackedCounterparty: ["counterparty"],
      counterpartyEffect: ["counterparty"],
      project: ["project"],
    };
    const ignoredKeys = new Set(fieldKeyMap[ignored] || []);
    return Object.entries(values).some(([key, value]) => !ignoredKeys.has(key) && Boolean(value));
  }

  function getLatestTransactionForSelection(field, value) {
    const selectedValue = String(value || "").trim();
    const normalizedValue = selectedValue.toLowerCase();
    if (!normalizedValue) {
      return null;
    }
    const selectedType = document.getElementById("transaction-type").value || "expense";
    const selectedCategoryId = document.getElementById("transaction-category").value || "";
    const selectedSubcategory = String(document.getElementById("transaction-subcategory").value || "")
      .trim()
      .toLowerCase();
    const matches = state.transactions.filter((transaction) => {
      if (field === "account") {
        return transaction.type !== "transfer" && transaction.accountId === value;
      }
      if (field === "category") {
        return transaction.type !== "transfer" && transaction.categoryId === value;
      }
      if (field === "subcategory") {
        return (
          transaction.type !== "transfer" &&
          (!selectedCategoryId || transaction.categoryId === selectedCategoryId) &&
          String(transaction.subcategory || "").trim().toLowerCase() === normalizedValue
        );
      }
      if (field === "counterparty") {
        return (
          transaction.type === selectedType &&
          (!selectedCategoryId || transaction.categoryId === selectedCategoryId) &&
          (!selectedSubcategory || String(transaction.subcategory || "").trim().toLowerCase() === selectedSubcategory) &&
          String(transaction.counterparty || "").trim().toLowerCase() === normalizedValue
        );
      }
      if (field === "project") {
        return (
          transaction.type === selectedType &&
          (!selectedCategoryId || transaction.categoryId === selectedCategoryId) &&
          (!selectedSubcategory || String(transaction.subcategory || "").trim().toLowerCase() === selectedSubcategory) &&
          String(transaction.project || "").trim().toLowerCase() === normalizedValue
        );
      }
      return false;
    });
    return matches.sort((left, right) => getTransactionRecencyValue(right).localeCompare(getTransactionRecencyValue(left)))[0] || null;
  }

  function applyLatestTransactionSelection(field, value) {
    if (transactionSelectionAutofillLock || !isCreateTransactionMode()) {
      return;
    }
    const selectedValue = String(value || "").trim();
    if (!selectedValue) {
      return;
    }
    if (hasMeaningfulTransactionFormData(field)) {
      return;
    }
    const matchedTransaction = getLatestTransactionForSelection(field, value);
    if (!matchedTransaction) {
      return;
    }
    transactionSelectionAutofillLock = true;
    try {
      applyTransactionDraftToForm(matchedTransaction, { preserveDate: true, title: "Add Transaction" });
      if (field === "account") {
        document.getElementById("transaction-account").value = value;
      }
      if (field === "category") {
        document.getElementById("transaction-category").value = value;
        renderSubcategoryOptions();
      }
      if (field === "subcategory") {
        document.getElementById("transaction-subcategory").value = selectedValue;
      }
      if (field === "counterparty") {
        document.getElementById("transaction-counterparty").value = selectedValue;
      }
      if (field === "project") {
        document.getElementById("transaction-project").value = selectedValue;
      }
      renderTransactionLinkedSuggestions();
    } finally {
      transactionSelectionAutofillLock = false;
    }
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
    const rawValue =
      valueOverride && typeof valueOverride === "object" && "target" in valueOverride
        ? document.getElementById("smart-field-picker-input").value
        : valueOverride ?? document.getElementById("smart-field-picker-input").value ?? "";
    const value = String(rawValue).trim();
    target.value = value;
    target.setAttribute("value", value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    if (field === "subcategory" || field === "counterparty" || field === "project") {
      applyLatestTransactionSelection(field, value);
    }
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

  function handleSmartFieldPickerApply(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const input = document.getElementById("smart-field-picker-input");
    applySmartFieldPickerValue(input ? input.value : "");
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
    setTransactionSubmitMode("save-new");
    document.getElementById("transaction-form").requestSubmit();
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
    if (action === "edit-counterparty") {
      openCounterpartyModal(id);
    }
    if (action === "delete-counterparty") {
      deleteCounterparty(id);
    }
    if (action === "open-counterparty-ledger") {
      openCounterpartyLedger(id);
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
    if (action === "edit-managed-value") {
      openManagedValueModal(actionTarget.dataset.kind || "counterparty", actionTarget.dataset.value || "");
    }
    if (action === "delete-managed-value") {
      deleteManagedValue(actionTarget.dataset.kind || "counterparty", actionTarget.dataset.value || "");
    }
    if (action === "use-example") {
      document.getElementById("dictation-input").value = actionTarget.dataset.statement || "";
      switchScreen("overview");
      document.getElementById("dictation-input").focus();
    }
    if (action === "open-calendar-day") {
      applyDateFilter(actionTarget.dataset.date || "");
    }
    if (action === "show-calendar-tooltip") {
      const date = actionTarget.dataset.date || "";
      if (calendarTooltipState.pinned && calendarTooltipState.date === date) {
        hideCalendarTooltip(true);
        return;
      }
      showCalendarTooltip(date, actionTarget, true);
      return;
    }
    if (action === "open-calendar-tooltip-day") {
      hideCalendarTooltip(true);
      applyDateFilter(actionTarget.dataset.date || "");
      return;
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
    renderManagedValuePanels();
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
    void hydrateTransactionSlipPreviews(document.getElementById("transaction-list"));
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
    const historicalTrendSeries = buildTransactionSnapshotSeries(getTransactionSnapshotTrendTransactions(transactions));
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
              <span>${escapeHtml(historicalTrendSeries[0]?.key || "")}${historicalTrendSeries.length > 1 ? ` - ${escapeHtml(historicalTrendSeries[historicalTrendSeries.length - 1]?.key || "")}` : ""}</span>
            </div>
            ${renderTransactionSnapshotTrend(historicalTrendSeries)}
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

  function getTransactionSnapshotTrendTransactions(currentTransactions) {
    if (uiState.filters.startDate || uiState.filters.endDate) {
      return currentTransactions;
    }
    const rollingStart = new Date();
    rollingStart.setMonth(rollingStart.getMonth() - 24);
    return getFilteredTransactions({
      startDate: toLocalIsoDate(rollingStart),
      endDate: todayIso(),
    });
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
    const midLabel = series[Math.floor((series.length - 1) / 2)]?.label || "";
    const coords = points.map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
      const normalized = (value - min) / range;
      const y = height - padding - normalized * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const areaPath = [`M ${padding} ${height - padding}`, ...coords.map((point) => `L ${point.replace(",", " ")}`), `L ${width - padding} ${height - padding}`, "Z"].join(" ");
    return `
      <div class="transaction-snapshot-chart-shell">
        <div class="transaction-snapshot-scale">
          <span>${escapeHtml(formatMoney(max, getPrimaryCurrencySymbol()))}</span>
          <span>${escapeHtml(formatMoney(min, getPrimaryCurrencySymbol()))}</span>
        </div>
        <svg class="transaction-snapshot-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
          <path d="${areaPath}" fill="rgba(18, 200, 164, 0.14)"></path>
          <polyline points="${coords.join(" ")}" fill="none" stroke="#12c8a4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
        </svg>
        <div class="transaction-snapshot-axis">
          <span>${escapeHtml(series[0]?.label || "")}</span>
          <span>${escapeHtml(midLabel)}</span>
          <span>${escapeHtml(series[series.length - 1]?.label || "")}</span>
        </div>
      </div>
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
    const counterpartyMetrics = getCounterpartyLedgerMetrics();
    const rankedCounterparties = state.counterparties
      .slice()
      .sort((left, right) => {
        const leftStats = getCounterpartyLedgerStats(left.id);
        const rightStats = getCounterpartyLedgerStats(right.id);
        const leftExposure = Math.max(Math.abs(leftStats.receivable), Math.abs(leftStats.payable), Math.abs(leftStats.net));
        const rightExposure = Math.max(Math.abs(rightStats.receivable), Math.abs(rightStats.payable), Math.abs(rightStats.net));
        if (rightExposure !== leftExposure) {
          return rightExposure - leftExposure;
        }
        if ((rightStats.lastActivity || "") !== (leftStats.lastActivity || "")) {
          return String(rightStats.lastActivity || "").localeCompare(String(leftStats.lastActivity || ""));
        }
        return left.name.localeCompare(right.name);
      });
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

    document.getElementById("counterparty-metrics").innerHTML = [
      metricCard("Tracked Counterparties", String(state.counterparties.length), "Canonical payees and payers linked to receivables and payables"),
      metricCard("Receivables", formatMoney(counterpartyMetrics.receivable, baseSymbol), "Amounts owed back to you"),
      metricCard("Payables", formatMoney(counterpartyMetrics.payable, baseSymbol), "Amounts you still owe"),
      metricCard("Net Exposure", formatMoney(counterpartyMetrics.net, baseSymbol), "Receivables minus payables"),
    ].join("");
    document.getElementById("counterparty-list").innerHTML = rankedCounterparties.length
      ? rankedCounterparties.map((counterparty) => renderCounterpartyCard(counterparty, true)).join("")
      : renderEmpty("Create a tracked counterparty to monitor receivables and payables from selected payees or payers.");
  }

  function renderCategories() {
    const container = document.getElementById("category-list");
    const sortByCategoryUsageFrequency = (left, right) => {
      const leftUsage = getCategoryUsageFrequency(left.id);
      const rightUsage = getCategoryUsageFrequency(right.id);
      if (rightUsage.count !== leftUsage.count) {
        return rightUsage.count - leftUsage.count;
      }
      if ((rightUsage.lastUsed || "") !== (leftUsage.lastUsed || "")) {
        return String(rightUsage.lastUsed || "").localeCompare(String(leftUsage.lastUsed || ""));
      }
      return left.name.localeCompare(right.name);
    };
    const expenses = state.categories
      .filter((category) => category.type === "expense")
      .sort(sortByCategoryUsageFrequency);
    const income = state.categories
      .filter((category) => category.type === "income")
      .sort(sortByCategoryUsageFrequency);
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

  function getManagedValueConfig(kind) {
    if (kind === "counterparty") {
      return {
        title: "Payee / Payer",
        singular: "payee or payer",
        empty: "No payees or payers tracked yet.",
        deleteMessage: "This will clear the payee / payer from every matching transaction.",
        createLabel: "Payee / Payer",
      };
    }
    if (kind === "project") {
      return {
        title: "Project",
        singular: "project",
        empty: "No projects tracked yet.",
        deleteMessage: "This will clear the project from every matching transaction.",
        createLabel: "Project",
      };
    }
    return {
      title: "Tag",
      singular: "tag",
      empty: "No tags tracked yet.",
      deleteMessage: "This will remove the tag from every matching transaction.",
      createLabel: "Tag",
    };
  }

  function getManagedLookupEntries(kind) {
    const entries = Array.isArray(state.lookupEntries) ? state.lookupEntries : [];
    return entries.filter((entry) => entry.kind === kind && String(entry.name || "").trim());
  }

  function getManagedValueStats(kind) {
    const stats = new Map();
    getManagedLookupEntries(kind).forEach((entry) => {
      const key = String(entry.name || "").trim().toLowerCase();
      if (!key) {
        return;
      }
      stats.set(key, {
        id: entry.id,
        kind,
        name: String(entry.name || "").trim(),
        count: 0,
        lastUsed: String(entry.updatedAt || entry.createdAt || ""),
        catalogOnly: true,
      });
    });

    state.transactions.forEach((transaction) => {
      const normalizedTags = Array.isArray(transaction.tags)
        ? transaction.tags
        : splitTags(transaction.tags || "");
      const values =
        kind === "tag"
          ? normalizedTags.map((tag) => String(tag || "").trim()).filter(Boolean)
          : [String(kind === "counterparty" ? transaction.counterparty : transaction.project || "").trim()].filter(Boolean);
      if (!values.length) {
        return;
      }
      const candidateDate = String(transaction.date || transaction.updatedAt || transaction.createdAt || "");
      values.forEach((value) => {
        const key = value.toLowerCase();
        const existing = stats.get(key) || {
          id: "",
          kind,
          name: value,
          count: 0,
          lastUsed: "",
          catalogOnly: false,
        };
        existing.count += 1;
        existing.catalogOnly = false;
        if (!existing.name) {
          existing.name = value;
        }
        if (candidateDate && candidateDate.localeCompare(existing.lastUsed || "") > 0) {
          existing.lastUsed = candidateDate;
        }
        stats.set(key, existing);
      });
    });

    return [...stats.values()].sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      if ((right.lastUsed || "") !== (left.lastUsed || "")) {
        return String(right.lastUsed || "").localeCompare(String(left.lastUsed || ""));
      }
      return left.name.localeCompare(right.name);
    });
  }

  function formatManagedValueLastUsed(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "Not used yet";
    }
    const normalized = normalizeDateInput(raw);
    return normalized || raw.slice(0, 10);
  }

  function renderManagedValueItem(kind, entry) {
    const nameLabel = kind === "tag" ? `#${entry.name}` : entry.name;
    const usageLabel = `${entry.count} ${entry.count === 1 ? "transaction" : "transactions"}`;
    const lastUsedLabel = formatManagedValueLastUsed(entry.lastUsed);
    return `
      <div class="managed-value-item">
        <div class="managed-value-copy">
          <div class="managed-value-head">
            <strong>${escapeHtml(nameLabel)}</strong>
            <div class="managed-value-actions">
              <button class="icon-button" type="button" data-action="edit-managed-value" data-kind="${escapeAttribute(kind)}" data-value="${escapeAttribute(entry.name)}" aria-label="Edit ${escapeAttribute(kind)}">
                ${iconRegistry.pen}
              </button>
              <button class="icon-button delete" type="button" data-action="delete-managed-value" data-kind="${escapeAttribute(kind)}" data-value="${escapeAttribute(entry.name)}" aria-label="Delete ${escapeAttribute(kind)}">
                ${iconRegistry.bin}
              </button>
            </div>
          </div>
          <div class="managed-value-meta-line">
            <span>${escapeHtml(usageLabel)}</span>
            <span>${escapeHtml(lastUsedLabel)}</span>
          </div>
          ${
            entry.catalogOnly
              ? '<div class="managed-value-pill-row"><span class="meta-pill neutral">Catalog only</span></div>'
              : ""
          }
        </div>
      </div>
    `;
  }

  function renderManagedValuePanels() {
    const mappings = [
      { kind: "counterparty", id: "managed-counterparty-list" },
      { kind: "project", id: "managed-project-list" },
      { kind: "tag", id: "managed-tag-list" },
    ];
    mappings.forEach(({ kind, id }) => {
      const container = document.getElementById(id);
      if (!container) {
        return;
      }
      const items = getManagedValueStats(kind);
      container.innerHTML = items.length
        ? items.map((entry) => renderManagedValueItem(kind, entry)).join("")
        : renderEmpty(getManagedValueConfig(kind).empty);
    });
  }

  function syncManagedValueMergeButton(kind, originalName) {
    const button = document.getElementById("managed-value-merge-button");
    if (!button) {
      return;
    }
    const hasSource = Boolean(String(originalName || "").trim());
    const mergeCandidates = hasSource
      ? getManagedValueStats(kind).filter((entry) => entry.name.trim().toLowerCase() !== String(originalName || "").trim().toLowerCase())
      : [];
    button.classList.toggle("hidden", !hasSource);
    button.disabled = !hasSource || !mergeCandidates.length;
    button.dataset.kind = kind;
    button.dataset.value = originalName;
  }

  function countManagedValueLinks(kind, name) {
    const valueKey = String(name || "").trim().toLowerCase();
    if (!valueKey) {
      return 0;
    }
    return state.transactions.filter((transaction) => {
      if (kind === "counterparty") {
        return String(transaction.counterparty || "").trim().toLowerCase() === valueKey;
      }
      if (kind === "project") {
        return String(transaction.project || "").trim().toLowerCase() === valueKey;
      }
      const tags = Array.isArray(transaction.tags) ? transaction.tags : splitTags(transaction.tags || "");
      return tags.some((tag) => String(tag || "").trim().toLowerCase() === valueKey);
    }).length;
  }

  function openManagedValueModal(kind, currentName = "") {
    const idField = document.getElementById("managed-value-id");
    const kindField = document.getElementById("managed-value-kind");
    const originalField = document.getElementById("managed-value-original-name");
    const nameField = document.getElementById("managed-value-name");
    const titleField = document.getElementById("managed-value-modal-title");
    const labelField = document.getElementById("managed-value-label");
    const helpField = document.getElementById("managed-value-help");
    if (!idField || !kindField || !originalField || !nameField || !titleField || !labelField || !helpField) {
      return;
    }
    const config = getManagedValueConfig(kind);
    const originalName = String(currentName || "").trim();
    const existingEntry = getManagedLookupEntries(kind).find((entry) => entry.name.trim().toLowerCase() === originalName.toLowerCase());
    idField.value = existingEntry?.id || "";
    kindField.value = kind;
    originalField.value = originalName;
    nameField.value = originalName;
    titleField.textContent = originalName ? `Edit ${config.title}` : `Add ${config.title}`;
    labelField.textContent = config.createLabel;
    helpField.textContent = originalName
      ? `Caution: renaming this ${config.singular} updates all matching transactions in the ledger.`
      : `Create a reusable ${config.singular} so it appears in ranked suggestions even before it is used often.`;
    syncManagedValueMergeButton(kind, originalName);
    openModal("managed-value-modal");
    window.setTimeout(() => {
      nameField.focus();
      nameField.select();
    }, 20);
  }

  function openManagedValueMergeModal(kind, sourceName) {
    const titleField = document.getElementById("managed-value-merge-title");
    const labelField = document.getElementById("managed-value-merge-label");
    const helpField = document.getElementById("managed-value-merge-help");
    const kindField = document.getElementById("managed-value-merge-kind");
    const sourceField = document.getElementById("managed-value-merge-source");
    const targetField = document.getElementById("managed-value-merge-target");
    const submitButton = document.getElementById("managed-value-merge-submit");
    if (!titleField || !labelField || !helpField || !kindField || !sourceField || !targetField || !submitButton) {
      return;
    }
    const config = getManagedValueConfig(kind);
    const source = String(sourceName || "").trim();
    const candidates = getManagedValueStats(kind)
      .filter((entry) => entry.name.trim().toLowerCase() !== source.toLowerCase())
      .map((entry) => entry.name);
    titleField.textContent = `Merge ${config.title}`;
    labelField.textContent = `Merge ${config.title} Into`;
    helpField.textContent = candidates.length
      ? `This moves ${countManagedValueLinks(kind, source)} linked ${countManagedValueLinks(kind, source) === 1 ? "transaction" : "transactions"} from "${source}" into the selected target, then removes "${source}".`
      : `No other ${config.title.toLowerCase()} entries are available to merge into yet.`;
    kindField.value = kind;
    sourceField.value = source;
    targetField.innerHTML = candidates.length
      ? candidates.map((candidate) => `<option value="${escapeHtml(candidate)}">${escapeHtml(kind === "tag" ? `#${candidate}` : candidate)}</option>`).join("")
      : `<option value="">No merge target available</option>`;
    submitButton.disabled = !candidates.length;
    openModal("managed-value-merge-modal");
  }

  function handleManagedValueMergeButton() {
    const kind = String(document.getElementById("managed-value-kind")?.value || "").trim();
    const sourceName = String(document.getElementById("managed-value-original-name")?.value || "").trim();
    if (!kind || !sourceName) {
      return;
    }
    openManagedValueMergeModal(kind, sourceName);
  }

  function renameManagedValueInTransactions(kind, originalName, nextName) {
    const originalKey = String(originalName || "").trim().toLowerCase();
    if (!originalKey) {
      return 0;
    }
    let updated = 0;
    state.transactions = state.transactions.map((transaction) => {
      if (kind === "counterparty") {
        if (String(transaction.counterparty || "").trim().toLowerCase() !== originalKey) {
          return transaction;
        }
        updated += 1;
        return { ...transaction, counterparty: nextName };
      }
      if (kind === "project") {
        if (String(transaction.project || "").trim().toLowerCase() !== originalKey) {
          return transaction;
        }
        updated += 1;
        return { ...transaction, project: nextName };
      }
      const tags = Array.isArray(transaction.tags) ? transaction.tags : splitTags(transaction.tags || "");
      let changed = false;
      const nextTags = tags.map((tag) => {
        if (String(tag || "").trim().toLowerCase() !== originalKey) {
          return tag;
        }
        changed = true;
        return nextName.toLowerCase();
      });
      if (!changed) {
        return transaction;
      }
      updated += 1;
      return {
        ...transaction,
        tags: [...new Set(nextTags.map((tag) => String(tag || "").trim()).filter(Boolean))],
      };
    });
    return updated;
  }

  function clearManagedValueFromTransactions(kind, name) {
    const valueKey = String(name || "").trim().toLowerCase();
    if (!valueKey) {
      return 0;
    }
    let updated = 0;
    state.transactions = state.transactions.map((transaction) => {
      if (kind === "counterparty") {
        if (String(transaction.counterparty || "").trim().toLowerCase() !== valueKey) {
          return transaction;
        }
        updated += 1;
        return { ...transaction, counterparty: "" };
      }
      if (kind === "project") {
        if (String(transaction.project || "").trim().toLowerCase() !== valueKey) {
          return transaction;
        }
        updated += 1;
        return { ...transaction, project: "" };
      }
      const tags = Array.isArray(transaction.tags) ? transaction.tags : splitTags(transaction.tags || "");
      const nextTags = tags.filter((tag) => String(tag || "").trim().toLowerCase() !== valueKey);
      if (nextTags.length === tags.length) {
        return transaction;
      }
      updated += 1;
      return { ...transaction, tags: nextTags };
    });
    return updated;
  }

  function handleManagedValueSubmit(event) {
    event.preventDefault();
    const kindField = document.getElementById("managed-value-kind");
    const originalField = document.getElementById("managed-value-original-name");
    const nameField = document.getElementById("managed-value-name");
    if (!kindField || !originalField || !nameField) {
      return;
    }
    const kind = kindField.value || "counterparty";
    const config = getManagedValueConfig(kind);
    const originalName = String(originalField.value || "").trim();
    const nextName = String(nameField.value || "").trim();
    if (!nextName) {
      showToast(`Enter a ${config.singular} first.`);
      return;
    }
    const duplicate = getManagedValueStats(kind).some(
      (entry) => entry.name.trim().toLowerCase() === nextName.toLowerCase() && entry.name.trim().toLowerCase() !== originalName.toLowerCase()
    );
    if (duplicate) {
      showToast(`${config.title} "${nextName}" already exists.`);
      return;
    }
    const now = new Date().toISOString();
    if (!originalName) {
      state.lookupEntries.push({
        id: uid("lkp"),
        kind,
        name: kind === "tag" ? nextName.toLowerCase() : nextName,
        createdAt: now,
        updatedAt: now,
      });
      persistAndRefresh();
      closeModal("managed-value-modal");
      showToast(`${config.title} saved.`);
      return;
    }

    const normalizedOriginal = originalName.toLowerCase();
    let touchedLookup = false;
    state.lookupEntries = state.lookupEntries.map((entry) => {
      if (entry.kind !== kind || entry.name.trim().toLowerCase() !== normalizedOriginal) {
        return entry;
      }
      touchedLookup = true;
      return {
        ...entry,
        name: kind === "tag" ? nextName.toLowerCase() : nextName,
        updatedAt: now,
      };
    });
    if (!touchedLookup) {
      state.lookupEntries.push({
        id: uid("lkp"),
        kind,
        name: kind === "tag" ? nextName.toLowerCase() : nextName,
        createdAt: now,
        updatedAt: now,
      });
    }
    const affectedTransactions = renameManagedValueInTransactions(kind, originalName, nextName);
    persistAndRefresh();
    closeModal("managed-value-modal");
    showToast(
      affectedTransactions
        ? `${config.title} updated across ${affectedTransactions} ${affectedTransactions === 1 ? "transaction" : "transactions"}.`
        : `${config.title} updated.`
    );
  }

  function handleManagedValueMergeSubmit(event) {
    event.preventDefault();
    const kind = String(document.getElementById("managed-value-merge-kind")?.value || "").trim();
    const sourceName = String(document.getElementById("managed-value-merge-source")?.value || "").trim();
    const targetName = String(document.getElementById("managed-value-merge-target")?.value || "").trim();
    if (!kind || !sourceName || !targetName || sourceName.toLowerCase() === targetName.toLowerCase()) {
      return;
    }
    const config = getManagedValueConfig(kind);
    const now = new Date().toISOString();
    const targetKey = targetName.toLowerCase();
    let targetExists = false;
    state.lookupEntries = state.lookupEntries
      .filter((entry) => !(entry.kind === kind && String(entry.name || "").trim().toLowerCase() === sourceName.toLowerCase()))
      .map((entry) => {
        if (entry.kind === kind && String(entry.name || "").trim().toLowerCase() === targetKey) {
          targetExists = true;
          return { ...entry, updatedAt: now };
        }
        return entry;
      });
    if (!targetExists) {
      state.lookupEntries.push({
        id: uid("lkp"),
        kind,
        name: kind === "tag" ? targetName.toLowerCase() : targetName,
        createdAt: now,
        updatedAt: now,
      });
    }
    const movedTransactions = renameManagedValueInTransactions(kind, sourceName, targetName);
    persistAndRefresh();
    closeModal("managed-value-merge-modal");
    closeModal("managed-value-modal");
    showToast(
      movedTransactions
        ? `Merged ${config.title} into ${kind === "tag" ? `#${targetName}` : targetName} across ${movedTransactions} ${movedTransactions === 1 ? "transaction" : "transactions"}.`
        : `Merged ${config.title} into ${kind === "tag" ? `#${targetName}` : targetName}.`
    );
  }

  function deleteManagedValue(kind, name) {
    const config = getManagedValueConfig(kind);
    const affectedTransactions = state.transactions.filter((transaction) => {
      if (kind === "counterparty") {
        return String(transaction.counterparty || "").trim().toLowerCase() === String(name || "").trim().toLowerCase();
      }
      if (kind === "project") {
        return String(transaction.project || "").trim().toLowerCase() === String(name || "").trim().toLowerCase();
      }
      const tags = Array.isArray(transaction.tags) ? transaction.tags : splitTags(transaction.tags || "");
      return tags.some((tag) => String(tag || "").trim().toLowerCase() === String(name || "").trim().toLowerCase());
    }).length;
    openConfirmModal({
      eyebrow: "Delete",
      title: `Delete this ${config.singular}?`,
      message: affectedTransactions
        ? `${config.deleteMessage} ${affectedTransactions} linked ${affectedTransactions === 1 ? "transaction will" : "transactions will"} be updated.`
        : `This ${config.singular} will be removed from the directory.`,
      submitLabel: "Delete",
      onConfirm: () => {
        const targetKey = String(name || "").trim().toLowerCase();
        state.lookupEntries = state.lookupEntries.filter(
          (entry) => !(entry.kind === kind && String(entry.name || "").trim().toLowerCase() === targetKey)
        );
        const touched = clearManagedValueFromTransactions(kind, name);
        persistAndRefresh();
        showToast(
          touched
            ? `${config.title} removed from ${touched} ${touched === 1 ? "transaction" : "transactions"}.`
            : `${config.title} deleted.`
        );
      },
    });
  }

  function getCategoryUsageFrequency(categoryId) {
    let count = 0;
    let lastUsed = "";
    state.transactions.forEach((transaction) => {
      if (transaction.categoryId !== categoryId) {
        return;
      }
      count += 1;
      const candidate = String(transaction.updatedAt || transaction.createdAt || transaction.date || "");
      if (candidate && candidate.localeCompare(lastUsed) > 0) {
        lastUsed = candidate;
      }
    });
    return { count, lastUsed };
  }

  function renderSelectOptions() {
    populateAccountSelect(document.getElementById("filter-account"), true);
    populateCategorySelect(document.getElementById("filter-category"), true);
    populateAccountSelect(document.getElementById("report-account"), true);

    populateAccountSelect(document.getElementById("transaction-account"), false, "Select account");
    populateAccountSelect(document.getElementById("transaction-from-account"), false, "Select source");
    populateAccountSelect(document.getElementById("transaction-to-account"), false, "Select destination");
    populateCategorySelect(document.getElementById("transaction-category"), false, "Optional category");
    populateCounterpartySelect(document.getElementById("transaction-tracked-counterparty"), false, "Use payee / payer text");

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

  function populateCounterpartySelect(select, includeAll, placeholder) {
    if (!select) {
      return;
    }
    const current = select.value;
    const options = [];
    if (includeAll) {
      options.push('<option value="all">All Counterparties</option>');
    } else {
      options.push(`<option value="">${placeholder || "Select counterparty"}</option>`);
    }
    state.counterparties
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((counterparty) => {
        options.push(`<option value="${escapeHtml(counterparty.id)}">${escapeHtml(counterparty.name)}</option>`);
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

  function syncTrackedCounterpartySelection() {
    const trackedField = document.getElementById("transaction-tracked-counterparty");
    const counterpartyField = document.getElementById("transaction-counterparty");
    if (!trackedField || !counterpartyField) {
      return;
    }
    const typedName = counterpartyField.value.trim().toLowerCase();
    if (trackedField.value) {
      const linked = getCounterparty(trackedField.value);
      if (linked && !counterpartyField.value.trim()) {
        counterpartyField.value = linked.name;
      }
      return;
    }
    if (!typedName) {
      return;
    }
    const match = state.counterparties.find((entry) => entry.name.trim().toLowerCase() === typedName);
    if (match) {
      trackedField.value = match.id;
    }
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

  function mergeManagedLookupValues(kind, rankedEntries) {
    const merged = [...rankedEntries];
    const seen = new Set(merged.map((entry) => String(entry.value || "").trim().toLowerCase()));
    getManagedLookupEntries(kind).forEach((entry) => {
      const value = String(entry.name || "").trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) {
        return;
      }
      merged.push({
        value,
        count: 0,
        lastUsed: String(entry.updatedAt || entry.createdAt || ""),
      });
      seen.add(key);
    });
    return merged;
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

    const ranked = mergeManagedLookupValues(
      field === "counterparty" ? "counterparty" : "project",
      [...exact.values(), ...[...fallback.values()].filter((entry) => !exact.has(entry.value.toLowerCase()))]
    );
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

    const ranked = mergeManagedLookupValues(
      field === "counterparty" ? "counterparty" : "project",
      [...exact.values(), ...[...fallback.values()].filter((entry) => !exact.has(entry.value.toLowerCase()))]
    );
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
      const tags = Array.isArray(transaction.tags) ? transaction.tags : splitTags(transaction.tags || "");
      tags.forEach((tag) => {
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

    const ranked = mergeManagedLookupValues(
      "tag",
      [...exact.values(), ...[...fallback.values()].filter((entry) => !exact.has(entry.value.toLowerCase()))]
    );
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
        const transaction = getTransaction(id);
        const slipPath = String(transaction?.slipPath || "").trim();
        state.transactions = state.transactions.filter((transactionItem) => transactionItem.id !== id);
        persistAndRefresh();
        if (slipPath) {
          clearTransactionSlipPreviewCache(slipPath);
          void deleteTransactionSlip(slipPath).catch((error) => console.error(error));
        }
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
        const slipPaths = state.transactions.map((transaction) => String(transaction.slipPath || "").trim()).filter(Boolean);
        state.transactions = [];
        uiState.transactionPage = 1;
        clearFilters();
        persistAndRefresh();
        slipPaths.forEach((path) => clearTransactionSlipPreviewCache(path));
        if (slipPaths.length) {
          void deleteTransactionSlips(slipPaths).catch((error) => console.error(error));
        }
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

  function openCounterpartyLedger(id) {
    const counterparty = getCounterparty(id);
    if (!counterparty) {
      return;
    }
    uiState.filters.counterparty = counterparty.name;
    uiState.transactionPage = 1;
    switchScreen("transactions");
    renderTransactions();
    showToast(`Showing ledger entries for ${counterparty.name}.`);
  }

  function deleteCounterparty(id) {
    const linked = state.transactions.some((transaction) => transaction.counterpartyId === id);
    if (linked) {
      showToast("This counterparty is already linked to tracked transactions.");
      return;
    }
    openConfirmModal({
      eyebrow: "Delete",
      title: "Delete this counterparty?",
      message: "This tracked payee or payer will be removed permanently.",
      submitLabel: "Delete",
      onConfirm: () => {
        state.counterparties = state.counterparties.filter((counterparty) => counterparty.id !== id);
        persistAndRefresh();
        showToast("Counterparty deleted.");
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
    const safeTags = Array.isArray(transaction.tags) ? transaction.tags : splitTags(transaction.tags || "");
    const tagPills = safeTags.map((tag) => `<span class="meta-pill neutral">#${escapeHtml(tag)}</span>`).join("");
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
    const slipPath = String(transaction.slipPath || "").trim();
    const badgeMarkup = `
      <div class="transaction-badge ${slipPath ? "transaction-badge-has-image" : ""}"${
        slipPath ? ` data-transaction-slip-path="${escapeAttribute(slipPath)}"` : ""
      }>
        <img class="transaction-badge-image hidden" alt="Slip preview for ${escapeAttribute(transaction.date || "transaction")}" />
        <div class="transaction-badge-fallback">${leadingIcon}</div>
      </div>
    `;
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
              ${badgeMarkup}
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

  function getCounterparty(id) {
    return state.counterparties.find((counterparty) => counterparty.id === id);
  }

  function getTransaction(id) {
    return state.transactions.find((transaction) => transaction.id === id);
  }

})();
