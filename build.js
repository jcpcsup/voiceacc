// LedgerFlow Web Assets Bundle Script for Capacitor
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const outDir = path.join(rootDir, "www");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Copy top files
const filesToCopy = ["index.html", "styles.css", "app.js", "config.js"];
for (const file of filesToCopy) {
  const src = path.join(rootDir, file);
  const dest = path.join(outDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

// Copy modules recursively
const modulesSrc = path.join(rootDir, "modules");
const modulesDest = path.join(outDir, "modules");

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(modulesSrc)) {
  copyDirRecursive(modulesSrc, modulesDest);
}

console.log("Web assets bundled successfully to www/");
