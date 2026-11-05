// Create an Error that carries an HTTP status code.
// Controllers `throw httpError(409, 'Venue busy')` and the central errorHandler sends it.
// `extra` adds fields to the JSON response, e.g. { upgradeTo: 'plus' } for plan limits.
export function httpError(status, message, details, extra) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  if (extra) err.extra = extra;
  return err;
}
