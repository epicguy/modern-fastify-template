/**
 * routes/monitor.js - Monitor your server logs via HTTPS
 */
const _ = require('lodash');
const moment = require('moment');
const { jsonReplacer } = require('../helpers/json');
const { InvalidArg, ServerError, Unauthorized } = require('../helpers/exception');

const D1 = 24 * 60 * 60;
const H1 = 1 * 60 * 60;

class monitor {
  static deps = { modules: ['ses'], config: 'health', db: ['monitor'] };
  constructor(backpack) {
    this.log = backpack.config.log;
    this.db = backpack.db;
    this.slack = backpack.slack;
    this.discord = backpack.discord;
    this.config = backpack.config;
    // ServiceHealth: Hash of services that implement a 'monitor' method
    this.services = Object.keys(backpack)
      .filter((k) => typeof backpack[k].monitor === 'function')
      .reduce((prev, k) => ((prev[k] = backpack[k]), prev), {});

    this.endpointDefaults = {
      get: { monitor: false, auth_required: false, sql_conn: true },
    };
    this.endpoints = {
      getPing: { verb: 'get', route: '/Ping', handler: this._GetPing, sql_conn: false },
      getLogs: { verb: 'get', route: '/Health', handler: this._GetLogs },
      getDebug: { verb: 'get', route: '/Debug/:uuid', handler: this._GetDebug },
      getServiceHealth: { verb: 'get', route: '/ServiceHealth', handler: this._ServiceHealth },
      getcomprehensive: { verb: 'get', route: '/Health/comprehensive', handler: this._GetLogs_HCProxy },
    };
  }

  _GetPing(ctx) {
    const f = 'monitor.js:_GetPing:';
    const request_count = ctx.monitor.request_count;
    return { send: { success: true, pid: `P${process.pid}`, request_count, config: this.config.api_server } };
  }

  // Same as GetLogs but forces type=comprehensive and checks URL based security
  // secret: '{String}' provided in ENV setting HEALTH_SECURITY_KEYS=key1,key2,key3,fish_fry_tomorrow
  // red: '{Number} - statusCode if in "red" condition (for comprehensive) else 200',
  // yellow: '{Number} - statusCode if in "yellow" condition (for comprehensive) else 200',
  _GetLogs_HCProxy(ctx) {
    const f = 'monitor.js:_GetLogs_HCProxy:';
    const p = ctx.p;

    // Check BasicAuth using config value (Lets log it first, and confirm)
    const is_match = ctx.req.headers.authorization === 'Basic ' + this.config.monitor_health.basicAuth;
    ctx.log(f, { is_match });
    ctx.reply.header('WWW-Authenticate', `Basic realm=\"${this.config.monitor_health.realm}\"`);
    if (!is_match) throw Unauthorized(f, 'HEALTH_ENDPOINT', 'basic auth value incorrect');
    p.type = 'comprehensive';
    return this._GetLogs(ctx);
  }

