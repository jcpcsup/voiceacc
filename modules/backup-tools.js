// LedgerFlow Lossless Backup & Restore Engine (JSZip + Attachments)
import { getAllSlipsForBackup, importSlipFromBackup } from "./storage.js";

export function createBackupTools(api) {
  const {
    state,
    buildSerializableState,
    replaceState,
    persistState,
    renderAll,
    showToast,
    todayIso,
  } = api;

  async function getJSZip() {
    if (window.JSZip) {
      return window.JSZip;
    }
    // Dynamic import if not on window
    const mod = await import("./jszip.min.js");
    return window.JSZip || mod.default || mod;
  }

  async function exportFullBackupZip() {
    showToast("Generating full backup archive...");
    try {
      const JSZip = await getJSZip();
      const zip = new JSZip();

      // 1. Ledger Data JSON
      const serializable = buildSerializableState();
      const payload = {
        app: "LedgerFlow Voice",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        ...serializable,
      };
      zip.file("ledger_data.json", JSON.stringify(payload, null, 2));

      // 2. Receipt Image Slips
      const slips = await getAllSlipsForBackup();
      if (slips.length > 0) {
        const slipsFolder = zip.folder("slips");
        for (const slip of slips) {
          slipsFolder.file(slip.path, slip.blob);
        }
      }

      // 3. Compress ZIP
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const filename = `ledgerflow_backup_${todayIso().replace(/-/g, "")}.zip`;

      // 4. Native Capacitor Share or Browser Download
      if (window.Capacitor?.isNativePlatform() && window.Capacitor.Plugins?.Share) {
        // Future / Native bridge share
        await saveAndShareNativeZip(filename, zipBlob);
      } else {
        downloadBlob(filename, zipBlob);
      }

      showToast(`Backup ready: ${slips.length} receipt${slips.length === 1 ? "" : "s"} included.`);
    } catch (error) {
      console.error("Backup export error:", error);
      showToast("Failed to create full backup archive.");
    }
  }

  async function importFullBackupArchive(file) {
    if (!file) return;
    showToast("Processing backup archive...");
    try {
      const isZip = file.name.endsWith(".zip") || file.type.includes("zip");

      if (!isZip) {
        // Legacy JSON restore fallback
        const text = await file.text();
        const parsed = JSON.parse(text);
        replaceState(parsed);
        persistState();
        renderAll();
        showToast("Ledger restored from JSON.");
        return;
      }

      const JSZip = await getJSZip();
      const zip = await JSZip.loadAsync(file);

      // Find ledger_data.json
      const dataFile = zip.file("ledger_data.json");
      if (!dataFile) {
        throw new Error("Invalid backup archive: missing ledger_data.json.");
      }

      const rawJson = await dataFile.async("string");
      const parsedData = JSON.parse(rawJson);

      // Restore receipt slips
      let restoredSlipsCount = 0;
      const slipFiles = zip.file(/^slips\/.+/);
      for (const slipFile of slipFiles) {
        const relativeName = slipFile.name.replace(/^slips\//, "");
        if (relativeName) {
          const blob = await slipFile.async("blob");
          await importSlipFromBackup(relativeName, blob);
          restoredSlipsCount++;
        }
      }

      // Restore accounts, categories, transactions
      replaceState(parsedData);
      persistState();
      renderAll();

      showToast(
        `Restored ${parsedData.transactions?.length || 0} transactions and ${restoredSlipsCount} receipts!`
      );
    } catch (error) {
      console.error("Backup import error:", error);
      showToast(error.message || "Failed to import backup archive.");
    }
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function saveAndShareNativeZip(filename, blob) {
    // 1. Modern Web Share API with File
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        const file = new File([blob], filename, { type: "application/zip" });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: filename,
            text: `LedgerFlow Voice Full Backup Archive (${filename})`,
          });
          return;
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("Native file share fallback to browser download:", err);
      }
    }

    // 2. Standard browser anchor download
    downloadBlob(filename, blob);
  }

  return {
    exportFullBackupZip,
    importFullBackupArchive,
  };
}
