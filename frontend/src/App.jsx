import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import MySeries from './pages/MySeries'
import SeriesDetail from './pages/SeriesDetail'
import Wishlist from './pages/Wishlist'
import Search from './pages/Search'

function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mis-series" element={<MySeries />} />
          <Route path="/series/:id" element={<SeriesDetail />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </main>
    </>
  )
}

export default App
