import type { SchemaNode } from '../schema/SchemaBuilder';
import type {
  AsnModule,
  AsnType,
  AsnField,
  AsnConstraint,
  AsnConstrainedType,
} from './types';

/**
 * Options for controlling schema conversion.
 */
export interface ConvertOptions {
  /**
   * How to handle OBJECT IDENTIFIER fields.
   * - 'native': encode/decode as OID dot-notation strings (default)
   * - 'error': throw an error
   * - 'omit': silently omit the field from SEQUENCE/CHOICE
   * - 'octetstring': substitute OCTET STRING
   */
  objectIdentifierHandling?: 'native' | 'error' | 'omit' | 'octetstring';
}

/**
 * Convert all type assignments in an ASN.1 module to a map of SchemaNode definitions.
 *
 * Type references are resolved within the module. Each top-level type assignment
 * becomes an entry in the returned record.
 *
 * @param module - Parsed ASN.1 module AST
 * @param options - Conversion options
 * @returns Map of type name to SchemaNode
 */
export function convertModuleToSchemaNodes(
  module: AsnModule,
  options: ConvertOptions = {},
): Record<string, SchemaNode> {
  const typeMap = new Map<string, AsnType>();

  // First pass: collect all type assignments
  for (const assignment of module.assignments) {
    typeMap.set(assignment.name, assignment.type);
  }

  // Second pass: convert each assignment to SchemaNode
  const result: Record<string, SchemaNode> = {};
  for (const assignment of module.assignments) {
    result[assignment.name] = convertType(assignment.type, typeMap, options);
  }
  return result;
}

function convertType(
  type: AsnType,
  typeMap: Map<string, AsnType>,
  options: ConvertOptions,
): SchemaNode {
  switch (type.kind) {
    case 'BOOLEAN':
      return { type: 'BOOLEAN' };

    case 'NULL':
      return { type: 'NULL' };

    case 'INTEGER':
      return { type: 'INTEGER' };

    case 'BIT STRING':
      return { type: 'BIT STRING' };

    case 'OCTET STRING':
      return { type: 'OCTET STRING' };

    case 'CharString':
      return { type: type.charStringType };

    case 'OBJECT IDENTIFIER':
      return handleObjectIdentifier(options);

    case 'ENUMERATED': {
      const node: SchemaNode = {
        type: 'ENUMERATED',
        values: type.rootValues,
      };
      if (type.extensionValues !== undefined) {
        (node as { extensionValues?: string[] }).extensionValues = type.extensionValues;
      }
      return node;
    }

    case 'SEQUENCE': {
      const fields = convertFields(type.fields, typeMap, options);
      const node: SchemaNode & { extensionFields?: unknown[] } = {
        type: 'SEQUENCE',
        fields,
      };
      if (type.extensionFields !== undefined) {
        node.extensionFields = convertFields(type.extensionFields, typeMap, options);
      }
      return node as SchemaNode;
    }

    case 'SEQUENCE OF':
      return {
        type: 'SEQUENCE OF',
        item: convertType(type.itemType, typeMap, options),
      };

    case 'CHOICE': {
      const alternatives = type.alternatives.map(a => ({
        name: a.name,
        schema: convertType(a.type, typeMap, options),
      }));
      const node: SchemaNode & { extensionAlternatives?: unknown[] } = {
        type: 'CHOICE',
        alternatives,
      };
      if (type.extensionAlternatives !== undefined) {
        node.extensionAlternatives = type.extensionAlternatives.map(a => ({
          name: a.name,
          schema: convertType(a.type, typeMap, options),
        }));
      }
      return node as SchemaNode;
    }

    case 'TypeReference': {
      const resolved = typeMap.get(type.name);
      if (!resolved) {
        throw new Error(`Unresolved type reference: ${type.name}`);
      }
      return convertType(resolved, typeMap, options);
    }

    case 'ConstrainedType':
      return applyConstraint(type, typeMap, options);

    default:
      throw new Error(`Unsupported ASN.1 type: ${(type as { kind: string }).kind}`);
  }
}

