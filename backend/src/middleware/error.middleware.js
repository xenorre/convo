import logger from "#config/logger.js";

export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.publicMessage || err.message || "Internal server error";

  logger.error("Unhandled error", {
    requestId: req?.requestId,
    method: req?.method,
    url: req?.originalUrl,
    status,
    message: err.message,
    stack: err.stack,
  });

  // Avoid leaking internals in production
  const response = {
    error: status >= 500 ? "Internal server error" : message,
    requestId: req?.requestId,
  };

  res.status(status).json(response);
};