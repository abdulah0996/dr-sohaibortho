const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const queries = ["EMAIL_WORKER_FAILURE", "owner email", "Worker", "email", "worker_threads"];

function searchFiles(dir, results = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === "node_modules" || file === ".git" || file === "dist") continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchFiles(fullPath, results);
    } else {
      const content = fs.readFileSync(fullPath, "utf8");
      queries.forEach(q => {
        if (content.includes(q)) {
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            if (line.includes(q)) {
              results.push({ query: q, file: fullPath, line: idx + 1, text: line.trim() });
            }
          });
        }
      });
    }
  }
  return results;
}

const found = searchFiles(rootDir);
console.log(`Search completed. Found ${found.length} results:`);
found.forEach(r => {
  console.log(`[${r.query}] ${r.file}:${r.line} -> ${r.text}`);
});
