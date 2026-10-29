import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export class JsonProtocolError extends Error {
  constructor(code, path = "$") {
    super(code);
    this.name = "JsonProtocolError";
    this.code = code;
    this.path = path;
  }
}

const fail = (code, path = "$") => { throw new JsonProtocolError(code, path); };
const isPlainObject = (value) => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Reject every JavaScript value that JSON.stringify would lose, coerce or invoke. */
export function assertJsonValue(value, path = "$", ancestors = new Set(), depth = 0) {
  if (depth > 128) fail("JSON_DEPTH_LIMIT", path);
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
      fail("JSON_LONE_SURROGATE", path);
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("JSON_NON_FINITE", path);
    if (Object.is(value, -0)) fail("JSON_NEGATIVE_ZERO", path);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) fail("JSON_UNSAFE_INTEGER", path);
    return;
  }
  if (typeof value === "undefined") fail("JSON_UNDEFINED", path);
  if (typeof value === "bigint") fail("JSON_BIGINT", path);
  if (typeof value === "function") fail("JSON_FUNCTION", path);
  if (typeof value === "symbol") fail("JSON_SYMBOL", path);
  if (typeof value !== "object") fail("JSON_UNSUPPORTED_TYPE", path);
  if (ancestors.has(value)) fail("JSON_CYCLE", path);
  if (!Array.isArray(value) && !isPlainObject(value)) fail("JSON_NON_PLAIN_OBJECT", path);

  ancestors.add(value);
  if (Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Array.prototype) fail("JSON_ARRAY_PROTOTYPE", path);
    for (let current = prototype; current !== null; current = Object.getPrototypeOf(current)) {
      if (Object.hasOwn(current, "toJSON")) fail("JSON_SERIALIZATION_HOOK", path);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || !Number.isSafeInteger(Number(key)) || Number(key) >= 4294967295 || String(Number(key)) !== key) {
        fail("JSON_ARRAY_PROPERTY", path);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      // Reject accessors before reading any index; JSON.stringify must never invoke a getter or drop an own property.
      if (!descriptor?.enumerable || !("value" in descriptor)) fail("JSON_NON_DATA_PROPERTY", path);
    }
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) fail("JSON_SPARSE_ARRAY", `${path}[${index}]`);
      assertJsonValue(value[index], `${path}[${index}]`, ancestors, depth + 1);
    }
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") fail("JSON_SYMBOL_KEY", path);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) fail("JSON_NON_DATA_PROPERTY", path);
      assertJsonValue(descriptor.value, `${path}.${key}`, ancestors, depth + 1);
    }
  }
  ancestors.delete(value);
}

export function canonicalize(value) {
  assertJsonValue(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function strictStringify(value, pretty = false) {
  assertJsonValue(value);
  return JSON.stringify(value, null, pretty ? 2 : undefined);
}

export function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function sha256Json(value) {
  return sha256Text(canonicalStringify(value));
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Parse exactly one JSON text. No prefix/suffix logging, duplicate object keys,
 * non-finite numbers or lossy integer coercion is accepted.
 */
export function parseJson(text) {
  if (typeof text !== "string") fail("JSON_TEXT_REQUIRED");
  if (text.length === 0 || !text.trim()) fail("JSON_EMPTY");
  let index = 0;
  const whitespace = () => { while (/\s/.test(text[index] ?? "")) index++; };
  const error = (code) => fail(code);
  const parseString = () => {
    const start = index;
    if (text[index] !== '"') error("JSON_STRING_EXPECTED");
    index++;
    let escaped = false;
    while (index < text.length) {
      const char = text[index];
      if (!escaped && char === '"') {
        index++;
        const token = text.slice(start, index);
        try { return JSON.parse(token); } catch { error("JSON_INVALID_STRING"); }
      }
      if (!escaped && char === "\\") escaped = true;
      else {
        if (!escaped && char.charCodeAt(0) <= 0x1f) error("JSON_CONTROL_CHARACTER");
        escaped = false;
      }
      index++;
    }
    error("JSON_UNTERMINATED_STRING");
  };
  const parseValue = (depth) => {
    if (depth > 128) error("JSON_DEPTH_LIMIT");
    whitespace();
    const char = text[index];
    if (char === '"') return parseString();
    if (char === "{") {
      index++;
      const result = {};
      const keys = new Set();
      whitespace();
      if (text[index] === "}") { index++; return result; }
      while (index < text.length) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) error("JSON_DUPLICATE_KEY");
        keys.add(key);
        whitespace();
        if (text[index] !== ":") error("JSON_COLON_EXPECTED");
        index++;
        Object.defineProperty(result, key, { value: parseValue(depth + 1), enumerable: true, configurable: true, writable: true });
        whitespace();
        if (text[index] === "}") { index++; return result; }
        if (text[index] !== ",") error("JSON_COMMA_EXPECTED");
        index++;
      }
      error("JSON_UNTERMINATED_OBJECT");
    }
    if (char === "[") {
      index++;
      const result = [];
      whitespace();
      if (text[index] === "]") { index++; return result; }
      while (index < text.length) {
        result.push(parseValue(depth + 1));
        whitespace();
        if (text[index] === "]") { index++; return result; }
        if (text[index] !== ",") error("JSON_COMMA_EXPECTED");
        index++;
      }
      error("JSON_UNTERMINATED_ARRAY");
    }
    if (text.startsWith("true", index)) { index += 4; return true; }
    if (text.startsWith("false", index)) { index += 5; return false; }
    if (text.startsWith("null", index)) { index += 4; return null; }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(index));
    if (match) {
      index += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) error("JSON_NON_FINITE");
      if (Object.is(value, -0)) error("JSON_NEGATIVE_ZERO");
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) error("JSON_UNSAFE_INTEGER");
      return value;
    }
    error("JSON_VALUE_EXPECTED");
  };
  const value = parseValue(0);
  whitespace();
  if (index !== text.length) error("JSON_TRAILING_CONTENT");
  assertJsonValue(value);
  return value;
}

export function readJson(path, maxBytes = 16 * 1024 * 1024) {
  const text = readFileSync(path, "utf8");
  if (Buffer.byteLength(text, "utf8") > maxBytes) fail("JSON_INPUT_TOO_LARGE");
  return parseJson(text);
}
