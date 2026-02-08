# TODO — ASN.1 Parser Limitations

The ASN.1 schema parser (`src/parser/`) supports a practical subset of ASN.1 notation. The following features are **not yet implemented**.

## Unsupported Types

- **REAL** — Floating-point type
- **SET / SET OF** — Unordered collection types
- **NumericString** — Digits and space only
- **PrintableString** — Subset of ASCII
- **BMPString** — Basic Multilingual Plane (UCS-2)
- **GeneralizedTime / UTCTime** — Date/time types
- **EXTERNAL / EMBEDDED PDV** — External data types

## Unsupported Constraint Types

- **FROM constraint** — Character alphabet restriction, e.g. `IA5String (FROM ("0".."9"))`
- **PATTERN constraint** — Regex-like restrictions
- **CONTAINING constraint** — `OCTET STRING (CONTAINING OtherType)`
- **WITH COMPONENTS constraint** — Nested component constraints
- **INCLUDES constraint** — Type inclusion
- **UNION / INTERSECTION / EXCEPT** — Set operations on constraints
- **Table constraints** — Information object set constraints
- **Named number lists** — `INTEGER { first(1), second(2) }`

## Unsupported Module Features

- **IMPORTS / EXPORTS** — Cross-module type references
- **Value assignments** — `myValue INTEGER ::= 42`
- **Information objects** — CLASS, WITH SYNTAX, etc.
- **Parameterized types** — `MyType{T} ::= SEQUENCE { value T }`
- **Value set definitions** — `MyValues INTEGER ::= { 1 | 2 | 3 }`

## Unsupported Encoding Features

- **DEFAULT values** — Parsed in the AST but only simple literals (TRUE, FALSE, NULL, numbers, identifiers) are captured; complex default values are not supported
- **COMPONENTS OF** — Including fields from another SEQUENCE
- **Automatic tagging** — Tag mode is parsed but not used in PER encoding (PER is tag-independent)

## Known Limitations

- Type references are resolved by inlining (expanding the referenced type). Recursive/circular type references will cause infinite recursion.
- The parser only handles a single module per input. Multi-module files are not supported.
- Comments are limited to `--` single-line style. Block comments `/* */` are not supported (not standard ASN.1 anyway).
