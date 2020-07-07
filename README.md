# json-dts-generator

Generate TS declaration files from JSON files. Suitable for both small and large datasets.

## Usage

Install it globally:

```
$ npm i -g json-dts-generator
$ json-dts-generator INPUT-DIR OUTPUT-DIR
```

Or use `npx`:

```
$ npx json-dts-generator INPUT-DIR OUTPUT-DIR
```

## Purpose

Reads all JSON files inside INPUT-DIR (including those in subdirectories), parses each into a TS declaration file with matching name and places those into OUTPUT-DIR, matching the folder structure inside of INPUT-DIR.

Let's say we have the following folder structure:

```
data/
├── person.json
└── transaction.json
```

And file contents look like this:

### `person.json`

```json
{
  "name": "Jane",
  "age": 27
}
```

### `transaction.json`

```json
{
  "from": {
    "name": "Bob",
    "age": 30
  },
  "to": {
    "name": "Mark",
    "age": 34
  },
  "amount": 100
}
```

Running the command:

```
$ npx json-dts-generator data output
```

Will generate the following folder structure:

```
output/
├── _common.d.ts
├── person.d.ts
└── transaction.d.ts
```

The file `person.d.ts` will default export the type of `person.json`, while `transaction.d.ts` will do the same for `transaction.json`.

The `_common.d.ts` is a special file that holds all of the types generated from the input files. All of the other output files simply re-export the appropriate type from `_common.d.ts`.

The script processes the input folder (including subfolders) and generates a matching folder structure in the output.

## Advantages

- Reuses same type declarations across different JSON files to avoid declaring the same type more than once. This makes it suitable for processing large datasets of thousands of JSON files.
- Type declarations are readable and Intellisense-friendly, using primitives instead of cryptic type aliases.
- Every generated type declaration inside `_common.d.ts` has additional context telling you where the type is used to make debugging easier if manual change is required.

## Pitfalls

- Cannot infer proper types for empty arrays. The script will warn you if it runs into any of these so that you can fix them manually.