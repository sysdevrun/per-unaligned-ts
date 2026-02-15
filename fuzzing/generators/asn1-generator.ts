/**
 * Grammar-aware random ASN.1 module generator.
 *
 * Produces structurally plausible ASN.1 module text by following
 * the grammar structure with randomized choices at each production.
 */

/** PRNG with seedable state for reproducible fuzzing. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    // xorshift32
    this.state ^= this.state << 13;
    this.state ^= this.state >> 17;
    this.state ^= this.state << 5;
    return (this.state >>> 0) / 0x100000000;
  }

  /** Returns an integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns a random element from an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Returns true with the given probability. */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

export interface GeneratorOptions {
  /** Maximum nesting depth for types (default: 4). */
  maxDepth?: number;
  /** Maximum number of type assignments per module (default: 8). */
  maxAssignments?: number;
  /** Maximum fields per SEQUENCE (default: 6). */
  maxFields?: number;
  /** Maximum alternatives per CHOICE (default: 5). */
  maxAlternatives?: number;
  /** Maximum enum values (default: 8). */
  maxEnumValues?: number;
  /** Probability of generating a type reference instead of inline type (default: 0.3). */
  refProbability?: number;
  /** Probability of adding extension markers (default: 0.3). */
  extensionProbability?: number;
  /** Probability of adding constraints (default: 0.5). */
  constraintProbability?: number;
}

const DEFAULTS: Required<GeneratorOptions> = {
  maxDepth: 4,
  maxAssignments: 8,
  maxFields: 6,
  maxAlternatives: 5,
  maxEnumValues: 8,
  refProbability: 0.3,
  extensionProbability: 0.3,
  constraintProbability: 0.5,
};

const TAG_MODES = ['AUTOMATIC TAGS', 'EXPLICIT TAGS', 'IMPLICIT TAGS'] as const;

const UPPER_NAMES = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
  'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi',
  'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
];

const LOWER_NAMES = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
];

export class Asn1Generator {
  private rng: Rng;
  private opts: Required<GeneratorOptions>;
  private definedTypes: string[] = [];

