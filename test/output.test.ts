import { TypeDeclaration, Type } from "../src/core";
import { typeDeclaration, relativeReExport, commonDTS } from "../src/output";

describe("typeDeclaration()", () => {
  const declaration = (
    id: number,
    type: Type,
    contexts: string[] = [],
  ): TypeDeclaration => ({ id, type, contexts });

  test("non-object type", () => {
    const input = declaration(0, "string");
    expect(typeDeclaration(input)).toBe("type T0 = string;");
  });

  test("object type", () => {
    const input = declaration(0, { a: "string" });
    expect(typeDeclaration(input)).toBe("type T0 = { a: string; };");
  });

  test("exported type", () => {
    const input = declaration(0, "string");
    expect(typeDeclaration(input, { exported: true })).toBe(
      "export type T0 = string;",
    );
  });

  test("computed type", () => {
    const input = declaration(0, "string");
    expect(typeDeclaration(input, { computed: true })).toBe(
      "type T0 = C<string>;",
    );
  });

  test("with context", () => {
    const input = declaration(0, "string", ["foo", "bar"]);
    expect(typeDeclaration(input, { includeContexts: true })).toBe(
      "type T0 = string; // foo, bar",
    );
  });

  test("all together", () => {
    const input = declaration(0, { foo: "number", bar: "string" }, ["root"]);
    expect(
      typeDeclaration(input, {
        exported: true,
        computed: true,
        includeContexts: true,
      }),
    ).toBe("export type T0 = C<{ foo: number; bar: string; }>; // root");
  });
});

describe("relativeReExport()", () => {
  test("same-level input", () => {
    const result = relativeReExport("T1", "output", "input.json", "common");
    expect(result).toBe(`export { T1 as default } from "./common";`);
  });

  test("input from subfolder", () => {
    const result = relativeReExport("T1", "output", "foo/input.json", "common");
    expect(result).toBe(`export { T1 as default } from "../common";`);
  });
});

describe("commonDTS()", () => {
  test("compute helper", () => {
    const result = commonDTS([], new Set(), { computed: true });
    expect([...result][0]).toContain(
      "type C<A extends any> = {[K in keyof A]: A[K]} & {};",
    );
  });

  test("exported and non-exported types", () => {
    const result = commonDTS(
      [
        { id: 0, type: "string", contexts: [] },
        { id: 1, type: "number", contexts: [] },
      ],
      new Set(["T0"]),
    );

    expect([...result]).toEqual([
      "export type T0 = string;\n",
      "type T1 = number;\n",
    ]);
  });
});
