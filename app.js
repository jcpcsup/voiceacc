(function () {
  "use strict";

  const ASTRA_VAULT_SIGNAL = "document.getElementById";
  // Fill these values to enable Supabase auth and cloud sync.
  const SUPABASE_URL = "https://rcpilsxyrswwhjyaenxt.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjcGlsc3h5cnN3d2hqeWFlbnh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDc3MzEsImV4cCI6MjA4OTY4MzczMX0.kxQhwsH1InTmLCrKIhBw93pI2ALf_iVcTowqvR_zYco";
  const SUPABASE_STATE_TABLE = "ledger_state";
  const STORAGE_KEY = "ledgerflow-voice-v1";
  const SUPABASE_CONFIGURED = SUPABASE_URL.trim() !== "" && SUPABASE_ANON_KEY.trim() !== "";
  const SUPABASE_AVAILABLE =
    SUPABASE_CONFIGURED && typeof window.supabase?.createClient === "function";
  const toastEl = document.getElementById("toast");
  const dictationExamples = [
    "Spent 45 on groceries at Walmart yesterday from Cash tags home,food",
    "Received 2500 salary from Acme Corp on 2026-03-01 into Main Bank project March payroll",
    "Transfer 300 from Main Bank to Savings on 03/15/2026 tags reserve",
    "Paid 89 for internet bill from Main Bank category Utilities project apartment",
  ];
  const captureFields = [
    "Amount",
    "Date",
    "Account / From Account",
    "To Account for transfers",
    "Category",
    "Subcategory",
    "Payee or Payer",
    "Project",
    "Tags",
    "Details",
  ];
  const categoryKeywordMap = {
    groceries: ["groceries", "supermarket", "market", "food shopping"],
    dining: ["restaurant", "dinner", "lunch", "breakfast", "cafe", "coffee"],
    transport: ["uber", "taxi", "fuel", "gas", "metro", "train", "bus"],
    utilities: ["internet", "electricity", "water bill", "gas bill", "utility"],
    housing: ["rent", "mortgage", "apartment", "home repair"],
    health: ["doctor", "pharmacy", "medicine", "clinic", "hospital"],
    entertainment: ["movie", "netflix", "concert", "game"],
    shopping: ["shopping", "amazon", "mall", "clothes"],
    salary: ["salary", "payroll", "bonus", "wage"],
    freelance: ["invoice", "client payment", "consulting", "freelance"],
    refund: ["refund", "rebate", "cashback"],
  };

  const iconRegistry = {
    overview: svgIcon("M3 11.5L12 4l9 7.5v8.5H14v-5h-4v5H3z"),
    transactions: svgIcon("M5 6h14M5 12h14M5 18h14"),
    accounts: svgIcon("M4 6h16v12H4z M8 10h4"),
    reports: svgIcon("M5 18V9M12 18V5M19 18v-7"),
    more: svgIcon("M6 6h4v4H6z M14 6h4v4h-4z M6 14h4v4H6z M14 14h4v4h-4z"),
    search: svgIcon("M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm8 14-3.2-3.2"),
    "chevron-left": svgIcon("M15 6l-6 6 6 6"),
    "chevron-right": svgIcon("M9 6l6 6-6 6"),
    microphone: svgIcon(
      "M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4zm0 0v4m-4-2h8M6 11a6 6 0 0 0 12 0"
    ),
    day: svgIcon("M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8"),
    week: svgIcon("M7 3v3M17 3v3M4 8h16M5 6h14v14H5zM8 12h2M12 12h2M16 12h0M8 16h2M12 16h2"),
    month: svgIcon("M7 3v3M17 3v3M4 8h16M5 6h14v14H5z"),
    wallet: svgIcon("M4 7h16v10H4z M15 12h3"),
    bank: svgIcon("M3 9l9-5 9 5M5 10v7M10 10v7M14 10v7M19 10v7M3 19h18"),
    safe: svgIcon("M5 5h14v14H5z M12 10v4M10 12h4"),
    card: svgIcon("M3 7h18v10H3z M3 11h18"),
    cash: svgIcon("M4 8h16v8H4z M12 12h.01M7 10.5A2 2 0 0 1 5.5 12 2 2 0 0 1 7 13.5M17 10.5A2 2 0 0 0 18.5 12 2 2 0 0 0 17 13.5"),
    cart: svgIcon("M4 5h2l2.2 9h8.5l2-6H8.2 M10 19a1 1 0 1 0 0 .01 M17 19a1 1 0 1 0 0 .01"),
    food: svgIcon("M7 4v8M11 4v8M9 4v8M16 4c0 5 0 8-3 8v8"),
    home: svgIcon("M4 11.5L12 5l8 6.5V20h-5v-5H9v5H4z"),
    travel: svgIcon("M4 15l16-6-7 10-1-4-4 1z"),
    health: svgIcon("M10 5h4v4h4v4h-4v4h-4v-4H6V9h4z"),
    briefcase: svgIcon("M8 7V5h8v2M4 8h16v10H4z"),
    gift: svgIcon("M4 10h16v10H4z M12 10v10 M4 14h16 M10 10s-2-1.5-2-3a2 2 0 0 1 4 0v1 M14 10s2-1.5 2-3a2 2 0 0 0-4 0v1"),
    spark: svgIcon("M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4z"),
    "arrow-up": svgIcon("M12 19V5M6 11l6-6 6 6"),
    "arrow-down": svgIcon("M12 5v14M6 13l6 6 6-6"),
    swap: svgIcon("M7 7h11l-3-3M17 17H6l3 3M18 7a5 5 0 0 1 0 10M6 17A5 5 0 0 1 6 7"),
  };

  const defaultState = {
    accounts: [
      {
        id: uid("acc"),
        name: "Cash",
        type: "cash",
        currencySymbol: "$",
        openingBalance: 0,
        color: "#19c6a7",
        icon: "cash",
        notes: "Physical cash account",
      },
      {
        id: uid("acc"),
        name: "Main Bank",
        type: "bank",
        currencySymbol: "$",
        openingBalance: 0,
        color: "#7db8ff",
        icon: "bank",
        notes: "Primary checking account",
      },
      {
        id: uid("acc"),
        name: "Savings",
        type: "savings",
        currencySymbol: "$",
        openingBalance: 0,
        color: "#ffb84d",
        icon: "safe",
        notes: "Savings reserve",
      },
    ],
    categories: [
      {
        id: "groceries",
        name: "Groceries",
        type: "expense",
        icon: "cart",
        color: "#19c6a7",
        subcategories: ["Supermarket", "Produce", "Household"],
        budgetLimit: 500,
        budgetPeriod: "monthly",
      },
      {
        id: "dining",
        name: "Dining",
        type: "expense",
        icon: "food",
        color: "#ff8f6b",
        subcategories: ["Dining Out", "Coffee", "Delivery"],
        budgetLimit: 160,
        budgetPeriod: "weekly",
      },
      {
        id: "transport",
        name: "Transport",
        type: "expense",
        icon: "travel",
        color: "#00a6c7",
        subcategories: ["Fuel", "Taxi", "Public Transit"],
        budgetLimit: 220,
        budgetPeriod: "monthly",
      },
      {
        id: "utilities",
        name: "Utilities",
        type: "expense",
        icon: "spark",
        color: "#6f8cff",
        subcategories: ["Internet", "Electricity", "Water", "Gas"],
        budgetLimit: 280,
        budgetPeriod: "monthly",
      },
      {
        id: "housing",
        name: "Housing",
        type: "expense",
        icon: "home",
        color: "#48b29c",
        subcategories: ["Rent", "Repairs", "Furniture"],
        budgetLimit: 1800,
        budgetPeriod: "monthly",
      },
      {
        id: "health",
        name: "Health",
        type: "expense",
        icon: "health",
        color: "#ef6461",
        subcategories: ["Doctor", "Medicine", "Insurance"],
        budgetLimit: 200,
        budgetPeriod: "monthly",
      },
      {
        id: "shopping",
        name: "Shopping",
        type: "expense",
        icon: "gift",
        color: "#f06f9b",
        subcategories: ["Clothing", "Personal Care", "Gadgets"],
        budgetLimit: 300,
        budgetPeriod: "monthly",
      },
      {
        id: "entertainment",
        name: "Entertainment",
        type: "expense",
        icon: "spark",
        color: "#9f86ff",
        subcategories: ["Streaming", "Games", "Events"],
        budgetLimit: 120,
        budgetPeriod: "monthly",
      },
      {
        id: "salary",
        name: "Salary",
        type: "income",
        icon: "briefcase",
        color: "#19c6a7",
        subcategories: ["Payroll", "Bonus", "Commission"],
        budgetLimit: 0,
        budgetPeriod: "monthly",
      },
      {
        id: "freelance",
        name: "Freelance",
        type: "income",
        icon: "briefcase",
        color: "#00a6c7",
        subcategories: ["Consulting", "Project Payment", "Invoice"],
        budgetLimit: 0,
        budgetPeriod: "monthly",
      },
      {
        id: "refund",
        name: "Refund",
        type: "income",
        icon: "arrow-down",
        color: "#48b29c",
        subcategories: ["Rebate", "Cashback", "Returned Item"],
        budgetLimit: 0,
        budgetPeriod: "monthly",
      },
    ],
    transactions: [],
  };

  const cloudState = {
    client: null,
    session: null,
    authSubscription: null,
    isSyncing: false,
    pendingSync: false,
    lastSyncedAt: "",
  };
  const state = loadLocalState();
  const uiState = {
    screen: "overview",
    authProvider: SUPABASE_AVAILABLE ? "supabase" : "local",
    authView: "signin",
    requiresLogin: SUPABASE_AVAILABLE ? true : ASTRA_VAULT_SIGNAL.trim() !== "",
    isAuthenticated: SUPABASE_AVAILABLE ? false : ASTRA_VAULT_SIGNAL.trim() === "",
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

    if (uiState.authProvider === "supabase") {
      modeLabel.textContent = "Supabase Cloud";
      title.textContent = "Sign in to LedgerFlow Voice";
      hint.textContent =
        uiState.authView === "signup"
          ? "Create your email account to unlock cloud sync across devices."
          : "Use your Supabase email and password to open your ledger.";
      hint.classList.remove("hidden");
      toggle.classList.remove("hidden");
      emailGroup.classList.remove("hidden");
      confirmGroup.classList.toggle("hidden", uiState.authView !== "signup");
      emailInput.required = true;
      passwordInput.autocomplete = uiState.authView === "signup" ? "new-password" : "current-password";
      confirmInput.required = uiState.authView === "signup";
      submitButton.textContent = uiState.authView === "signup" ? "Create Account" : "Sign In";
      updateAuthToggleButtons();
    } else {
      modeLabel.textContent = "Local Access";
      title.textContent = "Unlock LedgerFlow Voice";
      hint.classList.add("hidden");
      toggle.classList.add("hidden");
      emailGroup.classList.add("hidden");
      confirmGroup.classList.add("hidden");
      emailInput.required = false;
      confirmInput.required = false;
      passwordInput.autocomplete = "current-password";
      submitButton.textContent = "Login";
    }

    if (!uiState.requiresLogin) {
      lockScreen.classList.add("hidden");
      lockScreen.setAttribute("aria-hidden", "true");
      document.body.classList.remove("app-locked");
      return;
    }
    lockScreen.classList.remove("hidden");
    lockScreen.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-locked");
    if (uiState.authProvider === "supabase") {
      emailInput.focus();
      return;
    }
    passwordInput.focus();
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

    if (uiState.authProvider === "supabase") {
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

    if (input.value === ASTRA_VAULT_SIGNAL) {
      uiState.isAuthenticated = true;
      document.getElementById("lock-screen").classList.add("hidden");
      document.getElementById("lock-screen").setAttribute("aria-hidden", "true");
      document.body.classList.remove("app-locked");
      error.classList.add("hidden");
      input.value = "";
      showToast("Logged in.");
      return;
    }
    error.classList.remove("hidden");
    input.select();
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

  function loadLocalState(key = STORAGE_KEY) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return structuredClone(defaultState);
      }
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.error(error);
      return structuredClone(defaultState);
    }
  }

  function normalizeState(parsed) {
    const normalizedAccounts = Array.isArray(parsed.accounts) && parsed.accounts.length
      ? parsed.accounts.map((account) => ({
          currencySymbol: "$",
          ...account,
        }))
      : structuredClone(defaultState.accounts);
    return {
      accounts: normalizedAccounts,
      categories:
        Array.isArray(parsed.categories) && parsed.categories.length
          ? parsed.categories
          : structuredClone(defaultState.categories),
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    };
  }

  function replaceState(nextState) {
    const normalized = normalizeState(nextState);
    state.accounts = normalized.accounts;
    state.categories = normalized.categories;
    state.transactions = normalized.transactions;
  }

  function buildSerializableState() {
    return {
      accounts: state.accounts,
      categories: state.categories,
      transactions: state.transactions,
    };
  }

  function getUserCacheKey(userId) {
    return `${STORAGE_KEY}:${userId}`;
  }

  function persistState() {
    const serialized = JSON.stringify(buildSerializableState());
    window.localStorage.setItem(STORAGE_KEY, serialized);
    if (uiState.currentUserId) {
      window.localStorage.setItem(getUserCacheKey(uiState.currentUserId), serialized);
    }
  }

  async function initializeSupabase() {
    if (!SUPABASE_AVAILABLE) {
      renderCloudStatus();
      return;
    }
    try {
      cloudState.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      });
      const { data, error } = await cloudState.client.auth.getSession();
      if (error) {
        throw error;
      }
      const authSubscription = cloudState.client.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => {
          void handleSupabaseSession(session, true);
        }, 0);
      });
      cloudState.authSubscription = authSubscription.data.subscription;
      await handleSupabaseSession(data.session, true);
    } catch (error) {
      console.error(error);
      uiState.syncStatus = error.message || "Supabase initialization failed.";
      renderCloudStatus();
      initializeLockScreen();
    }
  }

  async function handleSupabaseSession(session, quiet) {
    const sameUser =
      Boolean(session) &&
      cloudState.session?.user?.id === session.user.id &&
      uiState.isAuthenticated;
    cloudState.session = session || null;
    uiState.isAuthenticated = Boolean(session);
    uiState.requiresLogin = !session;
    uiState.currentUserId = session?.user?.id || "";
    uiState.currentUserEmail = session?.user?.email || "";

    if (sameUser && quiet) {
      initializeLockScreen();
      renderCloudStatus();
      return;
    }

    if (!session) {
      cloudState.lastSyncedAt = "";
      replaceState(structuredClone(defaultState));
      persistState();
      renderAll();
      initializeLockScreen();
      uiState.syncStatus = "Sign in to load your Supabase ledger.";
      renderCloudStatus();
      return;
    }

    await hydrateStateFromSupabase(quiet);
    initializeLockScreen();
  }

  async function hydrateStateFromSupabase(quiet) {
    if (!cloudState.client || !cloudState.session) {
      return;
    }
    uiState.syncStatus = "Syncing with Supabase...";
    renderCloudStatus();

    const { data, error } = await cloudState.client
      .from(SUPABASE_STATE_TABLE)
      .select("payload, updated_at")
      .eq("user_id", cloudState.session.user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      const cachedState = loadLocalState(getUserCacheKey(cloudState.session.user.id));
      replaceState(cachedState);
      renderAll();
      uiState.syncStatus = error.message || "Unable to load Supabase data.";
      renderCloudStatus();
      initializeLockScreen();
      return;
    }

    if (data?.payload) {
      replaceState(data.payload);
      persistState();
      renderAll();
      cloudState.lastSyncedAt = data.updated_at || "";
      uiState.syncStatus = `Cloud data loaded${data.updated_at ? ` on ${formatShortDateTime(data.updated_at)}` : "."}`;
      renderCloudStatus();
      if (!quiet) {
        showToast("Supabase data loaded.");
      }
      return;
    }

    await syncStateToSupabase(!quiet, "Created your first Supabase backup.");
  }

  async function syncStateToSupabase(showFeedback, successMessage = "Synced to Supabase.") {
    if (!cloudState.client || !cloudState.session) {
      if (showFeedback) {
        showToast("Sign in to Supabase first.");
      }
      return;
    }
    if (cloudState.isSyncing) {
      cloudState.pendingSync = true;
      return;
    }

    cloudState.isSyncing = true;
    uiState.syncStatus = "Syncing with Supabase...";
    renderCloudStatus();

    try {
      const payload = {
        user_id: cloudState.session.user.id,
        payload: buildSerializableState(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await cloudState.client.from(SUPABASE_STATE_TABLE).upsert(payload, {
        onConflict: "user_id",
      });
      if (error) {
        throw error;
      }
      cloudState.lastSyncedAt = payload.updated_at;
      uiState.syncStatus = `Synced ${formatShortDateTime(payload.updated_at)}`;
      renderCloudStatus();
      if (showFeedback) {
        showToast(successMessage);
      }
    } catch (error) {
      console.error(error);
      uiState.syncStatus = error.message || "Supabase sync failed.";
      renderCloudStatus();
      if (showFeedback) {
        showToast("Supabase sync failed.");
      }
    } finally {
      cloudState.isSyncing = false;
      if (cloudState.pendingSync) {
        cloudState.pendingSync = false;
        void syncStateToSupabase(false);
      }
    }
  }

  async function handleSignOut() {
    if (!cloudState.client || !cloudState.session) {
      showToast("No Supabase session is active.");
      return;
    }
    const { error } = await cloudState.client.auth.signOut();
    if (error) {
      console.error(error);
      showToast(error.message || "Unable to sign out.");
      return;
    }
    showToast("Signed out.");
  }

  function renderCloudStatus() {
    const mode = document.getElementById("auth-status-mode");
    const title = document.getElementById("auth-status-title");
    const detail = document.getElementById("auth-status-detail");
    const syncButton = document.getElementById("sync-now-button");
    const signOutButton = document.getElementById("sign-out-button");

    if (!SUPABASE_CONFIGURED) {
      mode.textContent = "Local Mode";
      title.textContent = "Supabase not configured";
      detail.textContent = "Add your Supabase project URL and anon key in app.js to enable cloud auth and syncing.";
      syncButton.disabled = true;
      signOutButton.disabled = true;
      return;
    }

    if (!SUPABASE_AVAILABLE) {
      mode.textContent = "Supabase";
      title.textContent = "Client unavailable";
      detail.textContent = "The Supabase browser client could not load, so the app stayed in local mode.";
      syncButton.disabled = true;
      signOutButton.disabled = true;
      return;
    }

    mode.textContent = "Supabase Cloud";
    title.textContent = uiState.isAuthenticated ? "Connected" : "Sign in required";
    detail.textContent = uiState.isAuthenticated
      ? `${uiState.currentUserEmail || "Authenticated user"}${uiState.syncStatus ? ` · ${uiState.syncStatus}` : ""}`
      : uiState.syncStatus;
    syncButton.disabled = !uiState.isAuthenticated || cloudState.isSyncing;
    signOutButton.disabled = !uiState.isAuthenticated;
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

  function getAppRedirectUrl() {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = "";
    return url.toString();
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

  function formatShortDateTime(value) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
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
                          <span class="calendar-pill-text">${formatCompactMoney(income, baseSymbol)}</span>
                          <span class="calendar-pill-mobile-text">${formatCompactPlainAmount(income)}</span>
                        </span>`
                      : ""
                  }
                  ${
                    expense
                      ? `<span class="calendar-pill icon-expense">
                          <span class="calendar-pill-icon">${iconRegistry["arrow-down"]}</span>
                          <span class="calendar-pill-text">${formatCompactMoney(expense, baseSymbol)}</span>
                          <span class="calendar-pill-mobile-text">${formatCompactPlainAmount(expense)}</span>
                        </span>`
                      : ""
                  }
                  ${
                    transfer
                      ? `<span class="calendar-pill icon-transfer">
                          <span class="calendar-pill-icon">${iconRegistry.swap}</span>
                          <span class="calendar-pill-text">${formatCompactMoney(transfer, baseSymbol)}</span>
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

  function renderReports() {
    const transactions = getReportTransactions();
    const baseSymbol = getPrimaryCurrencySymbol();
    const income = sumAmounts(transactions.filter((tx) => tx.type === "income"));
    const expense = sumAmounts(transactions.filter((tx) => tx.type === "expense"));
    const transfer = sumAmounts(transactions.filter((tx) => tx.type === "transfer"));
    const largest = transactions.reduce((best, tx) => (!best || tx.amount > best.amount ? tx : best), null);

    document.getElementById("report-metrics").innerHTML = [
      metricCard("Income", formatMoney(income, baseSymbol), "Filtered income"),
      metricCard("Expenses", formatMoney(expense, baseSymbol), "Filtered expense"),
      metricCard("Net", formatMoney(income - expense, baseSymbol), "Income minus expense"),
      metricCard("Transfers", formatMoney(transfer, baseSymbol), "Transfer volume"),
      metricCard(
        "Largest Entry",
        largest ? formatTransactionAmount(largest.amount, largest) : formatMoney(0, baseSymbol),
        largest ? largest.details || largest.counterparty || largest.type : "No transactions"
      ),
    ].join("");

    const budgetStatus = getBudgetStatus(transactions);
    document.getElementById("timeline-chart").innerHTML = renderTimeline(transactions);
    document.getElementById("category-report").innerHTML = renderCategoryBreakdown(transactions);
    document.getElementById("account-report").innerHTML = renderAccountBreakdown(transactions);
    document.getElementById("report-budgets").innerHTML = budgetStatus.length
      ? budgetStatus.map(renderBudgetCard).join("")
      : renderEmpty("No active budgets in the selected range.");
    document.getElementById("project-report").innerHTML = renderProjectTable(transactions);
    document.getElementById("report-insights").innerHTML = renderInsights(transactions);
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

  function syncTransactionTypeFields() {
    const type = document.getElementById("transaction-type").value;
    const isTransfer = type === "transfer";
    document.getElementById("field-from-account").classList.toggle("hidden", !isTransfer);
    document.getElementById("field-to-account").classList.toggle("hidden", !isTransfer);
    document.getElementById("transaction-account").closest(".field-group").classList.toggle("hidden", isTransfer);
    document.getElementById("transaction-category").closest(".field-group").classList.toggle("hidden", isTransfer);
    document.getElementById("transaction-subcategory").closest(".field-group").classList.toggle("hidden", isTransfer);
  }

  function syncCategoryBudgetState() {
    const isIncome = document.getElementById("category-type").value === "income";
    document.getElementById("category-budget-limit").disabled = isIncome;
    document.getElementById("category-budget-period").disabled = isIncome;
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

  function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function openTransactionModal(transactionId, parserResult) {
    const form = document.getElementById("transaction-form");
    form.reset();
    document.getElementById("transaction-date").value = todayIso();
    document.getElementById("transaction-id").value = transactionId || "";
    document.getElementById("transaction-modal-title").textContent = transactionId ? "Edit Transaction" : "Add Transaction";
    document.getElementById("transaction-parser-notice").classList.add("hidden");
    renderSelectOptions();
    if (transactionId) {
      const transaction = getTransaction(transactionId);
      if (!transaction) {
        return;
      }
      applyTransactionToForm(transaction);
    }
    if (parserResult) {
      applyTransactionToForm(parserResult.transaction);
      if (parserResult.missing.length) {
        const notice = document.getElementById("transaction-parser-notice");
        notice.textContent = `Captured from dictation. Please confirm: ${parserResult.missing.join(", ")}.`;
        notice.classList.remove("hidden");
      }
    }
    syncTransactionTypeFields();
    openModal("transaction-modal");
  }

  function openAccountModal(accountId) {
    const form = document.getElementById("account-form");
    form.reset();
    document.getElementById("account-id").value = accountId || "";
    document.getElementById("account-modal-title").textContent = accountId ? "Edit Account" : "Add Account";
    document.getElementById("account-color").value = "#19c6a7";
    document.getElementById("account-currency-symbol").value = "$";
    if (accountId) {
      const account = getAccount(accountId);
      if (!account) {
        return;
      }
      document.getElementById("account-name").value = account.name;
      document.getElementById("account-type").value = account.type;
      document.getElementById("account-currency-symbol").value = account.currencySymbol || "$";
      document.getElementById("account-opening-balance").value = account.openingBalance ?? 0;
      document.getElementById("account-color").value = account.color || "#19c6a7";
      document.getElementById("account-icon").value = account.icon || "wallet";
      document.getElementById("account-notes").value = account.notes || "";
    }
    openModal("account-modal");
  }

  function openCategoryModal(categoryId) {
    const form = document.getElementById("category-form");
    form.reset();
    document.getElementById("category-id").value = categoryId || "";
    document.getElementById("category-modal-title").textContent = categoryId ? "Edit Category" : "Add Category";
    document.getElementById("category-color").value = "#19c6a7";
    if (categoryId) {
      const category = getCategory(categoryId);
      if (!category) {
        return;
      }
      document.getElementById("category-name").value = category.name;
      document.getElementById("category-type").value = category.type;
      document.getElementById("category-icon").value = category.icon || "cart";
      document.getElementById("category-color").value = category.color || "#19c6a7";
      document.getElementById("category-subcategories").value = (category.subcategories || []).join(", ");
      document.getElementById("category-budget-limit").value = category.budgetLimit || "";
      document.getElementById("category-budget-period").value = category.budgetPeriod || "monthly";
    }
    syncCategoryBudgetState();
    openModal("category-modal");
  }

  function applyTransactionToForm(transaction) {
    document.getElementById("transaction-type").value = transaction.type || "expense";
    document.getElementById("transaction-amount").value = transaction.amount ?? "";
    document.getElementById("transaction-date").value = transaction.date || todayIso();
    document.getElementById("transaction-account").value = transaction.accountId || "";
    document.getElementById("transaction-from-account").value = transaction.fromAccountId || "";
    document.getElementById("transaction-to-account").value = transaction.toAccountId || "";
    document.getElementById("transaction-category").value = transaction.categoryId || "";
    renderSubcategoryOptions();
    document.getElementById("transaction-subcategory").value = transaction.subcategory || "";
    document.getElementById("transaction-counterparty").value = transaction.counterparty || "";
    document.getElementById("transaction-project").value = transaction.project || "";
    document.getElementById("transaction-tags").value = (transaction.tags || []).join(", ");
    document.getElementById("transaction-details").value = transaction.details || "";
  }

  function handleTransactionSubmit(event) {
    event.preventDefault();
    const type = document.getElementById("transaction-type").value;
    const amount = Number(document.getElementById("transaction-amount").value);
    const payload = {
      id: document.getElementById("transaction-id").value || uid("tx"),
      type,
      amount,
      date: document.getElementById("transaction-date").value,
      accountId: type === "transfer" ? "" : document.getElementById("transaction-account").value,
      fromAccountId: type === "transfer" ? document.getElementById("transaction-from-account").value : "",
      toAccountId: type === "transfer" ? document.getElementById("transaction-to-account").value : "",
      categoryId: type === "transfer" ? "" : document.getElementById("transaction-category").value,
      subcategory: type === "transfer" ? "" : document.getElementById("transaction-subcategory").value,
      counterparty: document.getElementById("transaction-counterparty").value.trim(),
      project: document.getElementById("transaction-project").value.trim(),
      tags: splitTags(document.getElementById("transaction-tags").value),
      details: document.getElementById("transaction-details").value.trim(),
      updatedAt: new Date().toISOString(),
    };

    if (!amount || amount <= 0) {
      showToast("Enter a valid amount.");
      return;
    }
    if (!payload.date) {
      showToast("Pick a transaction date.");
      return;
    }
    if (type === "transfer") {
      if (!payload.fromAccountId || !payload.toAccountId) {
        showToast("Transfers need both source and destination accounts.");
        return;
      }
      if (payload.fromAccountId === payload.toAccountId) {
        showToast("Transfer accounts must be different.");
        return;
      }
    } else if (!payload.accountId) {
      showToast("Choose an account for this transaction.");
      return;
    }

    const existingIndex = state.transactions.findIndex((tx) => tx.id === payload.id);
    if (existingIndex >= 0) {
      state.transactions[existingIndex] = {
        ...state.transactions[existingIndex],
        ...payload,
      };
      showToast("Transaction updated.");
    } else {
      state.transactions.push({
        ...payload,
        createdAt: new Date().toISOString(),
      });
      showToast("Transaction saved.");
    }
    persistAndRefresh();
    closeModal("transaction-modal");
  }

  function handleAccountSubmit(event) {
    event.preventDefault();
    const payload = {
      id: document.getElementById("account-id").value || uid("acc"),
      name: document.getElementById("account-name").value.trim(),
      type: document.getElementById("account-type").value,
      currencySymbol: document.getElementById("account-currency-symbol").value.trim() || "$",
      openingBalance: Number(document.getElementById("account-opening-balance").value || 0),
      color: document.getElementById("account-color").value,
      icon: document.getElementById("account-icon").value,
      notes: document.getElementById("account-notes").value.trim(),
    };
    if (!payload.name) {
      showToast("Account name is required.");
      return;
    }
    const existingIndex = state.accounts.findIndex((account) => account.id === payload.id);
    if (existingIndex >= 0) {
      state.accounts[existingIndex] = payload;
      showToast("Account updated.");
    } else {
      state.accounts.push(payload);
      showToast("Account created.");
    }
    persistAndRefresh();
    closeModal("account-modal");
  }

  function handleCategorySubmit(event) {
    event.preventDefault();
    const type = document.getElementById("category-type").value;
    const rawName = document.getElementById("category-name").value.trim();
    const categoryId = document.getElementById("category-id").value;
    const payload = {
      id: categoryId || slugify(rawName) || uid("cat"),
      name: rawName,
      type,
      icon: document.getElementById("category-icon").value,
      color: document.getElementById("category-color").value,
      subcategories: document
        .getElementById("category-subcategories")
        .value.split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      budgetLimit: type === "income" ? 0 : Number(document.getElementById("category-budget-limit").value || 0),
      budgetPeriod: document.getElementById("category-budget-period").value,
    };
    if (!payload.name) {
      showToast("Category name is required.");
      return;
    }
    const existingIndex = state.categories.findIndex((category) => category.id === categoryId);
    if (existingIndex >= 0) {
      state.categories[existingIndex] = payload;
      showToast("Category updated.");
    } else {
      state.categories.push(payload);
      showToast("Category created.");
    }
    persistAndRefresh();
    closeModal("category-modal");
  }

  async function handleImportSubmit(event) {
    event.preventDefault();
    const target = document.getElementById("import-target").value;
    const file = document.getElementById("import-file").files[0];
    if (!file) {
      showToast("Select a CSV file first.");
      return;
    }
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      showToast("The CSV file appears to be empty.");
      return;
    }
    if (target === "transactions") {
      importTransactions(rows);
    }
    if (target === "accounts") {
      importAccounts(rows);
    }
    if (target === "categories") {
      importCategories(rows);
    }
    persistAndRefresh();
    closeModal("import-modal");
    showToast(`Imported ${rows.length} ${target}.`);
  }

  function importTransactions(rows) {
    rows.forEach((row) => {
      const payload = {
        id: row.id || uid("tx"),
        type: row.type || "expense",
        amount: Number(row.amount || 0),
        date: normalizeDateInput(row.date) || todayIso(),
        accountId: findAccountId(row.accountId, row.accountName),
        fromAccountId: findAccountId(row.fromAccountId, row.fromAccountName),
        toAccountId: findAccountId(row.toAccountId, row.toAccountName),
        categoryId: findCategoryId(row.categoryId, row.categoryName),
        subcategory: row.subcategory || "",
        counterparty: row.payeeOrPayer || row.counterparty || "",
        project: row.project || "",
        tags: splitTags(row.tags || ""),
        details: row.details || "",
        createdAt: row.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      upsertById(state.transactions, payload);
    });
  }

  function importAccounts(rows) {
    rows.forEach((row) => {
      const payload = {
        id: row.id || uid("acc"),
        name: row.name || "Imported Account",
        type: row.type || "cash",
        currencySymbol: row.currencySymbol || "$",
        openingBalance: Number(row.openingBalance || 0),
        color: row.color || "#19c6a7",
        icon: row.icon || "wallet",
        notes: row.notes || "",
      };
      upsertById(state.accounts, payload);
    });
  }

  function importCategories(rows) {
    rows.forEach((row) => {
      const payload = {
        id: row.id || slugify(row.name || "") || uid("cat"),
        name: row.name || "Imported Category",
        type: row.type || "expense",
        icon: row.icon || "cart",
        color: row.color || "#19c6a7",
        subcategories: splitTags(row.subcategories || ""),
        budgetLimit: Number(row.budgetLimit || 0),
        budgetPeriod: row.budgetPeriod || "monthly",
      };
      upsertById(state.categories, payload);
    });
  }

  function upsertById(collection, payload) {
    const index = collection.findIndex((item) => item.id === payload.id);
    if (index >= 0) {
      collection[index] = { ...collection[index], ...payload };
    } else {
      collection.push(payload);
    }
  }

  function handleParseStatement() {
    const statement = document.getElementById("dictation-input").value.trim();
    if (!statement) {
      showToast("Type or dictate a statement first.");
      return;
    }
    const parserResult = parseStatement(statement);
    openTransactionModal(null, parserResult);
  }

  function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      document.getElementById("listen-button").disabled = true;
      document.getElementById("listen-button").textContent = "Voice Not Supported";
      document.getElementById("dictation-input").placeholder =
        "This browser does not support speech recognition. You can still type statements manually.";
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      document.getElementById("dictation-input").value = transcript.trim();
    };
    recognition.onstart = () => {
      uiState.isListening = true;
      refreshListeningUi();
    };
    recognition.onend = () => {
      uiState.isListening = false;
      refreshListeningUi();
    };
    recognition.onerror = () => {
      uiState.isListening = false;
      refreshListeningUi();
      showToast("Voice dictation ran into a browser permission issue.");
    };
    uiState.recognition = recognition;
    refreshListeningUi();
  }

  function toggleListening() {
    if (!uiState.recognition) {
      return;
    }
    if (uiState.isListening) {
      uiState.recognition.stop();
    } else {
      uiState.recognition.start();
    }
  }

  function refreshListeningUi() {
    document.getElementById("listen-button").textContent = uiState.isListening ? "Stop Listening" : "Start Listening";
    document.getElementById("dictation-status-icon").innerHTML = iconRegistry.microphone;
    document.getElementById("dictation-status-icon").style.background = uiState.isListening
      ? "linear-gradient(135deg, rgba(239,100,97,0.16), rgba(255,184,77,0.16))"
      : "linear-gradient(135deg, rgba(18,200,164,0.16), rgba(0,166,199,0.16))";
    document.getElementById("dictation-status-icon").style.color = uiState.isListening ? "#ef6461" : "#12c8a4";
  }

  function parseStatement(statement) {
    const normalized = statement.toLowerCase();
    const transaction = {
      id: "",
      type: detectTransactionType(normalized),
      amount: extractAmount(normalized),
      date: extractDate(normalized) || todayIso(),
      accountId: "",
      fromAccountId: "",
      toAccountId: "",
      categoryId: "",
      subcategory: "",
      counterparty: extractCounterparty(normalized),
      project: extractProject(normalized),
      tags: extractTags(statement),
      details: statement,
    };

    const accountHints = extractAccounts(normalized);
    if (transaction.type === "transfer") {
      transaction.fromAccountId = accountHints.from || "";
      transaction.toAccountId = accountHints.to || "";
    } else {
      transaction.accountId = accountHints.primary || accountHints.from || accountHints.to || "";
    }

    const category = detectCategory(normalized, transaction.type);
    if (category) {
      transaction.categoryId = category.id;
      transaction.subcategory = detectSubcategory(normalized, category) || "";
    }

    const missing = [];
    if (!transaction.amount) {
      missing.push("amount");
    }
    if (transaction.type === "transfer") {
      if (!transaction.fromAccountId) {
        missing.push("source account");
      }
      if (!transaction.toAccountId) {
        missing.push("destination account");
      }
    } else {
      if (!transaction.accountId) {
        missing.push("account");
      }
      if (!transaction.categoryId && transaction.type !== "income") {
        missing.push("category");
      }
    }

    return { transaction, missing };
  }

  function detectTransactionType(text) {
    if (/(transfer|moved?|sent|shifted)/.test(text)) {
      return "transfer";
    }
    if (/(received|income|earned|salary|sold|bonus|got paid|deposit)/.test(text)) {
      return "income";
    }
    return "expense";
  }

  function extractAmount(text) {
    const match = text.match(/(?:\$|usd\s*)?(\d+(?:\.\d{1,2})?)/);
    return match ? Number(match[1]) : 0;
  }

  function extractDate(text) {
    if (text.includes("today")) {
      return todayIso();
    }
    if (text.includes("yesterday")) {
      return shiftIsoDate(todayIso(), -1);
    }
    if (text.includes("tomorrow")) {
      return shiftIsoDate(todayIso(), 1);
    }
    const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoMatch) {
      return isoMatch[1];
    }
    const usMatch = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    if (usMatch) {
      return normalizeDateInput(usMatch[1]);
    }
    return "";
  }

  function extractCounterparty(text) {
    const expenseMatch = text.match(/\b(?:at|to)\s+([a-z0-9&.' -]+?)(?=\s+(?:from|on|for|category|project|tag|tags)\b|$)/i);
    const incomeMatch = text.match(/\bfrom\s+([a-z0-9&.' -]+?)(?=\s+(?:into|on|project|tag|tags)\b|$)/i);
    const match = incomeMatch || expenseMatch;
    return match ? titleCase(match[1].trim()) : "";
  }

  function extractProject(text) {
    const match = text.match(/\bproject\s+([a-z0-9&.' -]+?)(?=\s+(?:tag|tags|from|to|on|into)\b|$)/i);
    return match ? titleCase(match[1].trim()) : "";
  }

  function extractTags(statement) {
    const explicit = [];
    const lower = statement.toLowerCase();
    const tagPhraseMatch = lower.match(/\btags?\s+([a-z0-9,\s-]+)/);
    if (tagPhraseMatch) {
      explicit.push(...splitTags(tagPhraseMatch[1]));
    }
    const hashTags = statement.match(/#([a-zA-Z0-9_-]+)/g) || [];
    hashTags.forEach((item) => explicit.push(item.replace("#", "").toLowerCase()));
    return [...new Set(explicit)];
  }

  function extractAccounts(text) {
    const loweredAccounts = state.accounts.map((account) => ({
      id: account.id,
      name: account.name.toLowerCase(),
    }));
    const matches = { primary: "", from: "", to: "" };
    loweredAccounts.forEach((account) => {
      if (!matches.primary && text.includes(account.name)) {
        matches.primary = account.id;
      }
      if (!matches.from && new RegExp(`\\b(?:from|via|using)\\s+${escapeRegExp(account.name)}\\b`, "i").test(text)) {
        matches.from = account.id;
      }
      if (!matches.to && new RegExp(`\\b(?:to|into|in)\\s+${escapeRegExp(account.name)}\\b`, "i").test(text)) {
        matches.to = account.id;
      }
    });
    return matches;
  }

  function detectCategory(text, type) {
    if (type === "transfer") {
      return null;
    }
    const exact = state.categories.find((category) => text.includes(category.name.toLowerCase()) && category.type === type);
    if (exact) {
      return exact;
    }
    for (const [categoryId, keywords] of Object.entries(categoryKeywordMap)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        const category = getCategory(categoryId);
        if (category && category.type === type) {
          return category;
        }
      }
    }
    return state.categories.find((category) => category.type === type) || null;
  }

  function detectSubcategory(text, category) {
    return (category.subcategories || []).find((subcategory) => text.includes(subcategory.toLowerCase())) || "";
  }

  function getFilteredTransactions() {
    return [...state.transactions]
      .filter(matchesTransactionFilters)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function matchesTransactionFilters(transaction) {
    const accountNames = [getAccount(transaction.accountId)?.name, getAccount(transaction.fromAccountId)?.name, getAccount(transaction.toAccountId)?.name]
      .filter(Boolean)
      .join(" ");
    const categoryName = getCategory(transaction.categoryId)?.name || "";
    const haystack = [
      transaction.details,
      transaction.counterparty,
      transaction.project,
      transaction.subcategory,
      accountNames,
      categoryName,
      ...(transaction.tags || []),
      transaction.type,
      transaction.date,
    ]
      .join(" ")
      .toLowerCase();

    if (uiState.filters.search && !haystack.includes(uiState.filters.search.toLowerCase())) {
      return false;
    }
    if (uiState.filters.type !== "all" && transaction.type !== uiState.filters.type) {
      return false;
    }
    if (
      uiState.filters.account !== "all" &&
      ![transaction.accountId, transaction.fromAccountId, transaction.toAccountId].includes(uiState.filters.account)
    ) {
      return false;
    }
    if (uiState.filters.category !== "all" && transaction.categoryId !== uiState.filters.category) {
      return false;
    }
    if (
      uiState.filters.tag &&
      !(transaction.tags || []).some((tag) => tag.toLowerCase().includes(uiState.filters.tag.toLowerCase()))
    ) {
      return false;
    }
    if (uiState.filters.startDate && transaction.date < uiState.filters.startDate) {
      return false;
    }
    if (uiState.filters.endDate && transaction.date > uiState.filters.endDate) {
      return false;
    }
    return true;
  }

  function getReportTransactions() {
    const { start, end } = getDateRange(uiState.reports.range);
    return state.transactions.filter((transaction) => {
      if (uiState.reports.type !== "all" && transaction.type !== uiState.reports.type) {
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

  function getGlobalMetrics() {
    const balance = state.accounts.reduce((sum, account) => sum + getAccountBalance(account.id), 0);
    const monthTransactions = getTransactionsForPreset("thisMonth");
    const weekTransactions = getTransactionsForPreset("thisWeek");
    const dayTransactions = getTransactionsForPreset("today");
    return {
      balance,
      monthIncome: sumAmounts(monthTransactions.filter((transaction) => transaction.type === "income")),
      monthExpense: sumAmounts(monthTransactions.filter((transaction) => transaction.type === "expense")),
      weekIncome: sumAmounts(weekTransactions.filter((transaction) => transaction.type === "income")),
      weekExpense: sumAmounts(weekTransactions.filter((transaction) => transaction.type === "expense")),
      dayIncome: sumAmounts(dayTransactions.filter((transaction) => transaction.type === "income")),
      dayExpense: sumAmounts(dayTransactions.filter((transaction) => transaction.type === "expense")),
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
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }

  function getAccountBalance(accountId) {
    const account = getAccount(accountId);
    if (!account) {
      return 0;
    }
    let balance = Number(account.openingBalance || 0);
    state.transactions.forEach((transaction) => {
      if (transaction.type === "expense" && transaction.accountId === accountId) {
        balance -= Number(transaction.amount || 0);
      }
      if (transaction.type === "income" && transaction.accountId === accountId) {
        balance += Number(transaction.amount || 0);
      }
      if (transaction.type === "transfer") {
        if (transaction.fromAccountId === accountId) {
          balance -= Number(transaction.amount || 0);
        }
        if (transaction.toAccountId === accountId) {
          balance += Number(transaction.amount || 0);
        }
      }
    });
    return balance;
  }

  function getAccountFlow(accountId) {
    let incoming = 0;
    let outgoing = 0;
    state.transactions.forEach((transaction) => {
      const amount = Number(transaction.amount || 0);
      if (transaction.type === "income" && transaction.accountId === accountId) {
        incoming += amount;
      }
      if (transaction.type === "expense" && transaction.accountId === accountId) {
        outgoing += amount;
      }
      if (transaction.type === "transfer" && transaction.toAccountId === accountId) {
        incoming += amount;
      }
      if (transaction.type === "transfer" && transaction.fromAccountId === accountId) {
        outgoing += amount;
      }
    });
    return { incoming, outgoing };
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
    return rows
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
      .join("");
  }

  function renderCategoryBreakdown(transactions) {
    const map = new Map();
    transactions
      .filter((transaction) => transaction.type === "expense")
      .forEach((transaction) => {
        const category = getCategory(transaction.categoryId);
        const key = category ? category.name : "Uncategorized";
        map.set(key, (map.get(key) || 0) + Number(transaction.amount || 0));
      });
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!rows.length) {
      return renderEmpty("No expense data for this report selection.");
    }
    const max = Math.max(...rows.map((row) => row[1]), 1);
    return rows.map(([label, value]) => renderBarItem(label, value, max)).join("");
  }

  function renderAccountBreakdown(transactions) {
    const map = new Map();
    transactions.forEach((transaction) => {
      if (transaction.type === "transfer") {
        const from = getAccount(transaction.fromAccountId)?.name || "Unknown";
        const to = getAccount(transaction.toAccountId)?.name || "Unknown";
        map.set(`${from} → ${to}`, (map.get(`${from} → ${to}`) || 0) + Number(transaction.amount || 0));
        return;
      }
      const label = getAccount(transaction.accountId)?.name || "Unknown Account";
      map.set(label, (map.get(label) || 0) + Number(transaction.amount || 0));
    });
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!rows.length) {
      return renderEmpty("No account activity available for the selected filters.");
    }
    const max = Math.max(...rows.map((row) => row[1]), 1);
    return rows.map(([label, value]) => renderBarItem(label, value, max)).join("");
  }

  function renderProjectTable(transactions) {
    const map = new Map();
    transactions.forEach((transaction) => {
      (transaction.tags || []).forEach((tag) => {
        map.set(`#${tag}`, (map.get(`#${tag}`) || 0) + Number(transaction.amount || 0));
      });
      if (transaction.project) {
        map.set(transaction.project, (map.get(transaction.project) || 0) + Number(transaction.amount || 0));
      }
    });
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!rows.length) {
      return renderEmpty("Use tags and projects to unlock deeper reporting.");
    }
    return rows
      .map(
        ([label, value]) => `
          <div class="mini-row">
            <strong>${escapeHtml(label)}</strong>
            <span>${formatCurrency(value)}</span>
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

  function exportTransactionsCsv() {
    const rows = state.transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      date: transaction.date,
      accountId: transaction.accountId || "",
      accountName: getAccount(transaction.accountId)?.name || "",
      fromAccountId: transaction.fromAccountId || "",
      fromAccountName: getAccount(transaction.fromAccountId)?.name || "",
      toAccountId: transaction.toAccountId || "",
      toAccountName: getAccount(transaction.toAccountId)?.name || "",
      categoryId: transaction.categoryId || "",
      categoryName: getCategory(transaction.categoryId)?.name || "",
      subcategory: transaction.subcategory || "",
      tags: (transaction.tags || []).join(", "),
      payeeOrPayer: transaction.counterparty || "",
      project: transaction.project || "",
      details: transaction.details || "",
      createdAt: transaction.createdAt || "",
      updatedAt: transaction.updatedAt || "",
    }));
    downloadCsv("transactions.csv", rows);
  }

  function exportAccountsCsv() {
    const rows = state.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currencySymbol: account.currencySymbol || "$",
      openingBalance: account.openingBalance || 0,
      icon: account.icon || "wallet",
      color: account.color || "#19c6a7",
      notes: account.notes || "",
    }));
    downloadCsv("accounts.csv", rows);
  }

  function exportCategoriesCsv() {
    const rows = state.categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      icon: category.icon || "cart",
      color: category.color || "#19c6a7",
      subcategories: (category.subcategories || []).join(", "),
      budgetPeriod: category.budgetPeriod || "monthly",
      budgetLimit: category.budgetLimit || 0,
    }));
    downloadCsv("categories.csv", rows);
  }

  function downloadCsv(filename, rows) {
    if (!rows.length) {
      showToast("There is no data to export yet.");
      return;
    }
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`${filename} downloaded.`);
  }

  function clearFilters() {
    uiState.filters = {
      search: "",
      type: "all",
      account: "all",
      category: "all",
      tag: "",
      startDate: "",
      endDate: "",
    };
    document.getElementById("search-input").value = "";
    document.getElementById("filter-type").value = "all";
    document.getElementById("filter-account").value = "all";
    document.getElementById("filter-category").value = "all";
    document.getElementById("filter-tag").value = "";
    document.getElementById("filter-start-date").value = "";
    document.getElementById("filter-end-date").value = "";
    renderTransactions();
  }

  function renderGlobalSearchResults() {
    const panel = document.getElementById("global-search-results");
    const query = uiState.globalSearch.trim().toLowerCase();
    if (!query) {
      hideGlobalSearchResults();
      return;
    }

    const results = getGlobalSearchResults(query);
    panel.innerHTML = results.length
      ? results
          .map(
            (result) => `
              <button class="global-search-item" type="button" data-action="open-search-result" data-kind="${escapeHtml(
                result.kind
              )}" data-id="${escapeHtml(result.id || "")}" data-query="${escapeHtml(result.query || "")}">
                <span class="global-search-item-icon">${result.icon}</span>
                <span class="global-search-item-copy">
                  <strong>${escapeHtml(result.label)}</strong>
                  <span>${escapeHtml(result.meta)}</span>
                </span>
              </button>
            `
          )
          .join("")
      : `<div class="empty-state compact-empty">No matches for "${escapeHtml(uiState.globalSearch.trim())}".</div>`;
    panel.classList.remove("hidden");
  }

  function hideGlobalSearchResults() {
    document.getElementById("global-search-results").classList.add("hidden");
  }

  function getGlobalSearchResults(query) {
    const results = [];
    state.transactions.forEach((transaction) => {
      const categoryName = getCategory(transaction.categoryId)?.name || transaction.type;
      const accountName = transaction.type === "transfer"
        ? `${getAccount(transaction.fromAccountId)?.name || "Unknown"} -> ${getAccount(transaction.toAccountId)?.name || "Unknown"}`
        : getAccount(transaction.accountId)?.name || "Unknown Account";
      const haystack = [
        transaction.counterparty,
        transaction.project,
        transaction.details,
        categoryName,
        accountName,
        ...(transaction.tags || []),
        transaction.date,
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          kind: "transaction",
          id: transaction.id,
          icon: transaction.type === "income" ? iconRegistry["arrow-up"] : transaction.type === "expense" ? iconRegistry["arrow-down"] : iconRegistry.swap,
          label: transaction.counterparty || categoryName,
          meta: `${transaction.date} • ${accountName} • ${formatTransactionAmount(transaction.amount, transaction)}`,
        });
      }
    });

    state.accounts.forEach((account) => {
      if (`${account.name} ${account.type} ${account.notes || ""}`.toLowerCase().includes(query)) {
        results.push({
          kind: "account",
          id: account.id,
          icon: iconRegistry[account.icon] || iconRegistry.wallet,
          label: account.name,
          meta: `${titleCase(account.type)} • ${formatMoney(getAccountBalance(account.id), account.currencySymbol || "$")}`,
        });
      }
    });

    state.categories.forEach((category) => {
      const haystack = `${category.name} ${category.type} ${(category.subcategories || []).join(" ")}`.toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          kind: "category",
          id: category.id,
          icon: iconRegistry[category.icon] || iconRegistry.cart,
          label: category.name,
          meta: `${titleCase(category.type)} • ${category.budgetLimit ? formatCurrency(category.budgetLimit) : "No budget limit"}`,
        });
      }
    });

    results.push({
      kind: "query",
      id: "",
      query,
      icon: iconRegistry.search,
      label: `Search transactions for "${uiState.globalSearch.trim()}"`,
      meta: "Open the Transactions tab with this query applied",
    });

    return results.slice(0, 8);
  }

  function openGlobalSearchResult(kind, id, query) {
    hideGlobalSearchResults();
    if (kind === "transaction") {
      switchScreen("transactions");
      openTransactionModal(id);
      return;
    }
    if (kind === "account") {
      switchScreen("accounts");
      openAccountModal(id);
      return;
    }
    if (kind === "category") {
      switchScreen("more");
      openCategoryModal(id);
      return;
    }
    if (kind === "query") {
      applyGlobalQueryToTransactions(query);
    }
  }

  function applyGlobalQueryToTransactions(query) {
    uiState.filters.search = query;
    document.getElementById("search-input").value = query;
    switchScreen("transactions");
    renderTransactions();
    hideGlobalSearchResults();
  }

  function applyDateFilter(date) {
    uiState.filters.startDate = date;
    uiState.filters.endDate = date;
    document.getElementById("filter-start-date").value = date;
    document.getElementById("filter-end-date").value = date;
    switchScreen("transactions");
    renderTransactions();
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
    if (uiState.authProvider === "supabase" && uiState.isAuthenticated) {
      void syncStateToSupabase(false);
    }
  }

  function renderAccountCard(account, manageMode) {
    const balance = getAccountBalance(account.id);
    const flow = getAccountFlow(account.id);
    const accountSymbol = account.currencySymbol || "$";
    return `
      <article class="account-card" style="--card-color:${escapeHtml(account.color || "#19c6a7")}">
        <div class="flash-card-top">
          <div class="card-icon">${iconRegistry[account.icon] || iconRegistry.wallet}</div>
          <span class="meta-pill neutral">${escapeHtml(accountSymbol)} • ${escapeHtml(titleCase(account.type))}</span>
        </div>
        <h3>${escapeHtml(account.name)}</h3>
        <strong class="money account-balance">${formatMoney(balance, accountSymbol)}</strong>
        <div class="transaction-tags compact-tags">
          <span class="meta-pill neutral meta-pill-icon icon-income">${iconRegistry["arrow-up"]}<span>${formatMoney(flow.incoming, accountSymbol)}</span></span>
          <span class="meta-pill neutral meta-pill-icon icon-expense">${iconRegistry["arrow-down"]}<span>${formatMoney(flow.outgoing, accountSymbol)}</span></span>
        </div>
        ${
          manageMode
            ? `<div class="card-actions compact-actions">
                <button class="ghost-button" type="button" data-action="edit-account" data-id="${escapeHtml(account.id)}">Edit</button>
                <button class="secondary-button" type="button" data-action="delete-account" data-id="${escapeHtml(account.id)}">Delete</button>
              </div>`
            : ""
        }
      </article>
    `;
  }

  function renderBudgetCard(item) {
    const baseSymbol = getPrimaryCurrencySymbol();
    const periodIcon = item.category.budgetPeriod === "weekly" ? iconRegistry.week : iconRegistry.month;
    return `
      <article class="budget-item">
        <div class="budget-top">
          <div>
            <strong>${escapeHtml(item.category.name)}</strong>
            <p>${escapeHtml(titleCase(item.category.budgetPeriod))} budget</p>
          </div>
          <div class="transaction-tags compact-tags">
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
              <p class="transaction-meta">${escapeHtml(primaryAccount)} • ${escapeHtml(transaction.date)}</p>
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

  function renderCategoryItem(category) {
    const usage = getBudgetStatus().find((item) => item.category.id === category.id);
    const baseSymbol = getPrimaryCurrencySymbol();
    return `
      <article class="category-item" style="--card-color:${escapeHtml(category.color || "#19c6a7")}">
        <div class="category-main">
          <div class="category-copy">
            <div class="flash-card-top">
              <div class="category-icon">${iconRegistry[category.icon] || iconRegistry.cart}</div>
              <span class="meta-pill neutral">${escapeHtml(titleCase(category.type))}</span>
            </div>
            <h3>${escapeHtml(category.name)}</h3>
            <div class="category-subs">
              ${(category.subcategories || []).slice(0, 2).map((item) => `<span class="meta-pill neutral">${escapeHtml(item)}</span>`).join("")}
            </div>
          </div>
          <div class="item-actions compact-actions">
            ${
              category.type === "expense" && Number(category.budgetLimit) > 0
                ? `<span class="meta-pill meta-pill-icon">${category.budgetPeriod === "weekly" ? iconRegistry.week : iconRegistry.month}<span>${formatMoney(category.budgetLimit, baseSymbol)}</span></span>`
                : `<span class="meta-pill neutral">No budget limit</span>`
            }
            ${usage ? `<span class="meta-pill neutral meta-pill-icon icon-expense">${iconRegistry["arrow-down"]}<span>${formatMoney(usage.spent, baseSymbol)}</span></span>` : ""}
            <button class="ghost-button" type="button" data-action="edit-category" data-id="${escapeHtml(category.id)}">Edit</button>
            <button class="secondary-button" type="button" data-action="delete-category" data-id="${escapeHtml(category.id)}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }

  function getGlobalSearchResults(query) {
    const results = [];
    state.transactions.forEach((transaction) => {
      const categoryName = getCategory(transaction.categoryId)?.name || transaction.type;
      const accountName =
        transaction.type === "transfer"
          ? `${getAccount(transaction.fromAccountId)?.name || "Unknown"} -> ${getAccount(transaction.toAccountId)?.name || "Unknown"}`
          : getAccount(transaction.accountId)?.name || "Unknown Account";
      const haystack = [
        transaction.counterparty,
        transaction.project,
        transaction.details,
        categoryName,
        accountName,
        ...(transaction.tags || []),
        transaction.date,
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          kind: "transaction",
          id: transaction.id,
          icon:
            transaction.type === "income" ? iconRegistry["arrow-up"] : transaction.type === "expense" ? iconRegistry["arrow-down"] : iconRegistry.swap,
          label: transaction.counterparty || categoryName,
          meta: `${transaction.date} | ${accountName} | ${formatTransactionAmount(transaction.amount, transaction)}`,
        });
      }
    });

    state.accounts.forEach((account) => {
      if (`${account.name} ${account.type} ${account.notes || ""}`.toLowerCase().includes(query)) {
        results.push({
          kind: "account",
          id: account.id,
          icon: iconRegistry[account.icon] || iconRegistry.wallet,
          label: account.name,
          meta: `${titleCase(account.type)} | ${formatMoney(getAccountBalance(account.id), account.currencySymbol || "$")}`,
        });
      }
    });

    state.categories.forEach((category) => {
      const haystack = `${category.name} ${category.type} ${(category.subcategories || []).join(" ")}`.toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          kind: "category",
          id: category.id,
          icon: iconRegistry[category.icon] || iconRegistry.cart,
          label: category.name,
          meta: `${titleCase(category.type)} | ${category.budgetLimit ? formatCurrency(category.budgetLimit) : "No budget limit"}`,
        });
      }
    });

    results.push({
      kind: "query",
      id: "",
      query,
      icon: iconRegistry.search,
      label: `Search transactions for "${uiState.globalSearch.trim()}"`,
      meta: "Open the Transactions tab with this query applied",
    });

    return results.slice(0, 8);
  }

  function renderAccountCard(account, manageMode) {
    const balance = getAccountBalance(account.id);
    const flow = getAccountFlow(account.id);
    const accountSymbol = account.currencySymbol || "$";
    return `
      <article class="account-card" style="--card-color:${escapeHtml(account.color || "#19c6a7")}">
        <div class="flash-card-top">
          <div class="card-icon">${iconRegistry[account.icon] || iconRegistry.wallet}</div>
          <span class="meta-pill neutral">${escapeHtml(accountSymbol)} • ${escapeHtml(titleCase(account.type))}</span>
        </div>
        <h3>${escapeHtml(account.name)}</h3>
        <strong class="money account-balance">${formatMoney(balance, accountSymbol)}</strong>
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

  function renderCategoryItem(category) {
    const usage = getBudgetStatus().find((item) => item.category.id === category.id);
    const baseSymbol = getPrimaryCurrencySymbol();
    return `
      <article class="category-item" style="--card-color:${escapeHtml(category.color || "#19c6a7")}">
        <div class="category-main">
          <div class="category-copy">
            <div class="flash-card-top">
              <div class="category-icon">${iconRegistry[category.icon] || iconRegistry.cart}</div>
              <span class="meta-pill neutral">${escapeHtml(titleCase(category.type))}</span>
            </div>
            <h3>${escapeHtml(category.name)}</h3>
            <div class="category-subs">
              ${(category.subcategories || []).slice(0, 2).map((item) => `<span class="meta-pill neutral">${escapeHtml(item)}</span>`).join("")}
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

  function metricCard(label, value, note) {
    return `
      <article class="metric-card">
        <p class="eyebrow">${escapeHtml(label)}</p>
        <strong class="money">${escapeHtml(value)}</strong>
        <p>${escapeHtml(note)}</p>
      </article>
    `;
  }

  function renderBarItem(label, value, max) {
    const baseSymbol = getPrimaryCurrencySymbol();
    return `
      <div class="bar-item">
        <div class="bar-meta">
          <strong>${escapeHtml(label)}</strong>
          <span>${formatMoney(value, baseSymbol)}</span>
        </div>
        <div class="bar-fill"><span style="width:${(value / max) * 100}%"></span></div>
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

  function toCsv(rows) {
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    return lines.join("\n");
  }

  function parseCsv(text) {
    const rows = [];
    let current = "";
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(current);
        current = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          i += 1;
        }
        row.push(current);
        if (row.some((cell) => cell !== "")) {
          rows.push(row);
        }
        row = [];
        current = "";
      } else {
        current += char;
      }
    }
    if (current || row.length) {
      row.push(current);
      rows.push(row);
    }
    if (!rows.length) {
      return [];
    }
    const headers = rows[0].map((cell) => cell.trim());
    return rows.slice(1).map((cells) => {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = (cells[index] || "").trim();
      });
      return entry;
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

  function findAccountId(id, name) {
    if (id && getAccount(id)) {
      return id;
    }
    if (name) {
      const match = state.accounts.find((account) => account.name.toLowerCase() === name.toLowerCase());
      return match ? match.id : "";
    }
    return "";
  }

  function findCategoryId(id, name) {
    if (id && getCategory(id)) {
      return id;
    }
    if (name) {
      const match = state.categories.find((category) => category.name.toLowerCase() === name.toLowerCase());
      return match ? match.id : "";
    }
    return "";
  }

  function sumAmounts(transactions) {
    return transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  }

  function formatCurrency(value) {
    return formatMoney(value, getPrimaryCurrencySymbol());
  }

  function formatCompactMoney(value, symbol) {
    const amount = Number(value || 0);
    const formatted = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: amount >= 1000 ? 1 : 2,
    }).format(Math.abs(amount));
    return `${amount < 0 ? "-" : ""}${symbol || "$"} ${formatted}`;
  }

  function formatCompactPlainAmount(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: amount >= 1000 ? 1 : 2,
    }).format(Math.abs(amount));
  }

  function formatMoney(value, symbol) {
    const amount = Number(value || 0);
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
    return `${amount < 0 ? "-" : ""}${symbol || "$"} ${formatted}`;
  }

  function formatTransactionAmount(value, transaction) {
    return formatMoney(value, getTransactionCurrencySymbol(transaction));
  }

  function getPrimaryCurrencySymbol() {
    return state.accounts[0]?.currencySymbol || "$";
  }

  function getTransactionCurrencySymbol(transaction) {
    if (transaction.type === "transfer") {
      return getAccount(transaction.fromAccountId)?.currencySymbol || getAccount(transaction.toAccountId)?.currencySymbol || getPrimaryCurrencySymbol();
    }
    return getAccount(transaction.accountId)?.currencySymbol || getPrimaryCurrencySymbol();
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function shiftIsoDate(isoDate, amount) {
    const date = new Date(`${isoDate}T00:00:00`);
    date.setDate(date.getDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function normalizeDateInput(value) {
    if (!value) {
      return "";
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const [month, day, year] = value.split("/");
    if (!month || !day || !year) {
      return "";
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function splitTags(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean);
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .replace(/\s+/g, " ")
      .trim();
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function svgIcon(path) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"></path></svg>`;
  }
})();
