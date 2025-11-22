import { NavLink } from 'react-router-dom'
import './Navbar.css'

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <NavLink to="/" className="navbar-brand">
          Manga Tracker
        </NavLink>
        <div className="navbar-links">
          <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
            Inicio
          </NavLink>
          <NavLink to="/mis-series" className={({ isActive }) => isActive ? 'active' : ''}>
            Mis Series
          </NavLink>
          <NavLink to="/wishlist" className={({ isActive }) => isActive ? 'active' : ''}>
            Wishlist
          </NavLink>
          <NavLink to="/buscar" className={({ isActive }) => isActive ? 'active' : ''}>
            Buscar
          </NavLink>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
