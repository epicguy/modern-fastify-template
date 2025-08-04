/**
 * routes/index.js - Load and register all routes for the api_server (wrap w/decoration)
 */
const routeModules = {
  ident: require('./ident').ident,
  monitor: require('./monitor').monitor,
};
let wrap = () => console.log('WRAP NOT SET.');
class routes {
  static deps = { module: [], config: 'routes', db: [] };

  constructor(backpack) {
    this.config = backpack.config.routes;
    this.api_server = backpack.api_server;
    wrap = require('../helpers/wrap')(backpack);
  }

  module_init(backpack) {
    // Server has been init-ed, so we can add routes now
    for (const moduleName of Object.keys(routeModules)) {
      const instance = new routeModules[moduleName](backpack);
      // Wrap each endpoint, and add verb-method to server
      Object.keys(instance.endpoints).forEach((routeName) => this._addRoute(moduleName, routeName, instance));
    }
  }

  _addRoute(moduleName, routeName, instance) {
    const defaults = (instance.endpointDefaults ?? {})[instance.endpoints[routeName].verb] ?? {};
    var decoration = Object.assign({}, defaults, instance.endpoints[routeName]);
    decoration.name = moduleName + ':' + routeName;
    // Fix 'role' to be an array if it was only one value as string
    if (typeof decoration.role === 'string') decoration.role = [decoration.role];
    // Unless globally declined (for now, maybe later always) bind unbound route-logic-methods
    if (instance.bindDecline !== true) {
      if (!decoration.handler.name.startsWith('bound')) decoration.handler = decoration.handler.bind(instance);
    }
    const prefix = this.config.api_prefix;
    this.api_server.route({
      method: decoration.verb,
      path: prefix + decoration.route,
      schema: { description: decoration.description },
      handler: (req, reply) => wrap(req, reply, decoration),
    });
  }
}
exports.routes = routes;
