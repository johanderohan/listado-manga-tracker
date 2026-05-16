const IS_PROD = process.env.NODE_ENV === 'production';

export function notFound(req, res, _next) {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);

  // En 5xx logueamos el error completo (con stack) para diagnóstico.
  if (status >= 500) console.error('[error]', err);

  // Para 5xx en producción NO devolvemos err.message porque puede filtrar
  // detalles internos. En 4xx sí: el cliente lo necesita para corregir.
  let message;
  if (status >= 500 && IS_PROD) {
    message = 'Internal Server Error';
  } else {
    message = err.message || 'Internal Server Error';
  }

  const body = { error: err.name || 'Error', message };
  if (err.details && status < 500) body.details = err.details;
  res.status(status).json(body);
}
