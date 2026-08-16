-- Adds fade-toggle, two-color gradient, text-shadow, and font-family options
-- to the company banner feature (see components/CompanyBanner.tsx,
-- 0055_company_banner.sql). Owner-only to change, same as the rest of the
-- companyBanner* fields (see workspaces/routes.ts's PATCH handler).
ALTER TABLE workspaces ADD COLUMN company_banner_fade_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workspaces ADD COLUMN company_banner_gradient_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN company_banner_background_color_2 TEXT;
ALTER TABLE workspaces ADD COLUMN company_banner_gradient_angle INTEGER NOT NULL DEFAULT 90;
ALTER TABLE workspaces ADD COLUMN company_banner_gradient_start_position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN company_banner_text_shadow INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN company_banner_font_family TEXT;
