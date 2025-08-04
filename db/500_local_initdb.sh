#!/bin/sh

DBNAME=$POSTGRES_DB
cd /docker-entrypoint-initdb.d
psql template1 --echo-all --variable=db=$DBNAME <db/init.sql
# Without liquibase/flyway - for dev, load schemas and sample-data
psql template1 --echo-all --variable=db=$DBNAME <db/load.sql
