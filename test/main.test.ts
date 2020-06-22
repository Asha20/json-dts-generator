import { createCache, createHash, convertToType } from "../src/core";

describe("convertToType()", () => {
  const map = (obj: object) => new Map(Object.entries(obj));

  test("string", () => {
    const result = convertToType(createCache(), "foo");
    expect(result.type).toBe("string");
    expect(result.cache.map.size).toBe(0);
  });

  test("number", () => {
    const result = convertToType(createCache(), 2);
    expect(result.type).toBe("number");
    expect(result.cache.map.size).toBe(0);
  });

  test("boolean", () => {
    const result = convertToType(createCache(), true);
    expect(result.type).toBe("boolean");
    expect(result.cache.map.size).toBe(0);
  });

  test("null", () => {
    const result = convertToType(createCache(), null);
    expect(result.type).toBe("null");
    expect(result.cache.map.size).toBe(0);
  });

  test("array of primitives", () => {
    const result = convertToType(createCache(), [1, 2, 3]);
    expect(result.type).toBe("number[]");
    expect(result.cache.map.size).toBe(0);
  });

  test("empty array", () => {
    const result = convertToType(createCache(), []);
    expect(result.type).toBe("T0");
    expect(result.cache.map).toEqual(
      map({
        [createHash("unknown[]") + "0"]: {
          id: 0,
          type: "unknown[]",
          contexts: ["root"],
        },
      }),
    );
  });

  test("flat object", () => {
    const input = { foo: "bar", num: 3 };
    const result = convertToType(createCache(), input);
    const expectedType = { foo: "string", num: "number" };

    expect(result.type).toBe("T0");
    expect(result.cache.map).toEqual(
      map({
        [createHash(expectedType)]: {
          id: 0,
          type: expectedType,
          contexts: ["root"],
        },
      }),
    );
  });

  test("nested object", () => {
    const input = { foo: { bar: 3 } };
    const result = convertToType(createCache(), input);
    expect(result.type).toBe("T1");
    expect(result.cache.map).toEqual(
      map({
        [createHash({ bar: "number" })]: {
          id: 0,
          type: { bar: "number" },
          contexts: ["root.foo"],
        },

        [createHash({ foo: "T0" })]: {
          id: 1,
          type: { foo: "T0" },
          contexts: ["root"],
        },
      }),
    );
  });

  test("unknown arrays should be unique", () => {
    const input = { one: [], two: [] };
    const result = convertToType(createCache(), input);
    expect(result.type).toBe("T2");
    expect(result.cache.map).toEqual(
      map({
        [createHash("unknown[]") + "0"]: {
          id: 0,
          type: "unknown[]",
          contexts: ["root.one"],
        },

        [createHash("unknown[]") + "1"]: {
          id: 1,
          type: "unknown[]",
          contexts: ["root.two"],
        },

        [createHash({ one: "T0", two: "T1" })]: {
          id: 2,
          type: { one: "T0", two: "T1" },
          contexts: ["root"],
        },
      }),
    );
  });
});
