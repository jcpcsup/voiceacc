// LedgerFlow Voice Adapter: Universal Web & Native Android Speech Recognizer

export function createVoiceTools(api) {
  const { showToast } = api;

  let isListening = false;
  let webRecognition = null;

  function isNative() {
    return Boolean(window.Capacitor?.isNativePlatform());
  }

  async function checkPermissions() {
    if (isNative() && window.Capacitor?.Plugins?.SpeechRecognition) {
      const plugin = window.Capacitor.Plugins.SpeechRecognition;
      try {
        let perm = null;
        if (typeof plugin.checkPermissions === "function") {
          perm = await plugin.checkPermissions();
        }
        if (!perm || perm.speechRecognition !== "granted") {
          if (typeof plugin.requestPermissions === "function") {
            perm = await plugin.requestPermissions();
          }
        }
        return perm?.speechRecognition === "granted";
      } catch (e) {
        console.warn("Speech permission check error:", e);
        return false;
      }
    }
    return true;
  }

  async function startListening(options = {}) {
    const { onResult, onStart, onEnd, onError } = options;

    if (isListening) {
      await stopListening();
      return;
    }

    const permitted = await checkPermissions();
    if (!permitted) {
      showToast("Microphone permission was denied.");
      if (typeof onError === "function") onError("Permission denied");
      return;
    }

    if (isNative() && window.Capacitor?.Plugins?.SpeechRecognition) {
      try {
        isListening = true;
        if (typeof onStart === "function") onStart();

        window.Capacitor.Plugins.SpeechRecognition.addListener("partialResults", (data) => {
          if (data && data.matches && data.matches.length > 0) {
            const transcript = data.matches[0];
            if (typeof onResult === "function") onResult(transcript);
          }
        });

        const result = await window.Capacitor.Plugins.SpeechRecognition.start({
          language: "en-US",
          maxResults: 1,
          prompt: "Speak your transaction...",
          partialResults: true,
          popup: false,
        });

        if (result && result.matches && result.matches.length > 0) {
          if (typeof onResult === "function") onResult(result.matches[0]);
        }
      } catch (err) {
        console.warn("Native speech error:", err);
        isListening = false;
        if (typeof onError === "function") onError(err);
      } finally {
        isListening = false;
        if (typeof onEnd === "function") onEnd();
      }
      return;
    }

    // Web Speech API fallback
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Speech recognition is not supported in this browser.");
      if (typeof onError === "function") onError("Unsupported");
      return;
    }

    try {
      webRecognition = new SpeechRecognition();
      webRecognition.lang = "en-US";
      webRecognition.interimResults = true;
      webRecognition.maxAlternatives = 1;

      webRecognition.onstart = () => {
        isListening = true;
        if (typeof onStart === "function") onStart();
      };

      webRecognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" ");
        if (typeof onResult === "function") onResult(transcript.trim());
      };

      webRecognition.onend = () => {
        isListening = false;
        if (typeof onEnd === "function") onEnd();
      };

      webRecognition.onerror = (event) => {
        isListening = false;
        if (typeof onError === "function") onError(event.error);
        if (typeof onEnd === "function") onEnd();
      };

      webRecognition.start();
    } catch (e) {
      isListening = false;
      console.error(e);
      if (typeof onError === "function") onError(e);
    }
  }

  async function stopListening() {
    isListening = false;
    if (isNative() && window.Capacitor?.Plugins?.SpeechRecognition) {
      try {
        await window.Capacitor.Plugins.SpeechRecognition.stop();
      } catch (_) {}
    } else if (webRecognition) {
      try {
        webRecognition.stop();
      } catch (_) {}
    }
  }

  return {
    startListening,
    stopListening,
    getIsListening: () => isListening,
  };
}
