export function createStateTools(api) {
  const { storageKey, defaultState, state, getCurrentUserId } = api;

  function normalizeTags(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    return String(value || "")
      .split(",")
      .map((item) => item.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean);
  }

  function loadLocalState(key = storageKey) {
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
    const normalizedAccounts =
      Array.isArray(parsed.accounts) && parsed.accounts.length
        ? parsed.accounts
            .map((account, index) => ({
              currencySymbol: "$",
              includeInTotalBalance: true,
              sortOrder: index,
              ...account,
            }))
            .sort((a, b) => Number(a.sortOrder ?? Number.MAX_SAFE_INTEGER) - Number(b.sortOrder ?? Number.MAX_SAFE_INTEGER))
            .map((account, index) => ({
              ...account,
              sortOrder: index,
            }))
        : structuredClone(defaultState.accounts);
    return {
      accounts: normalizedAccounts,
      counterparties:
        Array.isArray(parsed.counterparties) && parsed.counterparties.length
          ? parsed.counterparties.map((counterparty) => ({
              color: "#6657ca",
              icon: "briefcase",
              notes: "",
              ...counterparty,
            }))
          : structuredClone(defaultState.counterparties || []),
      lookupEntries:
        Array.isArray(parsed.lookupEntries) && parsed.lookupEntries.length
          ? parsed.lookupEntries
              .map((entry) => ({
                id: "",
                kind: "",
                name: "",
                createdAt: "",
                updatedAt: "",
                ...entry,
              }))
              .filter((entry) => entry.id && entry.kind && String(entry.name || "").trim())
          : structuredClone(defaultState.lookupEntries || []),
      categories:
        Array.isArray(parsed.categories) && parsed.categories.length
          ? parsed.categories
          : structuredClone(defaultState.categories),
      transactions: Array.isArray(parsed.transactions)
        ? parsed.transactions.map((transaction) => ({
            counterpartyId: "",
            counterpartyEffect: "",
            slipPath: "",
            slipResolution: "720",
            slipMimeType: "",
            slipUpdatedAt: "",
            ...transaction,
            tags: normalizeTags(transaction?.tags),
            slipResolution: String(transaction?.slipResolution || 720),
          }))
        : [],
    };
  }

  function replaceState(nextState) {
    const normalized = normalizeState(nextState);
    state.accounts = normalized.accounts;
    state.counterparties = normalized.counterparties;
    state.lookupEntries = normalized.lookupEntries;
    state.categories = normalized.categories;
    state.transactions = normalized.transactions;
  }

  function buildSerializableState() {
    return {
      accounts: state.accounts,
      counterparties: state.counterparties,
      lookupEntries: state.lookupEntries,
      categories: state.categories,
      transactions: state.transactions,
    };
  }

  function getUserCacheKey(userId) {
    return `${storageKey}:${userId}`;
  }

  function persistState() {
    const serialized = JSON.stringify(buildSerializableState());
    window.localStorage.setItem(storageKey, serialized);
    const userId = getCurrentUserId ? getCurrentUserId() : "";
    if (userId) {
      window.localStorage.setItem(getUserCacheKey(userId), serialized);
    }
  }

  return {
    loadLocalState,
    normalizeState,
    replaceState,
    buildSerializableState,
    getUserCacheKey,
    persistState,
  };
}
