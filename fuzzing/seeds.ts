/**
 * Seed corpus of valid ASN.1 module strings for mutation-based fuzzing.
 * Each seed exercises a different grammar feature.
 */

/** Minimal valid module. */
export const SEED_MINIMAL = `
TestModule DEFINITIONS ::= BEGIN
  MyBool ::= BOOLEAN
END
`;

/** All primitive types. */
export const SEED_PRIMITIVES = `
Primitives DEFINITIONS ::= BEGIN
  MyBool ::= BOOLEAN
  MyNull ::= NULL
  MyInt ::= INTEGER
  MyBits ::= BIT STRING
  MyOctets ::= OCTET STRING
  MyOid ::= OBJECT IDENTIFIER
  MyIA5 ::= IA5String
  MyVisible ::= VisibleString
  MyUtf8 ::= UTF8String
END
`;

/** Value and size constraints. */
export const SEED_CONSTRAINTS = `
Constraints DEFINITIONS ::= BEGIN
  SmallInt ::= INTEGER (0..255)
  SignedInt ::= INTEGER (-128..127)
  ExtInt ::= INTEGER (0..100, ...)
  FixedBits ::= BIT STRING (SIZE (8))
  VarOctets ::= OCTET STRING (SIZE (1..100))
  ExtString ::= IA5String (SIZE (1..50, ...))
  FixedStr ::= VisibleString (SIZE (10))
END
`;

/** SEQUENCE with OPTIONAL and DEFAULT fields. */
export const SEED_SEQUENCE = `
SeqModule DEFINITIONS ::= BEGIN
  Person ::= SEQUENCE {
    name IA5String (SIZE (1..50)),
    age INTEGER (0..150),
    email IA5String (SIZE (1..100)) OPTIONAL,
    active BOOLEAN DEFAULT TRUE
  }
END
`;

/** SEQUENCE with extension marker. */
export const SEED_SEQUENCE_EXT = `
ExtSeq DEFINITIONS ::= BEGIN
  Message ::= SEQUENCE {
    version INTEGER (1..10),
    payload OCTET STRING (SIZE (0..1000)),
    ...,
    priority INTEGER (0..9) OPTIONAL
  }
END
`;

/** CHOICE type. */
export const SEED_CHOICE = `
ChoiceModule DEFINITIONS ::= BEGIN
  Shape ::= CHOICE {
    circle INTEGER (1..100),
    rectangle SEQUENCE {
      width INTEGER (1..1000),
      height INTEGER (1..1000)
    },
    label IA5String (SIZE (1..20))
  }
END
`;

/** CHOICE with extension marker. */
export const SEED_CHOICE_EXT = `
ExtChoice DEFINITIONS ::= BEGIN
  Transport ::= CHOICE {
    car BOOLEAN,
    bike NULL,
    ...,
    scooter INTEGER (0..50)
  }
END
`;

/** ENUMERATED type. */
export const SEED_ENUMERATED = `
EnumModule DEFINITIONS ::= BEGIN
  Color ::= ENUMERATED { red, green, blue }
  Status ::= ENUMERATED { active(0), inactive(1), ..., archived(2) }
END
`;

/** SEQUENCE OF type. */
export const SEED_SEQUENCE_OF = `
ListModule DEFINITIONS ::= BEGIN
  Numbers ::= SEQUENCE (SIZE (1..10)) OF INTEGER (0..255)
  Names ::= SEQUENCE OF IA5String (SIZE (1..50))
END
`;

/** Type references. */
export const SEED_TYPE_REFS = `
RefModule DEFINITIONS ::= BEGIN
  Name ::= IA5String (SIZE (1..100))
  Age ::= INTEGER (0..200)
  Person ::= SEQUENCE {
    name Name,
    age Age
  }
  People ::= SEQUENCE (SIZE (0..50)) OF Person
END
`;

/** Recursive type (produces $ref). */
export const SEED_RECURSIVE = `
TreeModule DEFINITIONS ::= BEGIN
  Tree ::= SEQUENCE {
    value INTEGER (0..999),
    children SEQUENCE OF Tree
  }
END
`;

/** Mutually referencing types. */
export const SEED_MUTUAL_REF = `
MutualModule DEFINITIONS ::= BEGIN
  NodeA ::= SEQUENCE {
    data INTEGER,
    next NodeB OPTIONAL
  }
  NodeB ::= SEQUENCE {
    data BOOLEAN,
    next NodeA OPTIONAL
  }
END
`;

/** Tag modes. */
export const SEED_TAG_MODES = `
AutoModule DEFINITIONS AUTOMATIC TAGS ::= BEGIN
  Msg ::= SEQUENCE {
    id INTEGER (0..65535),
    body OCTET STRING (SIZE (0..500))
  }
END
`;

/** Comments. */
export const SEED_COMMENTS = `
CommentModule DEFINITIONS ::= BEGIN
  -- This is a comment
  MyType ::= INTEGER (0..100) -- inline comment
  -- Another comment
END
`;

/** Complex nested structure. */
export const SEED_COMPLEX = `
Complex DEFINITIONS AUTOMATIC TAGS ::= BEGIN
  Header ::= SEQUENCE {
    version INTEGER (1..3),
    flags BIT STRING (SIZE (8)),
    timestamp INTEGER (0..4294967295)
  }

  Payload ::= CHOICE {
    text IA5String (SIZE (0..1000)),
    binary OCTET STRING (SIZE (0..5000)),
    structured SEQUENCE {
      kind ENUMERATED { request, response, notification },
      data OCTET STRING (SIZE (0..10000)) OPTIONAL
    }
  }

  Message ::= SEQUENCE {
    header Header,
    payload Payload,
    checksum BIT STRING (SIZE (32)) OPTIONAL,
    ...,
    extensions SEQUENCE OF Extension OPTIONAL
  }

  Extension ::= SEQUENCE {
    id INTEGER (0..255),
    value OCTET STRING (SIZE (0..100))
  }
END
`;

/** All seeds as an array for iteration. */
export const ALL_SEEDS: string[] = [
  SEED_MINIMAL,
  SEED_PRIMITIVES,
  SEED_CONSTRAINTS,
  SEED_SEQUENCE,
  SEED_SEQUENCE_EXT,
  SEED_CHOICE,
  SEED_CHOICE_EXT,
  SEED_ENUMERATED,
  SEED_SEQUENCE_OF,
  SEED_TYPE_REFS,
  SEED_RECURSIVE,
  SEED_MUTUAL_REF,
  SEED_TAG_MODES,
  SEED_COMMENTS,
  SEED_COMPLEX,
];
