/**
 * ident.js - Routes for authentication via OTP to email
 *
 * Notes: User exists in ident table for login w/roles, but User record is required for access to web portal
 * Roles: admin, '' (empty, until registered), user
 *
 * Token response:
 * accessToken: '{String} - provided in subsequent authenticated endpoints',
 * tokenType: '{String} - bearer',
 * expires: '{Number} - expiration in seconds: i' + this.config.accessTokenExpiration,
 * refreshToken: '{String} - use to get a new accessToken after "expires" seconds',
 */

const { InvalidArg, NotFound, DbError } = require('../helpers/exception');
const { createKeycode, createRefreshToken, createTokenResponse } = require('../helpers/oauth');
const { getAvatarUploadUrl } = require('../helpers/s3');
const {
  validEmailRequired,
  asString,
  exists,
  inList,
  regex,
  minLength,
  asNumber,
  positive,
  integer,
  giveDefault,
} = require('../helpers/validate');

class ident {
  static deps = { modules: ['email'], config: 'oauth', db: ['ident', 'user'] };
  constructor(backpack) {
    this.db = backpack.db;
    this.email = backpack.email;
    this.config = backpack.config.oauth; // keycode expire seconds, debug_allow_zero_keycode

    this.endpointDefaults = {
      get: { role: 'user', sql_conn: true },
      post: { auth_required: false, sql_conn: true, sql_trx: true },
    };

    // Validation
    const email = validEmailRequired;
    const option = [exists(), inList(['', 'noRole', 'anyRole'])];
    const keycode = [asString(), regex('^[0-9]{6}$')];
    const refreshToken = [asString(), minLength(16)];
    const grantType = [asString(), inList(['refreshToken'])];
    const encrypt_bip39 = [asString(), minLength(16)];
    const screen_name_exists = [exists(), asString(), regex('^[^<>]{3,48}$', '3-48 chars, no HTML')];
    const screen_name_optional = [giveDefault(''), asString(), regex('^(|[^<>]{3,48})$', '3-48 chars, no HTML')];
    const avatar_file = [giveDefault(''), asString(), regex('^(|[a-f0-9]{16}[.](jpg|jpeg|png))$', 'hex{16}.(jpg,jpeg,png)')];
    const imageType = [asString(), inList(['jpg', 'jpeg', 'png'])];
    const contactEmail = validEmailRequired;
    const contactReference = [asNumber(), integer(), positive()];

    this.endpoints = {
      identCreate: { verb: 'post', route: `/Ident/_create`, handler: this._create, params: { email, option } },
      identVerify: { verb: 'post', route: `/Ident/_verify`, handler: this._verify, params: { email, keycode } },
      identRefresh: { verb: 'post', route: `/Ident/_refresh`, handler: this._refresh, params: { refreshToken, grantType } },
      userCreate: {
        verb: 'post',
        route: `/User/_create`,
        handler: this._createUser,
        auth_required: true,
        role: [''],
        params: { screen_name: screen_name_exists, avatar_file },
      },
      userUpdate: {
        verb: 'post',
        route: `/User/_update`,
        handler: this._updateUser,
        auth_required: true,
        role: ['user'],
        params: { screen_name: screen_name_optional, avatar_file },
      },
      userGet: { verb: 'get', route: '/User/me', handler: this._userGet },
      avatarUploadUrl: {
        verb: 'get',
        route: '/User/_avatar_upload_url',
        handler: this._getAvatarUploadUrl,
        auth_required: true,
        role: ['', 'user'],
        params: { imageType },
      },
      // Endpoint to allow adding user from a given user’s contact list
      userAddContact: {
        verb: 'post',
        route: '/User/_add_contact',
        handler: this._addContact,
        auth_required: true,
        role: ['user'],
        params: { contactEmail, contactReference },
      },
      userRemoveContact: {
        verb: 'post',
        route: '/User/_remove_contact',
        handler: this._removeContact,
        auth_required: true,
        role: ['user'],
        params: { contactReference },
      },
    };
  }

