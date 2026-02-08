import { parseAsn1Module } from '../../src/parser/AsnParser';
import type {
  AsnSequenceType,
  AsnSequenceOfType,
  AsnChoiceType,
  AsnEnumeratedType,
  AsnConstrainedType,
  AsnCharStringType,
  AsnTypeReference,
} from '../../src/parser/types';

function parseType(typeDef: string) {
  const module = parseAsn1Module(
    `Test DEFINITIONS ::= BEGIN\n  TestType ::= ${typeDef}\nEND`,
  );
  return module.assignments[0].type;
}

describe('AsnParser', () => {
  describe('module structure', () => {
    it('parses a minimal module', () => {
      const mod = parseAsn1Module(
        'TestModule DEFINITIONS ::= BEGIN\nEND',
      );
      expect(mod.name).toBe('TestModule');
      expect(mod.assignments).toEqual([]);
    });

    it('parses module with AUTOMATIC TAGS', () => {
      const mod = parseAsn1Module(
        'TestModule DEFINITIONS AUTOMATIC TAGS ::= BEGIN\nEND',
      );
      expect(mod.name).toBe('TestModule');
      expect(mod.tagMode).toBe('AUTOMATIC');
    });

    it('parses module with EXPLICIT TAGS', () => {
      const mod = parseAsn1Module(
        'TestModule DEFINITIONS EXPLICIT TAGS ::= BEGIN\nEND',
      );
      expect(mod.tagMode).toBe('EXPLICIT');
    });

    it('parses module with IMPLICIT TAGS', () => {
      const mod = parseAsn1Module(
        'TestModule DEFINITIONS IMPLICIT TAGS ::= BEGIN\nEND',
      );
      expect(mod.tagMode).toBe('IMPLICIT');
    });

    it('parses module with hyphenated name', () => {
      const mod = parseAsn1Module(
        'Test-Module DEFINITIONS ::= BEGIN\nEND',
      );
      expect(mod.name).toBe('Test-Module');
    });
  });

  describe('primitive types', () => {
    it('parses BOOLEAN', () => {
      const type = parseType('BOOLEAN');
      expect(type.kind).toBe('BOOLEAN');
    });

    it('parses NULL', () => {
      const type = parseType('NULL');
      expect(type.kind).toBe('NULL');
    });

    it('parses INTEGER', () => {
      const type = parseType('INTEGER');
      expect(type.kind).toBe('INTEGER');
    });

    it('parses BIT STRING', () => {
      const type = parseType('BIT STRING');
      expect(type.kind).toBe('BIT STRING');
    });

    it('parses OCTET STRING', () => {
      const type = parseType('OCTET STRING');
      expect(type.kind).toBe('OCTET STRING');
    });

    it('parses OBJECT IDENTIFIER', () => {
      const type = parseType('OBJECT IDENTIFIER');
      expect(type.kind).toBe('OBJECT IDENTIFIER');
    });

    it('parses IA5String', () => {
      const type = parseType('IA5String');
      expect(type.kind).toBe('CharString');
      expect((type as AsnCharStringType).charStringType).toBe('IA5String');
    });

    it('parses VisibleString', () => {
      const type = parseType('VisibleString');
      expect(type.kind).toBe('CharString');
      expect((type as AsnCharStringType).charStringType).toBe('VisibleString');
    });

    it('parses UTF8String', () => {
      const type = parseType('UTF8String');
      expect(type.kind).toBe('CharString');
      expect((type as AsnCharStringType).charStringType).toBe('UTF8String');
    });
  });

  describe('constraints', () => {
    it('parses INTEGER with value constraint', () => {
      const type = parseType('INTEGER (0..255)');
      expect(type.kind).toBe('ConstrainedType');
      const ct = type as AsnConstrainedType;
      expect(ct.baseType.kind).toBe('INTEGER');
      expect(ct.constraint.constraintType).toBe('value');
      expect(ct.constraint.min).toBe(0);
      expect(ct.constraint.max).toBe(255);
    });

    it('parses INTEGER with negative range', () => {
      const type = parseType('INTEGER (-128..127)');
      const ct = type as AsnConstrainedType;
      expect(ct.constraint.min).toBe(-128);
      expect(ct.constraint.max).toBe(127);
    });

    it('parses INTEGER with extensibility marker', () => {
      const type = parseType('INTEGER (0..100, ...)');
      const ct = type as AsnConstrainedType;
      expect(ct.constraint.min).toBe(0);
      expect(ct.constraint.max).toBe(100);
      expect(ct.constraint.extensible).toBe(true);
    });

    it('parses fixed size constraint', () => {
      const type = parseType('INTEGER (42)');
      const ct = type as AsnConstrainedType;
      expect(ct.constraint.min).toBe(42);
      expect(ct.constraint.max).toBe(42);
    });

    it('parses SIZE constraint on OCTET STRING', () => {
      const type = parseType('OCTET STRING (SIZE (1..100))');
      const ct = type as AsnConstrainedType;
      expect(ct.baseType.kind).toBe('OCTET STRING');
      expect(ct.constraint.constraintType).toBe('size');
      expect(ct.constraint.min).toBe(1);
      expect(ct.constraint.max).toBe(100);
    });

    it('parses SIZE constraint on BIT STRING', () => {
      const type = parseType('BIT STRING (SIZE (8))');
      const ct = type as AsnConstrainedType;
      expect(ct.baseType.kind).toBe('BIT STRING');
      expect(ct.constraint.constraintType).toBe('size');
      expect(ct.constraint.min).toBe(8);
      expect(ct.constraint.max).toBe(8);
    });
  });

  describe('SEQUENCE', () => {
    it('parses a simple SEQUENCE', () => {
      const type = parseType('SEQUENCE { name IA5String, value INTEGER }');
      expect(type.kind).toBe('SEQUENCE');
      const seq = type as AsnSequenceType;
      expect(seq.fields).toHaveLength(2);
      expect(seq.fields[0].name).toBe('name');
      expect(seq.fields[0].type.kind).toBe('CharString');
      expect(seq.fields[1].name).toBe('value');
      expect(seq.fields[1].type.kind).toBe('INTEGER');
    });

    it('parses OPTIONAL fields', () => {
      const type = parseType('SEQUENCE { name IA5String, value INTEGER OPTIONAL }');
      const seq = type as AsnSequenceType;
      expect(seq.fields[0].optional).toBeFalsy();
      expect(seq.fields[1].optional).toBe(true);
    });

    it('parses DEFAULT values', () => {
      const type = parseType('SEQUENCE { active BOOLEAN DEFAULT TRUE }');
      const seq = type as AsnSequenceType;
      expect(seq.fields[0].defaultValue).toBe(true);
    });

    it('parses SEQUENCE with constrained fields', () => {
      const type = parseType('SEQUENCE { id INTEGER (1..1000), data OCTET STRING }');
      const seq = type as AsnSequenceType;
      expect(seq.fields[0].type.kind).toBe('ConstrainedType');
      const ct = seq.fields[0].type as AsnConstrainedType;
      expect(ct.constraint.min).toBe(1);
      expect(ct.constraint.max).toBe(1000);
    });

    it('parses SEQUENCE with extension marker', () => {
      const type = parseType('SEQUENCE { name IA5String, ..., extra INTEGER }');
      const seq = type as AsnSequenceType;
      expect(seq.fields).toHaveLength(1);
      expect(seq.fields[0].name).toBe('name');
      expect(seq.extensionFields).toHaveLength(1);
      expect(seq.extensionFields![0].name).toBe('extra');
    });

    it('parses SEQUENCE with type references', () => {
      const type = parseType('SEQUENCE { data MyType }');
      const seq = type as AsnSequenceType;
      expect(seq.fields[0].type.kind).toBe('TypeReference');
      expect((seq.fields[0].type as AsnTypeReference).name).toBe('MyType');
    });
  });

  describe('SEQUENCE OF', () => {
    it('parses SEQUENCE OF with primitive type', () => {
      const type = parseType('SEQUENCE OF INTEGER');
      expect(type.kind).toBe('SEQUENCE OF');
      const sof = type as AsnSequenceOfType;
      expect(sof.itemType.kind).toBe('INTEGER');
    });

    it('parses SEQUENCE OF with type reference', () => {
      const type = parseType('SEQUENCE OF MyType');
      const sof = type as AsnSequenceOfType;
      expect(sof.itemType.kind).toBe('TypeReference');
      expect((sof.itemType as AsnTypeReference).name).toBe('MyType');
    });

    it('parses SEQUENCE OF with SIZE constraint', () => {
      const type = parseType('SEQUENCE (SIZE (1..10)) OF INTEGER');
      expect(type.kind).toBe('ConstrainedType');
      const ct = type as AsnConstrainedType;
      expect(ct.baseType.kind).toBe('SEQUENCE OF');
      expect(ct.constraint.constraintType).toBe('size');
      expect(ct.constraint.min).toBe(1);
      expect(ct.constraint.max).toBe(10);
    });
  });

  describe('CHOICE', () => {
    it('parses a simple CHOICE', () => {
      const type = parseType('CHOICE { flag BOOLEAN, count INTEGER }');
      expect(type.kind).toBe('CHOICE');
      const ch = type as AsnChoiceType;
      expect(ch.alternatives).toHaveLength(2);
      expect(ch.alternatives[0].name).toBe('flag');
      expect(ch.alternatives[0].type.kind).toBe('BOOLEAN');
      expect(ch.alternatives[1].name).toBe('count');
    });

    it('parses CHOICE with extension marker', () => {
      const type = parseType('CHOICE { a BOOLEAN, ..., b INTEGER }');
      const ch = type as AsnChoiceType;
      expect(ch.alternatives).toHaveLength(1);
      expect(ch.extensionAlternatives).toHaveLength(1);
      expect(ch.extensionAlternatives![0].name).toBe('b');
    });
  });

  describe('ENUMERATED', () => {
    it('parses simple ENUMERATED', () => {
      const type = parseType('ENUMERATED { red, green, blue }');
      expect(type.kind).toBe('ENUMERATED');
      const en = type as AsnEnumeratedType;
      expect(en.rootValues).toEqual(['red', 'green', 'blue']);
    });

    it('parses ENUMERATED with extension values', () => {
      const type = parseType('ENUMERATED { red, green, ..., yellow }');
      const en = type as AsnEnumeratedType;
      expect(en.rootValues).toEqual(['red', 'green']);
      expect(en.extensionValues).toEqual(['yellow']);
    });

    it('parses ENUMERATED with numeric values', () => {
      const type = parseType('ENUMERATED { red(0), green(1), blue(2) }');
      const en = type as AsnEnumeratedType;
      expect(en.rootValues).toEqual(['red', 'green', 'blue']);
    });
  });

  describe('comments', () => {
    it('ignores single-line comments', () => {
      const mod = parseAsn1Module(`
        TestModule DEFINITIONS ::= BEGIN
          -- This is a comment
          MyBool ::= BOOLEAN -- inline comment
        END
      `);
      expect(mod.assignments).toHaveLength(1);
      expect(mod.assignments[0].name).toBe('MyBool');
    });
  });

  describe('multiple assignments', () => {
    it('parses multiple type assignments', () => {
      const mod = parseAsn1Module(`
        TestModule DEFINITIONS ::= BEGIN
          TypeA ::= BOOLEAN
          TypeB ::= INTEGER
          TypeC ::= SEQUENCE { a TypeA, b TypeB }
        END
      `);
      expect(mod.assignments).toHaveLength(3);
      expect(mod.assignments[0].name).toBe('TypeA');
      expect(mod.assignments[1].name).toBe('TypeB');
      expect(mod.assignments[2].name).toBe('TypeC');
    });
  });

  describe('error handling', () => {
    it('throws on invalid input', () => {
      expect(() => parseAsn1Module('not valid ASN.1')).toThrow();
    });

    it('throws on missing END', () => {
      expect(() => parseAsn1Module('Test DEFINITIONS ::= BEGIN')).toThrow();
    });
  });
});