  async _GetLogs(ctx) {
    const params = {
      type: '{String}',
      filt: '{String} - report specific filter value',
      red: '{Number} - statusCode if in "red" condition (for comprehensive) else 200',
      yellow: '{Number} - statusCode if in "yellow" condition (for comprehensive) else 200',
      red_250ms: '{Number} Default 2 (500ms)',
      yellow_250ms: '{Number} Default 1 (250ms)',
      endpoint_baselines: '{String} endpoint1,n;post/Ident/_create,n;jobName3,n,... where n is in 250ms blocks',
      epoch_secs: '{Number} Default last-hour',
      last_secs: '{Number} Default uses epoch_secs',
      choices: '{any}',
      now: '{Date} to moment() e.g. 2020-06-22 08:30:00-06',
    };
    const f = 'monitor.js:_GetLogs:';
    const p = ctx.p;

    // Check BasicAuth using config value (Lets log it first, and confirm)
    const is_match = ctx.req.headers.authorization === 'Basic ' + this.config.monitor_health.basicAuth;
    ctx.log(f, { is_match });
    ctx.reply.header('WWW-Authenticate', `Basic realm=\"${this.config.monitor_health.realm}\"`);
    if (!is_match) throw Unauthorized(f, 'HEALTH_ENDPOINT', 'basic auth value incorrect');

    // Allow user to simulate 'now' (Note Please do moment_now.clone() if you use mutation methods
    const momentNow = moment(p.now); // Undefined is the real now
    if (!momentNow.isValid()) throw InvalidArg(f, 'now', `p.now not a moment-date (${p.now}).`);
    let perfThresholdMsYellow = 250 * Number(p.yellow_250ms || p.red_250ms || 1); // Yellow (and inintial filter)
    if (!(perfThresholdMsYellow < 100 * 60 * 1000)) perfThresholdMsYellow = 500;
    let perfThresholdMsRed = 250 * Number(p.red_250ms || 2); // Get value for 'red'
    if (!(perfThresholdMsRed < 100 * 60 * 1000)) perfThresholdMsRed = 500;
    const lastSecs = Number(p.last_secs); // This goes back from right now
    // This goes back this many secs and then covers the 'epoch' of that many seconds
    const epochSecs = Number(p.epoch_secs) || H1;

    // For formatters and output (return) links
    const baseUrl = this.config.api_server.protocol + ctx.req.headers.host + '/api/v1';
    const healthUrl = `${baseUrl}/Health?type=comprehensive&epoch_secs=${epochSecs}&endpoint_baselines=${
      p.endpoint_baselines || ''
    }`;
    const debugUrl = (uuid) => baseUrl + '/Debug/' + uuid;

    const typeMap = {
      lastBad100: { subject: 'Last Bad Queries', query: ['q_lastBad100'] },
      last100: { subject: 'Last Query', query: ['q_last100'] },
      last100job: { subject: 'Last jobs with job_name exists', query: ['q_last100job'] },
      last100jobWork: { subject: 'Last jobs with did_work ne false', query: ['q_last100jobWork'] },
      deadlocks: { note: 'last hour', subject: 'API Deadlocks', query: ['q_deadlocks', momentNow, lastSecs, epochSecs, H1] },
      dailyPerf: {
        subject: 'Daily Performance Aggregations of API',
        type: 'dailyPerf',
        note: `duration > yellow ${perfThresholdMsYellow}ms / red ${perfThresholdMsRed}ms`,
        query: ['q_dailyPerf', momentNow, lastSecs, epochSecs, D1, perfThresholdMsYellow],
      },
      dailyCounts: {
        subject: 'Daily Counts Aggregations of API',
        method: 'aggregate',
        query: ['q_dailyCounts', momentNow, lastSecs, epochSecs, D1],
      },
      dailyErrors: {
        subject: 'Daily Errors (unexpected) Aggregations of API',
        method: 'aggregate',
        query: ['q_dailyErrors', momentNow, lastSecs, epochSecs, 'epoch'],
      },
      comprehensive: {
        subject: 'Comprehensive Health Check (Errors, perf, deadlocks, services) Aggregations of API',
        multiple: [
          {
            type: 'Errors',
            subject: 'Errors (unexpected) Aggregations of API',
            method: 'aggregate',
            query: ['q_dailyErrors', momentNow, lastSecs, epochSecs, 'epoch'],
            formatterSlack: (row) =>
              `- (${row.count}) ${String(row.verb).toUpperCase()}${String(row.route).replace(/_/g, '-')} - *${row.statuscode} ${
                row.err_name || 'N'
              }:${row.err_code || 'C'}* ${row.err_message || 'M'} *_[<${debugUrl(row.muuid)}|debug>]_*`,
            formatterDiscord: (row) =>
              `\u2022 (${row.count}) ${String(row.verb).toUpperCase()}${String(row.route) /* .replace(/_/g, '-') */} - *${
                row.statuscode
              } ${row.err_name || 'N'}:${row.err_code || 'C'}* ${row.err_message || 'M'} ***[[debug](${debugUrl(row.muuid)})]***`,
          },
          {
            type: 'Perf',
            subject: 'Hourly Performance Aggregations of API',
            method: 'aggregate',
            note: `duration > ${perfThresholdMsYellow}ms`,
            query: ['q_dailyPerf', momentNow, lastSecs, epochSecs, 'epoch', perfThresholdMsYellow],
            formatterSlack: (row) =>
              `- (${row.count}) ${String(row.verb).toUpperCase()}${String(row.route).replace(/_/g, '-')} - &gt;*${
                (row.duration_250 * 250) / 1000
              }s*`,
            formatterDiscord: (row) =>
              `\u2022 (${row.count}) ${String(row.verb).toUpperCase()}${String(row.route) /* .replace(/_/g, '-') */} - >**${
                (row.duration_250 * 250) / 1000
              }s**`,
          },
          {
            type: 'Deadlocks',
            subject: 'API Deadlocks',
            query: ['q_deadlocks', momentNow, lastSecs, epochSecs, 'epoch'],
            formatterSlack: (row) => `- (${row.count}) ${String(row.verb).toUpperCase()}${String(row.route).replace(/_/g, '-')}`,
            formatterDiscord: (row) =>
              `\u2022 (${row.count}) ${String(row.verb).toUpperCase()}${String(row.route) /* .replace(/_/g, '-') */}`,
          },
        ],
      },
    };

    if (typeMap[p.type] == null) {
      return {
        send: {
          success: false,
          message: `Bad Monitor Type (options: ${Object.keys(typeMap)}) - using: ${p.type}`,
          link_lastBad100: baseUrl + '/Health?type=lastBad100',
          link_last100: baseUrl + '/Health?type=last100',
          link_last100jobWork: baseUrl + '/Health?type=last100jobWork',
          params,
        },
      };
    }

    const report = typeMap[p.type];
    const workList = report.multiple != null ? report.multiple : [report];

    let finalDisposition = 'g'; // Default green, can move to yellow and red. Caller should indicate if non-200 for these statuses
    const startAll = Date.now();

    // Prep for looking at threshold values
    const yellow_250ms = perfThresholdMsYellow / 250;
    const red_250ms = perfThresholdMsRed / 250;
    const adjByEndpoint = {};
    (p.endpoint_baselines || '').split(';').forEach((nm_val) => {
      if (!nm_val.length) return;
      const [nm, val] = nm_val.split(',');
      adjByEndpoint[nm] = Number(val);
    });

    // Prep for alert-service option
    const alertSettings =
      p.type !== 'comprehensive'
        ? null
        : p.output === 'slack' && this.slack
        ? ['formatterSlack', this.slack, '*']
        : p.output === 'discord' && this.discord
        ? ['formatterDiscord', this.discord, '**']
        : null;

    ctx.log(f, { services_keys: Object.keys(this.services) });
    const doing_work = async (work) => {
      const choices = Object.assign({ method: 'find', query: {}, note: 'no-note' }, work);
      ctx.log(f + 'doing_work', { choices });
      let db_results;

      const start = Date.now();
      if (choices.method === 'service') {
        if (!this.services[choices.service]) {
          db_results = { error: 'Service is not loaded: ' + choices.service };
        } else {
          db_results = await this.services[choices.service].monitor(ctx);
        }
      } else {
        db_results = await this.db.monitor[choices.query[0]](ctx, ...choices.query.slice(1));
      }

      const monitor_or_service_results = db_results;

      // Handle final-disposition based on results
      const next = { g_g: 'g', g_y: 'y', g_r: 'r', y_g: 'y', y_y: 'y', y_r: 'r', r_g: 'r', r_y: 'r', r_r: 'r' };
      if (choices.method === 'service') {
        finalDisposition = next[`${finalDisposition}_${monitor_or_service_results.status}`] || 'r';
      } else if (['Perf', 'dailyPerf'].indexOf(choices.type) > -1) {
        // Adjust using per-endpoint baseline thresholds; look for red vs yellow vs not really any issue (is green) even if results
        monitor_or_service_results.forEach((entry) => {
          const rec = entry;
          const adj = adjByEndpoint[rec.job_name || rec.verb + rec.route];
          let duration_adj;
          if (adj != null) {
            rec.duration_adj = duration_adj = rec.duration_250 - adj;
          } else duration_adj = rec.duration_250;
          if (duration_adj > red_250ms) {
            rec.di = 'r';
            finalDisposition = next[`${finalDisposition}_r`] || 'r';
          } else if (duration_adj > yellow_250ms) {
            rec.di = 'y';
            finalDisposition = next[`${finalDisposition}_y`] || 'y';
          }
        });
      } else {
        // Not a service (i.e. is a report) and not a performance report
        if (monitor_or_service_results.length !== 0) {
          finalDisposition = next[`${finalDisposition}_r`] || 'r';
        }
      }

      // Trim null values (job_name, err, etc.) since SQL includes all cols specified
      if (choices.method !== 'service') {
        monitor_or_service_results.forEach((entry) => {
          Object.keys(entry).forEach((key) => {
            if (entry[key] === null) delete entry[key];
          });
          if (entry.uuid) entry.uuid = baseUrl + '/Debug/' + entry.uuid;
        });
      }
      const send = {
        success: true,
        note: choices.note,
        type: choices.type, // To know to filter (e.g. Perf removes non-alarm rows)
        subject: choices.subject,
        date: new Date(),
        num_results: monitor_or_service_results.length,
        results: monitor_or_service_results,
        time_ms: Date.now() - start,
        formatter: alertSettings ? choices[alertSettings[0]] : null,
      };

      // Rarely known debug tool, set ?choices=x to get more details in the paragraph of results
      if (p.choices != null) Object.assign(send, { choices, adj_by_endpoint: adjByEndpoint });
      return send;
    };

    const allResults = [];
    try {
      for (const work of workList) {
        allResults.push(await doing_work(work)); // Array of promises
      }
    } catch (e) {
      ctx.log(f + 'WORK_LIST', JSON.parse(JSON.stringify(e, jsonReplacer(true))));
      throw ServerError(f, 'WORK_LIST', e.message);
    }

    let send;
    // Mutitiple-worklist vs. single; make it nicer to pull out the array-of-one-result
    if (allResults.length === 1) {
      send = allResults[0];
      send.now = momentNow.format();
      send.final_disposition = finalDisposition;
    } else {
      if (p.red && finalDisposition === 'r') ctx.res.status(Number(p.red));
      if (p.yellow && finalDisposition === 'y') ctx.res.status(Number(p.yellow));
      send = {
        subject: report.subject,
        final_disposition: finalDisposition,
        date: moment().format(),
        time_ms: Date.now() - startAll,
        link_lastBad100: baseUrl + '/Health?type=lastBad100',
        results: allResults,
      };
      if (alertSettings) {
        const [_, alertService, bold] = alertSettings;
        const rowsText = allResults
          .flatMap((report) => {
            // Perf reports have some possibly 'adjusted' entries that may not have yellow/red status
            const results = report.type === 'Perf' ? report.results.filter((r) => r.di === 'r' || r.di === 'y') : report.results;
            if (results.length === 0) return [];
            ctx.log(f, { report, results_map: [...results.map(report.formatter)] });
            return [`${bold}${report.subject}${bold}`, ...results.map(report.formatter)];
          })
          .join('\n');

        ctx.log(f, { healthUrl, rowsText });
        if (rowsText.length) alertService.alert(finalDisposition, `${bold}Comprehensive Health Check${bold}`, healthUrl, rowsText);
      }
    }
    return { send };
  }

