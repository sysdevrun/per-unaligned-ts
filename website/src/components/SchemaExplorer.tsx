import { useState } from 'react';
import { parseAsn1Module, convertModuleToSchemaNodes, SchemaCodec } from 'asn1-per-ts';
import type { SchemaNode } from 'asn1-per-ts';
import NodeEditor, { getInitialValue, prepareForEncoding } from './NodeEditor';

const EXAMPLES = [
  {
    label: 'Simple Protocol',
    text: `SimpleProtocol DEFINITIONS AUTOMATIC TAGS ::= BEGIN

Message ::= SEQUENCE {
    id INTEGER (0..255),
    active BOOLEAN,
    status Status
}

Status ::= ENUMERATED { pending, approved, rejected }

END`,
  },
  {
    label: 'With Defaults',
    text: `DefaultDemo DEFINITIONS AUTOMATIC TAGS ::= BEGIN

Config ::= SEQUENCE {
    version INTEGER (1..10) DEFAULT 1,
    name IA5String (SIZE(1..50)),
    enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER (0..255) DEFAULT 5
}

END`,
  },
  {
    label: 'Choice & Optional',
    text: `ChoiceDemo DEFINITIONS AUTOMATIC TAGS ::= BEGIN

Packet ::= SEQUENCE {
    tag INTEGER (0..15),
    payload Payload,
    priority INTEGER (1..10) OPTIONAL
}

Payload ::= CHOICE {
    text IA5String (SIZE(0..100)),
    number INTEGER (0..65535),
    flag BOOLEAN
}

END`,
  },
];

export default function SchemaExplorer() {
  const [asnText, setAsnText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<Record<string, SchemaNode>>({});
  const [typeNames, setTypeNames] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [formValue, setFormValue] = useState<unknown>(null);
  const [hexOutput, setHexOutput] = useState('');
  const [encodeError, setEncodeError] = useState<string | null>(null);

  const handleParse = (text?: string) => {
    const input = text ?? asnText;
    setParseError(null);
    setSchemas({});
    setTypeNames([]);
    setSelectedType(null);
    setFormValue(null);
    setHexOutput('');
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
      setSchemas(converted);
      setTypeNames(names);
      setSelectedType(names[0]);
      setFormValue(getInitialValue(converted[names[0]]));
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : 'Parse failed');
    }
  };

  const handleTypeSelect = (name: string) => {
    setSelectedType(name);
    setFormValue(getInitialValue(schemas[name]));
    setHexOutput('');
    setEncodeError(null);
  };

  const handleExampleClick = (text: string) => {
    setAsnText(text);
    handleParse(text);
  };

  const handleEncode = () => {
    if (!selectedType || !schemas[selectedType]) return;
    try {
      const schema = schemas[selectedType];
      const prepared = prepareForEncoding(schema, formValue);
      const codec = new SchemaCodec(schema);
      const hex = codec.encodeToHex(prepared);
      setHexOutput(hex);
      setEncodeError(null);
    } catch (e: unknown) {
      setEncodeError(e instanceof Error ? e.message : 'Encoding failed');
      setHexOutput('');
    }
  };

  const selectedSchema = selectedType ? schemas[selectedType] : null;

  return (
    <div className="space-y-4">
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
        Paste an ASN.1 module below to generate an interactive form with constraint validation.
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
        Parse & Build Form
      </button>

      {parseError && <p className="text-red-600 text-xs">{parseError}</p>}

      {typeNames.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">Select type:</label>
            <div className="flex flex-wrap gap-2">
              {typeNames.map((name) => (
                <button
                  key={name}
                  onClick={() => handleTypeSelect(name)}
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

          {selectedSchema && formValue !== null && (
            <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">
                {selectedType}
                <span className="ml-2 text-xs font-normal px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-mono">
                  {selectedSchema.type}
                </span>
              </h3>

              <NodeEditor
                schema={selectedSchema}
                value={formValue}
                onChange={setFormValue}
              />

              <div className="pt-3 border-t border-gray-100">
                <button
                  onClick={handleEncode}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Encode to Hex
                </button>
              </div>

              {encodeError && <p className="text-red-600 text-xs">{encodeError}</p>}

              {hexOutput && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Hex Output
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-gray-50 border border-gray-200 rounded p-3 break-all flex-1">
                      {hexOutput}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(hexOutput)}
                      className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  JSON value preview
                </summary>
                <pre className="mt-1 font-mono bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-48 text-gray-700">
                  {JSON.stringify(formValue, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
