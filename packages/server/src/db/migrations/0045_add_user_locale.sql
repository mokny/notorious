-- Preferred UI/push-notification language per user (an @notorious/shared
-- SUPPORTED_LOCALES code, e.g. "en"/"de") - null until the user picks one in
-- Settings or the web client's one-time browser-language detection finds a
-- supported match (see AuthContext.tsx).
ALTER TABLE users ADD COLUMN locale TEXT;
