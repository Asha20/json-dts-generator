import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as glob from "glob";
import * as mkdirp from "mkdirp";

type Type = string | { [key: string]: Type };
type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

interface TypeDeclaration {
  id: number;
  contexts: string[];
  type: Type;
}

interface Cache {
  map: Map<string, TypeDeclaration>;
  id(): number;
}

const identifierRegex = /^[$_a-z][$_a-z0-9]*$/i;

/**
 * Declaration file which will store declarations from all inputs.
 * Name chosen as such to hopefully avoid collision with an input file.
 **/
const COMMON_FILE = "_common";
const COMMON_DTS = COMMON_FILE + ".d.ts";

const USAGE = "Usage: node json-dts.js INPUT-DIR OUTPUT-DIR";
const INSTRUCTIONS = `
Reads all JSON files inside INPUT-DIR (including those in subdirectories),
parses each into a TS declaration file with matching name and places those
into OUTPUT-DIR, matching the folder structure inside of INPUT-DIR.
`.trim();

const UNKNOWN_ARRAY_WARNING = (declarations: TypeDeclaration[]) => {
  const unfinishedTypeAliases = declarations
    .map(
      ({ id, contexts }) =>
        `  type ${typeAlias(id)}, derived from ${contexts[0]}`,
    )
    .join("\n");

  return `
The proper array type for the following type aliases could not be
inferred because the provided JSON featured empty arrays:

${unfinishedTypeAliases}

These type aliases have been given the type "unknown[]". Opening
${COMMON_DTS} and manually providing the proper types is recommended.
  `.trim();
};

function createHash(type: Type) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(type))
    .digest("base64");
}

