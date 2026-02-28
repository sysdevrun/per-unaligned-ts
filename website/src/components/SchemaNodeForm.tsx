import { useState } from 'react';
import type { SchemaNode } from 'asn1-per-ts';

// ========================================
// Utility functions (exported)
// ========================================

export function getInitialValue(
  node: SchemaNode,
  allSchemas?: Record<string, SchemaNode>,
): unknown {
  switch (node.type) {
    case 'BOOLEAN':
      return false;
    case 'NULL':
      return null;
    case 'INTEGER':
      return node.min ?? 0;
    case 'ENUMERATED':
      return node.values[0] ?? '';
    case 'BIT STRING':
    case 'OCTET STRING':
      return '';
    case 'OBJECT IDENTIFIER':
      return '';
    case 'IA5String':
    case 'VisibleString':
    case 'UTF8String':
      return '';
    case 'CHOICE': {
      const alt = node.alternatives[0];
      return alt ? { [alt.name]: getInitialValue(alt.schema, allSchemas) } : {};
    }
    case 'SEQUENCE': {
      const obj: Record<string, unknown> = {};
      for (const f of node.fields) {
        if (!f.optional && f.defaultValue === undefined) {
          obj[f.name] = getInitialValue(f.schema, allSchemas);
        }
      }
      return obj;
    }
    case 'SEQUENCE OF':
      return [];
    case '$ref':
      return allSchemas?.[node.ref]
        ? getInitialValue(allSchemas[node.ref], allSchemas)
        : null;
    default:
      return null;
  }
}

export function convertForEncoding(
  node: SchemaNode,
  value: unknown,
  allSchemas?: Record<string, SchemaNode>,
): unknown {
  if (value === null || value === undefined) return value;

  switch (node.type) {
    case 'BOOLEAN':
    case 'NULL':
    case 'INTEGER':
    case 'ENUMERATED':
    case 'OBJECT IDENTIFIER':
      return value;

    case 'BIT STRING':
    case 'OCTET STRING': {
      const hex = (value as string).replace(/\s+/g, '');
      if (!hex) return new Uint8Array(0);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }

    case 'IA5String':
    case 'VisibleString':
    case 'UTF8String':
      return value;

    case 'CHOICE': {
      const obj = value as Record<string, unknown>;
      const key = Object.keys(obj)[0];
      if (!key) return obj;
      const allAlts = [...node.alternatives, ...(node.extensionAlternatives ?? [])];
      const alt = allAlts.find((a) => a.name === key);
      if (!alt) return obj;
      return { [key]: convertForEncoding(alt.schema, obj[key], allSchemas) };
    }

    case 'SEQUENCE': {
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      const allFields = [...node.fields, ...(node.extensionFields ?? [])];
      for (const f of allFields) {
        if (f.name in obj) {
          result[f.name] = convertForEncoding(f.schema, obj[f.name], allSchemas);
        }
      }
      return result;
    }

    case 'SEQUENCE OF':
      return (value as unknown[]).map((item) =>
        convertForEncoding(node.item, item, allSchemas),
      );

    case '$ref':
      return allSchemas?.[node.ref]
        ? convertForEncoding(allSchemas[node.ref], value, allSchemas)
        : value;

    default:
      return value;
  }
}

// ========================================
// Internal helpers
// ========================================

function getConstraintText(node: SchemaNode): string {
  switch (node.type) {
    case 'INTEGER': {
      const parts: string[] = [];
      if (node.min !== undefined && node.max !== undefined) parts.push(`${node.min}..${node.max}`);
      else if (node.min !== undefined) parts.push(`${node.min}..MAX`);
      else if (node.max !== undefined) parts.push(`MIN..${node.max}`);
      if (node.extensible) parts.push('...');
      return parts.length ? ` (${parts.join(', ')})` : '';
    }
    case 'BIT STRING':
    case 'OCTET STRING': {
      if (node.fixedSize !== undefined) return ` (SIZE ${node.fixedSize})`;
      if (node.minSize !== undefined && node.maxSize !== undefined)
        return ` (SIZE ${node.minSize}..${node.maxSize})`;
      if (node.minSize !== undefined) return ` (SIZE ${node.minSize}..MAX)`;
      if (node.maxSize !== undefined) return ` (SIZE 0..${node.maxSize})`;
      return '';
    }
    case 'IA5String':
    case 'VisibleString':
    case 'UTF8String': {
      const parts: string[] = [];
      if (node.fixedSize !== undefined) parts.push(`SIZE ${node.fixedSize}`);
      else if (node.minSize !== undefined && node.maxSize !== undefined)
        parts.push(`SIZE ${node.minSize}..${node.maxSize}`);
      else if (node.minSize !== undefined) parts.push(`SIZE ${node.minSize}..MAX`);
      else if (node.maxSize !== undefined) parts.push(`SIZE 0..${node.maxSize}`);
      if (node.alphabet) parts.push('FROM ...');
      if (node.extensible) parts.push('...');
      return parts.length ? ` (${parts.join(', ')})` : '';
    }
    case 'SEQUENCE OF': {
      if (node.fixedSize !== undefined) return ` (SIZE ${node.fixedSize})`;
      if (node.minSize !== undefined && node.maxSize !== undefined)
        return ` (SIZE ${node.minSize}..${node.maxSize})`;
      if (node.minSize !== undefined) return ` (SIZE ${node.minSize}..MAX)`;
      if (node.maxSize !== undefined) return ` (SIZE 0..${node.maxSize})`;
      return '';
    }
    default:
      return '';
  }
}

