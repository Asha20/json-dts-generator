import * as path from "path";
import { TypeDeclaration, typeAlias, identifierRegex } from "./core";

export function typeDeclaration(
  declaration: TypeDeclaration,
  { exported = false, computed = false, includeContexts = false } = {},
) {
  const name = typeAlias(declaration.id);
  const type = declaration.type;

  let result: string = "";
  if (typeof type === "string") {
    result = type;
  } else {
    const properties: string[] = Object.keys(type).map(key =>
      identifierRegex.test(key)
        ? `${key}: ${type[key]};`
        : `"${key}": ${type[key]};`,
    );

    result = properties.length ? "{ " + properties.join(" ") + " }" : "{}";
  }

  let typeDecl =
    (exported ? "export " : "") +
    "type " +
    name +
    " = " +
    (computed ? `C<${result}>` : result) +
    ";";

  return includeContexts
    ? typeDecl + " // " + declaration.contexts.join(", ")
    : typeDecl;
}

export function* commonDTS(
  declarations: Iterable<TypeDeclaration>,
  exportedTypes: Set<string>,
  { computed = false, includeContexts = false } = {},
) {
  if (computed) {
    yield `
/**
 * Compute utility which makes resulting types easier to read
 * with IntelliSense by expanding them fully, instead of leaving
 * object properties with cryptic type names.
 */
type C<A extends any> = {[K in keyof A]: A[K]} & {};
    `.trim() + "\n\n";
  }

  for (const declaration of declarations) {
    yield typeDeclaration(declaration, {
      exported: exportedTypes.has(typeAlias(declaration.id)),
      computed: computed,
      includeContexts: includeContexts,
    }) + "\n";
  }
}

export function relativeReExport(
  type: string,
  outDir: string,
  file: string,
  commonFile: string,
) {
  const outputFile = path.resolve(outDir, file.replace(".json", ".d.ts"));
  const relativePath = path.relative(path.dirname(outputFile), outDir);
  const relativeImport = relativePath
    ? path.join(relativePath, commonFile)
    : "./" + commonFile;

  return `export { ${type} as default } from "${relativeImport}";`;
}
