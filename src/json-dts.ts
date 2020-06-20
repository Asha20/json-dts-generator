import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as glob from "glob";
import * as mkdirp from "mkdirp";

type Shape = string | { [key: string]: Shape };
type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };
interface IShape {
  id: number;
  shape: Shape;
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

/**
 * Traverses the object recursively, generating a shape from it
 * and then adding that shape to the cache.
 *
 * @param obj Shape to be added to cache.
 * @return Hash of the given shape.
 **/
function getShapeHash(x: JSONValue) {
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
      const typeOfFirstElement = getTypeNameFromHash(getShapeHash(x[0]));
      return getHash(typeOfFirstElement + "[]");
    }
    return getHash("unknown[]");
  }

  const result: Record<string, Shape> = {};
  for (const key of Object.keys(x).sort()) {
    const hash = getShapeHash(x[key]);
    result[key] = getTypeNameFromHash(hash);
  }

  return getHash(result);
}

function getTypeNameFromHash(hash: string) {
  if (["string", "number", "boolean", "null"].includes(hash)) {
    return hash;
  }

  if (!db.has(hash)) {
    throw new Error(`Could not find type entry for hash ${hash}`);
  }
  return getTypeNameFromId(db.get(hash)!.id);
}

function getTypeNameFromId(id: number) {
  return "T" + id;
}

let id = 0;
/** A cache mapping hashes of shapes to the shapes themselves. */
const db = new Map<string, IShape>();

/**
 * Creates a new entry in the cache for the given shape or
 * returns a hash if such a shape already exists in the cache.
 */
function getHash(shape: Shape) {
  const hash = createHash(JSON.stringify(shape));
  if (db.has(hash)) {
    return hash;
  }

  const shapeInterface = { id: id++, shape };
  db.set(hash, shapeInterface);
  return hash;
}

/** Creates a TS type declaration for a given shape. */
function getTypeDeclaration(typeName: string, shape: Shape) {
  if (typeof shape !== "object") {
    return `type ${typeName} = C<${shape}>;`;
  }
  const result: string[] = [];
  for (const key of Object.keys(shape)) {
    result.push(`${key}: ${shape[key]};`);
  }
  const declarations = result.join(" ");
  return `type ${typeName} = C<{ ${declarations} }>;`;
}

const inputFiles = glob.sync("**/*.json", { cwd: inputDir });
const exportedTypes = new Set<number>();
let currentFile = 1;

console.log("Parsing JSON files...");
for (const file of inputFiles) {
  const hash = getShapeHash(readJSONSync(path.resolve(inputDir, file)));
  exportedTypes.add(db.get(hash)!.id);

  mkdirp.sync(path.resolve(outputDir, path.dirname(file)));
  const outputFile = path.resolve(outputDir, file.replace(".json", ".d.ts"));
  const relativePath = path.relative(path.dirname(outputFile), outputDir);
  const relativeImport = relativePath
    ? path.join(relativePath, COMMON_FILE)
    : "./" + COMMON_FILE;

  const typeName = getTypeNameFromHash(hash);
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
for (const value of db.values()) {
  const typeName = getTypeNameFromId(value.id);
  const typeDeclaration = getTypeDeclaration(typeName, value.shape);
  if (exportedTypes.has(value.id)) {
    output.write("export ");
  }

  output.write(typeDeclaration + "\n");
}

output.close();
console.log(COMMON_FILE + ".d.ts created successfully.");
