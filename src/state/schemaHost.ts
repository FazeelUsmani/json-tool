// Main-thread host for schema inference. Schema work now routes through
// parserHost so the parser worker can reuse its session-owned TreeNode
// root instead of structured-cloning the full tree into a separate
// schema worker on every Refresh click.

import { inferCurrentSchema } from './parserHost';
import type { SchemaTripleResult } from '@/lib/schema/result';

let activeSchemaInferId = 0;

export async function inferSchemaForCurrentDocument(): Promise<SchemaTripleResult> {
  const myId = ++activeSchemaInferId;
  try {
    const result = await inferCurrentSchema();
    if (myId !== activeSchemaInferId) {
      throw makeAbortError('inferSchema superseded');
    }
    return result;
  } catch (err) {
    if (myId !== activeSchemaInferId) {
      throw makeAbortError('inferSchema superseded');
    }
    throw err;
  }
}

export function abortInfer(): void {
  activeSchemaInferId++;
}

function makeAbortError(message: string): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError');
  }
  const e = new Error(message);
  e.name = 'AbortError';
  return e;
}