const inputBase =
  'w-full max-w-xs border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2';
const inputOk = `${inputBase} border-gray-300 focus:ring-indigo-300`;
const inputErr = `${inputBase} border-red-300 focus:ring-red-300 bg-red-50`;

// ========================================
// Shared label
// ========================================

function FieldHeader({ label, typeText }: { label?: string; typeText: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
      <span className="text-xs text-gray-400 font-mono">{typeText}</span>
    </div>
  );
}

// ========================================
// BOOLEAN
// ========================================

function BooleanInput({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
      />
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
      <span className="text-xs text-gray-400 font-mono">BOOLEAN</span>
    </label>
  );
}

// ========================================
// NULL
// ========================================

function NullDisplay({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
      <span className="text-xs text-gray-400 font-mono">NULL</span>
      <span className="text-xs text-gray-400 italic">(no value)</span>
    </div>
  );
}

// ========================================
// INTEGER
// ========================================

function IntegerInput({
  node,
  value,
  onChange,
  label,
}: {
  node: Extract<SchemaNode, { type: 'INTEGER' }>;
  value: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  const constraint = getConstraintText(node);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '-') return;
    const v = Number(raw);
    if (isNaN(v)) return;

    if (node.min !== undefined && v < node.min) {
      setError(`Minimum value is ${node.min}`);
    } else if (node.max !== undefined && v > node.max) {
      setError(`Maximum value is ${node.max}`);
    } else {
      setError(null);
    }
    onChange(v);
  };

  return (
    <div>
      <FieldHeader label={label} typeText={`INTEGER${constraint}`} />
      <input
        type="number"
        min={node.min}
        max={node.max}
        value={value ?? ''}
        onChange={handleChange}
        className={error ? inputErr : inputOk}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ========================================
// ENUMERATED
// ========================================

function EnumeratedInput({
  node,
  value,
  onChange,
  label,
}: {
  node: Extract<SchemaNode, { type: 'ENUMERATED' }>;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const hasExt = (node.extensionValues ?? []).length > 0;
  return (
    <div>
      <FieldHeader label={label} typeText="ENUMERATED" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputOk}>
        {node.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
        {hasExt && <option disabled>── extension ──</option>}
        {(node.extensionValues ?? []).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

// ========================================
// Character strings (IA5String, VisibleString, UTF8String)
// ========================================

function CharStringInput({
  node,
  value,
  onChange,
  label,
}: {
  node: Extract<SchemaNode, { type: 'IA5String' | 'VisibleString' | 'UTF8String' }>;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const constraint = getConstraintText(node);
  const maxLen = node.fixedSize ?? node.maxSize;
  const minLen = node.fixedSize ?? node.minSize ?? 0;
  const [error, setError] = useState<string | null>(null);

  const validate = (v: string): string | null => {
    if (node.alphabet) {
      for (const ch of v) {
        if (!node.alphabet.includes(ch)) {
          return `Character '${ch}' is not in the allowed alphabet`;
        }
      }
    }
    if (maxLen !== undefined && v.length > maxLen) {
      return `Maximum length is ${maxLen}`;
    }
    if (v.length > 0 && v.length < minLen) {
      return `Minimum length is ${minLen}`;
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    // Block characters not in alphabet
    if (node.alphabet) {
      for (const ch of v) {
        if (!node.alphabet.includes(ch)) {
          setError(`Character '${ch}' is not in the allowed alphabet`);
          return;
        }
      }
    }
    setError(validate(v));
    onChange(v);
  };

  return (
    <div>
      <FieldHeader label={label} typeText={`${node.type}${constraint}`} />
      <input
        type="text"
        value={value ?? ''}
        maxLength={maxLen}
        onChange={handleChange}
        className={error ? inputErr : inputOk}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ========================================
// BIT STRING / OCTET STRING
// ========================================

function HexStringInput({
  node,
  value,
  onChange,
  label,
}: {
  node: Extract<SchemaNode, { type: 'BIT STRING' | 'OCTET STRING' }>;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const constraint = getConstraintText(node);
  const [error, setError] = useState<string | null>(null);

  const validate = (v: string): string | null => {
    const clean = v.replace(/\s+/g, '');
    if (clean && !/^[0-9a-fA-F]*$/.test(clean)) {
      return 'Invalid hex characters';
    }
    if (clean.length % 2 !== 0) {
      return 'Hex string must have even number of characters';
    }
    const byteLen = clean.length / 2;
    if (node.fixedSize !== undefined && byteLen !== 0 && byteLen !== node.fixedSize) {
      return `Must be exactly ${node.fixedSize} bytes (${node.fixedSize * 2} hex chars)`;
    }
    if (node.maxSize !== undefined && byteLen > node.maxSize) {
      return `Maximum ${node.maxSize} bytes`;
    }
    if (node.minSize !== undefined && byteLen > 0 && byteLen < node.minSize) {
      return `Minimum ${node.minSize} bytes`;
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setError(validate(v));
    onChange(v);
  };

  return (
    <div>
      <FieldHeader label={label} typeText={`${node.type}${constraint}`} />
      <input
        type="text"
        value={value ?? ''}
        onChange={handleChange}
        placeholder="ff00abcd"
        className={`${error ? inputErr : inputOk} font-mono`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <p className="text-xs text-gray-400 mt-0.5">Hex bytes</p>
    </div>
  );
}

// ========================================
// OBJECT IDENTIFIER
// ========================================

function OidInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div>
      <FieldHeader label={label} typeText="OBJECT IDENTIFIER" />
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="1.2.840.113549"
        className={`${inputOk} font-mono`}
      />
    </div>
  );
}

// ========================================
// CHOICE
// ========================================

function ChoiceForm({
  node,
  value,
  onChange,
  allSchemas,
  label,
}: {
  node: Extract<SchemaNode, { type: 'CHOICE' }>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  allSchemas?: Record<string, SchemaNode>;
  label?: string;
}) {
  const allAlts = [...node.alternatives, ...(node.extensionAlternatives ?? [])];
  const currentKey = Object.keys(value ?? {})[0] ?? allAlts[0]?.name ?? '';
  const currentAlt = allAlts.find((a) => a.name === currentKey);

  const handleAltChange = (name: string) => {
    const alt = allAlts.find((a) => a.name === name);
    if (!alt) return;
    onChange({ [name]: getInitialValue(alt.schema, allSchemas) });
  };

  return (
    <div>
      {label && <FieldHeader label={label} typeText="CHOICE" />}
      {!label && (
        <div className="mb-1">
          <span className="text-xs text-gray-400 font-mono">CHOICE</span>
        </div>
      )}
      <div className="border-l-2 border-purple-200 pl-4 space-y-3 pt-1">
        <select
          value={currentKey}
          onChange={(e) => handleAltChange(e.target.value)}
          className={inputOk}
        >
          {allAlts.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
        {currentAlt && (
          <SchemaNodeForm
            node={currentAlt.schema}
            value={(value ?? {})[currentKey]}
            onChange={(v) => onChange({ [currentKey]: v })}
            allSchemas={allSchemas}
          />
        )}
      </div>
    </div>
  );
}

// ========================================
// SEQUENCE
// ========================================

interface FieldDef {
  name: string;
  schema: SchemaNode;
  optional?: boolean;
  defaultValue?: unknown;
  extension: boolean;
}

function SequenceForm({
  node,
  value,
  onChange,
  allSchemas,
  label,
}: {
  node: Extract<SchemaNode, { type: 'SEQUENCE' }>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  allSchemas?: Record<string, SchemaNode>;
  label?: string;
}) {
  const allFields: FieldDef[] = [
    ...node.fields.map((f) => ({ ...f, extension: false })),
    ...(node.extensionFields ?? []).map((f) => ({ ...f, extension: true })),
  ];

  const [useDefaults, setUseDefaults] = useState<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {};
    for (const f of allFields) {
      if (f.defaultValue !== undefined) {
        result[f.name] = !(f.name in (value ?? {}));
      }
    }
    return result;
  });

  const [included, setIncluded] = useState<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {};
    for (const f of allFields) {
      if ((f.optional && f.defaultValue === undefined) || f.extension) {
        result[f.name] = f.name in (value ?? {});
      }
    }
    return result;
  });

  const handleFieldChange = (fieldName: string, fieldValue: unknown) => {
    onChange({ ...(value ?? {}), [fieldName]: fieldValue });
  };

  const toggleInclude = (field: FieldDef) => {
    const newVal = !included[field.name];
    setIncluded({ ...included, [field.name]: newVal });
    if (newVal) {
      const init = getInitialValue(field.schema, allSchemas);
      onChange({ ...(value ?? {}), [field.name]: init });
    } else {
      const next = { ...(value ?? {}) };
      delete next[field.name];
      onChange(next);
    }
  };

  const toggleDefault = (field: FieldDef) => {
    const newUseDefault = !useDefaults[field.name];
    setUseDefaults({ ...useDefaults, [field.name]: newUseDefault });
    if (newUseDefault) {
      const next = { ...(value ?? {}) };
      delete next[field.name];
      onChange(next);
    } else {
      const init =
        field.defaultValue !== undefined
          ? field.defaultValue
          : getInitialValue(field.schema, allSchemas);
      onChange({ ...(value ?? {}), [field.name]: init });
    }
  };

  const hasExtensions = (node.extensionFields ?? []).length > 0;
  const rootFields = allFields.filter((f) => !f.extension);
  const extFields = allFields.filter((f) => f.extension);

  function renderField(field: FieldDef) {
    const isOpt = (field.optional && field.defaultValue === undefined) || field.extension;
    const hasDef = field.defaultValue !== undefined;
    const isInc = isOpt ? !!included[field.name] : true;
    const isUsingDef = hasDef ? !!useDefaults[field.name] : false;

    return (
      <div key={field.name} className="space-y-1">
        {/* Default toggle */}
        {hasDef && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isUsingDef}
              onChange={() => toggleDefault(field)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
            />
            <span className="text-xs text-gray-500">
              Use default for <span className="font-medium">{field.name}</span> (
              {JSON.stringify(field.defaultValue)})
            </span>
          </label>
        )}

        {/* Optional include toggle */}
        {isOpt && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isInc}
              onChange={() => toggleInclude(field)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
            />
            <span className="text-xs text-gray-500">
              Include <span className="font-medium">{field.name}</span>
              {field.extension && (
                <span className="ml-1 text-amber-600">(extension)</span>
              )}
            </span>
          </label>
        )}

        {/* Field input */}
        {isInc && !isUsingDef && (
          <SchemaNodeForm
            node={field.schema}
            value={(value ?? {})[field.name] ?? getInitialValue(field.schema, allSchemas)}
            onChange={(v) => handleFieldChange(field.name, v)}
            allSchemas={allSchemas}
            label={field.name}
          />
        )}

        {/* Default value display */}
        {isUsingDef && (
          <div className="flex items-center gap-2 opacity-60">
            <span className="text-sm font-medium text-gray-700">{field.name}</span>
            <span className="text-xs text-gray-400 font-mono">{field.schema.type}</span>
            <span className="text-xs italic text-gray-500">
              = {JSON.stringify(field.defaultValue)}
            </span>
          </div>
        )}

        {/* Excluded label */}
        {isOpt && !isInc && (
          <div className="flex items-center gap-2 opacity-40">
            <span className="text-sm text-gray-500">{field.name}</span>
            <span className="text-xs text-gray-400 font-mono">{field.schema.type}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {label && <FieldHeader label={label} typeText="SEQUENCE" />}
      {!label && (
        <div className="mb-1">
          <span className="text-xs text-gray-400 font-mono">SEQUENCE</span>
        </div>
      )}
      <div className="border-l-2 border-indigo-200 pl-4 space-y-4 pt-1">
        {rootFields.map(renderField)}
        {hasExtensions && (
          <>
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 border-t border-dashed border-gray-300" />
              <span className="text-xs text-gray-400 italic">extension</span>
              <div className="flex-1 border-t border-dashed border-gray-300" />
            </div>
            {extFields.map(renderField)}
          </>
        )}
      </div>
    </div>
  );
}

// ========================================
// SEQUENCE OF
// ========================================

function SequenceOfForm({
  node,
  value,
  onChange,
  allSchemas,
  label,
}: {
  node: Extract<SchemaNode, { type: 'SEQUENCE OF' }>;
  value: unknown[];
  onChange: (v: unknown[]) => void;
  allSchemas?: Record<string, SchemaNode>;
  label?: string;
}) {
  const constraint = getConstraintText(node);
  const minItems = node.fixedSize ?? node.minSize ?? 0;
  const maxItems = node.fixedSize ?? node.maxSize;

  const items = value ?? [];

  const addItem = () => {
    if (maxItems !== undefined && items.length >= maxItems) return;
    onChange([...items, getInitialValue(node.item, allSchemas)]);
  };

  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  const updateItem = (i: number, v: unknown) => {
    const next = [...items];
    next[i] = v;
    onChange(next);
  };

  return (
    <div>
      {label && <FieldHeader label={label} typeText={`SEQUENCE OF${constraint}`} />}
      {!label && (
        <div className="mb-1">
          <span className="text-xs text-gray-400 font-mono">SEQUENCE OF{constraint}</span>
        </div>
      )}
      <div className="border-l-2 border-green-200 pl-4 space-y-3 pt-1">
        {items.map((item, i) => (
          <div key={i} className="border border-gray-200 rounded p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 font-mono">[{i}]</span>
              <button
                onClick={() => removeItem(i)}
                disabled={items.length <= minItems}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Remove
              </button>
            </div>
            <SchemaNodeForm
              node={node.item}
              value={item}
              onChange={(v) => updateItem(i, v)}
              allSchemas={allSchemas}
            />
          </div>
        ))}
        <button
          onClick={addItem}
          disabled={maxItems !== undefined && items.length >= maxItems}
          className="text-xs px-3 py-1.5 border border-dashed border-gray-300 rounded text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          + Add item ({items.length}
          {maxItems !== undefined ? ` / ${maxItems}` : ''})
        </button>
        {items.length < minItems && (
          <p className="text-xs text-amber-600">Need at least {minItems} items</p>
        )}
      </div>
    </div>
  );
}

// ========================================
// Main component
// ========================================

interface SchemaNodeFormProps {
  node: SchemaNode;
  value: unknown;
  onChange: (value: unknown) => void;
  allSchemas?: Record<string, SchemaNode>;
  label?: string;
}

export default function SchemaNodeForm({
  node,
  value,
  onChange,
  allSchemas,
  label,
}: SchemaNodeFormProps) {
  // Resolve $ref
  if (node.type === '$ref') {
    if (allSchemas && allSchemas[node.ref]) {
      return (
        <SchemaNodeForm
          node={allSchemas[node.ref]}
          value={value}
          onChange={onChange}
          allSchemas={allSchemas}
          label={label}
        />
      );
    }
    return <div className="text-red-500 text-xs">Unresolved reference: {node.ref}</div>;
  }

  switch (node.type) {
    case 'BOOLEAN':
      return <BooleanInput value={value as boolean} onChange={onChange as (v: boolean) => void} label={label} />;
    case 'NULL':
      return <NullDisplay label={label} />;
    case 'INTEGER':
      return <IntegerInput node={node} value={value as number} onChange={onChange as (v: number) => void} label={label} />;
    case 'ENUMERATED':
      return <EnumeratedInput node={node} value={value as string} onChange={onChange as (v: string) => void} label={label} />;
    case 'IA5String':
    case 'VisibleString':
    case 'UTF8String':
      return <CharStringInput node={node} value={value as string} onChange={onChange as (v: string) => void} label={label} />;
    case 'BIT STRING':
    case 'OCTET STRING':
      return <HexStringInput node={node} value={value as string} onChange={onChange as (v: string) => void} label={label} />;
    case 'OBJECT IDENTIFIER':
      return <OidInput value={value as string} onChange={onChange as (v: string) => void} label={label} />;
    case 'CHOICE':
      return (
        <ChoiceForm
          node={node}
          value={(value ?? {}) as Record<string, unknown>}
          onChange={onChange as (v: Record<string, unknown>) => void}
          allSchemas={allSchemas}
          label={label}
        />
      );
    case 'SEQUENCE':
      return (
        <SequenceForm
          node={node}
          value={(value ?? {}) as Record<string, unknown>}
          onChange={onChange as (v: Record<string, unknown>) => void}
          allSchemas={allSchemas}
          label={label}
        />
      );
    case 'SEQUENCE OF':
      return (
        <SequenceOfForm
          node={node}
          value={(value ?? []) as unknown[]}
          onChange={onChange as (v: unknown[]) => void}
          allSchemas={allSchemas}
          label={label}
        />
      );
    default:
      return (
        <div className="text-red-500 text-xs">
          Unknown type: {(node as { type: string }).type}
        </div>
      );
  }
}
