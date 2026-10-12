#!/usr/bin/env node
/**
 * CSS cascade guard for the Dokkit surface migration.
 *
 * This deliberately does not remove or rewrite CSS. It records the current
 * !important budget in legacy-heavy files and fails if a change increases it.
 * The budgets are ceilings, not targets: cascade cleanup should lower them.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const budgets = {
  "app/surface-system.css": 792,
  "app/ux-today-product.css": 104,
  "app/ux-act-product.css": 5,
  "app/ux-capture-proposals.css": 2,
  "app/desktop-settings.css": 0,
  "app/dokkit-player.css": 0,
};

function maskCommentsAndStrings(source) {
  let output = "";
  let quote = null;
  let inComment = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inComment) {
      if (char === "*" && next === "/") {
        output += "  ";
        i += 1;
        inComment = false;
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (quote) {
      if (char === "\n") output += "\n";
      else output += " ";
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === "/" && next === "*") {
      output += "  ";
      i += 1;
      inComment = true;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      output += " ";
      continue;
    }

    output += char;
  }

  return output;
}

let failed = false;
const results = [];

for (const [relativePath, budget] of Object.entries(budgets)) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`CSS cascade audit: required file missing: ${relativePath}`);
    failed = true;
    continue;
  }

  const source = fs.readFileSync(absolutePath, "utf8");
  const importantCount = (source.match(/!important\b/gi) ?? []).length;
  const masked = maskCommentsAndStrings(source);
  let depth = 0;
  let minDepth = 0;
  for (const char of masked) {
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      minDepth = Math.min(minDepth, depth);
    }
  }

  const result = {
    file: relativePath,
    important: importantCount,
    budget,
    delta: importantCount - budget,
    balanced: depth === 0 && minDepth === 0,
  };
  results.push(result);

  if (!result.balanced) {
    console.error(`CSS cascade audit: unbalanced braces in ${relativePath}`);
    failed = true;
  }
  if (importantCount > budget) {
    console.error(
      `CSS cascade audit: ${relativePath} has ${importantCount} !important declarations; budget is ${budget}.`,
    );
    failed = true;
  }
}


/* Token ownership is architectural, not a style preference. Shared tokens
   must live in ux-design-tokens.css rather than being reintroduced in the
   legacy global stylesheet. */
const globalsPath = path.join(root, "app/globals.css");
const tokensPath = path.join(root, "app/ux-design-tokens.css");
const layoutPath = path.join(root, "app/layout.tsx");
const globalsSource = fs.readFileSync(globalsPath, "utf8");
const tokensSource = fs.readFileSync(tokensPath, "utf8");
const layoutSource = fs.readFileSync(layoutPath, "utf8");
const globalsHasRootTokens = /(^|\n)\s*:root\s*\{/m.test(maskCommentsAndStrings(globalsSource));
const tokensHasLightTokens = /(^|\n)\s*:root\s*\{/m.test(maskCommentsAndStrings(tokensSource));
const tokensHasDarkOverrides = /\[data-theme="dark"\]\s*\{/.test(maskCommentsAndStrings(tokensSource));
const globalsImport = layoutSource.indexOf("import './globals.css';");
const tokensImport = layoutSource.indexOf("import './ux-design-tokens.css';");
const ownershipChecks = [
  ["globals.css does not own root token blocks", !globalsHasRootTokens],
  ["ux-design-tokens.css owns light tokens", tokensHasLightTokens],
  ["ux-design-tokens.css owns dark-theme token overrides", tokensHasDarkOverrides],
  ["layout loads globals before the token layer", globalsImport >= 0 && tokensImport > globalsImport],
];
for (const [label, passed] of ownershipChecks) {
  console.log(`CSS token ownership: ${passed ? "PASS" : "FAIL"} — ${label}`);
  if (!passed) failed = true;
}

console.log("Dokkit CSS cascade audit (budgets are ceilings, not targets)");
console.table(results);
if (failed) process.exit(1);
