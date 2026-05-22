// Comlink-wrapped schema inference. Runs the walker
// (`@/lib/schema/infer`) and all three emitters (JSON Schema,
// TypeScript, Zod) off the main thread so a 500MB inference — walk
// + ~1000 sampled stub-slice + JSON.parse cycles — doesn't stall
// paint frames.
//
// Blob handle passes through Comlink trivially: Blob is a reference,
// not bytes, so transferring it is essentially free even at 505MB.
// The worker constructs `fetchStub` locally using the received Blob
// — calls `.slice(start, end).text()` then `JSON.parse` to resolve
// stub-object / stub-array / ndjson-line nodes during the walk.
//
// All three emitters run on every inference: per-format emit cost
// is ~1ms each on a typical schema, so emitting upfront keeps
// sub-tab switching instant in the UI (no second worker round-trip
// when the user toggles between JSON Schema / TypeScript / Zod).
//
// Tripwire for future-self: this "emit all three upfront" decision
// is only correct because (a) the three current emitters are
// microsecond-cheap pure functions over the same IR, and (b) the
// IR is the only walk we pay for. If a heavier emitter ever lands
// — e.g., a Pydantic emitter that runs a template engine, or
// something that pulls in a 100KB dependency — switch to lazy
// emission per sub-tab. The schemaHost call becomes
// `inferAndEmit(root, blob, format)` and the host caches per
// (root, format) instead of (root).
//
// No in-flight abort token: supersede is handled by the host
// terminating the worker on the next call. The worker itself is
// single-shot per inference; the lifecycle keeps the postMessage
// API minimal. If we add long-running incremental refinement in M2,
// abort moves inside.

import * as Comlink from 'comlink';
import { inferSchema, type FetchStubValue } from '@/lib/schema/infer';
import {
  emitJsonSchema,
  type JsonSchemaEmitResult,
} from '@/lib/schema/emit-json-schema';
import {
  emitTypeScript,
  type TypeScriptEmitResult,
} from '@/lib/schema/emit-typescript';
import { emitZod, type ZodEmitResult } from '@/lib/schema/emit-zod';
import type { TreeNode } from '@/lib/tree/parse';

export type SchemaTripleResult = {
  jsonSchema: JsonSchemaEmitResult;
  typescript: TypeScriptEmitResult;
  zod: ZodEmitResult;
};

export type SchemaWorkerAPI = {
  inferAndEmit(root: TreeNode, sourceBlob: Blob): Promise<SchemaTripleResult>;
};

const api: SchemaWorkerAPI = {
  async inferAndEmit(root, sourceBlob) {
    const fetchStub: FetchStubValue = async (byteStart, byteEnd) => {
      const text = await sourceBlob.slice(byteStart, byteEnd).text();
      return JSON.parse(text);
    };
    const ir = await inferSchema(root, fetchStub);
    return {
      jsonSchema: emitJsonSchema(ir),
      typescript: emitTypeScript(ir),
      zod: emitZod(ir),
    };
  },
};

Comlink.expose(api);