  async _GetDebug(ctx) {
    const f = 'Monitor:_GetDebug:';
    const p = ctx.p;

    // Check BasicAuth using config value (Lets log it first, and confirm)
    const is_match = ctx.req.headers.authorization === 'Basic ' + this.config.monitor_health.basicAuth;
    ctx.log(f, { is_match });
    ctx.reply.header('WWW-Authenticate', `Basic realm=\"${this.config.monitor_health.realm}\"`);
    if (!is_match) throw Unauthorized(f, 'HEALTH_ENDPOINT', 'basic auth value incorrect');

    const len = p.uuid && p.uuid.length;
    if (!(len > 35)) throw InvalidArg(f, 'uuid:', `uuid (${len}) under 35`);
    const debug = await this.db.monitor.getDebug(ctx, p.uuid);
    return { send: { success: true, debug } };
  }

  // any: '{ANY} - reflected back in params:',
  // service: '{String} - optional service name e.g. RunQueue to query for health-check',
  // red: '{Number} - optional, status code when service is "red"',
  // yellow: '{Number} - optional, status code when service is "yellow"',
  async _ServiceHealth(ctx) {
    const f = 'Monitor:_ServiceHealth:';
    const p = ctx.p;

    // Check BasicAuth using config value (Lets log it first, and confirm)
    const is_match = ctx.req.headers.authorization === 'Basic ' + this.config.monitor_health.basicAuth;
    ctx.log(f, { is_match });
    ctx.reply.header('WWW-Authenticate', `Basic realm=\"${this.config.monitor_health.realm}\"`);
    if (!is_match) throw Unauthorized(f, 'HEALTH_ENDPOINT', 'basic auth value incorrect');

    const send = { success: true, params: p, service: 'not-found', services: Object.keys(this.services) };

    if (this.services[p.service]) {
      send.service = p.service;
      const baseUrl = this.config.api_server.protocol + ctx.req.headers.host + '/api/v1';
      const result = await this.services[p.service].monitor(ctx, p.output, `${baseUrl}/ServiceHealth?service=${p.service}`);
      if (p.red && result.status === 'r') {
        ctx.res.status(Number(p.red));
      }
      if (p.yellow && result.status === 'y') {
        ctx.res.status(Number(p.yellow));
      }
      send.result = result;
    }
    return { send };
  }
}
exports.monitor = monitor;
