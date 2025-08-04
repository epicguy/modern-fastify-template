/**
 * app.js - Load application modules and init/start them
 */
const { load } = require('./milieu');
const backpack = {}; // Everything you need is here

const run = async () => {
  const f = 'app.js:run:';
  // process.env populates via docker (so no dotenv)
  // Config expects process.env to be loaded; Fire up milieu first...
  // Load milieu using pre-set process.env.milieu/milieu_private_key
  console.log(f, { milieu: process.env.milieu });
  await load(process.env.milieu);
  // Everyone needs configuration, load it first
  // Create and return the config structure
  // Future TS: Load all 'sections' via 'type' imports from each module
  const { log } = (backpack.config = require('./config'));

  // Load these modules so if someone needs another, load it first
  //backpack.slack = new (require('./slack').slack)(backpack);
  backpack.discord = new (require('./discord').discord)(backpack);
  backpack.mailer = new (require('./mailer').mailer)(backpack);
  backpack.email = new (require('./email').email)(backpack);
  backpack.db = new (require('./db').db)(backpack);
  backpack.monitor = new (require('./monitor').monitor)(backpack);
  backpack.api_server = new (require('./api_server').api_server)(backpack);

  // Load last, to load routes on routes.module_init
  backpack.routes = new (require('./routes').routes)(backpack);

  // 'Init' modules that need it
  for (module of Object.keys(backpack)) {
    if (typeof backpack[module].module_init === 'function') await backpack[module].module_init(backpack);
  }

  // 'Start' modules that need it
  for (module of Object.keys(backpack)) {
    if (typeof backpack[module].module_start === 'function') await backpack[module].module_start(backpack);
  }

  log(f, 'All modules loaded.');

  const logError = (event, object) => console.log(new Date().toUTCString(), `on:${event}`, object);
  process.on('unhandledRejection', (reason, p) => logError('unhandledRejection', { reason, p }));
  process.on('warning', (e) => logError('warning', { name: e.name, message: e.message, stack: e.stack }));
  process.on('beforeExit', (code) => logError('beforeExit', { code }));
  process.on('exit', (code) => logError('exit', { code }));
  process.on('uncaughtException', (err) => {
    logError('', { err, message: err.message, stack: err.stack });
    process.exit(198);
  });

  // Stop taking on new requests
  ['SIGUSR2', 'SIGHUP', 'SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, async () => {
      logError(signal, { exit_on_signal: process.env.exit_on_signal });
      if (backpack.slack) await backpack.slack.deploy(false, `**Draining** *via ${signal}*`);
      if (backpack.discord) await backpack.discord.deploy(false, `**Draining** *via ${signal}*`);
      if (backpack.JobQ != null) backpack.JobQ.Drain();
      await backpack.api_server.close();
      if (process.env.exit_on_signal === 'true') process.exit(1);
    });
  });

  if (backpack.slack) await backpack.slack.deploy(true, '*Started*');
  if (backpack.discord) await backpack.discord.deploy(true, '**Started**');
  log(f, 'Done.');
};
run().catch(function (e) {
  console.log('Fatal start-up in app.js', e);
  throw e;
});
