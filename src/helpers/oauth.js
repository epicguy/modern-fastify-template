/**
 * helpers/oauth.js - Helper to create OAuth tokens
 *   access_token, refresh_token, and random 6 - digit keycodes w / expiration
 */

const crypto = require('node:crypto');
const moment = require('moment');
const randomatic = require('randomatic');
// Local
const { oauth: config } = require('../config');

// Utiltity funcs
const urlSafeBase64EncodeFix = (str) => str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const urlSafeBase64DecodeFix = (str) => str.replace(/\-/g, '+').replace(/\_/g, '/');

function _encode(info, exp, key) {
  // console.log('_encode', { info, exp, key }); // XXX
  const token = {
    ...info,
    exp: moment.isMoment(exp) ? exp.unix() : moment(exp).unix(),
  };
  const data = urlSafeBase64EncodeFix(Buffer.from(JSON.stringify(token), 'utf8').toString('base64'));
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return data + '.' + urlSafeBase64EncodeFix(hmac.digest('base64'));
}
function decodeAndVerify(encoded, key) {
  const [dataReceived, hmacReceived] = encoded.split('.');

  // Confirm signature
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(dataReceived);
  const newHmac = urlSafeBase64EncodeFix(hmac.digest('base64'));
  if (newHmac !== hmacReceived) return 'hmac';

  // Decode base64 data into 'info' structure {id, role, ..., exp}
  const info = JSON.parse(Buffer.from(urlSafeBase64DecodeFix(dataReceived), 'base64'));
  const { exp } = info;

  // Verify expiration is in the past (before (less than) now)
  const now = moment().unix();
  if (exp < now) return 'expired:' + (now - exp);

  // Return the token itself (with all the fields intact)
  return info;
}

// Public funcs
const createKeycode = () => {
  return {
    keycode: config.debug_allow_zero_keycode ? '000000' : randomatic('0', 6),
    keycodeExpires: moment().add(config.keycodeExpiration, 'seconds'),
  };
};

const createRefreshToken = () => {
  return {
    refreshToken: randomatic('Aa0', 16),
    refreshTokenExpires: moment().add(config.refreshTokenExpiration, 'seconds'),
  };
};

// Compile the payload and sign it
const _createAccessToken = function ({ id, role }) {
  if (id === 0) throw new Error('_createAccessToken:Unexpected id');
  const expires = config.accessTokenExpiration;
  const accessExpiration = moment().add(expires, 'seconds');
  const payload = { id, role };
  const accessToken = _encode(payload, accessExpiration, config.key);
  return { accessToken, expires };
};

// A full response to send back to the client; creates access token; You must have stored refreshToken in ident table, and give it here
const createTokenResponse = function (_ctx, info, refreshToken) {
  const { accessToken, expires } = _createAccessToken(info);
  return { accessToken, tokenType: 'bearer', expires, refreshToken, info };
};

exports.createKeycode = createKeycode;
exports.createRefreshToken = createRefreshToken;
exports.createTokenResponse = createTokenResponse;
exports.decodeAndVerify = decodeAndVerify;
exports.urlSafeBase64EncodeFix = urlSafeBase64EncodeFix;
exports.urlSafeBase64DecodeFix = urlSafeBase64DecodeFix;
