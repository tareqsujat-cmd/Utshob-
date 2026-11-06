// The last two middlewares in app.js.

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Express recognises an error handler because it has 4 parameters.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message;

  // Translate common database errors into friendly 4xx responses.
  if (err.code === 11000) {
    status = 409;
    message = 'This record already exists';
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 1 MB' : err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  }

  // Unexpected errors (no status set by us) hide their details from the user.
  // Deliberate ones like httpError(502, 'gateway down…') keep their helpful message.
  if (!err.status && status >= 500) {
    console.error(err);
    message = 'Something went wrong on the server';
  }

  res.status(status).json({ error: message, details: err.details, ...err.extra });
}
