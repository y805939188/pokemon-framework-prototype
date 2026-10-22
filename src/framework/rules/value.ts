/** Plain-data copy shared by rules, without depending on the state/write-back module. */
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
