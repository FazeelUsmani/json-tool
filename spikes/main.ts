type ParserKind = 'streamparser' | 'streamjson';
type Status = 'pending' | 'pass' | 'fail';
type ResultMsg = { type: 'result'; caseId: string; status: Status; details: string };
type ResetMsg = { type: 'reset' };
type DoneMsg = { type: 'done' };

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

const $results = document.getElementById('results')!;
const $parser = document.getElementById('parser') as HTMLSelectElement;
const $runBuiltin = document.getElementById('run-builtin') as HTMLButtonElement;
const $pickFile = document.getElementById('pick-file') as HTMLButtonElement;
const $fileInput = document.getElementById('file-input') as HTMLInputElement;

const results: { caseId: string; status: Status; details: string }[] = [];

function render() {
  $results.innerHTML = results
    .map(
      (r) => `
        <div class="case ${r.status}">
          <h2><span class="tag ${r.status}">${r.status.toUpperCase()}</span>${escapeHtml(r.caseId)}</h2>
          <pre>${escapeHtml(r.details)}</pre>
        </div>`,
    )
    .join('');
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function setBusy(busy: boolean) {
  $runBuiltin.disabled = busy;
  $pickFile.disabled = busy;
  $parser.disabled = busy;
}

worker.onmessage = (e: MessageEvent<ResultMsg | ResetMsg | DoneMsg>) => {
  if (e.data.type === 'reset') {
    results.length = 0;
    render();
  } else if (e.data.type === 'result') {
    results.push({ caseId: e.data.caseId, status: e.data.status, details: e.data.details });
    render();
  } else if (e.data.type === 'done') {
    setBusy(false);
  }
};

worker.onerror = (e) => {
  results.push({
    caseId: '(a) worker boot — uncaught error',
    status: 'fail',
    details: e.message,
  });
  render();
  setBusy(false);
};

$runBuiltin.addEventListener('click', () => {
  setBusy(true);
  worker.postMessage({ type: 'run-builtin', parser: $parser.value as ParserKind });
});

$pickFile.addEventListener('click', () => $fileInput.click());

$fileInput.addEventListener('change', () => {
  const file = $fileInput.files?.[0];
  if (!file) return;
  setBusy(true);
  worker.postMessage({ type: 'run-file', parser: $parser.value as ParserKind, file });
});
