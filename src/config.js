/**
 * config.js - Return config object with 'sections'
 * Assumes process.env is loaded before first use of this module
 */
const { readFileSync } = require('fs');
const { join } = require('path');
const host = process.env.API_HOST ?? 'localhost';
const protocol = (host === 'localhost' ? 'http' : 'https') + '://';

module.exports = {
  log: (f, o) => console.log(f, o), // Low level logger
  api_server: { opts: { host: '0.0.0.0', port: 8600 }, host, protocol, port: process.env.API_PORT },
  routes: { api_prefix: '/api/:Version' },
  monitor: { write_to_log2: true },
  monitor_health: { realm: 'Monitor health check', basicAuth: process.env.MONITOR_HEALTH_AUTH },
  s3: {
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET,
    signedUrlExpirationSecs: 30, // 30 seconds
    credentials: {
      accessKeyId: process.env.API_ACCESS_KEY_ID,
      secretAccessKey: process.env.API_SECRET_ACCESS_KEY,
    },
  },
  slack: {
    level3: false,
    alert_url: process.env.SLACK_URL_ALERT || '',
    deploy_url: process.env.SLACK_URL_DEPLOY || '',
    repoCommitsUrl: 'https://__TEPLATE_REPO_PATH__/__TEMPLATE_REPO_NAME__/commit/',
  },
  discord: {
    level3: false,
    alert_url: process.env.DISCORD_URL_ALERT || '',
    deploy_url: process.env.DISCORD_URL_DEPLOY || '',
    repoCommitsUrl: 'https://__TEPLATE_REPO_PATH__/__TEMPLATE_REPO_NAME__/commit/',
  },
  db: {
    pool_opts: {
      ssl:
        process.env.DB_SSL_OFF === 'true'
          ? false
          : {
              ca: readFileSync(join(__dirname, 'assets', 'rds.us-east-1-bundle.pem')).toString(),
            },
      host: process.env.DB_HOST ?? 'localhost',
      port: process.env.DB_PORT ?? 5432,
      user: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASS ?? 'password',
      database: process.env.DB_NAME ?? 'process.env.DB_NAME',
    },
    level2_debug: process.env.LEVEL2 === 'true',
    level3_debug: process.env.LEVEL3 === 'true',
  },
  oauth: {
    debug_allow_zero_keycode: process.env.DEBUG_ALLOW_ZERO_KEYCODE === 'true',
    keycodeExpiration: 60 * 5,
    keycodeAttemptsMax: 3,
    accessTokenExpiration: 60 * 15,
    refreshTokenExpiration: 60 * 60 * 72, // Equivalent to idle timeout
    key: process.env.AUTH_KEY,
  },
  email: {
    allow_alias: process.env.EMAIL_ALLOW_ALIAS === 'true',
    options: {
      urlPrefix: (process.env.WEB_APP_URL ?? 'process.env.WEB_APP_URL') + '/#!/',
      urlStaticPrefix: (process.env.WEB_APP_URL ?? 'process.env.WEB_APP_URL') + '/',
    },
  },
  mailer: {
    level3: true,
    from: process.env.MAIL_FROM,
    transport_options: {
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT),
      secure: Number(process.env.MAIL_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    },
    ses: {
      region: process.env.SES_REGION,
      credentials: { accessKeyId: process.env.API_ACCESS_KEY_ID, secretAccessKey: process.env.API_SECRET_ACCESS_KEY },
    },
  },
};
