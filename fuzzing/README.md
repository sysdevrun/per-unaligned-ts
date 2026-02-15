# Parser Fuzzing

Fuzzing infrastructure for the ASN.1 PER parser (`parseAsn1Module`) and its AST-to-SchemaNode converter (`convertModuleToSchemaNodes`).

## Evaluation: Why Fuzz the Parser?

The ASN.1 parser accepts arbitrary string input and processes it through two stages:

1. **PEG grammar parsing** (`parseAsn1Module`): Transforms raw ASN.1 text into an AST via Peggy
2. **AST conversion** (`convertModuleToSchemaNodes`): Transforms the AST into `SchemaNode` definitions with type resolution, cycle detection, and constraint application

Both stages are vulnerable to edge cases that unit tests are unlikely to cover:

| Risk | Description | Fuzzing approach |
|------|-------------|------------------|
| **Crash on malformed input** | Unexpected characters, truncated modules, missing delimiters | Mutation fuzzing |
| **Hang / infinite loop** | Deeply nested types, pathological constraint combinations, recursive references | Generation fuzzing with depth control |
| **Uncaught exceptions** | Grammar edge cases that Peggy doesn't reject cleanly | Random generation + mutation |
| **Memory exhaustion** | Extremely large enumerations, deeply nested SEQUENCE OF chains | Generation with size amplification |
| **Incorrect AST** | Valid-looking input that produces a subtly wrong AST | Property-based generation + validation |
| **Constraint mishandling** | Unusual constraint combinations (e.g., negative ranges, MIN..MAX, extensible fixed-size) | Targeted constraint generation |
| **Type resolution bugs** | Forward references, mutual recursion, shadowed type names | Multi-assignment generation |

## Fuzzing Strategies Implemented

### 1. Grammar-Aware Generation (`generators/asn1-generator.ts`)

Generates random but structurally plausible ASN.1 module text by following the grammar structure. Controls:
- Nesting depth (prevents infinite recursion during generation)
- Number of type assignments
- Field/alternative counts for SEQUENCE/CHOICE
- Constraint variation (value, size, extensible, fixed)
- Type reference generation (including forward references and self-references)

**Strengths**: High likelihood of exercising deep parser paths. Finds bugs in constraint handling, nested structures, and type resolution.

**Weaknesses**: Limited ability to find bugs triggered by truly invalid syntax.

### 2. Mutation Fuzzing (`generators/mutator.ts`)

Takes valid ASN.1 seed inputs and applies random mutations:
- **Byte-level**: Bit flips, byte insertion/deletion/replacement
- **Token-level**: Keyword replacement, identifier mangling, number boundary substitution
- **Structural**: Brace/paren removal, comma insertion/deletion, extension marker injection

**Strengths**: Explores the boundary between valid and invalid input. Effective at finding parser error-handling gaps.

**Weaknesses**: Most mutations produce trivially invalid input that gets rejected immediately.

### 3. Property-Based Checks

For inputs that parse successfully, we verify structural properties:
- Every `SchemaNode` has a valid `type` discriminant
- SEQUENCE fields all have `name` and `schema` properties
- CHOICE alternatives all have `name` and `schema` properties
- Constraint values are consistent (min <= max when both defined, fixedSize set when min === max)
- No unresolved `$ref` nodes pointing to types not in the module
- `extensionValues`/`extensionFields`/`extensionAlternatives` are arrays when present

## Directory Structure

```
fuzzing/
  README.md                        # This file
  jest.config.cjs                  # Jest config for running fuzz tests
  seeds.ts                         # Seed corpus of valid ASN.1 inputs
  generators/
    asn1-generator.ts              # Grammar-aware random ASN.1 generator
    mutator.ts                     # Mutation strategies for strings
  fuzz-parser.test.ts              # Fuzz tests for parseAsn1Module
  fuzz-converter.test.ts           # Fuzz tests for full pipeline
  run.ts                           # Standalone continuous fuzzer script
```

## Running

```bash
# Run fuzz tests via Jest (default: 500 iterations each)
npx jest --config fuzzing/jest.config.cjs

# Run a specific fuzz test file
npx jest --config fuzzing/jest.config.cjs fuzz-parser

# Standalone continuous fuzzer (runs until stopped or crash found)
npx ts-node fuzzing/run.ts

# With iteration limit
npx ts-node fuzzing/run.ts --iterations 10000
```

## Extending

To add new seed inputs, add entries to `seeds.ts`. Good seeds are valid ASN.1 modules that exercise specific grammar features (constraints, extensions, recursion, etc.).

To add new mutation strategies, add functions to `generators/mutator.ts` and register them in the `MUTATORS` array.

To add new property checks, add validation functions to the test files' `validateSchemaNode` helpers.
