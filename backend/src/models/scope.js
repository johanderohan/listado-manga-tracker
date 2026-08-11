// Series que generan avisos y que el cron debe refrescar: las que sigues
// activamente más las de la wishlist. Las 'discarded' quedan fuera de los
// avisos (aunque el cron las siga refrescando como hasta ahora).
// Vive aquí, y no en el módulo de notificaciones, porque lo usan tanto la
// línea base del esquema como el detector y el cron.
export const IN_SCOPE_SERIES_SQL = `
  SELECT series_id FROM user_series WHERE status = 'following'
  UNION
  SELECT series_id FROM wishlist
`;
