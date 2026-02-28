import { useState } from 'react';
import type { SchemaNode } from 'asn1-per-ts';

interface NodeEditorProps {
  schema: SchemaNode;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function getInitialValue(schema: SchemaNode): unknown {
  switch (schema.type) {
    case 'BOOLEAN':
      return false;
    case 'NULL':
      return null;
    case 'INTEGER':
      return schema.min ?? 0;
    case 'ENUMERATED':
      return schema.values[0] ?? '';
    case 'BIT STRING':
    case 'OCTET STRING':
      return '';
    case 'IA5String':
    case 'VisibleString':
    case 'UTF8String':
      return '';
    case 'OBJECT IDENTIFIER':
      return '';
    case 'CHOICE': {
      const first = schema.alternatives[0];
      return first
        ? { key: first.name, value: getInitialValue(first.schema) }
        : { key: '', value: null };
    }
    case 'SEQUENCE': {
      const obj: Record<string, unknown> = {};
      for (const field of schema.fields) {
        if (field.defaultValue !== undefined) continue;
        if (field.optional) continue;
        obj[field.name] = getInitialValue(field.schema);
      }
      return obj;
    }
    case 'SEQUENCE OF':
      return [];
    case '$ref':
      return null;
    default:
      return null;
  }
}

export function prepareForEncoding(schema: SchemaNode, value: unknown): unknown {
  switch (schema.type) {
    case 'BIT STRING':
    case 'OCTET STRING': {
      const hex = value as string;
      if (!hex) return new Uint8Array(0);
      const padded = hex.length % 2 ? hex + '0' : hex;
      const bytes = new Uint8Array(padded.length / 2);
      for (let i = 0; i < padded.length; i += 2) {
        bytes[i / 2] = parseInt(padded.slice(i, i + 2), 16);
      }
      return bytes;
    }
    case 'CHOICE': {
      const choiceVal = value as { key: string; value: unknown };
      const alt = [...schema.alternatives, ...(schema.extensionAlternatives ?? [])].find(
        (a) => a.name === choiceVal.key
      );
      return {
        key: choiceVal.key,
        value: alt ? prepareForEncoding(alt.schema, choiceVal.value) : choiceVal.value,
      };
    }
    case 'SEQUENCE': {
      const seqVal = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      const allFields = [...schema.fields, ...(schema.extensionFields ?? [])];
      for (const field of allFields) {
        if (field.name in seqVal) {
          result[field.name] = prepareForEncoding(field.schema, seqVal[field.name]);
        }
      }
      return result;
    }
    case 'SEQUENCE OF': {
      const arr = value as unknown[];
      return arr.map((item) => prepareForEncoding(schema.item, item));
    }
    default:
      return value;
  }
}

const inputBase =
  'w-full px-3 py-1.5 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 font-mono';
const inputNormal = `${inputBase} border-gray-300 focus:ring-indigo-300`;
const inputError = `${inputBase} border-red-300 focus:ring-red-300 bg-red-50`;

function ConstraintText({ text }: { text: string }) {
  return <span className="text-xs text-gray-400">{text}</span>;
}

function ValidationError({ message }: { message: string }) {
  return <p className="text-xs text-red-500 mt-0.5">{message}</p>;
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-mono">
      {type}
    </span>
  );
}

// ---- BOOLEAN ----

function BooleanEditor({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
      />
      <span className="text-sm text-gray-600">{value ? 'TRUE' : 'FALSE'}</span>
    </label>
  );
}

// ---- NULL ----

function NullEditor() {
  return <span className="text-sm text-gray-400 italic">null (no value)</span>;
}

// ---- INTEGER ----

