-- Optional owner-set company branding, shown as a thin banner on object
-- detail pages (see components/CompanyBanner.tsx). companyCover (if set)
-- renders as a plain image; otherwise companyName (if set) renders as text
-- over companyBannerBackgroundColor. Changing these fields is owner-only,
-- unlike the rest of the workspace general settings (see workspaces/routes.ts).
ALTER TABLE workspaces ADD COLUMN company_name TEXT;
ALTER TABLE workspaces ADD COLUMN company_cover TEXT;
ALTER TABLE workspaces ADD COLUMN company_banner_height INTEGER NOT NULL DEFAULT 50;
ALTER TABLE workspaces ADD COLUMN company_banner_text_color TEXT;
ALTER TABLE workspaces ADD COLUMN company_banner_background_color TEXT;
ALTER TABLE workspaces ADD COLUMN company_banner_bold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN company_banner_italic INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN company_banner_letter_spacing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN company_banner_text_align TEXT NOT NULL DEFAULT 'center';
