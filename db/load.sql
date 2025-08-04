--
-- Load schema/sample-data (dev) for containers for PostgreSQL
--
\set ON_ERROR_STOP on
\c :db;

-- All scripts to be loaded (include sample-data for dev)
\i db/scripts/V002__base.sql
\i db/scripts/V003__add_ident_for_contact_list.sql

\echo Good load.sql
