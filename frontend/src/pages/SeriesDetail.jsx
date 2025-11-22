import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getSeries,
  getSeriesVolumes,
  followSeries,
  unfollowSeries,
  markVolumePurchased,
  unmarkVolumePurchased,
  markVolumesBulk,
  addToWishlist,
  removeFromWishlist,
  getUserSeries,
  getWishlist,
  refreshSeries
} from '../services/api'
import './SeriesDetail.css'

function SeriesDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [series, setSeries] = useState(null)
  const [volumes, setVolumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isInWishlist, setIsInWishlist] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    try {
      setLoading(true)
      const [seriesData, userSeries, wishlist] = await Promise.all([
        getSeries(id),
        getUserSeries().catch(() => []),
        getWishlist().catch(() => [])
      ])

      setSeries(seriesData)
      setVolumes(seriesData.volumes || [])
      setIsFollowing(userSeries.some(s => s.id === parseInt(id)))
      setIsInWishlist(wishlist.some(w => w.id === parseInt(id)))

      // Si está siguiendo, cargar estado de tomos
      if (userSeries.some(s => s.id === parseInt(id))) {
        const userVolumes = await getSeriesVolumes(id)
        setVolumes(userVolumes)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFollow() {
    try {
      await followSeries(id)
      setIsFollowing(true)
      // Recargar volúmenes con estado
      const userVolumes = await getSeriesVolumes(id)
      setVolumes(userVolumes)
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleUnfollow() {
    if (!confirm('¿Eliminar esta serie de tu colección?')) return
    try {
      await unfollowSeries(id)
      setIsFollowing(false)
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleToggleWishlist() {
    try {
      if (isInWishlist) {
        await removeFromWishlist(id)
        setIsInWishlist(false)
      } else {
        await addToWishlist(id)
        setIsInWishlist(true)
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleToggleVolume(volumeNumber, isOwned) {
    try {
      if (isOwned) {
        await unmarkVolumePurchased(id, volumeNumber)
      } else {
        await markVolumePurchased(id, volumeNumber)
      }
      setVolumes(prev =>
        prev.map(v =>
          v.number === volumeNumber ? { ...v, owned: isOwned ? 0 : 1 } : v
        )
      )
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleMarkAllPurchased() {
    const unpurchased = volumes.filter(v => !v.owned && v.is_released !== 0).map(v => v.number)
    if (unpurchased.length === 0) return
    if (!confirm(`¿Marcar ${unpurchased.length} tomos como comprados?`)) return

    try {
      await markVolumesBulk(id, unpurchased)
      setVolumes(prev => prev.map(v => ({ ...v, owned: 1 })))
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleRefresh() {
    try {
      setRefreshing(true)
      const result = await refreshSeries(id)
      setSeries(result.series)
      setVolumes(result.series.volumes || [])
      alert(result.message)
    } catch (err) {
      alert('Error al actualizar: ' + err.message)
    } finally {
      setRefreshing(false)
    }
  }

  // Tomos publicados y comprados
  const releasedVolumes = volumes.filter(v => v.is_released !== 0)
  const ownedCount = volumes.filter(v => v.owned).length
  const releasedCount = releasedVolumes.length
  const totalCount = volumes.length

  // Progreso sobre tomos publicados (al día con lo publicado)
  const releasedProgress = releasedCount > 0 ? Math.round((ownedCount / releasedCount) * 100) : 0
  // Progreso sobre total (serie completa)
  const totalProgress = totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0
  // ¿Está al día? (tiene todos los publicados)
  const isUpToDate = ownedCount >= releasedCount && releasedCount > 0

  if (loading) {
    return <div className="loading">Cargando...</div>
  }

  if (error) {
    return <div className="card error">Error: {error}</div>
  }

  if (!series) {
    return <div className="card">Serie no encontrada</div>
  }

  return (
    <div className="series-detail">
      <div className="top-actions">
        <button className="back-btn btn-secondary" onClick={() => navigate(-1)}>
          ← Volver
        </button>
        <button
          className="btn-secondary refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Actualizando...' : '↻ Actualizar datos'}
        </button>
      </div>

      <div className="series-header card">
        <div className="series-info">
          <h1>{series.name}</h1>
          {series.original_name && (
            <p className="original-name text-muted">{series.original_name}</p>
          )}

          <div className="series-meta">
            {series.author && <p><strong>Autor:</strong> {series.author}</p>}
            {series.artist && series.artist !== series.author && (
              <p><strong>Dibujante:</strong> {series.artist}</p>
            )}
            {series.editorial_es && <p><strong>Editorial:</strong> {series.editorial_es}</p>}
            {series.total_volumes > 0 && (
              <p><strong>Tomos:</strong> {series.total_volumes}</p>
            )}
          </div>

          {series.is_complete ? (
            <span className="badge badge-success">Serie completa</span>
          ) : (
            <span className="badge badge-warning">En publicación</span>
          )}

          {series.synopsis && (
            <p className="synopsis">{series.synopsis}</p>
          )}
        </div>

        <div className="series-actions">
          {isFollowing ? (
            <>
              <div className="progress-section">
                <div className="progress-label">
                  <span>Publicados</span>
                  {isUpToDate && <span className="badge badge-success">Al día</span>}
                </div>
                <div className="progress-info">
                  <span>{ownedCount} / {releasedCount} tomos</span>
                  <span>{releasedProgress}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${releasedProgress}%` }} />
                </div>

                {totalCount > releasedCount && (
                  <>
                    <div className="progress-label" style={{ marginTop: '1rem' }}>
                      <span>Total (con no editados)</span>
                    </div>
                    <div className="progress-info">
                      <span>{ownedCount} / {totalCount} tomos</span>
                      <span>{totalProgress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar-fill secondary" style={{ width: `${totalProgress}%` }} />
                    </div>
                  </>
                )}
              </div>
              <div className="action-buttons">
                <button className="btn-danger" onClick={handleUnfollow}>
                  Dejar de seguir
                </button>
                {ownedCount < releasedCount && (
                  <button className="btn-success" onClick={handleMarkAllPurchased}>
                    Marcar todos
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="action-buttons">
              <button className="btn-primary" onClick={handleFollow}>
                Seguir serie
              </button>
              <button
                className={isInWishlist ? 'btn-secondary' : 'btn-primary'}
                onClick={handleToggleWishlist}
              >
                {isInWishlist ? 'En Wishlist ✓' : 'Añadir a Wishlist'}
              </button>
            </div>
          )}
        </div>
      </div>

      {isFollowing && volumes.length > 0 && (
        <section className="volumes-section">
          <h2>Tomos</h2>
          <div className="volumes-grid">
            {volumes.map(vol => {
              const isReleased = vol.is_released !== 0
              return (
                <div
                  key={vol.number}
                  className={`volume-card ${vol.owned ? 'owned' : ''} ${!isReleased ? 'unreleased' : ''}`}
                  onClick={isReleased ? () => handleToggleVolume(vol.number, vol.owned) : undefined}
                  style={!isReleased ? { cursor: 'default' } : undefined}
                >
                  {vol.cover_url && (
                    <img src={vol.cover_url} alt={`Tomo ${vol.number}`} className="volume-cover" />
                  )}
                  <div className="volume-info">
                    <span className="volume-number">Tomo {vol.number}</span>
                    {isReleased && vol.price > 0 && <span className="volume-price">{vol.price.toFixed(2)}€</span>}
                  </div>
                  <div className="volume-status">
                    {!isReleased ? 'No editado' : vol.owned ? '✓ Comprado' : 'Pendiente'}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {!isFollowing && volumes.length > 0 && (
        <section className="volumes-preview">
          <h2>Tomos disponibles: {volumes.length}</h2>
          <p className="text-muted">Sigue esta serie para gestionar tus compras</p>
        </section>
      )}

      {series.url && (
        <a
          href={series.url}
          target="_blank"
          rel="noopener noreferrer"
          className="external-link"
        >
          Ver en ListadoManga.es →
        </a>
      )}
    </div>
  )
}

export default SeriesDetail
