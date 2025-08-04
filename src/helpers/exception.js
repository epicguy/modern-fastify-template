//const statusCodes = require('http').STATUS_CODES
const _serialize = (e, s) => Object.assign({ name: e.name, message: e.message, stack: s ? e.stack : null }, e);

[
  ['PartialSuccess', 202],
  ['MissingArg', 400],
  ['InvalidArg', 400],
  ['InvalidParams', 400], // Contains e.g. multiple issues
  ['Unauthorized', 401],
  ['Forbidden', 403],
  ['NotFound', 404],
  ['DbError', 500],
  ['ServerError', 500],
].forEach(([name, statusCode]) => {
  exports[name] = (func, code, message, extra = {}) => {
    // TODO SECURITY MAY NOT WANT TO EXPOSE message ON DbError ???
    const body = { name, statusCode, code, func, message, extra }; // TODO FIND GREAT BODY FOR END USER / DEV WHEN ERRORS OCCUR
    // TODO USEFUL WITH AUTO TESTING: console.log({ body });
    return Object.assign(new Error(message), { name, statusCode, code, func, body });
  };
});

exports.reply = (reply, error) => {
  if (error.statusCode) {
    // Our custom error
    reply.status(error.statusCode).send(_serialize(error));
  } else reply.send(error); // Fallback to basic error handler in Fastify
};
