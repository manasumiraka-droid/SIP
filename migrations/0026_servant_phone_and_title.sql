-- Migration 0026: Add phone number and ecclesiastical title (Jabatan: Diaken, Penatua, Staff) to servants.
ALTER TABLE servants ADD COLUMN phone_number TEXT;
ALTER TABLE servants ADD COLUMN title TEXT CHECK(title IS NULL OR title IN ('Diaken','Penatua','Staff'));

CREATE INDEX IF NOT EXISTS servants_org_title ON servants(organization_id, title);