  // Create unique ident (optionally, just let them log in) and send a keycode via email; created role is empty for now
  async _create(ctx) {
    const f = 'ident:_create:';
    const { email, option } = ctx.cleanP;
    let dbRows, dbResults;

    let canProceed;
    dbRows = await this.db.ident.getByEmail(ctx, email);
    if (dbRows.length === 0) canProceed = true; // Good for all options
    else if (dbRows.length !== 1) canProceed = false; // Bad on all accounts (DB is broken)
    // A record exists...
    else if (option === '') canProceed = 'email-exists'; // This option does not allow any existing record
    else if (dbRows[0].role == null && option === 'noRole') canProceed = true; // A specifically allowed option (not fully created user)
    else if (option === 'anyRole') canProceed = true; // Anyone could have existed previously, just allow the normal code login
    else canProceed = 'email-role'; // All other cases are not allowed
    if (canProceed !== true) throw InvalidArg(f, canProceed);

    // Create ident if needed, include keycode to save time
    const { keycode, keycodeExpires } = createKeycode(ctx);
    if (dbRows.length === 0) {
      // Create the record
      dbRows = await this.db.ident.Create(ctx, { email }, keycode, keycodeExpires, true); // No role, but include the keycode to save time
      if (dbRows.length !== 1) throw DbError(f, 'ident.Create', `rows:${dbRows.length}`);
    } else {
      // Simulate sign-in logic (i.e. save the keycode for later verification)
      dbResults = await this.db.ident.saveKeyCode(ctx, dbRows[0].id, keycode, keycodeExpires);
      if (dbResults.affectedRows !== 1) throw DbError(f, 'ident.saveKeyCode', `rows:${dbResults.affectedRows}`);
    }
    const ident = dbRows[0];
    if (keycode !== '000000') await this.email.verify(ctx, ident, keycode);
    return { send: { success: true }, testability: { ident, canProceed, keycode } };
  }

  // This method might return success:false to avoid rollback when updating ident.keycode_attempts
  async _verify(ctx) {
    const f = 'ident:_verify:';
    const { email, keycode } = ctx.cleanP;
    let dbRows;

    // Updates attempt count on keycode, and returns current keycode if not expired and not exceeded attempts
    const { refreshToken, refreshTokenExpires } = createRefreshToken();
    dbRows = await this.db.ident.keycodeAttempt(ctx, email, keycode, refreshToken, refreshTokenExpires);
    if (dbRows.length !== 1) {
      // Don't throw an error, else keycode_attempts update will rollback
      return { send: { success: false }, testability: { email, dbRows } };
    }
    const ident = dbRows[0];
    if (ident.role === null) ident.role = '';
    const tokenResponse = createTokenResponse(ctx, ident, refreshToken); // Create/sign a token
    return { send: { success: true, ...tokenResponse }, testability: { email, ident } };
  }

  async _refresh(ctx) {
    const f = 'ident:_refresh:';
    const { grantType, refreshToken: oldRefreshToken } = ctx.cleanP;
    let dbRows;

    // Updates refreshToken (single use) , and returns current refreshToken if not expired
    const { refreshToken, refreshTokenExpires } = createRefreshToken(ctx);
    dbRows = await this.db.ident.refreshTokenAttempt(ctx, oldRefreshToken, refreshToken, refreshTokenExpires);
    if (dbRows.length !== 1) throw NotFound(f, 'ident.refreshTokenAttempt', `rows:${dbRows.length}`);
    const ident = dbRows[0];
    if (ident.role === null) ident.role = '';
    const token = createTokenResponse(ctx, ident, refreshToken);
    return { send: { success: true, ...token }, testability: { grantType: grantType, refreshToken: oldRefreshToken, ident } };
  }

  /**
   * Methods for User: Create (give out upgraded token), and update
   */

  async _createUser(ctx) {
    const f = 'ident:_createUser:';
    const { screen_name, avatar_file } = ctx.cleanP;
    let dbRows, dbResults, newValues;

    // Creates user , and returns ident values for token creation (upgrades role to 'user')
    newValues = { screen_name, avatar_file: avatar_file || null };

    const { refreshToken, refreshTokenExpires } = createRefreshToken(ctx);
    // Returns ident for upgrading client token (fails if already created, to avoid overwriting original wallet)
    dbRows = await this.db.ident.updateRole(ctx, ctx.authId, 'user', refreshToken, refreshTokenExpires, newValues);
    if (dbRows.length !== 1) throw NotFound(f, 'ident.updateRole', `rows:${dbRows.length}`);
    const ident = dbRows[0];

    // Upgrade auth-token with new 'user' role.
    const token = createTokenResponse(ctx, ident, refreshToken);
    return { send: { success: true, ...token }, testability: { newValues, dbResults, dbRows, ident } };
  }

