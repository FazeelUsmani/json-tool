// The single source of truth for the editor's current document.
//
// Intentionally minimal. This store answers exactly one question:
//   "What document is loaded, and where did it come from?"
//
// Things deliberately NOT in here (yet — and not by accident):
//   - parsing state         → derived in the tree worker
//   - validation diagnostics → Monaco's language service owns these
//   - selection / cursor    → Monaco owns these
//   - undo history          → Monaco owns these
//   - UI flags              → component-local useState
//   - editor refs           → component-local useRef
//   - share-link metadata   → lands when share links land (Month 1 Thu)
//
// Adding fields here means another consumer will eventually depend on
// them. Resist until something actually needs the field.

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type DocumentSource =
  | { kind: 'paste' }
  | { kind: 'file'; name: string }
  | { kind: 'url'; url: string }
  | { kind: 'sample'; name: string }
  | null;

type DocumentState = {
  text: string;
  source: DocumentSource;
  // Original Blob (typically a dropped File) when one is available. Lets
  // the streaming parser read bytes via .stream() without re-encoding the
  // text string. Cleared on any setText that doesn't pass a file — typing
  // in the editor invalidates the file's byte representation.
  file: Blob | null;
};

type DocumentActions = {
  setText: (text: string, source: DocumentSource, file?: Blob | null) => void;
  clear: () => void;
};

export const useDocumentStore = create<DocumentState & DocumentActions>()(
  immer((set) => ({
    text: '',
    source: null,
    file: null,
    setText: (text, source, file = null) =>
      set((state) => {
        state.text = text;
        state.source = source;
        state.file = file;
      }),
    clear: () =>
      set((state) => {
        state.text = '';
        state.source = null;
        state.file = null;
      }),
  })),
);
