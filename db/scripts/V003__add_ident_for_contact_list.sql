-- Add screen_name to ident table
ALTER TABLE ident ADD COLUMN screen_name VARCHAR(64) DEFAULT NULL;

-- Add contact_list to ident table
ALTER TABLE ident ADD COLUMN contact_list VARCHAR(255) DEFAULT NULL;

-- Add avatar_file to ident table
ALTER TABLE ident ADD COLUMN avatar_file VARCHAR(64) DEFAULT NULL;
