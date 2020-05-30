import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as glob from "glob";
import * as mkdirp from "mkdirp";

type Shape = string | { [key: string]: Shape };
interface ShapeInterface {
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

function readJSONSync(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/**
 * Traverses the object recursively, generating a shape from it
 * and then adding that shape to the cache.
 *
 * @param obj Shape to be added to cache.
 * @return Hash of the given shape.
 **/
function getShapeHash(obj: any) {
  if (typeof obj === "string") {
    return getHash("string");
  }
  if (typeof obj === "number") {
    return getHash("number");
  }
  if (typeof obj === "boolean") {
    return getHash("boolean");
  }
  if (obj === null) {
    return getHash("null");
  }
  if (Array.isArray(obj)) {
    if (obj.length) {
      const first = getTypeNameFromHash(getShapeHash(obj[0]));
      return getHash(first + "[]");
    }
    return getHash("unknown[]");
  }

  const result: Record<string, Shape> = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    if (typeof value === "string") {
      result[key] = "string";
    } else if (typeof value === "number") {
      result[key] = "number";
    } else if (typeof value === "boolean") {
      result[key] = "boolean";
    } else if (value === null) {
      result[key] = "null";
    } else if (typeof value === "object") {
      const hash = getShapeHash(value);
      result[key] = getTypeNameFromHash(hash);
    } else {
      throw new Error("Unhandled value: " + value);
    }
  }

  return getHash(result);
}

function getTypeNameFromHash(hash: string) {
  return getTypeNameFromId(db.get(hash)!.id);
}

function getTypeNameFromId(id: number) {
  return "T" + id;
}

let id = 0;
/** A cache mapping hashes of shapes to the shapes themselves. */
const db = new Map<string, ShapeInterface>();

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
    return `type ${typeName} = C<${shape}>;\n`;
  }
  const result: string[] = [];
  for (const key of Object.keys(shape)) {
    result.push(`${key}: ${shape[key]};`);
  }
  const declarations = result.join(" ");
  return `type ${typeName} = C<{ ${declarations} }>;\n`;
}

const inputFiles = glob.sync("**/*.json", { cwd: inputDir });
const exportedTypes = new Set<number>();
let currentFile = 1;

console.log("Parsing JSON files...");
for (const file of inputFiles) {
  const hash = getShapeHash(readJSONSync(path.resolve(inputDir, file)));
  exportedTypes.add(db.get(hash)!.id);

  mkdirp.sync(path.resolve(outputDir, path.dirname(file)));
  const outputFile = path.resolve(outputDir, file.slice(0, -5) + ".d.ts");
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

  output.write(typeDeclaration);
}

output.close();
console.log(COMMON_FILE + ".d.ts created successfully.");
