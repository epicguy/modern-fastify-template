/**
 * discord.js - messaging service to discord
 */
const axios = require('axios');
const { intercept } = require('./helpers/intercept');

class discord {
  static deps = { modules: [], config: 'discord' };

  constructor(backpack) {
    this.log = backpack.config.log;
    this.config = backpack.config.discord;
    this.level3_debug = this.config.level3;
    // Deploy messages (like server going up/down)
    this.deploy_url = this.config.deploy_url;
    this.deploy_on = this.config.deploy_url.length !== 0;
    // Alert messages (like health-check)
    this.alert_color = [0xeb1717, 0xf0ad4e];

    this.alert_url = this.config.alert_url;
    this.alert_on = this.config.alert_url.length !== 0;

    this.environment = (process.env.milieu || 'env').toUpperCase();
    const image_tag_parts = process.env.image_tag.split('/')[1].split('.');
    const url_prefix = this.config.repoCommitsUrl;
    image_tag_parts[2] = `[${image_tag_parts[2]}](${url_prefix}${image_tag_parts[2]})`;
    this.image_tag = image_tag_parts.join('.');
    this.ip_address = Object.values(require('os').networkInterfaces()).reduce(
      (r, list) => r.concat(list.reduce((rr, i) => rr.concat((i.family === 'IPv4' && !i.internal && i.address) || []), [])),
      []
    );

    // Create axios client with logging
    const axios_options = {};
    this.axios_client = axios.create(axios_options);
    if (this.level3_debug) intercept(this.axios_client);
  }

  _compose(heading, color, text, pretext = '') {
    const f = 'discord:_compose:';
    if (this.level3_debug) console.log(f, { heading, color, text, pretext });
    // Without color, heading has all the text to go
    const discord_output = {
      avatar_url: 'https://imgur.com/CbvDUsN',
      content: heading,
    };
    if (color != null) {
      const discord_attachment = { color, title: pretext, description: text };
      discord_output.embeds = [discord_attachment];
    }
    return discord_output;
  }
  async _send(url, payload) {
    try {
      // Use http client to POST to url the payload as json
      await this.axios_client.post(url, payload);
    } catch (e) {
      // If above used axios w/interceptor, no need to log it
      // We are a logging service, so don't return errors to the caller
      this.log(f, { info: 'caught error', e_message: 'e.message', url, payload });
    }
  }

  // Deployment messages come from specific tasks on various environments (show which one)
  async deploy(up, message) {
    const f = `discord:deploy:${this.deploy_on}:`;
    this.log(f, { message });
    //const icon = up ? ':point_up_2:' : ':point_down:';
    const icon = up ? ':arrow_heading_up:' : ':arrow_heading_down:';
    const text = `${icon} **${this.environment}** *${this.image_tag}* [${this.ip_address}] ${message}`;
    const payload = this._compose(text);
    if (!this.deploy_on) return;
    await this._send(this.deploy_url, payload);
  }
  async alert(level, title, returnUrl, message) {
    const f = `discord:alert:${this.alert_on}:`;
    this.log(f, { level, title, message });
    if (!this.alert_on) return;
    const heading = `${title} :fire: **[${this.environment}](${returnUrl})** :fire: *${this.image_tag}*`;
    const payload = this._compose(heading, this.alert_color[level === 'r' ? 0 : 1], message);
    await this._send(this.alert_url, payload);
  }
}

exports.discord = discord;
