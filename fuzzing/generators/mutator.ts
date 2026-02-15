/**
 * Mutation strategies for string-based fuzzing.
 *
 * Takes a valid ASN.1 input string and applies random mutations
 * to produce inputs that test parser error handling and edge cases.
 */

import { Rng } from './asn1-generator';

/** A mutation function that transforms an input string. */
export type Mutator = (input: string, rng: Rng) => string;

// -- Byte-level mutations --

/** Flip a random bit in a random byte. */
export function bitFlip(input: string, rng: Rng): string {
  if (input.length === 0) return input;
  const pos = rng.int(0, input.length - 1);
  const bit = 1 << rng.int(0, 7);
  const chars = [...input];
  chars[pos] = String.fromCharCode(chars[pos].charCodeAt(0) ^ bit);
  return chars.join('');
}

/** Insert a random byte at a random position. */
export function byteInsert(input: string, rng: Rng): string {
  const pos = rng.int(0, input.length);
  const byte = String.fromCharCode(rng.int(0, 127));
  return input.slice(0, pos) + byte + input.slice(pos);
}

/** Delete a random byte. */
export function byteDelete(input: string, rng: Rng): string {
  if (input.length === 0) return input;
  const pos = rng.int(0, input.length - 1);
  return input.slice(0, pos) + input.slice(pos + 1);
}

/** Replace a random byte with another. */
export function byteReplace(input: string, rng: Rng): string {
  if (input.length === 0) return input;
  const pos = rng.int(0, input.length - 1);
  const byte = String.fromCharCode(rng.int(0, 127));
  return input.slice(0, pos) + byte + input.slice(pos + 1);
}

/** Insert a block of repeated bytes. */
export function blockInsert(input: string, rng: Rng): string {
  const pos = rng.int(0, input.length);
  const len = rng.int(1, 20);
  const byte = String.fromCharCode(rng.int(32, 126));
  return input.slice(0, pos) + byte.repeat(len) + input.slice(pos);
}

// -- Token-level mutations --

const ASN1_KEYWORDS = [
  'BOOLEAN', 'NULL', 'INTEGER', 'BIT', 'STRING', 'OCTET', 'OBJECT', 'IDENTIFIER',
  'SEQUENCE', 'OF', 'CHOICE', 'ENUMERATED', 'OPTIONAL', 'DEFAULT',
  'BEGIN', 'END', 'DEFINITIONS', 'SIZE', 'TRUE', 'FALSE',
  'AUTOMATIC', 'EXPLICIT', 'IMPLICIT', 'TAGS',
  'IA5String', 'VisibleString', 'UTF8String',
  'MIN', 'MAX',
];

/** Replace a random keyword with another keyword. */
export function keywordSwap(input: string, rng: Rng): string {
  const present = ASN1_KEYWORDS.filter(k => input.includes(k));
  if (present.length === 0) return input;
  const target = rng.pick(present);
  const replacement = rng.pick(ASN1_KEYWORDS);
  const idx = input.indexOf(target);
  return input.slice(0, idx) + replacement + input.slice(idx + target.length);
}

/** Double a random keyword occurrence. */
export function keywordDouble(input: string, rng: Rng): string {
  const present = ASN1_KEYWORDS.filter(k => input.includes(k));
  if (present.length === 0) return input;
  const target = rng.pick(present);
  const idx = input.indexOf(target);
  return input.slice(0, idx) + target + ' ' + target + input.slice(idx + target.length);
}

/** Remove a random keyword. */
export function keywordRemove(input: string, rng: Rng): string {
  const present = ASN1_KEYWORDS.filter(k => input.includes(k));
  if (present.length === 0) return input;
  const target = rng.pick(present);
  const idx = input.indexOf(target);
  return input.slice(0, idx) + input.slice(idx + target.length);
}

// -- Number boundary mutations --

const BOUNDARY_NUMBERS = [
  '0', '-1', '1', '127', '128', '255', '256', '32767', '32768',
  '65535', '65536', '2147483647', '-2147483648', '4294967295',
  '999999999999', '-999999999999',
];

/** Replace a number in the input with a boundary value. */
export function numberBoundary(input: string, rng: Rng): string {
  const matches = [...input.matchAll(/-?\d+/g)];
  if (matches.length === 0) return input;
  const match = rng.pick(matches);
  const replacement = rng.pick(BOUNDARY_NUMBERS);
  const idx = match.index!;
  return input.slice(0, idx) + replacement + input.slice(idx + match[0].length);
}

