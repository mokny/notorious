-- Per-object user scripts (see modules/scripting/) - `script_source` is
-- user-authored JavaScript, run server-side inside a QuickJS sandbox.
-- `script_enabled` is the kill-switch specifically for *background
-- automation* (see modules/scripting/automation.ts's `// @automation`
-- pragma) - a manual Run-button click always works regardless of this flag.
-- Defaults to 0 so pasting/saving a script never silently starts
-- auto-running it. `script_last_run_*` mirror one run's outcome for display
-- (ScriptPanel.tsx) - kept as flat columns rather than one JSON blob, same
-- tradeoff already made for locked_at/locked_by on this same table.
ALTER TABLE objects ADD COLUMN script_source TEXT;
ALTER TABLE objects ADD COLUMN script_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE objects ADD COLUMN script_last_run_at TEXT;
ALTER TABLE objects ADD COLUMN script_last_run_success INTEGER;
ALTER TABLE objects ADD COLUMN script_last_run_trigger TEXT;
ALTER TABLE objects ADD COLUMN script_last_run_duration_ms INTEGER;
ALTER TABLE objects ADD COLUMN script_last_run_error TEXT;
ALTER TABLE objects ADD COLUMN script_last_run_log TEXT;
