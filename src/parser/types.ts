/**
 * AST types for parsed ASN.1 module definitions.
 */

/** A complete ASN.1 module. */
export interface AsnModule {
  name: string;
  tagMode?: 'AUTOMATIC' | 'EXPLICIT' | 'IMPLICIT';
  assignments: AsnTypeAssignment[];
}

/** A type assignment: `TypeName ::= Type` */
export interface AsnTypeAssignment {
  name: string;
  type: AsnType;
}

/** Discriminated union of all ASN.1 types. */
export type AsnType =
  | AsnBooleanType
  | AsnNullType
  | AsnIntegerType
  | AsnEnumeratedType
  | AsnBitStringType
  | AsnOctetStringType
  | AsnCharStringType
  | AsnObjectIdentifierType
  | AsnSequenceType
  | AsnSequenceOfType
  | AsnChoiceType
  | AsnTypeReference
  | AsnConstrainedType;

export interface AsnBooleanType {
  kind: 'BOOLEAN';
}

export interface AsnNullType {
  kind: 'NULL';
}

export interface AsnIntegerType {
  kind: 'INTEGER';
}

export interface AsnEnumeratedType {
  kind: 'ENUMERATED';
  rootValues: string[];
  extensionValues?: string[];
}

export interface AsnBitStringType {
  kind: 'BIT STRING';
}

export interface AsnOctetStringType {
  kind: 'OCTET STRING';
}

export interface AsnCharStringType {
  kind: 'CharString';
  charStringType: 'IA5String' | 'VisibleString' | 'UTF8String';
}

export interface AsnObjectIdentifierType {
  kind: 'OBJECT IDENTIFIER';
}

export interface AsnSequenceType {
  kind: 'SEQUENCE';
  fields: AsnField[];
  extensionFields?: AsnField[];
}

export interface AsnSequenceOfType {
  kind: 'SEQUENCE OF';
  itemType: AsnType;
}

export interface AsnChoiceType {
  kind: 'CHOICE';
  alternatives: AsnAlternative[];
  extensionAlternatives?: AsnAlternative[];
}

export interface AsnAlternative {
  name: string;
  type: AsnType;
}

export interface AsnTypeReference {
  kind: 'TypeReference';
  name: string;
}

export interface AsnConstrainedType {
  kind: 'ConstrainedType';
  baseType: AsnType;
  constraint: AsnConstraint;
}

/** A field in a SEQUENCE. */
export interface AsnField {
  name: string;
  type: AsnType;
  optional?: boolean;
  defaultValue?: unknown;
}

/** Value or size constraint. */
export interface AsnConstraint {
  constraintType: 'value' | 'size';
  min?: number;
  max?: number;
  extensible?: boolean;
}
