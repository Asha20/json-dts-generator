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
  file: string;
  context: string;
  type: Type;
}

/**
 * Declaration file which will store declarations from all inputs.
 * Name chosen as such to hopefully avoid collision with an input file.
 **/
const COMMON_FILE = "_common";

const USAGE = "Usage: node json-dts.js INPUT-DIR OUTPUT-DIR";
const INSTRUCTIONS = `
Reads all JSON files inside INPUT-DIR (including those in subdirectories),
parses each into a TS declaration file with matching name and places those
into OUTPUT-DIR, matching the folder structure inside of INPUT-DIR.
`.trim();

if (process.argv.length === 3 && ["-h", "--help"].includes(process.argv[2])) {
  console.log(USAGE + "\n\n" + INSTRUCTIONS);
  process.exit(0);
}

if (process.argv.length !== 4) {
  console.error(USAGE);
  process.exit(1);
}

const inputDir = path.resolve(process.cwd(), process.argv[2]);
const outputDir = path.resolve(process.cwd(), process.argv[3]);

function createHash(str: string) {
  return crypto.createHash("sha1").update(str).digest("base64");
}

function readJSONSync(file: string): JSONValue {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/** Traverses an object recursively and generates its TS type. */
function convertToType(x: JSONValue, file: string) {
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
      return createType("unknown[]", file, context, true);
    }

    const typeObject: Type = {};
    for (const key of Object.keys(x).sort()) {
      typeObject[key] = _convertToType(x[key], context + "." + key);
    }

    return createType(typeObject, file, context);
  }

  return _convertToType(x, "root");
}

/**
 * Returns a type alias for the given type. Gives a brand new alias and adds
 * the type to the type cache if the type is new. Alternatively, it reuses
 * a type alias if the matching type already exists in the cache.
 * @param type The type to be aliased.
 * @param file File from which the type originated.
 * @param context Object property path to the given type.
 * @param unique If true, the type won't be reused and will get its own unique type alias.
 * @return Type alias for the given type.
 */
function createType(type: Type, file: string, context: string, unique = false) {
  let hash = createHash(JSON.stringify(type));
  if (!unique && cache.has(hash)) {
    return typeAliasFromId(cache.get(hash)!.id);
  }

  const id = cacheId();

  if (unique) {
    hash += id;
  }

  const typeDeclaration = { id, file, context, type };
  cache.set(hash, typeDeclaration);
  const typeName = typeAliasFromId(id);
  return typeName;
}

/** A cache mapping hashes of types to the types themselves. */
const cache = new Map<string, TypeDeclaration>();
/** Increments the cache id on each call. */
const cacheId = (() => {
  let id = 0;
  return () => id++;
})();

/** Generates a type alias from a given id. */
function typeAliasFromId(id: number) {
  return "T" + id;
}

/** Creates a TS type declaration for a given type. */
function getTypeDeclaration(declaration: TypeDeclaration) {
  const typeName = typeAliasFromId(declaration.id);
  const type = declaration.type;

  if (typeof type !== "object") {
    return `type ${typeName} = C<${type}>;`;
  }
  const result: string[] = [];
  for (const key of Object.keys(type)) {
    result.push(`${key}: ${type[key]};`);
  }
  const declarations = result.join(" ");
  return `type ${typeName} = C<{ ${declarations} }>;`;
}

const inputFiles = glob.sync("**/*.json", { cwd: inputDir });
const exportedTypes = new Set<string>();
let currentFile = 1;

console.log("Parsing JSON files...");
for (const file of inputFiles) {
  const json = readJSONSync(path.resolve(inputDir, file));
  const typeName = convertToType(json, file);
  exportedTypes.add(typeName);

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

  console.log(`Finished file ${currentFile} of ${inputFiles.length}: ${file}`);
  currentFile += 1;
}

console.log(`Creating ${COMMON_FILE}.d.ts file...`);
const output = fs.createWriteStream(
  path.resolve(outputDir, COMMON_FILE + ".d.ts"),
);

// Include a Compute utility which makes resulting types easier to read
// with Intellisense by expanding them fully, instead of leaving
// object properties with cryptic type names.
output.write(`type C<A extends any> = {[K in keyof A]: A[K]} & {};\n\n`);
for (const declaration of cache.values()) {
  const typeDeclaration = getTypeDeclaration(declaration);
  if (exportedTypes.has(typeAliasFromId(declaration.id))) {
    output.write("export ");
  }

  output.write(typeDeclaration);
  output.write(` // ${declaration.file}:${declaration.context}\n`);
}

output.close();
console.log(COMMON_FILE + ".d.ts created successfully.");
