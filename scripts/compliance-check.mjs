import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = ["src", "README.md", "index.html", "package.json"];
const TEXT_EXT = new Set([".ts", ".tsx", ".css", ".md", ".html", ".json"]);
const BANNED = [
  /ameniwa\.com/i,
  /sora-flipbook/i,
  /sora_ghost/i,
  /1:1/i,
  /复刻/,
  /clone/i,
];

function listFiles(targetPath) {
  const full = path.resolve(ROOT, targetPath);
  if (!fs.existsSync(full)) {
    return [];
  }
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    return [full];
  }
  const files = [];
  const stack = [full];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!TEXT_EXT.has(ext)) {
          continue;
        }
        files.push(next);
      }
    }
  }
  return files;
}

function checkFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXT.has(ext)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const issues = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const rule of BANNED) {
      if (rule.test(line)) {
        issues.push({ line: i + 1, text: line.trim(), rule: String(rule) });
      }
    }
  }
  return issues;
}

const files = TARGETS.flatMap((target) => listFiles(target));
const findings = [];

for (const file of files) {
  const issues = checkFile(file);
  for (const issue of issues) {
    findings.push({
      file: path.relative(ROOT, file),
      ...issue,
    });
  }
}

if (findings.length > 0) {
  console.error("Compliance check failed. Found banned terms:");
  for (const item of findings) {
    console.error(`- ${item.file}:${item.line} [${item.rule}] ${item.text}`);
  }
  process.exit(1);
}

console.log(`Compliance check passed (${files.length} files scanned).`);
