----
-- Timestamp 'cr' and 'mo' fields
--

CREATE FUNCTION trigger_cr()
RETURNS TRIGGER AS $$
BEGIN
	NEW.mo = NOW(); -- Always update
	IF NEW.cr IS NULL -- Allow caller to force this value
		THEN NEW.cr= NOW();
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION trigger_mo()
RETURNS TRIGGER AS $$
BEGIN
	NEW.mo = NOW(); -- set always
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION trigger_create_table()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
    rec record;
	var_table_name text;
	sql text := 'CREATE TRIGGER trigger_%1$s BEFORE %2$s ON %3$s FOR EACH ROW EXECUTE PROCEDURE trigger_%1$s();';
BEGIN
  FOR rec IN SELECT * FROM pg_event_trigger_ddl_commands()
  		WHERE schema_name = 'public' AND command_tag in ('SELECT INTO','CREATE TABLE','CREATE TABLE AS')
  LOOP
    var_table_name := substring( rec.object_identity from 8 ); -- assume public.*
	RAISE NOTICE 'Note: trigger_create_table is looking at %', var_table_name ;

    IF EXISTS ( SELECT * FROM information_schema.columns c WHERE c.column_name = 'cr' AND c.table_schema = 'public' AND c.table_name = var_table_name) THEN
        EXECUTE format( sql, 'mo', 'UPDATE', var_table_name);
        EXECUTE format( sql, 'cr', 'INSERT', var_table_name);
	    RAISE NOTICE 'Note: trigger_create_table is adding triggers to %', var_table_name ;
	END IF;

  END LOOP;
END;
$$;

CREATE EVENT TRIGGER trigger_create_table ON ddl_command_end
WHEN TAG IN ('CREATE TABLE AS', 'CREATE TABLE', 'SELECT INTO')
EXECUTE PROCEDURE trigger_create_table();

\echo Good result trigger.sql.