function IntegerEditor({
  schema,
  value,
  onChange,
}: {
  schema: Extract<SchemaNode, { type: 'INTEGER' }>;
  value: number;
  onChange: (v: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const validate = (num: number) => {
    if (schema.min !== undefined && num < schema.min) {
      setError(`Must be >= ${schema.min}`);
      return;
    }
    if (schema.max !== undefined && num > schema.max) {
      setError(`Must be <= ${schema.max}`);
      return;
    }
    setError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '-') {
      onChange(schema.min ?? 0);
      validate(schema.min ?? 0);
      return;
    }
    const num = parseInt(raw, 10);
    if (isNaN(num)) return;
    validate(num);
    onChange(num);
  };

  const parts: string[] = [];
  if (schema.min !== undefined) parts.push(`min: ${schema.min}`);
  if (schema.max !== undefined) parts.push(`max: ${schema.max}`);
  if (schema.extensible) parts.push('extensible');

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={handleChange}
          min={schema.min}
          max={schema.max}
          className={error ? inputError : inputNormal}
          style={{ maxWidth: '200px' }}
        />
        {parts.length > 0 && <ConstraintText text={`(${parts.join(', ')})`} />}
      </div>
      {error && <ValidationError message={error} />}
    </div>
  );
}

// ---- ENUMERATED ----