function applyConstraint(
  constrained: AsnConstrainedType,
  typeMap: Map<string, AsnType>,
  options: ConvertOptions,
): SchemaNode {
  const base = convertType(constrained.baseType, typeMap, options);
  const constraint = constrained.constraint;

  if (constraint.constraintType === 'value') {
    return applyValueConstraint(base, constraint);
  } else {
    return applySizeConstraint(base, constraint);
  }
}

function applyValueConstraint(base: SchemaNode, constraint: AsnConstraint): SchemaNode {
  if (base.type === 'INTEGER') {
    return {
      type: 'INTEGER',
      min: constraint.min,
      max: constraint.max,
      extensible: constraint.extensible,
    };
  }
  // For other types, value constraints are not well-defined in our model
  return base;
}

function applySizeConstraint(base: SchemaNode, constraint: AsnConstraint): SchemaNode {
  const isFixed = constraint.min !== undefined && constraint.max !== undefined && constraint.min === constraint.max;

  switch (base.type) {
    case 'BIT STRING':
      return {
        type: 'BIT STRING',
        ...(isFixed
          ? { fixedSize: constraint.min }
          : { minSize: constraint.min, maxSize: constraint.max }),
        extensible: constraint.extensible,
      };

    case 'OCTET STRING':
      return {
        type: 'OCTET STRING',
        ...(isFixed
          ? { fixedSize: constraint.min }
          : { minSize: constraint.min, maxSize: constraint.max }),
        extensible: constraint.extensible,
      };

    case 'IA5String':
    case 'VisibleString':
    case 'UTF8String':
      return {
        type: base.type,
        ...(isFixed
          ? { fixedSize: constraint.min }
          : { minSize: constraint.min, maxSize: constraint.max }),
        extensible: constraint.extensible,
      };

    case 'SEQUENCE OF':
      return {
        type: 'SEQUENCE OF',
        item: base.item,
        ...(isFixed
          ? { fixedSize: constraint.min }
          : { minSize: constraint.min, maxSize: constraint.max }),
        extensible: constraint.extensible,
      };

    default:
      return base;
  }
}

function convertFields(
  fields: AsnField[],
  typeMap: Map<string, AsnType>,
  options: ConvertOptions,
): Array<{ name: string; schema: SchemaNode; optional?: boolean; defaultValue?: unknown }> {
  const result: Array<{ name: string; schema: SchemaNode; optional?: boolean; defaultValue?: unknown }> = [];

  for (const field of fields) {
    // Check if this field uses OBJECT IDENTIFIER and should be omitted
    if (options.objectIdentifierHandling === 'omit' && fieldUsesObjectIdentifier(field.type)) {
      continue;
    }

    const schema = convertType(field.type, typeMap, options);
    const entry: { name: string; schema: SchemaNode; optional?: boolean; defaultValue?: unknown } = {
      name: field.name,
      schema,
    };
    if (field.optional) {
      entry.optional = true;
    }
    if (field.defaultValue !== undefined) {
      entry.defaultValue = field.defaultValue;
    }
    result.push(entry);
  }

  return result;
}

function fieldUsesObjectIdentifier(type: AsnType): boolean {
  if (type.kind === 'OBJECT IDENTIFIER') return true;
  if (type.kind === 'ConstrainedType') return fieldUsesObjectIdentifier(type.baseType);
  return false;
}

function handleObjectIdentifier(options: ConvertOptions): SchemaNode {
  const handling = options.objectIdentifierHandling || 'native';
  switch (handling) {
    case 'native':
      return { type: 'OBJECT IDENTIFIER' };
    case 'error':
      throw new Error(
        'OBJECT IDENTIFIER type is not supported with "error" handling. ' +
        'Use objectIdentifierHandling: "native" (default), "omit", or "octetstring".',
      );
    case 'octetstring':
      return { type: 'OCTET STRING' };
    case 'omit':
      // This shouldn't be reached since we filter in convertFields,
      // but return OCTET STRING as a fallback
      return { type: 'OCTET STRING' };
  }
}
