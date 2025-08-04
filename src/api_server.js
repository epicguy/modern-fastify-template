const Fastify = require('fastify');

class api_server {
  static deps = { modules: [], config: 'api_server', db: ['api_server'] };
  constructor(backpack) {
    this.config = backpack.config.api_server;
  }

  async module_init() {
    this.fastify = Fastify({ logger: true });
    this.fastify.register(require('@fastify/formbody'));
    this.fastify.register(require('@fastify/multipart'));
    this.fastify.register(require('@fastify/cors'), {
      origin: [
        'http://localhost:8800',
        'http://localhost:3000',
        'https://stage.__TEMPLATE_DOMAIN__',
        'https://prod.__TEMPLATE_DOMAIN__',
        'https://app.__TEMPLATE_DOMAIN__',
      ],
    });
    // HSTS headers
    this.fastify.addHook('preHandler', (_req, res, done) => {
      res.header('Strict-Transport-Security', 'max-age=31536000 preload');
      done();
    });

    this.route = this.fastify.route.bind(this.fastify);
  }

  async module_start() {
    await this.fastify.listen({ ...this.config.opts });
  }
  async close() {
    await this.fastify.close();
  }
}
exports.api_server = api_server;
