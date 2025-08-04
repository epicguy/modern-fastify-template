/**
 * db/ident.js - Ident table Database Functions
 */
const { DbError } = require('../helpers/exception');

class ident {
  constructor(db) {
    this.db = db;
    this.table = 'ident';
    this.roleList = ['', 'user', 'admin'];
    this.schema = {
      reread: ['id', 'email'],
      getByEmail: ['id', 'email'],
      GetByKey: { id: ['id', 'email'], email: ['id', 'email'] },
      forTokens: ['id', 'role', 'email', 'screen_name', 'avatar_file'],
      getNames: ['id', 'email'],
      getUserDetails: ['id', 'email', 'screen_name', 'avatar_file', 'contact_list'],
      getContacts: ['id', 'email', 'screen_name', 'avatar_file'],
    };
  }

  // Checking for existence
  async getByEmail(ctx, email) {
    const sql = `
		SELECT ${this.schema.getNames}
		FROM ${this.table}
		WHERE email= ?
		`;
    return await this.db.sqlQuery(ctx, sql, [email]);
  }
  // Step on the previous keycode, reset expires and attempt-count
  async saveKeyCode(ctx, id, keycode, expires) {
    const f = 'db/ident:saveKeyCode:';
    ctx.log(f, { id, keycode, expires });

    const sql = `
         UPDATE ${this.table}
			SET keycode= ?, keycode_expires= ?, keycode_attempts= 0
			WHERE di = 0 AND id = ?
		`;
    return await this.db.sqlQuery(ctx, sql, [keycode, expires, id]);
  }

  // Create the email account and simultaneously set the keycode for access (role stays null)
  async Create(ctx, { email }, keycode, expires, reread) {
    const f = 'db/ident:Create:';
    ctx.log(f, { email, keycode, expires, reread });

    let sql = `
         INSERT INTO ${this.table} (email, keycode, keycode_expires) VALUES (?,?,?)
		`;
    if (reread === true) {
      sql += ` RETURNING ${this.schema.reread}`;
    }
    return await this.db.sqlQuery(ctx, sql, [email, keycode, expires]);
  }

  // Confirm keycode while updating attempt-count
  // On match only, invalidate keycode, add refresh, and return ID and ROLE for access-token
  // On no-match, update attempt count
  async keycodeAttempt(ctx, email, keycode, refreshToken, expires) {
    const f = 'db/ident:keyCodeAttempt:';
    ctx.log(f, { email, keycode, refreshToken, expires });

    // Optimize DB calls to assume a match most times
    const sql = `
         UPDATE ${this.table}
			SET refresh_token= ?, refresh_token_expires= ?, keycode= NULL
			WHERE di = 0 AND email = ? AND keycode = ? AND keycode_attempts< 3 AND keycode_expires> NOW()
			RETURNING ${this.schema.forTokens}
		`;

    const dbRowsOrResults = await this.db.sqlQuery(ctx, sql, [refreshToken, expires, email, keycode]);
    ctx.log(f, { dbRowsOrResults }); // NOTE THAT PSQL-CORE RETURNS OBJECT NOT ARRAY ON 'RETURNING' UPDATE QUERIES WHEN ROW-COUNT IS 0
    if ((dbRowsOrResults.affectedRows ?? dbRowsOrResults.length) !== 0) return dbRowsOrResults; // Could be multiple rows - let caller sort it out

    // Failed attempt - either no such email or keycode issue; update keycode-attempts if possible
    // Note: no point in updating state if count/expires is past
    const sql2 = `
         UPDATE ${this.table}
			SET keycode_attempts= keycode_attempts+ 1
			WHERE di = 0 AND email = ? AND keycode IS NOT NULL AND keycode_attempts< 3 AND keycode_expires> NOW()
		`;

    // In this case we fail the caller, regardless of this sql2 result
    await this.db.sqlQuery(ctx, sql2, [email]);
    return []; // To the caller, this looks like no such account, which is good for security
  }

  // Confirm currentRefreshToken, and update with new token/expires
  async refreshTokenAttempt(ctx, currentRefreshToken, refreshToken, expires) {
    const f = 'db/ident:refreshTokenAttempt:';
    ctx.log(f, { currentRefreshToken, refreshToken, expires });

    const sql = `
         UPDATE ${this.table}
			SET refresh_token= ?, refresh_token_expires= ?
			WHERE di = 0 AND refresh_token = ? AND  refresh_token_expires> NOW()
			RETURNING ${this.schema.forTokens}
		`;

    return await this.db.sqlQuery(ctx, sql, [refreshToken, expires, currentRefreshToken]);
  }

  // Use: dbRows = await this.sdb.ident.updateRole(ctx, ctx.token.id, 'user' ...); // Returns ident for upgrading client token
  async updateRole(ctx, id, role, refreshToken, expires, { screen_name, avatar_file }) {
    const f = 'db/ident:updateRole:';
    ctx.log(f, { id, role, refreshToken, expires });

    if (!this.roleList.includes(role)) throw DbError(f, 'ROLE_LIST', `role (${role}) not in ${this.roleList}`);
    const sql = `
         UPDATE ${this.table}
			SET role= ?, refresh_token= ?, refresh_token_expires= ?, screen_name = ?, avatar_file = ?
			WHERE di = 0 AND id = ?
			RETURNING ${this.schema.forTokens}
		`;

    return await this.db.sqlQuery(ctx, sql, [role, refreshToken, expires, screen_name, avatar_file, id]);
  }

  async updateDetails(ctx, id, { screen_name, avatar_file, contact_list }) {
    const f = 'db/ident:updateDetails:';
    ctx.log(f, { id, screen_name, avatar_file, contact_list });

    const args = [];
    const setSql = [];
    if (screen_name !== undefined) {
      setSql.push(`screen_name = ?`);
      args.push(screen_name);
    }
    if (avatar_file !== undefined) {
      setSql.push(`avatar_file = ?`);
      args.push(avatar_file);
    }
    if (contact_list !== undefined) {
      setSql.push(`contact_list = ?`);
      args.push(contact_list);
    }
    args.push(id);

    const sql = `
         UPDATE ${this.table}
			SET ${setSql}
			WHERE di = 0 AND id = ?
		`;

    return await this.db.sqlQuery(ctx, sql, args);
  }
  async getUserDetails(ctx, id) {
    const f = 'db/ident.getUserDetails:';

    const sql = `
         SELECT ${this.schema.getUserDetails} FROM ${this.table}
			WHERE di = 0 AND id = ?
		`;

    return await this.db.sqlQuery(ctx, sql, [id]);
  }
  async getContacts(ctx, contactIds) {
    const f = 'db/ident.getContacts:';
    ctx.log(f, { contactIds });

    const sql = `SELECT ${this.schema.getContacts} FROM ${this.table} WHERE di = 0 AND id IN (?)`;
    return await this.db.sqlQuery(ctx, sql, [contactIds]);
  }
}

exports.ident = ident;
