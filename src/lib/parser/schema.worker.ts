// Comlink-wrapped schema inference. Runs the walker
// (`@/lib/schema/infer`) and the JSON Schema emitter
// (`@/lib/schema/emit-json-schema`) off the main thread so a 500MB
// inference — walk + ~1000 sampled stub-slice + JSON.parse cycles —
// doesn't stall paint frames.
//
// Blob handle passes through Comlink trivially: Blob is a reference,
// not bytes, so transferring it is essentially free even at 505MB.
// The worker constructs `fetchStub` locally using the received Blob
// — calls `.slice(start, end).text()` then `JSON.parse` to resolve
// stub-object / stub-array / ndjson-line nodes during the walk.
//
// No in-flight abort token: supersede is handled by the host
// terminating the worker on the next call. The worker itself is
// single-shot per inference; the lifecycle keeps the postMessage
// API minimal. If we add long-running incremental refinement in M2,
// abort moves inside.
//
// TypeScript + Zod emitters land in subsequent slices and will be
// added to the API as additional methods (`inferAndEmitTypeScript`,
// `inferAndEmitZod`) rather than as flags, so the worker boundary
// stays type-safe per call.

import * as Comlink from 'comlink';
import { inferSchema, type FetchStubValue } from '@/lib/schema/infer';
import {
  emitJsonSchema,
  type JsonSchemaEmitResult,
} from '@/lib/schema/emit-json-schema';
import type { TreeNode } from '@/lib/tree/parse';

export type SchemaWorkerAPI = {
  inferAndEmit(
    root: TreeNode,
    sourceBlob: Blob,
  ): Promise<JsonSchemaEmitResult>;
};

const api: SchemaWorkerAPI = {
  async inferAndEmit(root, sourceBlob) {
    const fetchStub: FetchStubValue = async (byteStart, byteEnd) => {
      const text = await sourceBlob.slice(byteStart, byteEnd).text();
      return JSON.parse(text);
    };
    const ir = await inferSchema(root, fetchStub);
    return emitJsonSchema(ir);
  },
};

Comlink.expose(api);
