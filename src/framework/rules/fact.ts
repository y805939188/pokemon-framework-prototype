/** Four-state business fact. A value is distinct from checked absence and from a failed observation. */
export type Fact<T> = { readonly status: 'value'; readonly value: T }
  | { readonly status: 'absent' }
  | { readonly status: 'unavailable' | 'invalid'; readonly reason?: string };
