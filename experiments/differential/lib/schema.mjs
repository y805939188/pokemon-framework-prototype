import { canonicalStringify } from "./json.mjs";

const types = new Set(["null", "boolean", "object", "array", "number", "integer", "string"]);
const pathChild = (path, key) => `${path}.${key}`;
const equal = (a, b) => canonicalStringify(a) === canonicalStringify(b);

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isSafeInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  return false;
}

/**
 * Deliberately small, executable JSON Schema subset used by the closed protocol.
 * Unsupported validation keywords fail schema loading instead of being ignored.
 */
export function validateSchema(schema, value, root = schema) {
  const errors = [];
  const supported = new Set([
    "$schema", "$id", "$defs", "definitions", "$ref", "title", "description",
    "type", "const", "enum", "properties", "required", "additionalProperties",
    "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength",
    "pattern", "minimum", "maximum", "oneOf", "anyOf", "allOf", "if", "then", "else",
    "minProperties", "maxProperties"
  ]);

  function assertSchemaKeywords(node) {
    if (typeof node === "boolean" || node === null || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (!supported.has(key)) throw new Error(`UNSUPPORTED_SCHEMA_KEYWORD:${key}`);
    }
  }

  function resolveRef(ref) {
    if (!ref.startsWith("#/")) throw new Error("ONLY_LOCAL_SCHEMA_REFS");
    let target = root;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      if (!Object.hasOwn(target, key)) throw new Error("UNRESOLVED_SCHEMA_REF");
      target = target[key];
    }
    return target;
  }

  function visit(node, data, path, schemaPath) {
    if (node === true) return true;
    if (node === false) {
      errors.push({ code: "SCHEMA_FALSE", path, schemaPath });
      return false;
    }
    assertSchemaKeywords(node);
    if (node.$ref !== undefined) return visit(resolveRef(node.$ref), data, path, node.$ref);

    let valid = true;
    const reject = (code) => {
      errors.push({ code, path, schemaPath });
      valid = false;
    };
    if (node.allOf) for (let i = 0; i < node.allOf.length; i++) {
      if (!visit(node.allOf[i], data, path, `${schemaPath}/allOf/${i}`)) valid = false;
    }
    if (node.anyOf) {
      const passed = node.anyOf.some((branch) => {
        const trial = validateSchema(branch, data, root);
        return trial.valid;
      });
      if (!passed) reject("SCHEMA_ANY_OF");
    }
    if (node.oneOf) {
      const count = node.oneOf.filter((branch) => validateSchema(branch, data, root).valid).length;
      if (count !== 1) reject("SCHEMA_ONE_OF");
    }
    if (node.if) {
      const condition = validateSchema(node.if, data, root).valid;
      if (condition && node.then && !visit(node.then, data, path, `${schemaPath}/then`)) valid = false;
      if (!condition && node.else && !visit(node.else, data, path, `${schemaPath}/else`)) valid = false;
    }
    if (node.const !== undefined && !equal(data, node.const)) reject("SCHEMA_CONST");
    if (node.enum && !node.enum.some((candidate) => equal(data, candidate))) reject("SCHEMA_ENUM");
    if (node.type) {
      const allowed = Array.isArray(node.type) ? node.type : [node.type];
      for (const type of allowed) if (!types.has(type)) throw new Error(`UNKNOWN_SCHEMA_TYPE:${type}`);
      if (!allowed.some((type) => matchesType(data, type))) {
        reject("SCHEMA_TYPE");
        return false;
      }
    }
    if (typeof data === "string") {
      if (node.minLength !== undefined && [...data].length < node.minLength) reject("SCHEMA_MIN_LENGTH");
      if (node.maxLength !== undefined && [...data].length > node.maxLength) reject("SCHEMA_MAX_LENGTH");
      if (node.pattern && !(new RegExp(node.pattern, "u").test(data))) reject("SCHEMA_PATTERN");
    }
    if (typeof data === "number") {
      if (node.minimum !== undefined && data < node.minimum) reject("SCHEMA_MINIMUM");
      if (node.maximum !== undefined && data > node.maximum) reject("SCHEMA_MAXIMUM");
    }
    if (Array.isArray(data)) {
      if (node.minItems !== undefined && data.length < node.minItems) reject("SCHEMA_MIN_ITEMS");
      if (node.maxItems !== undefined && data.length > node.maxItems) reject("SCHEMA_MAX_ITEMS");
      if (node.uniqueItems) {
        const encoded = data.map(canonicalStringify);
        if (new Set(encoded).size !== encoded.length) reject("SCHEMA_UNIQUE_ITEMS");
      }
      if (node.items) data.forEach((item, index) => {
        if (!visit(node.items, item, `${path}[${index}]`, `${schemaPath}/items`)) valid = false;
      });
    }
    if (data !== null && typeof data === "object" && !Array.isArray(data)) {
      const properties = node.properties ?? {};
      const keys = Object.keys(data);
      if (node.minProperties !== undefined && keys.length < node.minProperties) reject("SCHEMA_MIN_PROPERTIES");
      if (node.maxProperties !== undefined && keys.length > node.maxProperties) reject("SCHEMA_MAX_PROPERTIES");
      for (const key of node.required ?? []) if (!Object.hasOwn(data, key)) reject(`SCHEMA_REQUIRED:${key}`);
      for (const key of keys) {
        if (Object.hasOwn(properties, key)) {
          if (!visit(properties[key], data[key], pathChild(path, key), `${schemaPath}/properties/${key}`)) valid = false;
        } else if (node.additionalProperties === false) {
          reject(`SCHEMA_ADDITIONAL_PROPERTY:${key}`);
        } else if (node.additionalProperties && typeof node.additionalProperties === "object") {
          if (!visit(node.additionalProperties, data[key], pathChild(path, key), `${schemaPath}/additionalProperties`)) valid = false;
        }
      }
    }
    return valid;
  }

  const valid = visit(schema, value, "$", "#");
  return { valid, errors: valid ? [] : errors.slice(0, 50) };
}

export function assertSchema(schema, value, label = "schema") {
  const result = validateSchema(schema, value);
  if (!result.valid) {
    const error = new Error(`${label}_SCHEMA_REJECTED`);
    error.code = `${label}_SCHEMA_REJECTED`;
    error.details = result.errors;
    throw error;
  }
  return value;
}
