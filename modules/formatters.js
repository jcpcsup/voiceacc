export function createFormatterTools(api) {
  const { state, getAccount } = api;

  function sumAmounts(transactions) {
    return transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
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

  function formatMoney(value, symbol) {
    const amount = Number(value || 0);
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
    return `${amount < 0 ? "-" : ""}${symbol || "$"} ${formatted}`;
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

  function formatCalendarDisplayMoney(value, symbol) {
    const amount = Number(value || 0);
    return `${symbol || "$"} ${new Intl.NumberFormat("en-US", {
      useGrouping: false,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))}`;
  }

  function formatCompactPlainAmount(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("en-US", {
      useGrouping: false,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
  }

  function withAlpha(hexColor, alpha) {
    const hex = String(hexColor || "").replace("#", "").trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `rgba(18, 200, 164, ${alpha})`;
    }
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function formatTransactionAmount(value, transaction) {
    return formatMoney(value, getTransactionCurrencySymbol(transaction));
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function shiftIsoDate(isoDate, amount) {
    const date = new Date(`${isoDate}T00:00:00`);
    date.setDate(date.getDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function formatShortDateTime(value) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  return {
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
  };
}
