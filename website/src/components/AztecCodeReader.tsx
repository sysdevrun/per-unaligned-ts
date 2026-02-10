import { useState, useRef, useCallback } from 'react';
import { readBarcodes } from 'zxing-wasm/reader';
import type { ReadResult } from 'zxing-wasm/reader';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface AztecCodeReaderProps {
  onHexDecoded?: (hex: string) => void;
}

export default function AztecCodeReader({ onHexDecoded }: AztecCodeReaderProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hexOutput, setHexOutput] = useState<string | null>(null);
  const [barcodeFormat, setBarcodeFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    setHexOutput(null);
    setBarcodeFormat(null);
    setCopied(false);

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    setFileName(file.name);

    // Decode barcode
    setLoading(true);
    try {
      const results: ReadResult[] = await readBarcodes(file, {
        formats: ['Aztec'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        maxNumberOfSymbols: 1,
      });

      if (results.length === 0) {
        // Try again with all formats in case the barcode isn't Aztec
        const allResults = await readBarcodes(file, {
          formats: [],
          tryHarder: true,
          tryRotate: true,
          tryInvert: true,
          tryDownscale: true,
          maxNumberOfSymbols: 1,
        });

        if (allResults.length === 0) {
          setError('No barcode detected in the image. Try a clearer photo with better lighting.');
          return;
        }

        const result = allResults[0];
        if (!result.isValid) {
          setError(`Barcode detected but could not be decoded: ${result.error}`);
          return;
        }

        const hex = toHex(result.bytes);
        setHexOutput(hex);
        setBarcodeFormat(result.format);
        return;
      }

      const result = results[0];
      if (!result.isValid) {
        setError(`Aztec code detected but could not be decoded: ${result.error}`);
        return;
      }

      const hex = toHex(result.bytes);
      setHexOutput(hex);
      setBarcodeFormat(result.format);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to decode barcode');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleCopy = async () => {
    if (hexOutput) {
      await navigator.clipboard.writeText(hexOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUseInDecoder = () => {
    if (hexOutput && onHexDecoded) {
      onHexDecoded(hexOutput);
    }
  };

  const handleReset = () => {
    setImagePreview(null);
    setFileName(null);
    setHexOutput(null);
    setBarcodeFormat(null);
    setError(null);
    setLoading(false);
    setCopied(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Aztec Code Reader</h2>
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <p className="text-sm text-gray-600">
          Browse or take a photo of an Aztec barcode to decode it into hex data.
          The hex output can be used as UIC ticket encoded data for the Intercode 6 Decoder.
        </p>

        {/* File input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleInputChange}
          className="hidden"
        />

        {/* Drop zone / browse button */}
        {!imagePreview ? (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
          >
            <div className="space-y-2">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                />
              </svg>
              <p className="text-sm font-medium text-gray-700">
                Tap to browse or take a photo
              </p>
              <p className="text-xs text-gray-500">
                or drag and drop an image here
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Image preview */}
            <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              <img
                src={imagePreview}
                alt="Barcode image"
                className="max-h-64 mx-auto object-contain"
              />
              {loading && (
                <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-indigo-600">
                    <svg
                      className="animate-spin h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span className="text-sm font-medium">Decoding...</span>
                  </div>
                </div>
              )}
            </div>

            {fileName && (
              <p className="text-xs text-gray-500 truncate">
                {fileName}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors border border-gray-200"
              >
                Choose another image
              </button>
              <button
                onClick={handleReset}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors border border-gray-200"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Result display */}
        {hexOutput && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-700">Decoded Data</h3>
              {barcodeFormat && (
                <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                  {barcodeFormat}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {hexOutput.length / 2} bytes
              </span>
            </div>

            <textarea
              readOnly
              value={hexOutput}
              className="w-full h-32 font-mono text-xs p-4 border border-gray-300 rounded-lg resize-y bg-gray-50 focus:outline-none"
            />

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Hex'}
              </button>
              {onHexDecoded && (
                <button
                  onClick={handleUseInDecoder}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  Decode as UIC Ticket
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
