import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getUserSeries, refreshAllSeries } from '../services/api'
import './MySeries.css'

function MySeries() {
  const [allSeries, setAllSeries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('in-progress')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadSeries()
  }, [])

  async function loadSeries() {
    try {
      setLoading(true)
      const following = await getUserSeries('following')
      const discarded = await getUserSeries('discarded')
      setAllSeries([...following, ...discarded])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRefreshAll() {
    if (allSeries.length === 0) return
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

  const filteredSeries = allSeries.filter(s => {
    if (filter === 'in-progress') return s.status === 'following' && s.progress < 100
    if (filter === 'all') return s.status === 'following'
    if (filter === 'discarded') return s.status === 'discarded'
    return true
  })

  const counts = {
    inProgress: allSeries.filter(s => s.status === 'following' && s.progress < 100).length,
    all: allSeries.filter(s => s.status === 'following').length,
    discarded: allSeries.filter(s => s.status === 'discarded').length
  }


  if (loading) {
    return <div className="loading">Cargando...</div>
  }

  if (error) {
    return <div className="card error">Error: {error}</div>
  }

  return (
    <div className="my-series">
      <div className="page-header">
        <div className="filter-buttons">
          <button
            className={filter === 'in-progress' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setFilter('in-progress')}
          >
            En progreso ({counts.inProgress})
          </button>
          <button
            className={filter === 'all' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setFilter('all')}
          >
            Todas ({counts.all})
          </button>
          <button
            className={filter === 'discarded' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setFilter('discarded')}
          >
            Descartadas ({counts.discarded})
          </button>
          {filteredSeries.length > 0 && (
            <button
              className="btn-secondary refresh-all-btn"
              onClick={handleRefreshAll}
              disabled={refreshing}
            >
              {refreshing ? 'Actualizando...' : '↻ Actualizar todas'}
            </button>
          )}
        </div>
      </div>

      {filteredSeries.length === 0 ? (
        <div className="card">
          <p className="text-muted">
            {allSeries.length === 0
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MySeries
