import { svgIcon } from "./utils.js";

export const iconRegistry = {
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
