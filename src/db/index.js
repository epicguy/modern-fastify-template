/**
 * db/index.js - Postgresql methods using db pool
 */

const { Pool } = require('pg');
const sqlModules = {
  monitor: require('./monitor').monitor,
  ident: require('./ident').ident,
};
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
class db {
  static deps = { modules: [], config: 'db', db: [] };
  constructor(backpack) {
    this.Acquire = this.Acquire.bind(this);

    this.config = backpack.config.db;
    this.log = backpack.config.log;
    this._log3 = this.config.level3_debug ? backpack.config.log : () => {};
    this._log2 = this.config.level2_debug
      ? (ctx, f, data) => {
          if (ctx.silent) return;
          ctx.log(f, data);
        }
      : () => {};

    this.pool_id = 100; // 3 digits everywhere
  }
  module_init(backpack) {
    // console.log(this.config.pool_opts); // XXX CONTAINS DB SECRETS
    this.pool = new Pool(this.config.pool_opts);
    // This can fire on connections idle in the pool, when e.g. the DB goes down or is unavailable
    this.pool.on('error', (err, client) => {
      const f = 'db.js:pool-on-error:';
      // Using logger so we can trace this back to a process/host/date/time and .error to look for it in the error logs
      this.log(f, err);
    });

    // Load sql modules
    for (const moduleName of Object.keys(sqlModules)) {
      const instance = new sqlModules[moduleName](this, backpack);
      // Make the module available in e.g. backpack.db.(module-name)
      this[moduleName] = instance;
    }
  }

  async Acquire() {
    const conn = await this.pool.connect();
    // Confirm that this handle is ready for business
    let issue = this.Issue(conn);
    if (issue) {
      this._log3(f, { issue });
      throw DbError(f, 'pool_result', JSON.stringify(issue));
    }

    if (conn.__pool_id == null) conn.__pool_id = this.pool_id++;
    return conn;
  }
  Release(conn) {
    const f = `DB:release:-${conn != null ? conn.__pool_id : undefined}-:`;
    if (this.config.level3_debug) {
      let issue = this.Issue(conn);
      this._log3(f, issue ? { issue } : {});
    }
    //this._log3(f, { /* conn, type: typeof conn, keys: Object.keys(conn), */ protocol: conn._protocol?._fatalError }); // TODO _protocol not defined
    return conn.release();
  }
  Destroy(conn) {
    const f = `DB:destroy:-${conn != null ? conn.__pool_id : undefined}-:`;
    if (this.config.level3_debug) {
      let issue = this.Issue(conn);
      this._log3(f, issue ? { issue } : {});
    }
    return conn.release(true);
  }

  // Look for DB issues (similar to _fatalError for MySQL
  // Maybe can use ._connected (and/or _connectionError), also {_queryable, readyForQuery: true,}
  //  could be checked before trying to attempt another query
  Issue(conn, forQuery = false) {
    if (conn == null) return { conn: 'not defined' };
    if (conn._connected !== true || conn._connectionError !== false) return _.pick(conn, ['_connected', '_connectionError', '__pool_id']);
    if (forQuery === true) {
      if (conn._queryable !== true || conn.readyForQuery !== true) return _.pick(conn, ['_queryable', 'readyForQuery', '__pool_id']);
    }
    return null;
  }

  // Note: Does not play well with UNNEST or other args which take an actual array
  _getStatement(statement, args) {
    let _statement = statement;
    for (let index = 0; index < args.length; index++) {
      const value = args[index];
      if (Array.isArray(value)) {
        _statement = _statement.replace('IN (?)', '= ANY($' + (index + 1) + ')');
      } else {
        _statement = _statement.replace('?', '$' + (index + 1));
      }
    }
    return _statement;
  }

  async sqlQuery(ctx, sql, args = [], pure_psql) {
    const f = `db/index.js:sqlQuery:-${ctx.conn?.__pool_id}-:`;
    if (!args || !Array.isArray(args)) throw DbError(f, 'ARGS', `Args not array (${typeof args})`);
    const isIssue = this.Issue(ctx.conn, true);
    if (isIssue !== null) throw DbError(f, 'CONNECTION', `Connection bad (${JSON.stringify(isIssue)})`);

    const statement = pure_psql === true ? sql : this._getStatement(sql, args);
    this._log2(ctx, f + 'PSQL:' + args.length, { statement });
    if (args.length) this._log2(ctx, f + 'ARGS', { args });
    const start_time = Date.now();
    // Delay on errors to let conn become queryable
    let result;
    try {
      result = await ctx.conn.query(statement, args);
    } catch (e) {
      await delay(10);
      throw e;
    }

    // Note: Returning early here, won't allow us to track time_ms on these calls. Could have been important in some cases.
    if (
      result.command === 'SET' ||
      result.command === 'START' ||
      result.command === 'COMMIT' ||
      result.command === 'ROLLBACK' ||
      result.command === 'SAVEPOINT'
    ) {
      return result;
    }
    const pick = ({ command, rowCount, rows }) => ({ command, rowCount, rows: rows.slice(0, 2) });
    const log_result = pick(result);
    log_result.time_ms = Date.now() - start_time;
    this._log2(ctx, f, { log_result });
    if (result.command !== 'SELECT') {
      return result.rows.length ? result.rows : { affectedRows: result.rowCount };
    }
    return result.rows;
  }
  async StartTransaction(ctx) {
    await this.sqlQuery(ctx, 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await this.sqlQuery(ctx, 'START TRANSACTION');
  }
  async Commit(ctx) {
    await this.sqlQuery(ctx, 'COMMIT');
  }
  async Rollback(ctx) {
    await this.sqlQuery(ctx, 'ROLLBACK');
  }
}
exports.db = db;