  async _updateUser(ctx) {
    const f = 'ident:_updateUser:';
    const { screen_name, avatar_file } = ctx.cleanP;
    let dbResults, newValues;

    if (!screen_name && !avatar_file) throw InvalidArg(f, 'NO_CHANGES');
    newValues = { screen_name: screen_name || undefined, avatar_file: avatar_file || undefined };

    dbResults = await this.db.ident.updateDetails(ctx, ctx.authId, newValues);
    if (dbResults.affectedRows !== 1) throw DbError(f, 'ident.updateDetails', `rows:${dbResults.affectedRows}`);
    return { send: { success: true } };
  }

  async _userGet(ctx) {
    const f = 'ident:_userGet:';
    let dbRows;

    // Returns ident details for FE log-in
    dbRows = await this.db.ident.getUserDetails(ctx, ctx.authId);
    if (dbRows.length !== 1) throw DbError(f, 'ident.getUserDetails', `rows:${dbRows.length}`);
    const user = dbRows[0];
    const contacts = [];
    if (user.contact_list) {
      const contactIds = user.contact_list.split(',');
      dbRows = await this.db.ident.getContacts(ctx, contactIds);
      if (dbRows.length !== contactIds.length) throw DbError(f, 'ident.getContacts', `rows:${dbRows.length}/${contactIds.length}`);
      contacts.push(...dbRows);
    }
    return { send: { success: true, user, contacts } };
  }

  // Get a signed URL for uploading an avatar
  async _getAvatarUploadUrl(ctx) {
    const f = 'ident:_getAvatarUploadUrl:';
    const { imageType } = ctx.cleanP;
    const { uploadUrl, avatar_file } = await getAvatarUploadUrl(ctx, ctx.authId, imageType);
    return { send: { success: true, uploadUrl, avatar_file } };
  }

  // Add a user to a given user’s contact list
  async _addContact(ctx) {
    const f = 'ident:_addContact:';
    const { contactEmail, contactReference } = ctx.cleanP;
    let dbRows, dbResults;

    dbRows = await this.db.ident.getByEmail(ctx, contactEmail);
    if (dbRows.length !== 1) throw NotFound(f, 'ident.getByEmail', `Email+ID not found`);
    if (dbRows[0].id === ctx.authId) throw InvalidArg(f, 'SELF', `Cannot add self to contact list`);
    // TODO XXX XXX XXX PUT BACK AS contactReference
    if (dbRows[0].id !== contactReference) throw NotFound(f, 'ident.getByEmail', `Email+ID not found`);
    const dbContact = dbRows[0];

    dbRows = await this.db.ident.getUserDetails(ctx, ctx.authId);
    if (dbRows.length !== 1) throw NotFound(f, 'ident.getUserDetails', `rows:${dbRows.length}`);
    const dbUser = dbRows[0];

    const contact_list = Array.from(new Set(['' + dbContact.id, ...(dbUser.contact_list ? dbUser.contact_list.split(',') : [])])).join(',');
    dbResults = await this.db.ident.updateDetails(ctx, ctx.authId, { contact_list });
    if (dbResults.affectedRows !== 1) throw DbError(f, 'ident.updateDetails', `rows:${dbResults.affectedRows}`);
    return { send: { success: true, user: { ...dbUser, contact_list } } };
  }

  async _removeContact(ctx) {
    const f = 'ident:_removeContact:';
    const { contactReference } = ctx.cleanP;
    let dbRows, dbResults;

    dbRows = await this.db.ident.getUserDetails(ctx, ctx.authId);
    if (dbRows.length !== 1) throw NotFound(f, 'ident.getUserDetails', `rows:${dbRows.length}`);
    const dbUser = dbRows[0];

    const fullSet = new Set(dbUser.contact_list ? dbUser.contact_list.split(',') : []);
    fullSet.delete('' + contactReference);
    const contact_list = Array.from(fullSet).join(',');
    dbResults = await this.db.ident.updateDetails(ctx, ctx.authId, { contact_list: contact_list });
    if (dbResults.affectedRows !== 1) throw DbError(f, 'ident.updateDetails', `rows:${dbResults.affectedRows}`);
    return { send: { success: true, user: { ...dbUser, contact_list } } };
  }
}

exports.ident = ident;
