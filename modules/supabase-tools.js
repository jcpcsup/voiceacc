export function createSupabaseTools(api) {
  const {
    constants,
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
  } = api;

  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_ACCOUNTS_TABLE,
    SUPABASE_CATEGORIES_TABLE,
    SUPABASE_TRANSACTIONS_TABLE,
    SUPABASE_LEGACY_STATE_TABLE,
    SUPABASE_CONFIGURED,
    SUPABASE_AVAILABLE,
  } = constants;

  async function initializeSupabase() {
    if (!SUPABASE_AVAILABLE) {
      renderCloudStatus();
      initializeLockScreen();
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

    try {
      const remoteState = await loadNormalizedStateFromSupabase(cloudState.session.user.id);
      const hasRemoteRows =
        remoteState.accounts.length || remoteState.categories.length || remoteState.transactions.length;

      if (hasRemoteRows) {
        replaceState(remoteState);
        persistState();
        renderAll();
        cloudState.lastSyncedAt = getLatestCloudTimestamp(remoteState) || "";
        uiState.syncStatus = `Cloud data loaded${cloudState.lastSyncedAt ? ` on ${formatShortDateTime(cloudState.lastSyncedAt)}` : "."}`;
        renderCloudStatus();
        if (!quiet) {
          showToast("Supabase data loaded.");
        }
        return;
      }

      const legacyState = await loadLegacySnapshotState(cloudState.session.user.id);
      if (legacyState) {
        replaceState(legacyState);
        persistState();
        renderAll();
        await syncStateToSupabase(!quiet, "Migrated your legacy cloud data.");
        return;
      }

      await syncStateToSupabase(!quiet, "Created your first Supabase backup.");
    } catch (error) {
      console.error(error);
      const cachedState = loadLocalState(getUserCacheKey(cloudState.session.user.id));
      replaceState(cachedState);
      renderAll();
      uiState.syncStatus = error.message || "Unable to load Supabase data.";
      renderCloudStatus();
      initializeLockScreen();
    }
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
      const syncedAt = new Date().toISOString();
      const userId = cloudState.session.user.id;
      await syncSupabaseTable(
        SUPABASE_ACCOUNTS_TABLE,
        state.accounts.map((account) => serializeAccountForSupabase(account, userId, syncedAt))
      );
      await syncSupabaseTable(
        SUPABASE_CATEGORIES_TABLE,
        state.categories.map((category) => serializeCategoryForSupabase(category, userId, syncedAt))
      );
      await syncSupabaseTable(
        SUPABASE_TRANSACTIONS_TABLE,
        state.transactions.map((transaction) => serializeTransactionForSupabase(transaction, userId, syncedAt))
      );

      cloudState.lastSyncedAt = syncedAt;
      uiState.syncStatus = `Synced ${formatShortDateTime(syncedAt)}`;
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

  async function loadNormalizedStateFromSupabase(userId) {
    const [accountsResult, categoriesResult, transactionsResult] = await Promise.all([
      cloudState.client
        .from(SUPABASE_ACCOUNTS_TABLE)
        .select("*")
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      cloudState.client
        .from(SUPABASE_CATEGORIES_TABLE)
        .select("*")
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      cloudState.client
        .from(SUPABASE_TRANSACTIONS_TABLE)
        .select("*")
        .eq("user_id", userId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    const firstError = [accountsResult.error, categoriesResult.error, transactionsResult.error].find(Boolean);
    if (firstError) {
      throw firstError;
    }

    return normalizeState({
      accounts: (accountsResult.data || []).map(deserializeSupabaseAccount),
      categories: (categoriesResult.data || []).map(deserializeSupabaseCategory),
      transactions: (transactionsResult.data || []).map(deserializeSupabaseTransaction),
    });
  }

  async function loadLegacySnapshotState(userId) {
    const { data, error } = await cloudState.client
      .from(SUPABASE_LEGACY_STATE_TABLE)
      .select("payload")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (String(error.code || "") === "PGRST205" || String(error.message || "").toLowerCase().includes("could not find")) {
        return null;
      }
      throw error;
    }

    return data?.payload ? normalizeState(data.payload) : null;
  }

  async function syncSupabaseTable(tableName, rows) {
    const userId = cloudState.session.user.id;
    const { data: existingRows, error: existingError } = await cloudState.client
      .from(tableName)
      .select("id")
      .eq("user_id", userId);

    if (existingError) {
      throw existingError;
    }

    if (rows.length) {
      const { error: upsertError } = await cloudState.client.from(tableName).upsert(rows, {
        onConflict: "user_id,id",
      });
      if (upsertError) {
        throw upsertError;
      }
    }

    const localIds = new Set(rows.map((row) => row.id));
    const staleIds = (existingRows || []).map((row) => row.id).filter((id) => !localIds.has(id));

    if (staleIds.length) {
      const { error: deleteError } = await cloudState.client.from(tableName).delete().eq("user_id", userId).in("id", staleIds);
      if (deleteError) {
        throw deleteError;
      }
    }
  }

  function serializeAccountForSupabase(account, userId, syncedAt) {
    return {
      user_id: userId,
      id: account.id,
      name: account.name,
      type: account.type,
      currency_symbol: account.currencySymbol || "$",
      opening_balance: Number(account.openingBalance || 0),
      color: account.color || "#19c6a7",
      icon: account.icon || "wallet",
      notes: account.notes || "",
      updated_at: syncedAt,
    };
  }

  function serializeCategoryForSupabase(category, userId, syncedAt) {
    return {
      user_id: userId,
      id: category.id,
      name: category.name,
      type: category.type,
      icon: category.icon || "cart",
      color: category.color || "#19c6a7",
      subcategories: Array.isArray(category.subcategories) ? category.subcategories : [],
      budget_limit: Number(category.budgetLimit || 0),
      budget_period: category.budgetPeriod || "monthly",
      updated_at: syncedAt,
    };
  }

  function serializeTransactionForSupabase(transaction, userId, syncedAt) {
    return {
      user_id: userId,
      id: transaction.id,
      type: transaction.type,
      amount: Number(transaction.amount || 0),
      transaction_date: transaction.date || todayIso(),
      account_id: transaction.accountId || null,
      from_account_id: transaction.fromAccountId || null,
      to_account_id: transaction.toAccountId || null,
      category_id: transaction.categoryId || null,
      subcategory: transaction.subcategory || "",
      counterparty: transaction.counterparty || "",
      project: transaction.project || "",
      tags: Array.isArray(transaction.tags) ? transaction.tags : [],
      details: transaction.details || "",
      created_at: transaction.createdAt || syncedAt,
      updated_at: transaction.updatedAt || syncedAt,
    };
  }

  function deserializeSupabaseAccount(row) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      currencySymbol: row.currency_symbol || "$",
      openingBalance: Number(row.opening_balance || 0),
      color: row.color || "#19c6a7",
      icon: row.icon || "wallet",
      notes: row.notes || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
    };
  }

  function deserializeSupabaseCategory(row) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      icon: row.icon || "cart",
      color: row.color || "#19c6a7",
      subcategories: Array.isArray(row.subcategories) ? row.subcategories : [],
      budgetLimit: Number(row.budget_limit || 0),
      budgetPeriod: row.budget_period || "monthly",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
    };
  }

  function deserializeSupabaseTransaction(row) {
    return {
      id: row.id,
      type: row.type,
      amount: Number(row.amount || 0),
      date: row.transaction_date || todayIso(),
      accountId: row.account_id || "",
      fromAccountId: row.from_account_id || "",
      toAccountId: row.to_account_id || "",
      categoryId: row.category_id || "",
      subcategory: row.subcategory || "",
      counterparty: row.counterparty || "",
      project: row.project || "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      details: row.details || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
    };
  }

  function getLatestCloudTimestamp(remoteState) {
    const timestamps = [
      ...remoteState.accounts.map((item) => item.updatedAt || ""),
      ...remoteState.categories.map((item) => item.updatedAt || ""),
      ...remoteState.transactions.map((item) => item.updatedAt || ""),
    ].filter(Boolean);
    return timestamps.sort().at(-1) || "";
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
      mode.textContent = "Supabase";
      title.textContent = "Supabase not configured";
      detail.textContent = "Supabase auth is required. Add your project URL and anon key in app.js to unlock the app.";
      syncButton.disabled = true;
      signOutButton.disabled = true;
      return;
    }

    if (!SUPABASE_AVAILABLE) {
      mode.textContent = "Supabase";
      title.textContent = "Client unavailable";
      detail.textContent = "The Supabase browser client could not load, so sign in is temporarily unavailable.";
      syncButton.disabled = true;
      signOutButton.disabled = true;
      return;
    }

    mode.textContent = "Supabase Cloud";
    title.textContent = uiState.isAuthenticated ? "Connected" : "Sign in required";
    detail.textContent = uiState.isAuthenticated
      ? `${uiState.currentUserEmail || "Authenticated user"}${uiState.syncStatus ? ` | ${uiState.syncStatus}` : ""}`
      : uiState.syncStatus;
    syncButton.disabled = !uiState.isAuthenticated || cloudState.isSyncing;
    signOutButton.disabled = !uiState.isAuthenticated;
  }

  function getAppRedirectUrl() {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = "";
    return url.toString();
  }

  return {
    initializeSupabase,
    handleSupabaseSession,
    syncStateToSupabase,
    handleSignOut,
    renderCloudStatus,
    getAppRedirectUrl,
  };
}