// -- Structural mutations --

/** Remove a random delimiter character ({, }, (, ), ,). */
export function removeDelimiter(input: string, rng: Rng): string {
  const delimiters = ['{', '}', '(', ')', ','];
  const positions: number[] = [];
  for (let i = 0; i < input.length; i++) {
    if (delimiters.includes(input[i])) {
      positions.push(i);
    }
  }
  if (positions.length === 0) return input;
  const pos = rng.pick(positions);
  return input.slice(0, pos) + input.slice(pos + 1);
}

/** Insert a random delimiter at a random position. */
export function insertDelimiter(input: string, rng: Rng): string {
  const delimiters = ['{', '}', '(', ')', ',', '::=', '...'];
  const pos = rng.int(0, input.length);
  return input.slice(0, pos) + rng.pick(delimiters) + input.slice(pos);
}

/** Inject an extension marker (...) at a random position within braces. */
export function injectExtensionMarker(input: string, rng: Rng): string {
  const bracePositions: number[] = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] === ',') bracePositions.push(i);
  }
  if (bracePositions.length === 0) return input;
  const pos = rng.pick(bracePositions);
  return input.slice(0, pos) + ', ...' + input.slice(pos);
}

/** Duplicate a random line. */
export function duplicateLine(input: string, rng: Rng): string {
  const lines = input.split('\n');
  if (lines.length === 0) return input;
  const idx = rng.int(0, lines.length - 1);
  lines.splice(idx, 0, lines[idx]);
  return lines.join('\n');
}

/** Shuffle lines within BEGIN..END block. */
export function shuffleAssignments(input: string, rng: Rng): string {
  const beginIdx = input.indexOf('BEGIN');
  const endIdx = input.lastIndexOf('END');
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return input;

  const before = input.slice(0, beginIdx + 5);
  const middle = input.slice(beginIdx + 5, endIdx);
  const after = input.slice(endIdx);

  const lines = middle.split('\n');
  // Fisher-Yates shuffle
  for (let i = lines.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }

  return before + lines.join('\n') + after;
}

/** Truncate the input at a random position. */
export function truncate(input: string, rng: Rng): string {
  if (input.length <= 1) return input;
  const pos = rng.int(1, input.length - 1);
  return input.slice(0, pos);
}

/** Insert null bytes. */
export function insertNullBytes(input: string, rng: Rng): string {
  const pos = rng.int(0, input.length);
  const count = rng.int(1, 5);
  return input.slice(0, pos) + '\0'.repeat(count) + input.slice(pos);
}

/** Replace content with a longer string (capped to avoid PEG backtracking hangs). */
export function amplifySize(input: string, rng: Rng): string {
  // Find an identifier and replace it with a longer one
  const match = input.match(/[a-z][A-Za-z0-9-]*/);
  if (!match) return input;
  const repeatCount = rng.int(2, 10);
  const longName = match[0].repeat(repeatCount);
  const idx = match.index!;
  return input.slice(0, idx) + longName + input.slice(idx + match[0].length);
}

/** Add unicode/non-ASCII characters. */
export function insertUnicode(input: string, rng: Rng): string {
  const pos = rng.int(0, input.length);
  const unicodeChars = ['🎉', '™', '©', '€', '£', '¥', '§', '¶', 'ñ', 'ü', 'ö', 'à', '中', '日'];
  return input.slice(0, pos) + rng.pick(unicodeChars) + input.slice(pos);
}

// -- Composite mutations --

/** All available mutators. */
export const MUTATORS: Mutator[] = [
  bitFlip,
  byteInsert,
  byteDelete,
  byteReplace,
  blockInsert,
  keywordSwap,
  keywordDouble,
  keywordRemove,
  numberBoundary,
  removeDelimiter,
  insertDelimiter,
  injectExtensionMarker,
  duplicateLine,
  shuffleAssignments,
  truncate,
  insertNullBytes,
  amplifySize,
  insertUnicode,
];

/**
 * Apply 1-N random mutations to an input string.
 * @param input - The seed input string
 * @param rng - Random number generator
 * @param count - Number of mutations to apply (default: 1-3)
 */
export function mutate(input: string, rng: Rng, count?: number): string {
  const n = count ?? rng.int(1, 3);
  let result = input;
  for (let i = 0; i < n; i++) {
    const mutator = rng.pick(MUTATORS);
    result = mutator(result, rng);
  }
  return result;
}
