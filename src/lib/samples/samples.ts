// Inline sample JSON / NDJSON content for the empty-state hero.
//
// Each sample is a small string (<2 KB) demonstrating one of the
// three canonical shapes the tool ships against:
//
//   - Telemetry events  — nested objects + a `null` field, exercises
//                          the schema-inference null-collapse rule
//   - NDJSON logs       — line-delimited, auto-triggers NDJSON mode
//                          detection on parse
//   - LLM JSON          — structured-output shape with the kind of
//                          fields an LLM tool would produce
//
// `kind: 'sample'` is the DocumentSource discriminator from
// documentStore.ts; consumers pass `{kind: sample.kind, name:
// sample.name, size: sample.content.length}` to `setText`.
//
// Adding a new sample: append to the array. The hero iterates this
// and renders one button per entry, so no UI changes needed.

export type Sample = {
  id: string;
  name: string;
  sizeLabel: string;
  content: string;
  kind: 'sample';
};

const TELEMETRY_EVENTS_JSON = `[
  {
    "timestamp": "2024-03-15T14:23:11.847Z",
    "request_id": "req_a3f9e2",
    "user": { "id": "u_847", "plan": "pro" },
    "event": { "type": "click", "url": "/dashboard", "ref": "/home" },
    "meta": { "client": "web", "v": "2.1.0" }
  },
  {
    "timestamp": "2024-03-15T14:23:12.103Z",
    "request_id": "req_a3f9e3",
    "user": { "id": "u_512", "plan": null },
    "event": { "type": "view", "url": "/pricing" },
    "meta": { "client": "ios", "v": "2.0.4" }
  },
  {
    "timestamp": "2024-03-15T14:23:13.598Z",
    "request_id": "req_a3f9e4",
    "user": { "id": "u_847", "plan": "pro" },
    "event": { "type": "submit", "url": "/checkout", "ref": "/pricing" },
    "meta": { "client": "web", "v": "2.1.0" }
  },
  {
    "timestamp": "2024-03-15T14:23:14.220Z",
    "request_id": "req_a3f9e5",
    "user": { "id": "u_201", "plan": "basic" },
    "event": { "type": "error", "code": "E_PAYMENT_DECLINED" },
    "meta": { "client": "web", "v": "2.1.0" }
  }
]`;

const NDJSON_LOGS = `{"level":"info","ts":"2024-03-15T14:23:00Z","msg":"server started","port":3000}
{"level":"info","ts":"2024-03-15T14:23:01Z","msg":"request received","path":"/api/users","duration_ms":12}
{"level":"warn","ts":"2024-03-15T14:23:02Z","msg":"slow query","table":"events","duration_ms":850}
{"level":"error","ts":"2024-03-15T14:23:03Z","msg":"db connection lost","retry":3,"error":"ECONNRESET"}
{"level":"info","ts":"2024-03-15T14:23:04Z","msg":"db reconnected","retry_total":3}
{"level":"info","ts":"2024-03-15T14:23:05Z","msg":"request completed","path":"/api/users","status":200,"duration_ms":42}`;

const LLM_JSON = `{
  "summary": "User asked about pricing for the Pro plan and how to upgrade from Basic.",
  "intent": "billing.upgrade",
  "categories": ["pricing", "upgrade", "pro-plan"],
  "confidence": 0.92,
  "sentiment": "neutral",
  "sources": [
    { "url": "/pricing", "snippet": "Pro plan is $20/month, billed annually..." },
    { "url": "/faq/upgrades", "snippet": "Upgrading is instant — prorated for the current period." }
  ],
  "suggested_action": "show_pricing_page",
  "follow_up_questions": [
    "Would you like to start a 14-day trial?",
    "Do you want help comparing plans?"
  ]
}`;

export const SAMPLES: ReadonlyArray<Sample> = [
  {
    id: 'telemetry',
    name: 'Telemetry events',
    sizeLabel: `${formatBytes(TELEMETRY_EVENTS_JSON.length)}`,
    content: TELEMETRY_EVENTS_JSON,
    kind: 'sample',
  },
  {
    id: 'ndjson-logs',
    name: 'NDJSON logs',
    sizeLabel: `${formatBytes(NDJSON_LOGS.length)}`,
    content: NDJSON_LOGS,
    kind: 'sample',
  },
  {
    id: 'llm-json',
    name: 'LLM JSON',
    sizeLabel: `${formatBytes(LLM_JSON.length)}`,
    content: LLM_JSON,
    kind: 'sample',
  },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
