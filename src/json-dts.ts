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

function getShape(obj: any) {
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
      const first = getTypeNameFromHash(getShape(obj[0]));
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
      const hash = getShape(value);
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
const db = new Map<string, ShapeInterface>();

function getHash(obj: any) {
  const hash = createHash(JSON.stringify(obj));
  if (db.has(hash)) {
    return hash;
  }

  const shapeInterface = { id: id++, shape: obj };
  db.set(hash, shapeInterface);
  return hash;
}

function stringifyShape(shape: Shape) {
  if (typeof shape !== "object") {
    return shape;
  }
  const result: string[] = [];
  for (const key of Object.keys(shape)) {
    result.push(`${key}: ${shape[key]};`);
  }
  return result.join(" ");
}

const inputFiles = glob.sync("**/*.json", { cwd: inputDir });
const exportedTypes = new Set<number>();
let currentFile = 1;

console.log("Parsing JSON files...");
for (const file of inputFiles) {
  const hash = getShape(readJSONSync(path.resolve(inputDir, file)));
  exportedTypes.add(db.get(hash)!.id);

  mkdirp.sync(path.resolve(outputDir, path.dirname(file)));
  const outputFile = path.resolve(outputDir, file.slice(0, -5) + ".d.ts");
  const relativePath = path.relative(path.dirname(outputFile), outputDir);
  const relativeImport = relativePath
    ? path.join(relativePath, "common")
    : "./common";

  const typeName = getTypeNameFromHash(hash);
  fs.writeFileSync(
    outputFile,
    `export { ${typeName} as default } from "${relativeImport}";`,
  );

  console.log(`Finished file ${currentFile} of ${inputFiles.length}: ${file}`);
  currentFile += 1;
}

console.log("Creating common.d.ts file...");
const output = fs.createWriteStream(path.resolve(outputDir, "common.d.ts"));

output.write(`type C<A extends any> = {[K in keyof A]: A[K]} & {};\n\n`);
for (const value of db.values()) {
  const typeName = getTypeNameFromId(value.id);
  const stringShape = stringifyShape(value.shape);
  if (exportedTypes.has(value.id)) {
    output.write("export ");
  }

  if (typeof value.shape !== "object") {
    output.write(`type ${typeName} = C<${stringShape}>;\n`);
  } else {
    output.write(`type ${typeName} = C<{ ${stringShape} }>;\n`);
  }
}

output.close();
console.log("common.d.ts created successfully.");
