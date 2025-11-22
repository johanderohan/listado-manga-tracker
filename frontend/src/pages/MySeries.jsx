import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getUserSeries, unfollowSeries, refreshAllSeries } from '../services/api'
import './MySeries.css'

function MySeries() {
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadSeries()
  }, [])

  async function loadSeries() {
    try {
      setLoading(true)
      const data = await getUserSeries()
      setSeries(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUnfollow(seriesId) {
    if (!confirm('¿Eliminar esta serie de tu colección?')) return
    try {
      await unfollowSeries(seriesId)
      setSeries(prev => prev.filter(s => s.id !== seriesId))
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleRefreshAll() {
    if (series.length === 0) return
    try {
      setRefreshing(true)
      const result = await refreshAllSeries()
      alert(result.message)
      // Recargar datos
      await loadSeries()
    } catch (err) {
      alert('Error al actualizar: ' + err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const filteredSeries = series.filter(s => {
    if (filter === 'complete') return s.progress === 100
    if (filter === 'in-progress') return s.progress > 0 && s.progress < 100
    if (filter === 'not-started') return s.progress === 0
    return true
  })

  if (loading) {
    return <div className="loading">Cargando...</div>
  }

  if (error) {
    return <div className="card error">Error: {error}</div>
  }

  return (
    <div className="my-series">
      <div className="page-header">
        <div className="header-top">
          {series.length > 0 && (
            <button
              className="btn-secondary refresh-all-btn"
              onClick={handleRefreshAll}
              disabled={refreshing}
            >
              {refreshing ? 'Actualizando...' : '↻ Actualizar todas'}
            </button>
          )}
        </div>
        <div className="filter-buttons">
          <button
            className={filter === 'all' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setFilter('all')}
          >
            Todas ({series.length})
          </button>
          <button
            className={filter === 'in-progress' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setFilter('in-progress')}
          >
            En progreso
          </button>
          <button
            className={filter === 'complete' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setFilter('complete')}
          >
            Completas
          </button>
          <button
            className={filter === 'not-started' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setFilter('not-started')}
          >
            Sin empezar
          </button>
        </div>
      </div>

      {filteredSeries.length === 0 ? (
        <div className="card">
          <p className="text-muted">
            {series.length === 0
              ? 'No sigues ninguna serie. '
              : 'No hay series con este filtro. '}
            <Link to="/buscar">Buscar series</Link>
          </p>
        </div>
      ) : (
        <div className="series-grid">
          {filteredSeries.map(s => (
            <div key={s.id} className="card series-card">
              <Link to={`/series/${s.id}`} className="series-card-content">
                {s.cover_url && (
                  <img src={s.cover_url} alt={s.name} className="series-cover" />
                )}
                <div className="series-info">
                  <h3 className="series-name">{s.name}</h3>
                  <div className="series-progress">
                  <div className="progress-info">
                    <span>{s.owned_volumes || 0} / {s.total_volumes || '?'}</span>
                    <span>{s.progress || 0}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${s.progress || 0}%` }}
                    />
                  </div>
                </div>
                  {s.is_complete ? (
                    <span className="badge badge-success">Serie completa</span>
                  ) : (
                    <span className="badge badge-warning">En publicación</span>
                  )}
                </div>
              </Link>
              <button
                className="btn-danger btn-sm unfollow-btn"
                onClick={() => handleUnfollow(s.id)}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MySeries
