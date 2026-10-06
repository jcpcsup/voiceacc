// LedgerFlow Security Engine: PBKDF2 4-Digit PIN & Biometrics
import { getSecuritySettings, saveSecuritySettings } from "./storage.js";

export function createSecurityTools(api) {
  const { showToast, onUnlockSuccess } = api;

  let currentSettings = {
    isLockEnabled: false,
    pinHash: "",
    pinSalt: "",
    biometricEnabled: false,
    autoLockTimeoutSeconds: 0,
    failedAttempts: 0,
    lockoutUntil: 0,
  };

  let enteredDigits = "";
  let isLocked = false;
  let lastActiveTimestamp = Date.now();
  let lockoutTimerInterval = null;

  // Crypto helpers (PBKDF2-HMAC-SHA256)
  async function hashPin(pin, saltHex) {
    const enc = new TextEncoder();
    const pinBuffer = enc.encode(pin);
    const saltBuffer = hexToBuffer(saltHex);

    const baseKey = await crypto.subtle.importKey(
      "raw",
      pinBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 100000,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );

    const rawDerived = await crypto.subtle.exportKey("raw", derivedKey);
    return bufferToHex(rawDerived);
  }

  function generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return bufferToHex(arr.buffer);
  }

  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function hexToBuffer(hex) {
    const bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes.buffer;
  }

  async function initializeSecurity() {
    currentSettings = await getSecuritySettings();
    bindKeypadEvents();
    bindLifecycleEvents();

    if (currentSettings.isLockEnabled && currentSettings.pinHash) {
      lockApp();
    } else {
      unlockApp(true);
    }
  }

  function lockApp() {
    if (!currentSettings.isLockEnabled || !currentSettings.pinHash) {
      return;
    }
    isLocked = true;
    enteredDigits = "";
    updatePinDotsUi();

    const lockScreen = document.getElementById("lock-screen");
    if (lockScreen) {
      lockScreen.classList.remove("hidden");
      lockScreen.setAttribute("aria-hidden", "false");
      document.body.classList.add("app-locked");
    }

    checkLockoutState();

    // Trigger biometric automatically if enabled and not locked out
    if (currentSettings.biometricEnabled && !isCurrentlyLockedOut()) {
      void promptBiometric();
    }
  }

  function unlockApp(quiet = false) {
    isLocked = false;
    enteredDigits = "";
    lastActiveTimestamp = Date.now();
    updatePinDotsUi();

    const lockScreen = document.getElementById("lock-screen");
    if (lockScreen) {
      lockScreen.classList.add("hidden");
      lockScreen.setAttribute("aria-hidden", "true");
      document.body.classList.remove("app-locked");
    }

    if (!quiet) {
      showToast("Unlocked ✓");
    }

    if (typeof onUnlockSuccess === "function") {
      onUnlockSuccess();
    }
  }

  function isCurrentlyLockedOut() {
    return currentSettings.lockoutUntil > Date.now();
  }

  function checkLockoutState() {
    const errorEl = document.getElementById("lock-error");
    if (!errorEl) return;

    if (lockoutTimerInterval) {
      clearInterval(lockoutTimerInterval);
      lockoutTimerInterval = null;
    }

    if (isCurrentlyLockedOut()) {
      disableKeypad(true);
      const updateMessage = () => {
        const remainingSeconds = Math.ceil((currentSettings.lockoutUntil - Date.now()) / 1000);
        if (remainingSeconds <= 0) {
          clearInterval(lockoutTimerInterval);
          currentSettings.lockoutUntil = 0;
          currentSettings.failedAttempts = 0;
          void saveSecuritySettings(currentSettings);
          disableKeypad(false);
          errorEl.classList.add("hidden");
        } else {
          errorEl.textContent = `Too many failed attempts. Try again in ${remainingSeconds}s.`;
          errorEl.classList.remove("hidden");
        }
      };
      updateMessage();
      lockoutTimerInterval = setInterval(updateMessage, 1000);
    } else {
      disableKeypad(false);
      errorEl.classList.add("hidden");
    }
  }

  function disableKeypad(disabled) {
    document.querySelectorAll(".pin-btn").forEach((btn) => {
      btn.disabled = disabled;
    });
  }

  function bindKeypadEvents() {
    document.querySelectorAll("[data-pin]").forEach((btn) => {
      btn.addEventListener("click", () => handleDigitPress(btn.dataset.pin));
    });

    document.getElementById("pin-backspace-button")?.addEventListener("click", handleBackspace);
    document.getElementById("pin-biometric-button")?.addEventListener("click", promptBiometric);

    // Keyboard support for testing / desktop
    window.addEventListener("keydown", (e) => {
      if (!isLocked) return;
      if (/^[0-9]$/.test(e.key)) {
        handleDigitPress(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      }
    });
  }

  function handleDigitPress(digit) {
    if (isCurrentlyLockedOut() || enteredDigits.length >= 4) return;

    enteredDigits += String(digit);
    vibrate(15);
    updatePinDotsUi();

    if (enteredDigits.length === 4) {
      void verifyEnteredPin();
    }
  }

  function handleBackspace() {
    if (isCurrentlyLockedOut() || enteredDigits.length === 0) return;
    enteredDigits = enteredDigits.slice(0, -1);
    vibrate(10);
    updatePinDotsUi();
  }

  function updatePinDotsUi() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pin-dot-${i}`);
      if (dot) {
        dot.classList.toggle("pin-dot-filled", i < enteredDigits.length);
      }
    }
  }

  async function verifyEnteredPin() {
    const errorEl = document.getElementById("lock-error");
    const enteredHash = await hashPin(enteredDigits, currentSettings.pinSalt);

    if (enteredHash === currentSettings.pinHash) {
      // Success! Reset attempts
      currentSettings.failedAttempts = 0;
      currentSettings.lockoutUntil = 0;
      await saveSecuritySettings(currentSettings);
      unlockApp();
    } else {
      // Failed!
      vibrate([50, 50, 50]);
      enteredDigits = "";
      updatePinDotsUi();
      shakeKeypad();

      currentSettings.failedAttempts = (currentSettings.failedAttempts || 0) + 1;
      if (currentSettings.failedAttempts >= 5) {
        currentSettings.lockoutUntil = Date.now() + 30000; // 30s lockout
        await saveSecuritySettings(currentSettings);
        checkLockoutState();
      } else {
        if (errorEl) {
          const remaining = 5 - currentSettings.failedAttempts;
          errorEl.textContent = `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`;
          errorEl.classList.remove("hidden");
        }
        await saveSecuritySettings(currentSettings);
      }
    }
  }

  function shakeKeypad() {
    const card = document.querySelector(".pin-lock-card");
    if (card) {
      card.classList.remove("pin-shake");
      void card.offsetWidth; // Force reflow
      card.classList.add("pin-shake");
    }
  }

  function vibrate(pattern) {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (_) {}
  }

  async function promptBiometric() {
    if (isCurrentlyLockedOut()) return;

    // Capacitor Native Biometric Auth bridge
    if (window.Capacitor?.isNativePlatform() && window.Capacitor.Plugins?.BiometricAuth) {
      try {
        const result = await window.Capacitor.Plugins.BiometricAuth.authenticate({
          reason: "Unlock LedgerFlow",
          cancelTitle: "Use PIN",
        });
        if (result && result.hasCredentials !== false) {
          unlockApp();
          return;
        }
      } catch (err) {
        console.warn("Biometric auth skipped or failed:", err);
      }
    }
  }

  function bindLifecycleEvents() {
    // Background auto-lock tracking
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        lastActiveTimestamp = Date.now();
      } else {
        checkAutoLock();
      }
    });

    if (window.Capacitor?.Plugins?.App) {
      window.Capacitor.Plugins.App.addListener("appStateChange", (state) => {
        if (!state.isActive) {
          lastActiveTimestamp = Date.now();
        } else {
          checkAutoLock();
        }
      });
    }
  }

  function checkAutoLock() {
    if (!currentSettings.isLockEnabled || !currentSettings.pinHash || isLocked) {
      return;
    }
    const elapsedSeconds = (Date.now() - lastActiveTimestamp) / 1000;
    if (elapsedSeconds >= (currentSettings.autoLockTimeoutSeconds || 0)) {
      lockApp();
    }
  }

  // Management functions for Settings UI
  async function setupNewPin(newPin4Digits) {
    if (!/^\d{4}$/.test(newPin4Digits)) {
      throw new Error("PIN must be exactly 4 digits.");
    }
    const salt = generateSalt();
    const hash = await hashPin(newPin4Digits, salt);
    currentSettings.pinSalt = salt;
    currentSettings.pinHash = hash;
    currentSettings.isLockEnabled = true;
    currentSettings.failedAttempts = 0;
    currentSettings.lockoutUntil = 0;
    await saveSecuritySettings(currentSettings);
    return true;
  }

  async function disableAppLock() {
    currentSettings.isLockEnabled = false;
    currentSettings.pinHash = "";
    currentSettings.pinSalt = "";
    currentSettings.biometricEnabled = false;
    await saveSecuritySettings(currentSettings);
  }

  async function updateSecurityConfig(patch = {}) {
    currentSettings = { ...currentSettings, ...patch };
    await saveSecuritySettings(currentSettings);
  }

  return {
    initializeSecurity,
    lockApp,
    unlockApp,
    setupNewPin,
    disableAppLock,
    updateSecurityConfig,
    getSecurityState: () => ({ ...currentSettings, isLocked }),
  };
}
