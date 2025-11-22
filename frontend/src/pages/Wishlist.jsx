import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getWishlist, removeFromWishlist, followSeries } from '../services/api'
import './Wishlist.css'

function Wishlist() {
  const [wishlist, setWishlist] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadWishlist()
  }, [])

  async function loadWishlist() {
    try {
      setLoading(true)
      const data = await getWishlist()
      setWishlist(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(seriesId) {
    try {
      await removeFromWishlist(seriesId)
      setWishlist(prev => prev.filter(s => s.id !== seriesId))
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleStartCollecting(seriesId) {
    try {
      await followSeries(seriesId)
      await removeFromWishlist(seriesId)
      setWishlist(prev => prev.filter(s => s.id !== seriesId))
      alert('Serie añadida a tu colección')
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  if (loading) {
    return <div className="loading">Cargando...</div>
  }

  if (error) {
    return <div className="card error">Error: {error}</div>
  }

  return (
    <div className="wishlist-page">
      <h1 className="mb-3">Wishlist</h1>

      {wishlist.length === 0 ? (
        <div className="card empty-state">
          <p className="text-muted">Tu wishlist está vacía</p>
          <p className="text-muted">
            Busca series y añádelas a tu wishlist para recordar lo que quieres comprar
          </p>
          <Link to="/buscar" className="btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Buscar series
          </Link>
        </div>
      ) : (
        <div className="wishlist-grid">
          {wishlist.map(series => (
            <div key={series.id} className="card wishlist-card">
              <Link to={`/series/${series.id}`} className="wishlist-content">
                <h3>{series.name}</h3>
                {series.editorial_es && (
                  <span className="text-muted text-sm">{series.editorial_es}</span>
                )}
                {series.total_volumes > 0 && (
                  <span className="text-sm">{series.total_volumes} tomos</span>
                )}
                {series.is_complete ? (
                  <span className="badge badge-success">Completa</span>
                ) : (
                  <span className="badge badge-warning">En publicación</span>
                )}
                {series.notes && (
                  <p className="wishlist-notes text-muted text-sm">{series.notes}</p>
                )}
              </Link>
              <div className="wishlist-actions">
                <button
                  className="btn-success"
                  onClick={() => handleStartCollecting(series.id)}
                >
                  Empezar colección
                </button>
                <button
                  className="btn-danger"
                  onClick={() => handleRemove(series.id)}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Wishlist
