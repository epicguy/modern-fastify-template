/**
 * wrap.js - Wrapper for api-server endpoints (implements decorations)
 */
const { randomUUID: uuidv4 } = require('crypto'); // Use: uuidv4()
const { Unauthorized, Forbidden, ServerError, DbError, InvalidParams } = require('./exception');
const { decodeAndVerify } = require('./oauth');
const { oneOf } = require('./validate');
const _serialize = (e, s) => Object.assign({ name: e.name, message: e.message, stack: s ? e.stack : null }, e);

module.exports = (backpack) => {
  const configKey = backpack.config.oauth.key;
  const monitor = backpack.monitor;
  const dbCore = backpack.db;

  const authorize = (ctx, req) => {
    const f = 'wrap.js:authorize:';
    let token = null;

    const authHeader = req.headers.authorization?.split(' ', 2);
    ctx.log(f, { authHeader });
    if (authHeader?.length === 2 && authHeader[0].toLowerCase() === 'bearer' && authHeader[1].length > 20) {
      token = decodeAndVerify(authHeader[1], configKey);
      ctx.log(f, { token });
    }
    if (!token?.id) throw Unauthorized(f, 'bearer_token', 'Missing or invalid authorization header (bearer)');
    return { authId: token.id, role: token.role, token };
  };

  return async (req, reply, decoration) => {
    const f = `Wrap:${decoration.name}:`;
    try {
      let badHandle = false;
      const handler = decoration.handler; // TODO API VERSIONING
      // TODO API Documentation if (req === 'use') {
      const route = decoration.route,
        verb = decoration.verb,
        start = new Date().getTime(),
        uuid = uuidv4(),
        conn = null,
        authId = null,
        role = null;
      const params = Object.assign({}, req.params, req.query, req.body);
      const monitorValues = { start, route, verb, params, uuid, authId: 0, role, conn_id: 0, debug: [] };
      const ctx = { conn, p: params, authId, role, req, reply, uuid, monitor: monitorValues };
      ctx.log = monitor.getReqLog(ctx);

      // Auth
      if (decoration.auth_required || decoration.role) {
        const { authId, role } = authorize(ctx, req); // Throws if not authorized!!
        ctx.authId = ctx.monitor.authId = authId;
        ctx.role = ctx.monitor.role = role;
      }

      // Only do 'try/catch' after authorize()!!
      try {
        // A user is in one role, but the decoration can have 1 or more roles to satisify
        if (decoration.role && !decoration.role.includes(ctx.role))
          throw Forbidden(f, 'ROLE', `EXPECTED ROLE ${decoration.role} (${ctx.role})`);

        // Validate any params
        if (decoration.params) {
          const cleanP = {};
          const bad = [];
          Object.entries(decoration.params).forEach(([nm, val]) => {
            //console.log(f, { nm, val, params }); // XXX XXX
            const result = oneOf(val)(nm)(params);
            if (result.bad) {
              bad.push(result.bad);
            } else cleanP[nm] = result.good;
          });
          if (bad.length) throw InvalidParams(f, `ISSUE_COUNT_${bad.length}`, bad.join('; '));
          ctx.log(f, { cleanP });
          ctx.cleanP = cleanP;
        }

        // Acquire DB Connection
        if (decoration.sql_conn) {
          ctx.conn = await dbCore.Acquire();
          ctx.monitor.conn_id = ctx.conn.__pool_id;
        }

        // Start a Transaction, Call the Route's handler, Commit the transaction, Release database conn
        if (decoration.sql_tx) await dbCore.StartTransaction(ctx);
        const handler_result = await handler(ctx);
        if (ctx.conn) {
          const dbIssue = dbCore.Issue(ctx.conn, true);
          if (dbIssue) {
            badHandle = true;
            throw DbError(f, 'BadHandle', JSON.stringify(dbIssue));
          }
        }
        if (decoration.sql_tx) await dbCore.sqlQuery(ctx, 'COMMIT');
        if (ctx.conn !== null) dbCore.Release(ctx.conn);
        ctx.conn = null;

        // Update monitor's stats and write to monitor
        ctx.monitor.statusCode = 200;
        const end = new Date().getTime();
        ctx.monitor.duration = end - ctx.monitor.start;
        if (decoration.monitor !== false) monitor.write(ctx);

        // Send handler's result via api server
        if (handler_result.send != null) handler_result.send.uuid = uuid;
        reply.status(200).send(handler_result.send);

        // Process errors
      } catch (err) {
        if ([400, 401, 403, 404].includes(err.statusCode)) ctx.log(f + '.catch', { err });
        else ctx.log(f + '.catch', { err, stack: err.stack });

        if (badHandle) dbCore.Destroy(ctx.conn);
        else if (ctx.conn != null) {
          if (!decoration.sql_tx) dbCore.Release(ctx.conn);
          else {
            ctx.conn.query('ROLLBACK', (err) => {
              if (err) {
                ctx.log(f, 'destroy db conn (failed rollback)');
                dbCore.Destroy(ctx.conn);
                ctx.log(f + '.catch', { stack: err.stack });
              } else {
                ctx.log(f, 'Release db conn (successful rollback)');
                dbCore.Release(ctx.conn);
              }
            });
          }
        }

        // Process final result back to api-server
        if (!err.body) console.log(f, { err }); // Hard to find details on this thing
        const client_err = err.body ? err : ServerError(f, err.name, err.message); // TODO TEST RANDOM ERRORS

        // Update monitor stats for error condition
        ctx.monitor.statusCode = client_err.statusCode;
        const end = new Date().getTime();
        ctx.monitor.duration = end - ctx.monitor.start;
        ctx.monitor.err = JSON.parse(JSON.stringify(_serialize(client_err)));
        monitor.write(ctx);
        // After monitor clones err, add unique uuid for caller (in body)
        if (client_err.body != null) {
          client_err.body.uuid = uuid;
        }
        reply.status(client_err.statusCode).send(client_err.body);
      }
    } catch (e) {
      // TODO NONE OF THESE ARE LOGGED IN LAMD (INCLUDES OAUTH ERRORS AT THIS TIME)
      if (e.statusCode === 401) throw e;
      // Super deep error
      console.log(f + 'DEEP-ERROR', e);
      e.statusCode = 501;
      throw e;
    }
  };
};
