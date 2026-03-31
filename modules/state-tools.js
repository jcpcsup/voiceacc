export function createStateTools(api) {
  const { storageKey, defaultState, state, getCurrentUserId } = api;

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