function readJSONSync(file: string): JSONValue {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/** Traverses an object recursively and generates its TS type. */
function convertToType(cache: Cache, x: JSONValue, file?: string) {
  const newCache: Cache = { map: new Map(cache.map), id: cache.id };

  function _convertToType(x: JSONValue, context: string): string {
    if (typeof x === "string") {
      return "string";
    }
    if (typeof x === "number") {
      return "number";
    }
    if (typeof x === "boolean") {
      return "boolean";
    }
    if (x === null) {
      return "null";
    }
    if (Array.isArray(x)) {
      if (x.length) {
        const typeOfFirstElement = _convertToType(x[0], context + "[0]");
        return typeOfFirstElement + "[]";
      }
      // unknown[] types are always made unique so that they can be manually
      // changed into correct types independently from each other. If all of
      // them used a single unknown[] type alias, this would be impossible.
      return createType(newCache, "unknown[]", context, true);
    }

    const typeObject: Type = {};
    for (const key of Object.keys(x).sort()) {
      const contextSuffix = identifierRegex.test(key)
        ? "." + key
        : '["' + key + '"]';
      typeObject[key] = _convertToType(x[key], context + contextSuffix);
    }

    return createType(newCache, typeObject, context);
  }

  return {
    type: _convertToType(x, file ? file + ":root" : "root"),
    cache: newCache,
  };
}

function createCache(): Cache {
  let currentId = 0;

  return {
    map: new Map(),
    id() {
      return currentId++;
    },
  };
}

/**
 * Returns a type alias for the given type. Gives a brand new alias and adds
 * the type to the type cache if the type is new. Alternatively, it reuses
 * a type alias if the matching type already exists in the cache.
 * @param cache Cache of types.
 * @param type The type to be aliased.
 * @param context Origin of the type.
 * @param unique If true, the type won't be reused and will get its own unique type alias.
 * @return Type alias for the given type.
 */
function createType(cache: Cache, type: Type, context: string, unique = false) {
  let hash = createHash(type);
  if (!unique && cache.map.has(hash)) {
    const declaration = cache.map.get(hash)!;
    declaration.contexts.push(context);
    return typeAlias(declaration.id);
  }

  const id = cache.id();

  if (unique) {
    hash += id;
  }

  const typeDeclaration = { id, contexts: [context], type };
  cache.map.set(hash, typeDeclaration);
  const typeName = typeAlias(id);
  return typeName;
}

/** Generates a type alias from a given id. */
function typeAlias(id: number) {
  return "T" + id;
}

/** Creates a TS type declaration for a given type. */
function getTypeDeclaration(declaration: TypeDeclaration) {
  const typeName = typeAlias(declaration.id);
  const type = declaration.type;

  if (typeof type !== "object") {
    return `type ${typeName} = C<${type}>;`;
  }
  const result: string[] = [];
  for (const key of Object.keys(type)) {
    if (identifierRegex.test(key)) {
      result.push(`${key}: ${type[key]};`);
    } else {
      result.push(`"${key}": ${type[key]};`);
    }
  }
  const declarations = result.join(" ");
  if (declarations === "") {
    return `type ${typeName} = C<{}>;`;
  }
  return `type ${typeName} = C<{ ${declarations} }>;`;
}

function main() {
  if (process.argv.length === 3 && ["-h", "--help"].includes(process.argv[2])) {
    console.log(USAGE + "\n\n" + INSTRUCTIONS);
    process.exit(0);
  }

  if (process.argv.length !== 4) {
    console.error(USAGE);
    process.exit(1);
  }

  let cache = createCache();
  const inputDir = path.resolve(process.cwd(), process.argv[2]);
  const outputDir = path.resolve(process.cwd(), process.argv[3]);

  const inputFiles = glob.sync("**/*.json", { cwd: inputDir });
  const exportedTypes = new Set<string>();
  let currentFile = 1;

  console.log("Parsing JSON files...");
  for (const file of inputFiles) {
    const json = readJSONSync(path.resolve(inputDir, file));
    const { type: typeName, cache: newCache } = convertToType(
      cache,
      json,
      file,
    );
    exportedTypes.add(typeName);
    cache = newCache;

    mkdirp.sync(path.resolve(outputDir, path.dirname(file)));
    const outputFile = path.resolve(outputDir, file.replace(".json", ".d.ts"));
    const relativePath = path.relative(path.dirname(outputFile), outputDir);
    const relativeImport = relativePath
      ? path.join(relativePath, COMMON_FILE)
      : "./" + COMMON_FILE;

    fs.writeFileSync(
      outputFile,
      `export { ${typeName} as default } from "${relativeImport}";`,
    );

    console.log(
      `Finished file ${currentFile} of ${inputFiles.length}: ${file}`,
    );
    currentFile += 1;
  }

  console.log(`Creating ${COMMON_DTS} file...`);
  const output = fs.createWriteStream(path.resolve(outputDir, COMMON_DTS));

  output.write(
    `
/**
 * Compute utility which makes resulting types easier to read
 * with IntelliSense by expanding them fully, instead of leaving
 * object properties with cryptic type names.
 */
type C<A extends any> = {[K in keyof A]: A[K]} & {};
`.trim(),
  );
  output.write("\n\n");

  const unknownArrays: TypeDeclaration[] = [];
  for (const declaration of cache.map.values()) {
    if (declaration.type === "unknown[]") {
      unknownArrays.push(declaration);
    }

    const typeDeclaration = getTypeDeclaration(declaration);
    if (exportedTypes.has(typeAlias(declaration.id))) {
      output.write("export ");
    }

    output.write(typeDeclaration);
    output.write(" // ");
    for (let i = 0; i < declaration.contexts.length; i++) {
      const context = declaration.contexts[i];
      output.write(context);
      if (i < declaration.contexts.length - 1) {
        output.write(", ");
      }
    }
    output.write("\n");
  }

  output.close();
  console.log(COMMON_DTS + " created successfully.");

  if (unknownArrays.length) {
    console.log("\n" + UNKNOWN_ARRAY_WARNING(unknownArrays));
  }
}

if (!module.parent) {
  main();
}
