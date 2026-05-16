// Envuelve un handler (sync o async) para que cualquier throw/rechazo fluya
// al errorHandler global en vez de repetir try/catch en cada controlador.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
