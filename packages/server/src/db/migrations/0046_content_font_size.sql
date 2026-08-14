-- Per-user content-area font-size preference (percent, 80-150), applied to
-- the block editor and views; separate values for phone vs tablet/desktop
-- viewports (see hooks/useBreakpoint.ts) - see ProfileSettings.tsx's
-- "Darstellung" section and lib/contentFontScale.ts.
ALTER TABLE users ADD COLUMN content_font_size_mobile INTEGER NOT NULL DEFAULT 100;
ALTER TABLE users ADD COLUMN content_font_size_desktop INTEGER NOT NULL DEFAULT 100;
