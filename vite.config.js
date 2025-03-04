import { defineConfig } from "vite";
import { resolve } from "path";
import fs from "fs-extra";
import { glob } from "glob";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
      },
    },
  },
  plugins: [
    {
      name: "hubspot-module-processor",
      transformIndexHtml(html) {
        return html.replace(
          /<!-- MODULE_IMPORT:(.*?) -->/g,
          (match, modulePath) => {
            try {
              const htmlPath = resolve(
                __dirname,
                `modules/${modulePath}/module.html`,
              );
              let content = fs.readFileSync(htmlPath, "utf-8");
              const hublPath = resolve(
                __dirname,
                `modules/${modulePath}/module.hubl`,
              );

              if (fs.existsSync(hublPath)) {
                const hublData = JSON.parse(fs.readFileSync(hublPath, "utf-8"));
                content = processHubL(content, hublData);
                console.log(`Processed content for ${modulePath}:`, content); // Debug log
              }

              return content;
            } catch (err) {
              console.error(`Error processing module ${modulePath}:`, err);
              return `<!-- Error loading module ${modulePath}: ${err.message} -->`;
            }
          },
        );
      },
      closeBundle() {
        processModules();
      },
    },
  ],
});

// Core HubL Processing Function
function processHubL(content, hublData) {
  let prevContent = "";
  while (content !== prevContent) {
    prevContent = content;
    content = processSet(content, hublData);
    content = processForLoops(content, hublData);
    content = processConditionals(content, hublData);
    content = processMacros(content, hublData);
    content = processBlocks(content, hublData);
    content = processVariables(content, hublData);
    content = processIncludes(content, hublData);
  }
  return content;
}

// Process {% set %}
function processSet(content, data) {
  const setRegex = /{%-?\s*set\s+(\w+)\s*=\s*(.*?)\s*-?%}/g;
  return content.replace(setRegex, (_match, varName, valueExpr) => {
    const value = evaluateExpression(valueExpr, data);
    data[varName] = value;
    return "";
  });
}

// Process {% for %}
function processForLoops(content, data) {
  const forLoopRegex =
    /{%-?\s*for\s+(\w+)\s+in\s+(.+?)\s*-?%}([\s\S]*?){%-?\s*endfor\s*-?%}/g;
  return content.replace(
    forLoopRegex,
    (_match, itemName, collectionExpr, innerContent) => {
      const collection = evaluateExpression(collectionExpr, data);
      if (!Array.isArray(collection))
        return `<!-- Invalid collection: ${collectionExpr} -->`;
      return collection
        .map((item) => {
          const loopData = { ...data, [itemName]: item };
          return processHubL(innerContent, loopData);
        })
        .join("");
    },
  );
}

// **Fixed** Process {% if %}, {% elif %}, {% else %}, {% endif %}
function processConditionals(content, data) {
  const tagRegex = /{%-?\s*(if|elif|else|endif)\s*(.*?)\s*-?%}/g;
  let output = "";
  let stack = [];
  let lastIndex = 0;

  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    // Content before the tag
    const beforeTag = content.slice(lastIndex, match.index);
    if (stack.length === 0 || stack[stack.length - 1].active) {
      output += beforeTag;
    }
    lastIndex = tagRegex.lastIndex;

    const type = match[1].trim();
    const condition = match[2].trim();

    if (type === "if") {
      const isTrue = evaluateCondition(condition, data);
      const active =
        isTrue && (stack.length === 0 || stack[stack.length - 1].active);
      stack.push({ type: "if", active, evaluated: isTrue });
      console.log(`If condition "${condition}" -> ${isTrue}`); // Debug log
    } else if (type === "elif") {
      if (stack.length > 0 && stack[stack.length - 1].type === "if") {
        const prev = stack[stack.length - 1];
        if (!prev.evaluated) {
          const isTrue = evaluateCondition(condition, data);
          prev.active =
            isTrue && (stack.length === 1 || stack[stack.length - 2].active);
          prev.evaluated = isTrue;
          console.log(`Elif condition "${condition}" -> ${isTrue}`); // Debug log
        } else {
          prev.active = false;
        }
      }
    } else if (type === "else") {
      if (stack.length > 0 && stack[stack.length - 1].type === "if") {
        const prev = stack[stack.length - 1];
        prev.active =
          !prev.evaluated &&
          (stack.length === 1 || stack[stack.length - 2].active);
      }
    } else if (type === "endif") {
      if (stack.length > 0 && stack[stack.length - 1].type === "if") {
        stack.pop();
      }
    }
  }

  // Remaining content after last tag
  const remaining = content.slice(lastIndex);
  if (stack.length === 0 || stack[stack.length - 1].active) {
    output += remaining;
  }

  return output;
}

