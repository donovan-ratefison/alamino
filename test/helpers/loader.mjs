import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";
import { existsSync } from "node:fs";

const root = process.cwd();

function resolveExtension(filePath) {
  if (existsSync(filePath)) return filePath;
  if (existsSync(filePath + ".ts")) return filePath + ".ts";
  if (existsSync(filePath + ".tsx")) return filePath + ".tsx";
  if (existsSync(filePath + ".js")) return filePath + ".js";
  if (existsSync(filePath + ".mjs")) return filePath + ".mjs";
  const indexTs = pathResolve(filePath, "index.ts");
  if (existsSync(indexTs)) return indexTs;
  const indexJs = pathResolve(filePath, "index.js");
  if (existsSync(indexJs)) return indexJs;
  return filePath;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return {
      url: pathToFileURL(pathResolve(root, "test/helpers/next-server-mock.mjs")).href,
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const full = resolveExtension(pathResolve(root, "src", rel));
    return nextResolve(pathToFileURL(full).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const candidate = resolveExtension(pathResolve(parentDir, specifier));
    if (candidate !== pathResolve(parentDir, specifier) || existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}
