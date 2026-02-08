# PROMPT

## Initial prompt

plan a typescript npm module project used to decode and encode per unaligned data.
it has primitives to manage a buffer at the bit level and encode and decode very common types such as Boolean, u5 string, numbers, enum , etc.
when configuring the encoders or decoders, they accept constraints and default values so it correctly encodes or decodes based on constraints and value to be encoded.
every class is unit tested.

a more high level part allows to configure a schema of combination of primitive types and allows to encode a JSON object (if object does not match the schema an exception is raised). when decoding an array buffer, a JSON object is returned.

in the GitHub repository, add a react typescript tailwindcss website that will be published on the GitHub pages with ./ assets path. it describe the project, allows to configure a schema and either decode a hex encoded data or encode a JSON object. When building the website, it uses the npm module of the project

## ASN.1 Schema Parser

analyze how to create a schema that can be used to encode or decode a document.

fetch https://github.com/UnionInternationalCheminsdeFer/UIC-barcode/blob/master/misc/uicBarcodeHeader_v2.0.1.asn

add to the npm library a parser of asn schema notation. the parser must use a npm module for parsing. it outputs a schema that can be used by the per-unaligned-ts module. it is unit tested.

the parser is run against the UIC schema to verify it works.
if some constraints are not implemented yet, they are described in a TODO.md file.

this prompt is added to the PROMPT.md file in a new section.
in Claude md file, a statement is added to tell Claude to add the prompt file each time a prompt is given to edit the project.
