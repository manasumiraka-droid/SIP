-- Migration: Add phone number and ecclesiastical title (Jabatan: Diaken, Penatua, Staff) to servants.
ALTER TABLE servants ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE servants ADD COLUMN IF NOT EXISTS title TEXT CHECK(title IS NULL OR title IN ('Diaken','Penatua','Staff'));

CREATE INDEX IF NOT EXISTS servants_org_title ON servants(organization_id, title);
