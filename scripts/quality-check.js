const { execFileSync } = require("node:child_process");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mode = process.argv[2];
function walk(directory, relative = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) return ["node_modules", ".git", "production-dr-khurrum"].includes(entry.name) ? [] : walk(path.join(directory, entry.name), next);
    return [next.replace(/\\/g, "/")];
  });
}
const trackedFiles = walk(root).filter((file) => file !== ".env");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

if (mode === "secrets") {
  const files = trackedFiles.filter((file) => /(^|\/)(\.env\.example|[^/]+\.(js|json|md|ya?ml))$/i.test(file));
  const forbidden = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\b(?:Admin|Doctor|Reception|Staff)@123\b/,
    /^SMTP_PASSWORD=\S+/m,
    /^(?:WHATSAPP_ACCESS_TOKEN|META_APP_SECRET|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|COOKIE_SECRET|STORAGE_ACCESS_KEY_ID|STORAGE_SECRET_ACCESS_KEY)=(?!(?:your_|change|example|placeholder))\S+/im
  ];
  const findings = files.flatMap((file) => forbidden.some((pattern) => pattern.test(read(file))) ? [file] : []);
  if (findings.length) throw new Error(`Potential secret found in: ${findings.join(", ")}`);
  console.log("Secret scan passed for tracked project files.");
} else if (mode === "dummy") {
  const productionFiles = trackedFiles.filter((file) => /^(src|script\.js|index\.html|api-client\.js)/.test(file));
  const forbidden = [/Demo Mode/i, /Dummy Data/i, /Simulated success/i, /Frontend-only records/i, /No real record was changed/i, /Dr\. Khurr[au]m/i, /Nighat Medical Complex/i, /\bKHR-\d{4}/i];
  const findings = productionFiles.flatMap((file) => forbidden.some((pattern) => pattern.test(read(file))) ? [file] : []);
  if (findings.length) throw new Error(`Legacy or dummy content found in production code: ${findings.join(", ")}`);
  console.log("Dummy and legacy identity scan passed for production code.");
} else {
  throw new Error("Use quality-check.js with either secrets or dummy.");
}
