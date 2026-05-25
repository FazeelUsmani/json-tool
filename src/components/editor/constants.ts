// Shared byte thresholds for editor dispatch. Lives in its own file so
// MonacoPane (file-drop path) and EditorToolbar (URL-load path) can both
// import without one depending on the other's module graph.

// Hard upper bound — files / URL responses past this are refused.
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

// Above this we skip Monaco and render the viewer-only placeholder.
// Monaco's main-thread tokenize/render on a multi-MB string freezes the
// tab (and at 100MB+ crashes it). The streaming parser still consumes
// the underlying Blob via .stream() and populates the tree pane normally.
export const VIEWER_ONLY_THRESHOLD = 10 * 1024 * 1024;