  constructor(seed: number, options?: GeneratorOptions) {
    this.rng = new Rng(seed);
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Generate a complete ASN.1 module string. */
  generateModule(): string {
    this.definedTypes = [];
    const moduleName = this.typeName();
    const tagMode = this.rng.chance(0.5) ? ` ${this.rng.pick(TAG_MODES)}` : '';
    const numAssignments = this.rng.int(1, this.opts.maxAssignments);

    const assignments: string[] = [];
    for (let i = 0; i < numAssignments; i++) {
      const name = this.uniqueTypeName();
      this.definedTypes.push(name);
      assignments.push(`  ${name} ::= ${this.generateType(0)}`);
    }

    return `${moduleName} DEFINITIONS${tagMode} ::= BEGIN\n${assignments.join('\n\n')}\nEND\n`;
  }

  /** Generate a random type expression. */
  private generateType(depth: number): string {
    // At max depth, only generate leaf types
    if (depth >= this.opts.maxDepth) {
      return this.generateLeafType();
    }

    // Maybe generate a type reference
    if (this.definedTypes.length > 0 && this.rng.chance(this.opts.refProbability)) {
      return this.rng.pick(this.definedTypes);
    }

    const typeChoices = [
      () => this.generateLeafType(),
      () => this.generateSequence(depth),
      () => this.generateSequenceOf(depth),
      () => this.generateChoice(depth),
      () => this.generateEnumerated(),
    ];

    // Weight leaf types more heavily at deeper nesting
    const leafWeight = Math.min(0.7, 0.3 + depth * 0.15);
    if (this.rng.chance(leafWeight)) {
      return this.generateLeafType();
    }

    return this.rng.pick(typeChoices.slice(1))();
  }

  /** Generate a primitive (leaf) type, optionally with constraints. */
  private generateLeafType(): string {
    const leafGenerators = [
      () => 'BOOLEAN',
      () => 'NULL',
      () => this.generateInteger(),
      () => this.generateBitString(),
      () => this.generateOctetString(),
      () => 'OBJECT IDENTIFIER',
      () => this.generateCharString('IA5String'),
      () => this.generateCharString('VisibleString'),
      () => this.generateCharString('UTF8String'),
    ];

    return this.rng.pick(leafGenerators)();
  }

  private generateInteger(): string {
    if (!this.rng.chance(this.opts.constraintProbability)) {
      return 'INTEGER';
    }
    const min = this.rng.int(-1000, 0);
    const max = this.rng.int(min, min + this.rng.int(1, 100000));
    const ext = this.rng.chance(this.opts.extensionProbability) ? ', ...' : '';
    return `INTEGER (${min}..${max}${ext})`;
  }

  private generateBitString(): string {
    if (!this.rng.chance(this.opts.constraintProbability)) {
      return 'BIT STRING';
    }
    return `BIT STRING ${this.sizeConstraint()}`;
  }

  private generateOctetString(): string {
    if (!this.rng.chance(this.opts.constraintProbability)) {
      return 'OCTET STRING';
    }
    return `OCTET STRING ${this.sizeConstraint()}`;
  }

  private generateCharString(charType: string): string {
    if (!this.rng.chance(this.opts.constraintProbability)) {
      return charType;
    }
    return `${charType} ${this.sizeConstraint()}`;
  }

  private sizeConstraint(): string {
    if (this.rng.chance(0.3)) {
      // Fixed size
      const size = this.rng.int(1, 100);
      const ext = this.rng.chance(this.opts.extensionProbability) ? ', ...' : '';
      return `(SIZE (${size}${ext}))`;
    }
    const min = this.rng.int(0, 50);
    const max = this.rng.int(min + 1, min + this.rng.int(1, 1000));
    const ext = this.rng.chance(this.opts.extensionProbability) ? ', ...' : '';
    return `(SIZE (${min}..${max}${ext}))`;
  }

  private generateSequence(depth: number): string {
    const numFields = this.rng.int(1, this.opts.maxFields);
    const usedNames = new Set<string>();
    const fields: string[] = [];

    for (let i = 0; i < numFields; i++) {
      const fieldName = this.uniqueFieldName(usedNames);
      usedNames.add(fieldName);
      const fieldType = this.generateType(depth + 1);
      let modifier = '';
      if (this.rng.chance(0.2)) {
        modifier = ' OPTIONAL';
      } else if (this.rng.chance(0.1)) {
        modifier = ` DEFAULT ${this.generateDefaultValue(fieldType)}`;
      }
      fields.push(`    ${fieldName} ${fieldType}${modifier}`);
    }

    // Maybe add extension marker
    if (this.rng.chance(this.opts.extensionProbability)) {
      const extPos = this.rng.int(1, fields.length);
      const extFields: string[] = [];
      if (this.rng.chance(0.5)) {
        // Add extension fields after the marker
        const numExt = this.rng.int(1, 3);
        for (let i = 0; i < numExt; i++) {
          const fn = this.uniqueFieldName(usedNames);
          usedNames.add(fn);
          const ft = this.generateType(depth + 1);
          const opt = this.rng.chance(0.5) ? ' OPTIONAL' : '';
          extFields.push(`    ${fn} ${ft}${opt}`);
        }
      }
      fields.splice(extPos, 0, '    ...', ...extFields);
    }

    return `SEQUENCE {\n${fields.join(',\n')}\n  }`;
  }

  private generateSequenceOf(depth: number): string {
    const itemType = this.generateType(depth + 1);
    if (this.rng.chance(this.opts.constraintProbability)) {
      return `SEQUENCE ${this.sizeConstraint()} OF ${itemType}`;
    }
    return `SEQUENCE OF ${itemType}`;
  }

  private generateChoice(depth: number): string {
    const numAlts = this.rng.int(2, this.opts.maxAlternatives);
    const usedNames = new Set<string>();
    const alts: string[] = [];

    for (let i = 0; i < numAlts; i++) {
      const altName = this.uniqueFieldName(usedNames);
      usedNames.add(altName);
      alts.push(`    ${altName} ${this.generateType(depth + 1)}`);
    }

    // Maybe add extension marker
    if (this.rng.chance(this.opts.extensionProbability)) {
      const extPos = this.rng.int(1, alts.length);
      const extAlts: string[] = [];
      if (this.rng.chance(0.5)) {
        const numExt = this.rng.int(1, 2);
        for (let i = 0; i < numExt; i++) {
          const an = this.uniqueFieldName(usedNames);
          usedNames.add(an);
          extAlts.push(`    ${an} ${this.generateType(depth + 1)}`);
        }
      }
      alts.splice(extPos, 0, '    ...', ...extAlts);
    }

    return `CHOICE {\n${alts.join(',\n')}\n  }`;
  }

  private generateEnumerated(): string {
    const numValues = this.rng.int(1, this.opts.maxEnumValues);
    const usedNames = new Set<string>();
    const values: string[] = [];

    for (let i = 0; i < numValues; i++) {
      const name = this.uniqueFieldName(usedNames);
      usedNames.add(name);
      // Sometimes include explicit numeric values
      if (this.rng.chance(0.3)) {
        values.push(`${name}(${i})`);
      } else {
        values.push(name);
      }
    }

    // Maybe add extension marker
    if (this.rng.chance(this.opts.extensionProbability)) {
      const extValues: string[] = [];
      if (this.rng.chance(0.5)) {
        const numExt = this.rng.int(1, 3);
        for (let i = 0; i < numExt; i++) {
          const en = this.uniqueFieldName(usedNames);
          usedNames.add(en);
          extValues.push(en);
        }
      }
      return `ENUMERATED { ${values.join(', ')}, ...${extValues.length > 0 ? ', ' + extValues.join(', ') : ''} }`;
    }

    return `ENUMERATED { ${values.join(', ')} }`;
  }

  private generateDefaultValue(typeStr: string): string {
    if (typeStr === 'BOOLEAN') return this.rng.chance(0.5) ? 'TRUE' : 'FALSE';
    if (typeStr === 'NULL') return 'NULL';
    if (typeStr.startsWith('INTEGER')) return String(this.rng.int(0, 100));
    return String(this.rng.int(0, 10));
  }

  private typeName(): string {
    return this.rng.pick(UPPER_NAMES) + this.rng.int(1, 99);
  }

  private uniqueTypeName(): string {
    let name: string;
    let attempts = 0;
    do {
      name = this.rng.pick(UPPER_NAMES) + this.rng.int(1, 999);
      attempts++;
    } while (this.definedTypes.includes(name) && attempts < 100);
    return name;
  }

  private uniqueFieldName(used: Set<string>): string {
    let name: string;
    let attempts = 0;
    do {
      name = this.rng.pick(LOWER_NAMES) + this.rng.int(1, 999);
      attempts++;
    } while (used.has(name) && attempts < 100);
    return name;
  }
}

/**
 * Generate a random ASN.1 module string.
 * @param seed - RNG seed for reproducibility
 * @param options - Generator options
 */
export function generateAsn1Module(seed: number, options?: GeneratorOptions): string {
  const gen = new Asn1Generator(seed, options);
  return gen.generateModule();
}
