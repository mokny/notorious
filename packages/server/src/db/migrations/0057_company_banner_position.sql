-- Lets the workspace owner choose whether the company banner renders above
-- or below an object's own cover image (see components/CompanyBanner.tsx,
-- pages/ObjectDetailPage.tsx). Owner-only to change, same as the rest of the
-- companyBanner* fields (see workspaces/routes.ts's PATCH handler).
ALTER TABLE workspaces ADD COLUMN company_banner_position TEXT NOT NULL DEFAULT 'below';
