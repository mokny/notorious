-- Instance-wide kill switch for the `http.*(...)` template builtin (see
-- modules/templates/http.ts) - off by default. A template author with edit
-- access can make the *server* issue an outbound request on behalf of
-- *anyone who views the page*, including anonymous share-link visitors, so
-- this stays opt-in rather than following registration/2FA's pattern of
-- defaulting to the more permissive setting.
ALTER TABLE instance_settings ADD COLUMN allow_template_http_requests INTEGER NOT NULL DEFAULT 0;
