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
  initializeSpeechRecognition();
  bindEvents();
  renderAll();
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
    document.getElementById("clear-filters-button").addEventListener("click", clearFilters);
    document.getElementById("add-category-button").addEventListener("click", () => openCategoryModal());
    document.getElementById("open-import-button").addEventListener("click", () => openModal("import-modal"));
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

    document.addEventListener("click", handleDelegatedClick);
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
    if (!window.confirm("Delete this transaction?")) {
      return;
    }
    state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
    persistAndRefresh();
    showToast("Transaction deleted.");
  }

  function deleteAccount(id) {
    const linked = state.transactions.some(
      (transaction) => transaction.accountId === id || transaction.fromAccountId === id || transaction.toAccountId === id
    );
    if (linked) {
      showToast("This account is used by transactions. Edit the transactions first.");
      return;
    }
    if (!window.confirm("Delete this account?")) {
      return;
    }
    state.accounts = state.accounts.filter((account) => account.id !== id);
    persistAndRefresh();
    showToast("Account deleted.");
  }

  function deleteCategory(id) {
    const linked = state.transactions.some((transaction) => transaction.categoryId === id);
    if (linked) {
      showToast("This category is already used by transactions.");
      return;
    }
    if (!window.confirm("Delete this category?")) {
      return;
    }
    state.categories = state.categories.filter((category) => category.id !== id);
    persistAndRefresh();
    showToast("Category deleted.");
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
    const primaryAccount =
      transaction.type === "transfer"
        ? `${getAccount(transaction.fromAccountId)?.name || "Unknown"} -> ${getAccount(transaction.toAccountId)?.name || "Unknown"}`
        : getAccount(transaction.accountId)?.name || "Unknown Account";
    const amountPrefix = transaction.type === "expense" ? "- " : transaction.type === "income" ? "+ " : "<-> ";
    const icon =
      transaction.type === "expense"
        ? iconRegistry["arrow-up"]
        : transaction.type === "income"
          ? iconRegistry["arrow-down"]
          : iconRegistry.swap;
    return `
      <article class="transaction-item ${escapeHtml(transaction.type)}">
        <div class="transaction-top">
          <div class="transaction-main">
            <div class="transaction-badge">${icon}</div>
            <div class="transaction-details">
              <strong>${escapeHtml(transaction.counterparty || category?.name || typeLabel)}</strong>
              <p class="transaction-meta">${escapeHtml(primaryAccount)} | ${escapeHtml(transaction.date)}</p>
              <p class="transaction-meta">${escapeHtml(transaction.project || transaction.details || typeLabel)}</p>
              <div class="transaction-tags">
                ${category ? `<span class="tag-pill">${escapeHtml(category.name)}</span>` : ""}
                ${transaction.subcategory ? `<span class="meta-pill neutral">${escapeHtml(transaction.subcategory)}</span>` : ""}
                ${(transaction.tags || []).map((tag) => `<span class="meta-pill neutral">#${escapeHtml(tag)}</span>`).join("")}
              </div>
            </div>
          </div>
          <div class="item-actions">
            <strong class="money transaction-amount">${amountPrefix}${formatMoney(transaction.amount, transactionSymbol)}</strong>
            <button class="ghost-button" type="button" data-action="edit-transaction" data-id="${escapeHtml(transaction.id)}">Edit</button>
            <button class="secondary-button" type="button" data-action="delete-transaction" data-id="${escapeHtml(transaction.id)}">Delete</button>
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
