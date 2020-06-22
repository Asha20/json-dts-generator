import * as crypto from "crypto";

type Type = string | { [key: string]: Type };
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export interface TypeDeclaration {
  id: number;
  contexts: string[];
  type: Type;
}

export interface Cache {
  map: Map<string, TypeDeclaration>;
  id(): number;
}

const identifierRegex = /^[$_a-z][$_a-z0-9]*$/i;

export function createHash(type: Type) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(type))
    .digest("base64");
}

/** Traverses an object recursively and generates its TS type. */
export function convertToType(cache: Cache, x: JSONValue, file?: string) {
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

export function createCache(): Cache {
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
export function typeAlias(id: number) {
  return "T" + id;
}

/** Creates a TS type declaration for a given type. */
export function getTypeDeclaration(declaration: TypeDeclaration) {
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
