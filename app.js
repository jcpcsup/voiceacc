import { createDefaultState } from "./modules/default-state.js";
import { iconRegistry } from "./modules/icons.js";
import { createCalendarTools } from "./modules/calendar-tools.js";
import { createAccountsCategoriesTools } from "./modules/accounts-categories-tools.js";
import { createCsvTools } from "./modules/csv-tools.js";
import { createFormatterTools } from "./modules/formatters.js";
import { createModalTools } from "./modules/modal-tools.js";
import { captureFields, categoryKeywordMap, dictationExamples } from "./modules/reference-data.js";
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
  const SUPABASE_CONFIGURED = SUPABASE_URL.trim() !== "" && SUPABASE_ANON_KEY.trim() !== "";
  const SUPABASE_AVAILABLE =
    SUPABASE_CONFIGURED && typeof window.supabase?.createClient === "function";
  const toastEl = document.getElementById("toast");
  const defaultState = createDefaultState();
  const SCREEN_ORDER = ["overview", "transactions", "accounts", "reports", "more"];

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
  let swipeGesture = null;
  let uiState;

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
      tag: "",
      startDate: "",
      endDate: "",
    },
    reports: {
      range: "thisMonth",
      account: "all",
      type: "all",
    },
    toastTimer: null,
    recognition: null,
    isListening: false,
    transactionsFiltersExpanded: false,
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
    switchScreen,
    renderTransactions,
  });

  ({ renderReports, getBudgetStatus } = createReportsTools({
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
    document.getElementById("add-category-button").addEventListener("click", () => openCategoryModal());
    document.getElementById("toggle-transaction-filters-button").addEventListener("click", toggleTransactionFiltersPanel);
    document.getElementById("open-import-button").addEventListener("click", () => {
      syncImportTemplateUi();
      openModal("import-modal");
    });
    document.getElementById("export-transactions-button").addEventListener("click", exportTransactionsCsv);
    document.getElementById("export-accounts-button").addEventListener("click", exportAccountsCsv);
    document.getElementById("export-categories-button").addEventListener("click", exportCategoriesCsv);

    document.querySelectorAll("[data-open-account-modal]").forEach((button) => {
      button.addEventListener("click", () => openAccountModal());
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => closeModal(button.dataset.closeModal));
    });

    document.getElementById("transaction-type").addEventListener("change", syncTransactionTypeFields);
    document.getElementById("transaction-category").addEventListener("change", renderSubcategoryOptions);
    document.getElementById("category-type").addEventListener("change", syncCategoryBudgetState);
    document.getElementById("import-target").addEventListener("change", syncImportTemplateUi);
    document.getElementById("download-import-template-button").addEventListener("click", handleDownloadImportTemplate);
    document.getElementById("confirm-modal-submit").addEventListener("click", handleConfirmModalSubmit);
    document.querySelectorAll('[data-close-modal="confirm-modal"]').forEach((button) => {
      button.addEventListener("click", resetConfirmModal);
    });

    document.getElementById("transaction-form").addEventListener("submit", handleTransactionSubmit);
    document.getElementById("account-form").addEventListener("submit", handleAccountSubmit);
    document.getElementById("category-form").addEventListener("submit", handleCategorySubmit);
    document.getElementById("import-form").addEventListener("submit", handleImportSubmit);

    bindFilterInput("search-input", "search");
    bindFilterInput("filter-type", "type");
    bindFilterInput("filter-account", "account");
    bindFilterInput("filter-category", "category");
    bindFilterInput("filter-tag", "tag");
    bindFilterInput("filter-start-date", "startDate");
    bindFilterInput("filter-end-date", "endDate");

    document.getElementById("report-range").addEventListener("change", (event) => {
      uiState.reports.range = event.target.value;
      renderReports();
    });
    document.getElementById("report-account").addEventListener("change", (event) => {
      uiState.reports.account = event.target.value;
      renderReports();
    });
    document.getElementById("report-type").addEventListener("change", (event) => {
      uiState.reports.type = event.target.value;
      renderReports();
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
  }

  function handleDownloadImportTemplate() {
    exportImportTemplate(document.getElementById("import-target").value || "transactions");
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
    const nextIndex = deltaX > 0 ? currentIndex + 1 : currentIndex - 1;
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

  function openConfirmModal({ eyebrow = "Confirm", title = "Continue?", message = "", submitLabel = "Confirm", onConfirm }) {
    pendingConfirmAction = typeof onConfirm === "function" ? onConfirm : null;
    document.getElementById("confirm-modal-eyebrow").textContent = eyebrow;
    document.getElementById("confirm-modal-title").textContent = title;
    document.getElementById("confirm-modal-message").textContent = message;
    document.getElementById("confirm-modal-submit").textContent = submitLabel;
    openModal("confirm-modal");
  }

  function resetConfirmModal() {
    pendingConfirmAction = null;
  }

  function handleConfirmModalSubmit() {
    const callback = pendingConfirmAction;
    pendingConfirmAction = null;
    closeModal("confirm-modal");
    if (typeof callback === "function") {
      callback();
    }
  }

  function bindFilterInput(id, key) {
    document.getElementById(id).addEventListener("input", (event) => {
      uiState.filters[key] = event.target.value;
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
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }
    const { action, id } = actionTarget.dataset;
    if (action === "edit-transaction") {
      openTransactionModal(id);
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

    const budgetsContainer = document.getElementById("overview-budgets");
    const budgetItems = getBudgetStatus().slice(0, 4);
    budgetsContainer.innerHTML = budgetItems.length
      ? budgetItems.map(renderBudgetCard).join("")
      : renderEmpty("No budgets configured yet. Add budget limits to categories.");

    const recentTransactions = [...state.transactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
    document.getElementById("overview-transactions").innerHTML = recentTransactions.length
      ? recentTransactions.map(renderTransactionItem).join("")
      : renderEmpty("No transactions yet. Use dictation or manual entry to create one.");
  }

  function renderTransactions() {
    const matches = getFilteredTransactions();
    document.getElementById("transaction-result-count").textContent = `${matches.length} matching transaction${
      matches.length === 1 ? "" : "s"
    }`;
    document.getElementById("transaction-list").innerHTML = matches.length
      ? matches.map(renderTransactionItem).join("")
      : renderEmpty("No transactions match your search yet.");
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

    renderSubcategoryOptions();
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
    state.categories.forEach((category) => {
      options.push(`<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`);
    });
    select.innerHTML = options.join("");
    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    }
  }

  function renderSubcategoryOptions() {
    const categoryId = document.getElementById("transaction-category").value;
    const select = document.getElementById("transaction-subcategory");
    const current = select.value;
    const category = getCategory(categoryId);
    const options = ['<option value="">Optional subcategory</option>'];
    if (category && Array.isArray(category.subcategories)) {
      category.subcategories.forEach((subcategory) => {
        options.push(`<option value="${escapeHtml(subcategory)}">${escapeHtml(subcategory)}</option>`);
      });
    }
    select.innerHTML = options.join("");
    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    }
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

  function getDateRange(range) {
    const now = new Date();
    const today = todayIso();
    if (range === "all") {
      return { start: "", end: "" };
    }
    if (range === "last30") {
      return { start: shiftIsoDate(today, -29), end: today };
    }
    if (range === "thisMonth") {
      return {
        start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
        end: today,
      };
    }
    if (range === "thisQuarter") {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        start: `${now.getFullYear()}-${String(quarterStartMonth + 1).padStart(2, "0")}-01`,
        end: today,
      };
    }
    if (range === "thisYear") {
      return {
        start: `${now.getFullYear()}-01-01`,
        end: today,
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
    const leadingIcon =
      category && iconRegistry[category.icon]
        ? iconRegistry[category.icon]
        : transaction.type === "expense"
          ? iconRegistry["arrow-down"]
          : transaction.type === "income"
            ? iconRegistry["arrow-up"]
            : iconRegistry.swap;
    const counterpartyLabel = transaction.type === "income" ? "Payer" : "Payee";
    const detailPills = [
      transaction.counterparty
        ? `<span class="meta-pill transaction-pill-payee">${escapeHtml(counterpartyLabel)}: ${escapeHtml(transaction.counterparty)}</span>`
        : "",
      transaction.project ? `<span class="meta-pill transaction-pill-project">${escapeHtml(transaction.project)}</span>` : "",
      tagPills,
    ]
      .filter(Boolean)
      .join("");
    return `
      <article class="transaction-item ${escapeHtml(transaction.type)}" style="--card-color:${escapeHtml(cardColor)}">
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
              ${detailPills ? `<div class="transaction-tags transaction-tags-secondary">${detailPills}</div>` : ""}
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
            <div class="transaction-action-row">
              <button class="ghost-button" type="button" data-action="edit-transaction" data-id="${escapeHtml(transaction.id)}">Edit</button>
              <button class="secondary-button" type="button" data-action="delete-transaction" data-id="${escapeHtml(transaction.id)}">Delete</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }


  function seedStaticContent() {
    document.getElementById("voice-examples").innerHTML = dictationExamples
      .map(
        (example) =>
          `<button class="example-chip" type="button" data-action="use-example" data-statement="${escapeAttribute(example)}">${escapeHtml(
            example
          )}</button>`
      )
      .join("");
    document.getElementById("more-examples").innerHTML = dictationExamples
      .map(
        (example) => `
          <button class="example-card ghost-button" type="button" data-action="use-example" data-statement="${escapeAttribute(example)}">
            <strong>${escapeHtml(example)}</strong>
            <span class="supporting-text">Tap to load this example into voice dictation.</span>
          </button>
        `
      )
      .join("");
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
