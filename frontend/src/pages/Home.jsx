import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getPendingVolumes, markVolumePurchased, getStats } from '../services/api'
import './Home.css'

function Home() {
  const [pending, setPending] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [pendingData, statsData] = await Promise.all([
        getPendingVolumes(),
        getStats()
      ])
      setPending(pendingData)
      setStats(statsData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleMarkPurchased(seriesId, volumeNumber) {
    try {
      await markVolumePurchased(seriesId, volumeNumber)
      setPending(prev => prev.filter(v => !(v.series_id === seriesId && v.number === volumeNumber)))
      setStats(prev => prev ? { ...prev, totalVolumes: prev.totalVolumes + 1 } : prev)
    } catch (err) {
      alert('Error al marcar como comprado: ' + err.message)
    }
  }

  // Agrupar tomos por serie
  const groupedBySeries = pending.reduce((acc, vol) => {
    const key = vol.series_id
    if (!acc[key]) {
      acc[key] = {
        seriesId: vol.series_id,
        seriesName: vol.series_name,
        seriesCover: vol.series_cover,
        volumes: []
      }
    }
    acc[key].volumes.push(vol)
    return acc
  }, {})

  if (loading) {
    return <div className="loading">Cargando...</div>
  }

  if (error) {
    return <div className="card error">Error: {error}</div>
  }

  return (
    <div className="home">
      {stats && (
        <div className="stats-grid mb-3">
          <div className="stat-card">
            <span className="stat-value">{stats.totalSeries}</span>
            <span className="stat-label">Series</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.totalVolumes}</span>
            <span className="stat-label">Tomos</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.completedSeries}</span>
            <span className="stat-label">Completas</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.wishlistCount}</span>
            <span className="stat-label">En Wishlist</span>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2">Próximos tomos pendientes</h2>

        {Object.keys(groupedBySeries).length === 0 ? (
          <div className="card">
            <p className="text-muted">No hay tomos pendientes. <Link to="/buscar">Busca series para empezar</Link></p>
          </div>
        ) : (
          <div className="pending-grid">
            {pending.map(vol => (
              <div key={`${vol.series_id}-${vol.number}`} className="card pending-card">
                {vol.cover_url && (
                  <img src={vol.cover_url} alt={`${vol.series_name} Tomo ${vol.number}`} className="pending-card-cover" />
                )}
                <div className="pending-card-info">
                  <Link to={`/series/${vol.series_id}`} className="pending-card-series">
                    {vol.series_name}
                  </Link>
                  <span className="pending-card-number">Tomo {vol.number}</span>
                  {vol.price > 0 && <span className="pending-card-price">{vol.price.toFixed(2)}€</span>}
                  <button
                    className="btn-success btn-sm pending-card-btn"
                    onClick={() => handleMarkPurchased(vol.series_id, vol.number)}
                  >
                    Comprado
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Home
