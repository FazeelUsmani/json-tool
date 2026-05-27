import type { JsonSchemaEmitResult } from './emit-json-schema';
import type { TypeScriptEmitResult } from './emit-typescript';
import type { ZodEmitResult } from './emit-zod';

export type SchemaTripleResult = {
  jsonSchema: JsonSchemaEmitResult;
  typescript: TypeScriptEmitResult;
  zod: ZodEmitResult;
};
