--
-- Postgres Init for one DB
-- Creates API user with 'api' password; Change/rotate password manually (for stage/prod)
--
\set ON_ERROR_STOP on
\set user :db '_api_user'

-- Users are global, so try to avoid errors when (re-)creating them
SELECT CONCAT( 'CREATE USER ', :'user')
  WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'user')\gexec
-- \ALTER USER :user WITH PASSWORD 'api';

DROP DATABASE IF EXISTS :db;
CREATE DATABASE :db;
REVOKE ALL ON DATABASE :db FROM PUBLIC;
GRANT CONNECT ON DATABASE :db TO :user;

\c :db;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO :user;

\i db/scripts/V001__triggers.sql

\echo End init.sql
