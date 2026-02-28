import { useState } from 'react';
import {
  parseAsn1Module,
  convertModuleToSchemaNodes,
  SchemaBuilder,
  BitBuffer,
} from 'asn1-per-ts';
import type { SchemaNode } from 'asn1-per-ts';
import SchemaNodeForm, { getInitialValue, convertForEncoding } from './SchemaNodeForm';

const SIMPLE_EXAMPLE = `SimpleProtocol DEFINITIONS AUTOMATIC TAGS ::= BEGIN

Message ::= SEQUENCE {
    id INTEGER (0..255),
    active BOOLEAN,
    status Status
}

Status ::= ENUMERATED { pending, approved, rejected }

END`;

const CHOICE_EXAMPLE = `ChoiceDemo DEFINITIONS AUTOMATIC TAGS ::= BEGIN

Packet ::= SEQUENCE {
    tag INTEGER (0..15),
    payload Payload
}

Payload ::= CHOICE {
    text IA5String,
    number INTEGER (0..65535),
    flag BOOLEAN
}

END`;

const EXTENSION_EXAMPLE = `ExtensionDemo DEFINITIONS AUTOMATIC TAGS ::= BEGIN

MessageV2 ::= SEQUENCE {
    id INTEGER (0..255),
    name IA5String,
    ...,
    email IA5String
}

Color ::= ENUMERATED { red, green, blue, ..., yellow, purple }

END`;

const DEFAULT_EXAMPLE = `DefaultDemo DEFINITIONS AUTOMATIC TAGS ::= BEGIN

Config ::= SEQUENCE {
    retries INTEGER (0..10) DEFAULT 3,
    timeout INTEGER (0..3600) DEFAULT 30,
    label IA5String,
    verbose BOOLEAN DEFAULT FALSE,
    mode Mode OPTIONAL
}

Mode ::= ENUMERATED { fast, balanced, thorough }

END`;

const EXAMPLES = [
  { label: 'Simple Protocol', text: SIMPLE_EXAMPLE },
  { label: 'Choice Demo', text: CHOICE_EXAMPLE },
  { label: 'Extension Markers', text: EXTENSION_EXAMPLE },
  { label: 'Default Values', text: DEFAULT_EXAMPLE },
];

export default function AsnFormBuilder() {
  const [asnText, setAsnText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [allSchemas, setAllSchemas] = useState<Record<string, SchemaNode>>({});
  const [typeNames, setTypeNames] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [formValue, setFormValue] = useState<unknown>(null);
  const [encodeOutput, setEncodeOutput] = useState('');
  const [encodeError, setEncodeError] = useState<string | null>(null);

  const handleParse = (text?: string) => {
    const input = text ?? asnText;
    setParseError(null);
    setAllSchemas({});
    setTypeNames([]);
    setSelectedType(null);
    setFormValue(null);
    setEncodeOutput('');
    setEncodeError(null);

    if (!input.trim()) {
      setParseError('Enter ASN.1 notation to parse');
      return;
    }

    try {
      const mod = parseAsn1Module(input);
      const converted = convertModuleToSchemaNodes(mod);
      const names = Object.keys(converted);
      if (names.length === 0) {
        setParseError('No type assignments found in module');
        return;
      }
      setAllSchemas(converted);
      setTypeNames(names);
      selectType(names[0], converted);
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : 'Parse failed');
    }
  };

  const selectType = (name: string, schemas?: Record<string, SchemaNode>) => {
    const s = schemas ?? allSchemas;
    setSelectedType(name);
    setFormValue(getInitialValue(s[name], s));
    setEncodeOutput('');
    setEncodeError(null);
  };

  const handleEncode = () => {
    if (!selectedType || !allSchemas[selectedType]) return;
    try {
      const converted = convertForEncoding(allSchemas[selectedType], formValue, allSchemas);
      const codecs = SchemaBuilder.buildAll(allSchemas);
      const codec = codecs[selectedType];
      const buffer = BitBuffer.alloc();
      codec.encode(buffer, converted);
      setEncodeOutput(buffer.toHex());
      setEncodeError(null);
    } catch (e: unknown) {
      setEncodeError(e instanceof Error ? e.message : 'Encoding failed');
      setEncodeOutput('');
    }
  };

  const handleExampleClick = (text: string) => {
    setAsnText(text);
    handleParse(text);
  };

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Form Builder</h2>

      {/* ASN.1 Input */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => handleExampleClick(ex.text)}
              className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 transition-colors border border-indigo-200"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-500">
          Paste an ASN.1 module below. The parsed schema will generate an interactive form
          for building values and encoding to PER.
        </p>

        <textarea
          value={asnText}
          onChange={(e) => setAsnText(e.target.value)}
          spellCheck={false}
          className={`w-full h-48 font-mono text-sm p-4 border rounded-lg resize-y focus:outline-none focus:ring-2 ${
            parseError
              ? 'border-red-300 focus:ring-red-300 bg-red-50'
              : 'border-gray-300 focus:ring-indigo-300 bg-gray-50'
          }`}
          placeholder={`MyModule DEFINITIONS AUTOMATIC TAGS ::= BEGIN\n\n  MyType ::= SEQUENCE {\n    id INTEGER (0..255),\n    name IA5String\n  }\n\nEND`}
        />

        <button
          onClick={() => handleParse()}
          className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Parse Module
        </button>

        {parseError && <p className="text-red-600 text-xs">{parseError}</p>}
      </div>

      {/* Type Selector + Form + Encode */}
      {typeNames.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          {/* Type selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">Select type:</label>
            <div className="flex flex-wrap gap-2">
              {typeNames.map((name) => (
                <button
                  key={name}
                  onClick={() => selectType(name)}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    selectedType === name
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          {selectedType && allSchemas[selectedType] && formValue !== null && (
            <>
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <SchemaNodeForm
                  key={selectedType}
                  node={allSchemas[selectedType]}
                  value={formValue}
                  onChange={setFormValue}
                  allSchemas={allSchemas}
                />
              </div>

              {/* JSON Preview */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Form value (JSON):
                </label>
                <pre className="text-xs font-mono bg-white border border-gray-200 rounded p-3 overflow-auto max-h-40 text-gray-700">
                  {JSON.stringify(formValue, null, 2)}
                </pre>
              </div>

              {/* Encode */}
              <div className="flex items-center gap-4">
                <button
                  onClick={handleEncode}
                  className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  Encode to PER
                </button>
                {encodeOutput && (
                  <button
                    onClick={() => navigator.clipboard.writeText(encodeOutput)}
                    className="px-4 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    Copy hex
                  </button>
                )}
              </div>

              {encodeError && <p className="text-red-600 text-xs">{encodeError}</p>}

              {encodeOutput && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    PER encoded (hex):
                  </label>
                  <div className="font-mono text-sm p-3 bg-white border border-gray-200 rounded break-all">
                    {encodeOutput}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
