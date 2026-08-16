ALTER TABLE instance_settings ADD COLUMN trust_proxy_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instance_settings ADD COLUMN trust_proxy_addresses TEXT;
