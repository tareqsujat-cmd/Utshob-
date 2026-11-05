import { httpError } from '../utils/httpError.js';

// Checks req.body (or req.query) against a zod schema before the controller runs.
// On success the cleaned data replaces req.body, or is stored in req.validQuery
// (Express 5 does not allow overwriting req.query).
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      throw httpError(400, 'Please check the highlighted fields', details);
    }
    if (source === 'query') req.validQuery = result.data;
    else req.body = result.data;
    next();
  };
}
