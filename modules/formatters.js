export function createFormatterTools(api) {
  const { state, getAccount } = api;

  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }

  function toLocalIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
  }

  function toLocalMonthKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
  }

  function parseIsoDate(value, hour = 12) {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return new Date("");
    }
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), hour, 0, 0, 0);
  }

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
    return toLocalIsoDate(new Date());
  }

  function shiftIsoDate(isoDate, amount) {
    const date = parseIsoDate(isoDate, 12);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    date.setDate(date.getDate() + amount);
    return toLocalIsoDate(date);
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
    toLocalIsoDate,
    toLocalMonthKey,
    parseIsoDate,
    todayIso,
    shiftIsoDate,
    formatShortDateTime,
  };
}
