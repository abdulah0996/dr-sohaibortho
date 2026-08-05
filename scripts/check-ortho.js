const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const pattern = /ortho(?:paedic|pedic)?/i;

function walk(dir, results = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === "node_modules" || file === ".git" || file === "dist") continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, results);
    } else {
      const content = fs.readFileSync(fullPath, "utf8");
      if (pattern.test(content)) {
        const matches = content.split("\n").map((line, idx) => {
          if (pattern.test(line)) {
            return `  L${idx + 1}: ${line.trim()}`;
          }
          return null;
        }).filter(Boolean);
        results.push({ file: fullPath, matches });
      }
    }
  }
  return results;
}

const found = walk(rootDir);
console.log(`Found ${found.length} files with 'ortho' matches:`);
found.forEach(item => {
  console.log(`\nFile: ${item.file}`);
  item.matches.forEach(m => console.log(m));
});
