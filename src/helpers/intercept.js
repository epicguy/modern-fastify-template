/**
 * helpers/interceptor.js - Axios logger to our monitor
 */
const _ = require('lodash');
const { ServerError } = require('./exception');
const defaultLogger = require('../config');

// Runs before server starts listening
function intercept(agent, logger = defaultLogger, ignoreCb = () => false) {
  var start = 0;
  agent.interceptors.request.use(
    (config) => {
      // Add a request interceptor
      const f = 'interceptors.request.BEFORE';
      // Do something before request is sent
      //ctx.log f, {config}
      logger.log(f, {
        timeout: config.timeout,
        headers_common: config.headers.common,
        method: config.method,
        headers_method: config.headers[config.method],
        baseURL: config.baseURL,
        url: config.url,
        params: config.params,
        data: config.data,
      });
      start = Date.now();
      return config;
    },
    (error) => {
      const f = 'interceptors.request.BEFORE-ERROR';
      // Do something with request error
      if (error.config) {
        // If this is an axios error, don't return just it, or logging will blow up
        logger.log(f, { JSON_parse: error.toJSON() });
        return Promise.reject(ServerError(f, error.code || 'NO_CODE', error.message || 'NO_MESSAGE'));
      }
      logger.log(f, { error });
      return Promise.reject(error);
    }
  );
  agent.interceptors.response.use(
    (response) => {
      // Add a response interceptor
      const f = 'interceptors.response.AFTER';
      // Do something with response data
      //ctx.log f, {response}
      logger.log(f, {
        status: response.status,
        headers_set_cookie: response.headers['set-cookie'],
        request_ClientRequest__header: response.request._header,
        data: JSON.stringify(response.data).substring(0, 999),
        time_ms: Date.now() - start,
      });
      return response;
    },
    (error) => {
      const f = 'interceptors.response.AFTER-ERROR';
      const time_ms = Date.now() - start;
      // Do something with response error
      if (error.config) {
        const response = _.pick(error.response || {}, ['status', 'statusText', 'headers', 'data']);
        response.data_json = String(JSON.stringify(response.data)).substring(0, 999);
        logger.log(f, { response, JSON_parse: error.toJSON(), time_ms });
        // Must check e.g. .status, .statusText, .headers, .data (could add .whatever)
        const ignore = ignoreCb(error.response);
        if (ignore) return error.response;
        const e = ServerError(f, error.code || 'NO_CODE', error.message || 'NO_MESSAGE');
        e.response = response;
        return Promise.reject(e);
      }
      logger.log(f, { error, time_ms });
      return Promise.reject(error);
    }
  );
  return agent;
}

exports.intercept = intercept;
