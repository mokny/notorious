-- Lets a user opt out of OS push notifications while they already have the
-- app open/focused on some device (see push/service.ts::notifyUser and
-- push-sw.ts's `push` handler). Defaults to showing them anyway.
ALTER TABLE users ADD COLUMN push_show_when_open INTEGER NOT NULL DEFAULT 1;
