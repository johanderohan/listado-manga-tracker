import axios from 'axios';

// App de un solo usuario sin auth: no se envían cookies de sesión ni
// cabeceras CSRF. Timeout alto porque scrape / refresh-all son lentos.
export const api = axios.create({
  baseURL: '/api',
  timeout: 120_000
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.message ||
      err.response?.data?.error ||
      err.message ||
      'Error de red';
    return Promise.reject(Object.assign(new Error(message), { original: err }));
  }
);

// === Series ===
export const searchSeries = (query) =>
  api.get('/series/search', { params: { q: query } }).then((r) => r.data);
export const getSeries = (id) => api.get(`/series/${id}`).then((r) => r.data);
export const getAllSeries = (params = {}) =>
  api.get('/series', { params }).then((r) => r.data);
export const syncSeries = () => api.post('/series/sync').then((r) => r.data);
export const refreshSeries = (seriesId) =>
  api.post(`/series/${seriesId}/refresh`).then((r) => r.data);
export const refreshAllSeries = () =>
  api.post('/series/refresh-all').then((r) => r.data);

// === Series del usuario ===
export const getUserSeries = (status = 'following') =>
  api.get('/user/series', { params: { status } }).then((r) => r.data);
export const followSeries = (seriesId) =>
  api.post(`/user/series/${seriesId}`).then((r) => r.data);
export const deleteUserSeries = (seriesId) =>
  api.delete(`/user/series/${seriesId}`).then((r) => r.data);
export const discardSeries = (seriesId) =>
  api.post(`/user/series/${seriesId}/discard`).then((r) => r.data);
export const refollowSeries = (seriesId) =>
  api.post(`/user/series/${seriesId}/follow`).then((r) => r.data);

// === Tomos ===
export const getPendingVolumes = () => api.get('/user/pending').then((r) => r.data);
export const getUpcomingVolumes = () => api.get('/user/upcoming').then((r) => r.data);
export const getRecentVolumes = (limit = 50) =>
  api.get('/user/recent', { params: { limit } }).then((r) => r.data);
export const getSeriesVolumes = (seriesId) =>
  api.get(`/user/series/${seriesId}/volumes`).then((r) => r.data);
export const markVolumePurchased = (seriesId, volumeNumber) =>
  api.post('/user/volumes', { seriesId, volumeNumber }).then((r) => r.data);
export const markVolumesBulk = (seriesId, volumeNumbers) =>
  api.post('/user/volumes/bulk', { seriesId, volumeNumbers }).then((r) => r.data);
export const unmarkVolumePurchased = (seriesId, volumeNumber) =>
  api.delete(`/user/volumes/${seriesId}/${volumeNumber}`).then((r) => r.data);

// === Wishlist ===
export const getWishlist = () => api.get('/user/wishlist').then((r) => r.data);
export const addToWishlist = (seriesId, notes = '') =>
  api.post(`/user/wishlist/${seriesId}`, { notes }).then((r) => r.data);
export const removeFromWishlist = (seriesId) =>
  api.delete(`/user/wishlist/${seriesId}`).then((r) => r.data);

// === Stats ===
export const getStats = () => api.get('/user/stats').then((r) => r.data);
export const getStatistics = () => api.get('/user/statistics').then((r) => r.data);
