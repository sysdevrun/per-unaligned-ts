/**
 * PEG grammar for a subset of ASN.1 notation.
 * Compiled by peggy at runtime.
 */
export const ASN1_GRAMMAR = `
{
  // Helper to filter null entries from arrays
  function compact(arr) {
    return arr.filter(function(x) { return x != null; });
  }
}

Module
  = _ name:ModuleIdentifier _ "DEFINITIONS" _ tagMode:TagMode? _ "::=" _ "BEGIN" _
    assignments:AssignmentList _
    "END" _
    {
      return {
        name: name,
        tagMode: tagMode || undefined,
        assignments: assignments
      };
    }

ModuleIdentifier
  = id:TypeReference { return id; }
  / id:Identifier { return id; }

TagMode
  = mode:("AUTOMATIC" / "EXPLICIT" / "IMPLICIT") _ "TAGS" { return mode; }

AssignmentList
  = assignments:TypeAssignment* { return compact(assignments); }

TypeAssignment
  = _ name:TypeReference _ "::=" _ type:Type _
    {
      return { name: name, type: type };
    }

Type
  = ConstrainedType
  / BuiltinType
  / ReferencedType

ConstrainedType
  = base:BaseType _ constraint:Constraint
    {
      return {
        kind: "ConstrainedType",
        baseType: base,
        constraint: constraint
      };
    }

BaseType
  = BuiltinType
  / ReferencedType

BuiltinType
  = SequenceOfType
  / SequenceType
  / ChoiceType
  / EnumeratedType
  / BooleanType
  / NullType
  / IntegerType
  / BitStringType
  / OctetStringType
  / ObjectIdentifierType
  / CharStringType

BooleanType
  = "BOOLEAN" { return { kind: "BOOLEAN" }; }

NullType
  = "NULL" { return { kind: "NULL" }; }

IntegerType
  = "INTEGER" { return { kind: "INTEGER" }; }

BitStringType
  = "BIT" _ "STRING" { return { kind: "BIT STRING" }; }

OctetStringType
  = "OCTET" _ "STRING" { return { kind: "OCTET STRING" }; }

ObjectIdentifierType
  = "OBJECT" _ "IDENTIFIER" { return { kind: "OBJECT IDENTIFIER" }; }

CharStringType
  = type:("IA5String" / "VisibleString" / "UTF8String")
    {
      return { kind: "CharString", charStringType: type };
    }

EnumeratedType
  = "ENUMERATED" _ "{" _ rootValues:EnumRootValues _ extensionAndValues:ExtensionEnumValues? _ "}"
    {
      var result = { kind: "ENUMERATED", rootValues: rootValues };
      if (extensionAndValues) {
        result.extensionValues = extensionAndValues;
      }
      return result;
    }

EnumRootValues
  = head:EnumValue tail:(_ "," _ EnumValue)* { return [head].concat(tail.map(function(t) { return t[3]; })); }

ExtensionEnumValues
  = _ "," _ "..." extensionValues:(_ "," _ EnumValue)*
    { return extensionValues.map(function(t) { return t[3]; }); }

EnumValue
  = name:Identifier _ "(" _ val:Number _ ")" { return name; }
  / name:Identifier { return name; }

SequenceType
  = "SEQUENCE" _ "{" _ fields:ComponentTypeList _ "}"
    {
      var rootFields = [];
      var extensionFields = null;
      var inExtension = false;

      for (var i = 0; i < fields.length; i++) {
        if (fields[i] === "...") {
          inExtension = true;
          extensionFields = [];
        } else if (inExtension) {
          extensionFields.push(fields[i]);
        } else {
          rootFields.push(fields[i]);
        }
      }

      var result = { kind: "SEQUENCE", fields: rootFields };
      if (extensionFields) {
        result.extensionFields = extensionFields;
      }
      return result;
    }

SequenceOfType
  = "SEQUENCE" _ sizeConstraint:SizeConstraint? _ "OF" _ itemType:Type
    {
      var result = { kind: "SEQUENCE OF", itemType: itemType };
      if (sizeConstraint) {
        result = {
          kind: "ConstrainedType",
          baseType: result,
          constraint: sizeConstraint
        };
      }
      return result;
    }

SizeConstraint
  = "(" _ "SIZE" _ "(" _ constraint:ConstraintSpec _ ")" _ ")"
    {
      constraint.constraintType = "size";
      return constraint;
    }
  / "SIZE" _ "(" _ constraint:ConstraintSpec _ ")"
    {
      constraint.constraintType = "size";
      return constraint;
    }

ChoiceType
  = "CHOICE" _ "{" _ alternatives:AlternativeTypeList _ "}"
    {
      var rootAlts = [];
      var extensionAlts = null;
      var inExtension = false;

      for (var i = 0; i < alternatives.length; i++) {
        if (alternatives[i] === "...") {
          inExtension = true;
          extensionAlts = [];
        } else if (inExtension) {
          extensionAlts.push(alternatives[i]);
        } else {
          rootAlts.push(alternatives[i]);
        }
      }

      var result = { kind: "CHOICE", alternatives: rootAlts };
      if (extensionAlts) {
        result.extensionAlternatives = extensionAlts;
      }
      return result;
    }

AlternativeTypeList
  = head:AlternativeTypeOrExtension tail:(_ "," _ AlternativeTypeOrExtension)*
    { return [head].concat(tail.map(function(t) { return t[3]; })); }

AlternativeTypeOrExtension
  = "..." { return "..."; }
  / NamedType

ComponentTypeList
  = head:ComponentTypeOrExtension tail:(_ "," _ ComponentTypeOrExtension)*
    { return [head].concat(tail.map(function(t) { return t[3]; })); }

ComponentTypeOrExtension
  = "..." { return "..."; }
  / ComponentType

ComponentType
  = name:Identifier _ type:Type _ "DEFAULT" _ defaultVal:DefaultValue
    {
      return { name: name, type: type, optional: false, defaultValue: defaultVal };
    }
  / name:Identifier _ type:Type _ "OPTIONAL"
    {
      return { name: name, type: type, optional: true };
    }
  / name:Identifier _ type:Type
    {
      return { name: name, type: type };
    }

DefaultValue
  = "TRUE" { return true; }
  / "FALSE" { return false; }
  / "NULL" { return null; }
  / n:Number { return n; }
  / s:QuotedString { return s; }
  / id:Identifier { return id; }

NamedType
  = name:Identifier _ type:Type
    {
      return { name: name, type: type };
    }

Constraint
  = "(" _ spec:ConstraintSpec _ ")"
    {
      spec.constraintType = spec.constraintType || "value";
      return spec;
    }

ConstraintSpec
  = "SIZE" _ "(" _ inner:ConstraintSpec _ ")" extMarker:(_ "," _ "...")?
    {
      inner.constraintType = "size";
      if (extMarker) { inner.extensible = true; }
      return inner;
    }
  / min:ConstraintValue _ ".." _ max:ConstraintValue extMarker:(_ "," _ "...")?
    {
      var result = {};
      if (min !== null) result.min = min;
      if (max !== null) result.max = max;
      if (extMarker) result.extensible = true;
      return result;
    }
  / val:ConstraintValue extMarker:(_ "," _ "...")?
    {
      var result = { min: val, max: val };
      if (extMarker) result.extensible = true;
      return result;
    }

ConstraintValue
  = "MIN" { return undefined; }
  / "MAX" { return undefined; }
  / Number

ReferencedType
  = name:TypeReference !(_ "::=")
    {
      return { kind: "TypeReference", name: name };
    }

TypeReference
  = first:[A-Z] rest:[A-Za-z0-9-]* { return first + rest.join(""); }

Identifier
  = first:[a-z] rest:[A-Za-z0-9-]* { return first + rest.join(""); }

Number
  = sign:"-"? digits:[0-9]+ { return parseInt((sign || "") + digits.join(""), 10); }

QuotedString
  = '"' chars:[^"]* '"' { return chars.join(""); }

// Whitespace and comments
_
  = (WhiteSpace / Comment)*

WhiteSpace
  = [ \\t\\n\\r]+

Comment
  = "--" [^\\n]* ("\\n" / !.)
`;
