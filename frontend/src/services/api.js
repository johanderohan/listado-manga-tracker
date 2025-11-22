const API_BASE = '/api';

async function fetchJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error de conexión' }));
    throw new Error(error.error || 'Error desconocido');
  }

  return response.json();
}

// Series
export const searchSeries = (query) => fetchJson(`/series/search?q=${encodeURIComponent(query)}`);
export const getSeries = (id) => fetchJson(`/series/${id}`);
export const getAllSeries = (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  return fetchJson(`/series?${queryString}`);
};
export const syncSeries = () => fetchJson('/series/sync', { method: 'POST' });
export const refreshSeries = (seriesId) => fetchJson(`/series/${seriesId}/refresh`, { method: 'POST' });
export const refreshAllSeries = () => fetchJson('/series/refresh-all', { method: 'POST' });

// User Series
export const getUserSeries = () => fetchJson('/user/series');
export const followSeries = (seriesId) => fetchJson(`/user/series/${seriesId}`, { method: 'POST' });
export const unfollowSeries = (seriesId) => fetchJson(`/user/series/${seriesId}`, { method: 'DELETE' });

// Volumes
export const getPendingVolumes = () => fetchJson('/user/pending');
export const getSeriesVolumes = (seriesId) => fetchJson(`/user/series/${seriesId}/volumes`);
export const markVolumePurchased = (seriesId, volumeNumber) =>
  fetchJson('/user/volumes', {
    method: 'POST',
    body: JSON.stringify({ seriesId, volumeNumber })
  });
export const markVolumesBulk = (seriesId, volumeNumbers) =>
  fetchJson('/user/volumes/bulk', {
    method: 'POST',
    body: JSON.stringify({ seriesId, volumeNumbers })
  });
export const unmarkVolumePurchased = (seriesId, volumeNumber) =>
  fetchJson(`/user/volumes/${seriesId}/${volumeNumber}`, { method: 'DELETE' });

// Wishlist
export const getWishlist = () => fetchJson('/user/wishlist');
export const addToWishlist = (seriesId, notes = '') =>
  fetchJson(`/user/wishlist/${seriesId}`, { method: 'POST', body: JSON.stringify({ notes }) });
export const removeFromWishlist = (seriesId) =>
  fetchJson(`/user/wishlist/${seriesId}`, { method: 'DELETE' });

// Stats
export const getStats = () => fetchJson('/user/stats');
