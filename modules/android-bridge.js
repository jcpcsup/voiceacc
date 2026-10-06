// LedgerFlow Android Native Bridge: Back Button, Status Bar, Safe Areas

export function initializeAndroidBridge(api) {
  const { switchScreen, getCurrentScreen, closeTopModal } = api;

  if (typeof window === "undefined" || !window.Capacitor?.isNativePlatform()) {
    return;
  }

  // 1. Android Status Bar and Navigation Bar Styling
  if (window.Capacitor.Plugins?.StatusBar) {
    try {
      window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: "#0e131f" });
      window.Capacitor.Plugins.StatusBar.setStyle({ style: "DARK" });
    } catch (e) {
      console.warn("StatusBar setup error:", e);
    }
  }

  // 2. Hardware / Gesture Back Button Navigation Stack
  if (window.Capacitor.Plugins?.App) {
    window.Capacitor.Plugins.App.addListener("backButton", ({ canGoBack }) => {
      // Priority 1: Close active modal
      if (typeof closeTopModal === "function" && closeTopModal()) {
        return;
      }

      // Priority 2: Clear search results
      const searchResults = document.getElementById("global-search-results");
      if (searchResults && !searchResults.classList.contains("hidden")) {
        searchResults.classList.add("hidden");
        const searchInput = document.getElementById("global-search-input");
        if (searchInput) searchInput.value = "";
        return;
      }

      // Priority 3: Return to overview if on another screen
      const activeScreen = getCurrentScreen ? getCurrentScreen() : "overview";
      if (activeScreen && activeScreen !== "overview") {
        switchScreen("overview");
        return;
      }

      // Priority 4: Minimize / Exit App
      window.Capacitor.Plugins.App.exitApp();
    });
  }
}
