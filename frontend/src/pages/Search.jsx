import { useState } from 'react'
import { Link } from 'react-router-dom'
import { searchSeries, syncSeries } from '../services/api'
import './Search.css'

function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return

    try {
      setLoading(true)
      setError(null)
      const data = await searchSeries(query)
      setResults(data)
      setSearched(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    try {
      setSyncing(true)
      setError(null)
      const result = await syncSeries()
      alert(result.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="search-page">

      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre de la serie..."
          className="search-input"
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      <div className="search-info">
        <p className="text-muted text-sm">
          Busca en tiempo real en ListadoManga.es
        </p>
        <button
          className="btn-secondary sync-btn"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? 'Sincronizando...' : 'Sincronizar catálogo'}
        </button>
      </div>

      {error && (
        <div className="card error">Error: {error}</div>
      )}

      {searched && results.length === 0 && !loading && (
        <div className="card">
          <p className="text-muted">No se encontraron resultados para "{query}"</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="search-results">
          <p className="results-count text-muted mb-2">
            {results.length} resultados encontrados
          </p>
          <div className="results-grid">
            {results.map(series => (
              <Link
                key={series.id}
                to={`/series/${series.id}`}
                className="card result-card"
              >
                <h3>{series.name}</h3>
                <span className="text-muted text-sm">Ver detalles →</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Search