// Process {% macro %}
function processMacros(content, data) {
  const macroRegex =
    /{%-?\s*macro\s+(\w+)\((.*?)\)\s*-?%}([\s\S]*?){%-?\s*endmacro\s*-?%}/g;
  let macros = {};
  content.replace(macroRegex, (_match, name, params, body) => {
    macros[name] = { params: params.split(",").map((p) => p.trim()), body };
    return "";
  });

  const macroCallRegex = /{%-?\s*call\s+(\w+)\((.*?)\)\s*-?%}/g;
  return content
    .replace(macroCallRegex, (_match, name, argsStr) => {
      const macro = macros[name];
      if (!macro) return `<!-- Undefined macro: ${name} -->`;
      const args = argsStr
        .split(",")
        .map((arg) => evaluateExpression(arg.trim(), data));
      let macroBody = macro.body;
      macro.params.forEach((param, i) => {
        macroBody = macroBody.replace(
          new RegExp(`{{\\s*${param}\\s*}}`, "g"),
          args[i] || "",
        );
      });
      return processHubL(macroBody, data);
    })
    .replace(macroRegex, "");
}

// Process {% block %}
function processBlocks(content, data) {
  const blockRegex =
    /{%-?\s*block\s+(\w+)\s*-?%}([\s\S]*?){%-?\s*endblock\s*-?%}/g;
  return content.replace(blockRegex, (_match, blockName, blockContent) => {
    return processHubL(blockContent, data);
  });
}

// Process {{ variables }}
function processVariables(content, data) {
  const variableRegex = /{{\s*(-?)\s*(.*?)\s*(-?)\s*}}/g;
  return content.replace(variableRegex, (_match, trimLeft, expr, trimRight) => {
    const value = evaluateExpression(expr, data);
    return `${trimLeft ? "" : " "}${value}${trimRight ? "" : " "}`;
  });
}

// Evaluate Conditions
function evaluateCondition(condition, data) {
  if (!condition) return true;
  const parts = condition.match(/(.+?)(==|!=|>|<|>=|<=)(.+)/) || [
    null,
    condition,
  ];
  const [_, left, operator, right] = parts;
  const leftValue = evaluateExpression(left?.trim() || condition, data);
  if (!operator) return !!leftValue;

  const rightValue = evaluateExpression(right?.trim() || "", data);
  switch (operator) {
    case "==":
      return leftValue == rightValue;
    case "!=":
      return leftValue != rightValue;
    case ">":
      return leftValue > rightValue;
    case "<":
      return leftValue < rightValue;
    case ">=":
      return leftValue >= rightValue;
    case "<=":
      return leftValue <= rightValue;
    default:
      return false;
  }
}

function evaluateExpression(expr, data) {
  const [path, filter] = expr.split("|").map((s) => s.trim());
  let value = path.includes(".")
    ? resolveHubLPath(path, data)
    : data[path] || path;
  if (typeof value === "undefined") value = "";
  return applyFilters(value, filter);
}

function resolveHubLPath(path, data) {
  const parts = path.replace("module.", "").split(".");
  return parts.reduce((acc, part) => acc?.[part], data) ?? "";
}

function applyFilters(value, filter) {
  const filters = {
    upper: (v) => v?.toString().toUpperCase(),
    lower: (v) => v?.toString().toLowerCase(),
    default: (v, arg) => (v == null ? arg || "N/A" : v),
    escape: (v) => v?.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;"),
  };
  if (!filter) return value;
  const [filterName, arg] = filter.split(":").map((s) => s.trim());
  return filters[filterName] ? filters[filterName](value, arg) : value;
}

// Process {% include %}
function processIncludes(content, data) {
  const includeRegex = /{%-?\s*include\s*(['"]?.*?['"]?)\s*-?%}/g;
  return content.replace(includeRegex, (_match, pathExpr) => {
    try {
      const path =
        pathExpr.startsWith('"') || pathExpr.startsWith("'")
          ? pathExpr.slice(1, -1)
          : evaluateExpression(pathExpr, data);
      const includeContent = fs.readFileSync(
        resolve(__dirname, `modules/${path}`),
        "utf-8",
      );
      return processHubL(includeContent, data);
    } catch (err) {
      return `<!-- Error including ${pathExpr}: ${err.message} -->`;
    }
  });
}

// Process Modules for Build
async function processModules() {
  const modules = await glob.glob("modules/*");
  await Promise.all(
    modules.map(async (modulePath) => {
      const moduleName = modulePath.split("/").pop();
      const outputDir = `dist/${moduleName}`;
      await fs.ensureDir(outputDir);

      await Promise.all([
        fs.copy(
          resolve(modulePath, "module.html"),
          resolve(outputDir, "module.html"),
        ),
        fs
          .copy(
            resolve(modulePath, "module.css"),
            resolve(outputDir, "module.css"),
          )
          .catch(() => {}),
        fs
          .copy(
            resolve(modulePath, "module.js"),
            resolve(outputDir, "module.js"),
          )
          .catch(() => {}),
        generateMetaFile(modulePath, outputDir),
      ]);

      console.log(`Processed module: ${moduleName}`);
    }),
  );
  console.log("Build complete. Files ready in dist/");
}

async function generateMetaFile(modulePath, outputDir) {
  const metaJson = {
    label: `${modulePath.split("/").pop().charAt(0).toUpperCase()}${modulePath.slice(1)} Module`,
    css_assets: [],
    js_assets: [],
    editable_regions: [],
  };

  if (await fs.pathExists(resolve(modulePath, "module.css")))
    metaJson.css_assets.push("module.css");
  if (await fs.pathExists(resolve(modulePath, "module.js")))
    metaJson.js_assets.push("module.js");

  await fs.writeFile(
    resolve(outputDir, "meta.json"),
    JSON.stringify(metaJson, null, 2),
  );
}
