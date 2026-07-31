-- User-configurable styling for the title overlaid on an object's cover
-- image (see CoverImage.tsx) - JSON-serialized CoverTextStyle, or NULL to
-- use the frontend's own default styling (white, bold, drop shadow).
ALTER TABLE objects ADD COLUMN cover_text_style TEXT;