function EnumeratedEditor({
  schema,
  value,
  onChange,
}: {
  schema: Extract<SchemaNode, { type: 'ENUMERATED' }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputNormal}
      style={{ maxWidth: '250px' }}
    >
      {schema.values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
      {schema.extensionValues && schema.extensionValues.length > 0 && (
        <optgroup label="Extension values">
          {schema.extensionValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// ---- BIT STRING ----

function BitStringEditor({
  schema,
  value,
  onChange,
}: {
  schema: Extract<SchemaNode, { type: 'BIT STRING' }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const validate = (hex: string) => {
    if (!hex) {
      if (schema.fixedSize || (schema.minSize && schema.minSize > 0)) {
        setError('Value required');
      } else {
        setError(null);
      }
      return;
    }
    const bits = hex.length * 4;
    if (schema.fixedSize !== undefined && bits !== schema.fixedSize) {
      setError(`Must be exactly ${schema.fixedSize} bits (${Math.ceil(schema.fixedSize / 4)} hex chars)`);
      return;
    }
    if (schema.minSize !== undefined && bits < schema.minSize) {
      setError(`Must be >= ${schema.minSize} bits`);
      return;
    }
    if (schema.maxSize !== undefined && bits > schema.maxSize) {
      setError(`Must be <= ${schema.maxSize} bits`);
      return;
    }
    setError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.replace(/[^0-9a-fA-F]/g, '');
    validate(hex);
    onChange(hex);
  };

  const parts: string[] = [];
  if (schema.fixedSize !== undefined) parts.push(`fixed: ${schema.fixedSize} bits`);
  if (schema.minSize !== undefined) parts.push(`min: ${schema.minSize} bits`);
  if (schema.maxSize !== undefined) parts.push(`max: ${schema.maxSize} bits`);
  if (schema.extensible) parts.push('extensible');

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="hex (e.g. a0ff)"
          className={error ? inputError : inputNormal}
          style={{ maxWidth: '300px' }}
        />
        {parts.length > 0 && <ConstraintText text={`(${parts.join(', ')})`} />}
      </div>
      {error && <ValidationError message={error} />}
    </div>
  );
}

// ---- OCTET STRING ----

function OctetStringEditor({
  schema,
  value,
  onChange,
}: {
  schema: Extract<SchemaNode, { type: 'OCTET STRING' }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const validate = (hex: string) => {
    if (!hex) {
      if (schema.fixedSize || (schema.minSize && schema.minSize > 0)) {
        setError('Value required');
      } else {
        setError(null);
      }
      return;
    }
    if (hex.length % 2 !== 0) {
      setError('Must have even number of hex characters');
      return;
    }
    const octets = hex.length / 2;
    if (schema.fixedSize !== undefined && octets !== schema.fixedSize) {
      setError(`Must be exactly ${schema.fixedSize} octets (${schema.fixedSize * 2} hex chars)`);
      return;
    }
    if (schema.minSize !== undefined && octets < schema.minSize) {
      setError(`Must be >= ${schema.minSize} octets`);
      return;
    }
    if (schema.maxSize !== undefined && octets > schema.maxSize) {
      setError(`Must be <= ${schema.maxSize} octets`);
      return;
    }
    setError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.replace(/[^0-9a-fA-F]/g, '');
    validate(hex);
    onChange(hex);
  };

  const parts: string[] = [];
  if (schema.fixedSize !== undefined) parts.push(`fixed: ${schema.fixedSize} octets`);
  if (schema.minSize !== undefined) parts.push(`min: ${schema.minSize} octets`);
  if (schema.maxSize !== undefined) parts.push(`max: ${schema.maxSize} octets`);
  if (schema.extensible) parts.push('extensible');

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="hex (e.g. 0a1b2c)"
          className={error ? inputError : inputNormal}
          style={{ maxWidth: '300px' }}
        />
        {parts.length > 0 && <ConstraintText text={`(${parts.join(', ')})`} />}
      </div>
      {error && <ValidationError message={error} />}
    </div>
  );
}

// ---- Character Strings (IA5String, VisibleString, UTF8String) ----

type CharStringSchema = Extract<SchemaNode, { type: 'IA5String' | 'VisibleString' | 'UTF8String' }>;

function StringEditor({
  schema,
  value,
  onChange,
}: {
  schema: CharStringSchema;
  value: string;
  onChange: (v: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const validate = (str: string) => {
    if (schema.alphabet) {
      for (const ch of str) {
        if (!schema.alphabet.includes(ch)) {
          setError(`Character '${ch}' not in permitted alphabet`);
          return;
        }
      }
    }
    if (schema.fixedSize !== undefined && str.length !== schema.fixedSize) {
      setError(`Must be exactly ${schema.fixedSize} characters`);
      return;
    }
    if (schema.minSize !== undefined && str.length < schema.minSize) {
      setError(`Must be >= ${schema.minSize} characters`);
      return;
    }
    if (schema.maxSize !== undefined && str.length > schema.maxSize) {
      setError(`Must be <= ${schema.maxSize} characters`);
      return;
    }
    setError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let str = e.target.value;
    if (schema.alphabet) {
      str = str
        .split('')
        .filter((ch) => schema.alphabet!.includes(ch))
        .join('');
    }
    const maxLen = schema.fixedSize ?? schema.maxSize;
    if (maxLen !== undefined) {
      str = str.slice(0, maxLen);
    }
    validate(str);
    onChange(str);
  };

  const parts: string[] = [];
  if (schema.fixedSize !== undefined) parts.push(`fixed: ${schema.fixedSize} chars`);
  if (schema.minSize !== undefined) parts.push(`min: ${schema.minSize}`);
  if (schema.maxSize !== undefined) parts.push(`max: ${schema.maxSize}`);
  if (schema.alphabet) {
    const display =
      schema.alphabet.length > 20 ? schema.alphabet.slice(0, 20) + '...' : schema.alphabet;
    parts.push(`alphabet: "${display}"`);
  }
  if (schema.extensible) parts.push('extensible');

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          maxLength={schema.fixedSize ?? schema.maxSize}
          className={error ? inputError : inputNormal}
          style={{ maxWidth: '400px' }}
        />
        {parts.length > 0 && <ConstraintText text={`(${parts.join(', ')})`} />}
      </div>
      {value.length > 0 && <span className="text-xs text-gray-400">{value.length} chars</span>}
      {error && <ValidationError message={error} />}
    </div>
  );
}

// ---- OBJECT IDENTIFIER ----

function OidEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const filtered = raw.replace(/[^0-9.]/g, '');
    if (filtered && !/^\d+(\.\d+)*\.?$/.test(filtered)) {
      setError('Invalid OID format (use dot notation: 1.2.3.4)');
    } else {
      setError(null);
    }
    onChange(filtered);
  };

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="1.2.840.113549"
        className={error ? inputError : inputNormal}
        style={{ maxWidth: '300px' }}
      />
      {error && <ValidationError message={error} />}
    </div>
  );
}

// ---- CHOICE ----

function ChoiceEditor({
  schema,
  value,
  onChange,
}: {
  schema: Extract<SchemaNode, { type: 'CHOICE' }>;
  value: { key: string; value: unknown };
  onChange: (v: { key: string; value: unknown }) => void;
}) {
  const allAlternatives = [
    ...schema.alternatives,
    ...(schema.extensionAlternatives ?? []),
  ];

  const selected = allAlternatives.find((a) => a.name === value.key);

  const handleKeyChange = (newKey: string) => {
    const alt = allAlternatives.find((a) => a.name === newKey);
    onChange({
      key: newKey,
      value: alt ? getInitialValue(alt.schema) : null,
    });
  };

  return (
    <div className="space-y-2">
      <select
        value={value.key}
        onChange={(e) => handleKeyChange(e.target.value)}
        className={inputNormal}
        style={{ maxWidth: '250px' }}
      >
        {schema.alternatives.map((a) => (
          <option key={a.name} value={a.name}>
            {a.name}
          </option>
        ))}
        {schema.extensionAlternatives && schema.extensionAlternatives.length > 0 && (
          <optgroup label="Extension alternatives">
            {schema.extensionAlternatives.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {selected && (
        <div className="pl-4 border-l-2 border-indigo-200">
          <NodeEditor
            schema={selected.schema}
            value={value.value}
            onChange={(v) => onChange({ ...value, value: v })}
          />
        </div>
      )}
    </div>
  );
}

// ---- SEQUENCE ----

function SequenceEditor({
  schema,
  value,
  onChange,
}: {
  schema: Extract<SchemaNode, { type: 'SEQUENCE' }>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const allFields = [
    ...schema.fields.map((f) => ({ ...f, isExtension: false })),
    ...(schema.extensionFields ?? []).map((f) => ({ ...f, isExtension: true })),
  ];

  return (
    <div className="space-y-3">
      {allFields.map(({ isExtension, ...field }) => (
        <SequenceFieldEditor
          key={field.name}
          field={field}
          isExtension={isExtension}
          value={value[field.name]}
          onChange={(v) => {
            const next = { ...value };
            if (v === undefined) {
              delete next[field.name];
            } else {
              next[field.name] = v;
            }
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

function SequenceFieldEditor({
  field,
  isExtension,
  value,
  onChange,
}: {
  field: {
    name: string;
    schema: SchemaNode;
    optional?: boolean;
    defaultValue?: unknown;
  };
  isExtension: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const hasDefault = field.defaultValue !== undefined;
  const isOptional = field.optional || isExtension;
  const isIncluded = value !== undefined;
  const [useDefault, setUseDefault] = useState(hasDefault && !isIncluded);

  const handleToggleInclude = () => {
    if (isIncluded) {
      onChange(undefined);
    } else {
      onChange(getInitialValue(field.schema));
    }
  };

  const handleToggleDefault = (checked: boolean) => {
    setUseDefault(checked);
    if (checked) {
      onChange(undefined);
    } else {
      onChange(getInitialValue(field.schema));
    }
  };

  return (
    <div
      className={`p-3 rounded-lg border ${
        isExtension
          ? 'border-dashed border-amber-300 bg-amber-50/50'
          : 'border-gray-200 bg-gray-50/50'
      }`}
    >
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-sm font-medium text-gray-800">{field.name}</span>
        <TypeBadge type={field.schema.type} />
        {isExtension && (
          <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">ext</span>
        )}
        {isOptional && !hasDefault && (
          <label className="flex items-center gap-1 ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={isIncluded}
              onChange={handleToggleInclude}
              className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
            />
            <span className="text-xs text-gray-500">include</span>
          </label>
        )}
        {hasDefault && (
          <label className="flex items-center gap-1 ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={useDefault}
              onChange={(e) => handleToggleDefault(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
            />
            <span className="text-xs text-gray-500">
              use default ({JSON.stringify(field.defaultValue)})
            </span>
          </label>
        )}
      </div>
      {hasDefault && useDefault ? (
        <div className="text-sm text-gray-400 italic pl-2">
          Default: {JSON.stringify(field.defaultValue)}
        </div>
      ) : isOptional && !isIncluded ? (
        <div className="text-sm text-gray-400 italic pl-2">Not included</div>
      ) : (
        <div className="pl-2">
          <NodeEditor
            schema={field.schema}
            value={value ?? getInitialValue(field.schema)}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}

// ---- SEQUENCE OF ----

function SequenceOfEditor({
  schema,
  value,
  onChange,
}: {
  schema: Extract<SchemaNode, { type: 'SEQUENCE OF' }>;
  value: unknown[];
  onChange: (v: unknown[]) => void;
}) {
  const canAdd =
    schema.fixedSize === undefined &&
    (schema.maxSize === undefined || value.length < schema.maxSize);
  const canRemove =
    schema.fixedSize === undefined &&
    (schema.minSize === undefined || value.length > schema.minSize);

  const handleAdd = () => {
    onChange([...value, getInitialValue(schema.item)]);
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, itemValue: unknown) => {
    const next = [...value];
    next[index] = itemValue;
    onChange(next);
  };

  const parts: string[] = [];
  if (schema.fixedSize !== undefined) parts.push(`fixed: ${schema.fixedSize} items`);
  if (schema.minSize !== undefined) parts.push(`min: ${schema.minSize}`);
  if (schema.maxSize !== undefined) parts.push(`max: ${schema.maxSize}`);
  if (schema.extensible) parts.push('extensible');

  return (
    <div className="space-y-2">
      {parts.length > 0 && <ConstraintText text={`(${parts.join(', ')})`} />}
      <div className="text-xs text-gray-500">{value.length} item(s)</div>
      {value.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1 p-3 rounded-lg border border-gray-200 bg-gray-50/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500">[{index}]</span>
              {canRemove && (
                <button
                  onClick={() => handleRemove(index)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  remove
                </button>
              )}
            </div>
            <NodeEditor
              schema={schema.item}
              value={item}
              onChange={(v) => handleItemChange(index, v)}
            />
          </div>
        </div>
      ))}
      {canAdd && (
        <button
          onClick={handleAdd}
          className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 transition-colors border border-indigo-200"
        >
          + Add item
        </button>
      )}
    </div>
  );
}

// ---- Main NodeEditor ----

export default function NodeEditor({ schema, value, onChange }: NodeEditorProps) {
  switch (schema.type) {
    case 'BOOLEAN':
      return <BooleanEditor value={value as boolean} onChange={onChange} />;
    case 'NULL':
      return <NullEditor />;
    case 'INTEGER':
      return (
        <IntegerEditor
          schema={schema}
          value={value as number}
          onChange={onChange}
        />
      );
    case 'ENUMERATED':
      return (
        <EnumeratedEditor
          schema={schema}
          value={value as string}
          onChange={onChange}
        />
      );
    case 'BIT STRING':
      return (
        <BitStringEditor
          schema={schema}
          value={value as string}
          onChange={onChange}
        />
      );
    case 'OCTET STRING':
      return (
        <OctetStringEditor
          schema={schema}
          value={value as string}
          onChange={onChange}
        />
      );
    case 'IA5String':
    case 'VisibleString':
    case 'UTF8String':
      return (
        <StringEditor
          schema={schema}
          value={value as string}
          onChange={onChange}
        />
      );
    case 'OBJECT IDENTIFIER':
      return <OidEditor value={value as string} onChange={onChange} />;
    case 'CHOICE':
      return (
        <ChoiceEditor
          schema={schema}
          value={value as { key: string; value: unknown }}
          onChange={onChange}
        />
      );
    case 'SEQUENCE':
      return (
        <SequenceEditor
          schema={schema}
          value={value as Record<string, unknown>}
          onChange={onChange}
        />
      );
    case 'SEQUENCE OF':
      return (
        <SequenceOfEditor
          schema={schema}
          value={value as unknown[]}
          onChange={onChange}
        />
      );
    case '$ref':
      return (
        <div className="text-xs text-amber-600 italic">
          Recursive type reference ({schema.ref}) - not editable in form
        </div>
      );
    default:
      return (
        <div className="text-xs text-gray-400">
          Unsupported type: {(schema as { type: string }).type}
        </div>
      );
  }
}
