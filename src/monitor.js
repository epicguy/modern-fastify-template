/**
 * monitor.js - monitor the server with logging to the DB
 */
const _ = require('lodash');
const _serialize = (e, s) => Object.assign({ name: e.name, message: e.message, stack: s ? e.stack : null }, e);

class monitor {
  static deps = { modules: [], config: 'monitor', db: ['monitor'] };
  constructor(backpack) {
    const f = 'monitor:constructor';
    this.flush = this.flush.bind(this);
    this.schedule = this.schedule.bind(this);
    this.config = backpack.config.monitor;
    this.log = backpack.config.log;
    this.db = backpack.db;

    this.queue = [];
    this.scheduled = false;
    this.ctx = { conn: false, silent: true, log: console.log };
  }
  getReqLog(ctx) {
    return (_f, o) => {
      if (this.config.write_to_log2) this.log(_f, o);
      ctx.monitor.debug.push(Object.assign({ _f }, o));
    };
  }

  schedule(howSoon = 0) {
    //console.log("Monitor:schedule", { howSoon, tqf: this.queue.length, scheduled: this.scheduled === false ? false : "not-false", });
    if (this.scheduled) return;
    this.scheduled = setTimeout(this.flush, howSoon);
  }

  async flush() {
    const f = 'Monitor.flush:';
    //console.log(f, { test: "over", tql: this.queue.length, scheduled: this.scheduled === false ? false : "not-false" });
    //console.log(f, { scheduled: !!this.scheduled, queue_length: this.queue.length, uuid_0: this.queue.length ? this.queue[0].uuid : 0 });
    if (!this.scheduled) return; // Someone cancelled our ticket?
    this.ctx.conn = await this.db.Acquire();
    // Attempt to write top row, but if failure, try again later?
    try {
      while (this.queue.length) {
        const { domain, action, write_object, debug: json } = this.queue[0];
        //console.log(f, { action });
        if (action === 'debug') await this.db.monitor.write_debug(this.ctx, write_object);
        else if (action === 'error') await this.db.monitor.write_many(this.ctx, [write_object]);
        else {
          const db_result = await this.db.monitor.write_many(this.ctx, [write_object]);

          // Add debug object to write queue
          const id = db_result.insertId;
          const action = 'debug';
          this.queue.push({ domain, action, write_object: { uuid: write_object.uuid, obj: write_object, id, json } });
        }
        this.queue.shift();
      }
    } catch (e) {
      this.log(f, e);
      // Allow like 3 attempts on writing one record, use 1 second backoff; don't err on error-rows
      const queueEntry = this.queue[0];
      const { domain, action, error_retry_count } = queueEntry;
      //console.log(f + "catch", { action, error_retry_count });
      if (action === 'error' || action === 'debug') {
        this.queue.shift(); // Ignore errors on errors or debug details
      } else if (error_retry_count < 3) {
        queueEntry.error_retry_count++; // Update queue entry in-place
      } else {
        // Reached max retries, remove this entry and push a flush_error object
        this.queue.shift();
        const columns = ['verb', 'route', 'start', 'authId', 'conn_id', 'statusCode', 'duration'];
        const error_object = _.pick(queueEntry.write_object, ['uuid', 'request_count', ...columns]);
        const error = JSON.stringify(_serialize(e));
        const write_object = {
          route: '/Monitor/_flush_error',
          statusCode: 999,
          err: { error, error_object },
        };
        this.queue.push({ domain, action: 'error', write_object });
        //console.log(f + "catch3", { tql: this.queue.length, write_object });
      }
      setTimeout(() => this.schedule(), 1000); // Call schedule after a bit (because we need to clear this.scheduled in the 'finally block' first)
    } finally {
      this.scheduled = false;
      await this.db.Release(this.ctx.conn);
    }
  }

  write(ctx) {
    // Called typically from inside a 'wrapper', so errors could either cause havac or be silently discarded
    const f = 'Monitor:write:';
    try {
      this._write(ctx);
    } catch (err) {
      this.log(f + 'err', err);
    }
  }

  _write(ctx) {
    const f = 'Monitor:_write:';
    if (this.config.write_to_log) {
      this.log(f, ctx.monitor);
    }
    // Write record using zero wait time; Assume data does not have to be cloned
    // Note: params, and err are JSON objects
    const columns = ['verb', 'route', 'start', 'params', 'authId', 'conn_id', 'statusCode', 'duration', 'err'];
    const write_object = _.pick(ctx.monitor, ['uuid', 'request_count', ...columns]);
    const domain = ctx.monitor.domain || 'monitor';
    this.queue.push({ domain, action: 'write', write_object, error_retry_count: 0, debug: ctx.monitor.debug });
    this.schedule();
  }
}
exports.monitor = monitor;
