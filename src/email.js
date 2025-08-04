class email {
  static deps = { modules: ['mailer'], config: 'email' };

  constructor(backpack) {
    this.mailer = backpack.mailer;
    this.config = backpack.config.email;
  }

  async _send(ctx, type, details) {
    const f = 'email._send:' + type + ':';
    ctx.log(f, { details });
    if (this.config.allow_alias === true) details = { ...details, email: details.email.replace(/__[^@]*@/, '@') };
    const rV = await this.mailer.send(ctx, type, details);
    ctx.log(f, { rV });
  }

  /**
   ** One method per template, with specific params needed for each email template
   */

  // Send a keycode to verify access to this email address (subsequently use 'login' to send key-codes)
  async verify(ctx, { email }, keycode) {
    const text = `Your verification code is: ${keycode}\n\nBest regards,\__TEMPLATE_PROJ_NAME__ Team`;
    await this._send(ctx, 'verify', { email, subject: 'Email Verification', text });
  }
}

exports.email = email;
