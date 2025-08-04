
-- Monitor table

CREATE TABLE monitor
(
	 id  SERIAL        PRIMARY KEY
	,di  SMALLINT      DEFAULT 0 NOT NULL -- disposal - 0:none,1:disabled,2:purge
	,cr  TIMESTAMP(0)  NOT NULL
	,mo  TIMESTAMP(0)  NOT NULL

	,log  JSONB        DEFAULT NULL    -- JSON fields and values
);
CREATE INDEX ix_monitor__log__start_bi ON monitor( ((log->>'start')::bigint) );

CREATE TABLE monitor_debug
(
	 id  SERIAL        PRIMARY KEY
	,di  SMALLINT      DEFAULT 0 NOT NULL -- disposal - 0:none,1:disabled,2:purge
	,cr  TIMESTAMP(0)  NOT NULL
	,mo  TIMESTAMP(0)  NOT NULL

	,log  JSONB        DEFAULT NULL    -- JSON fields and values
);
CREATE INDEX ix_monitor_debug__uuid ON monitor_debug((log->>'uuid'));

-- Ident table

CREATE TABLE ident
(
	 id  SERIAL        PRIMARY KEY
	,di  SMALLINT      DEFAULT 0 NOT NULL -- disposal - 0:none,1:disabled,2:purge
	,cr  TIMESTAMP(0)  NOT NULL
	,mo  TIMESTAMP(0)  NOT NULL

	-- Identity
	,email   VARCHAR(128)  DEFAULT NULL
	,role    VARCHAR(128)  DEFAULT NULL

	-- Security
	,keycode                VARCHAR( 16)  DEFAULT NULL
	,keycode_expires        TIMESTAMP(0)  DEFAULT NULL
	,keycode_attempts       SMALLINT      DEFAULT 0
	,refresh_token          VARCHAR( 32)  DEFAULT NULL
	,refresh_token_expires  TIMESTAMP(0)  DEFAULT NULL

);
CREATE UNIQUE INDEX ix_ident__email ON ident(email);

-- System principles
INSERT INTO ident (id,email) VALUES
	 (99,'SYSTEM - TIMERS')
	,(98,'SYSTEM - API')
	,(97,'SYSTEM - TEST')
;
ALTER SEQUENCE ident_id_seq RESTART WITH 100;

