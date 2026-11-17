import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function SiteLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const leave = async () => {
    await logout();
    navigate('/');
  };

  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="IKS home">
          <span className="brand-mark"><BookOpen size={22} strokeWidth={1.6} /></span>
          <span><b>IKS</b><small>INDIAN KNOWLEDGE SYSTEMS</small></span>
        </Link>
        <button className="menu-toggle" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav className={menuOpen ? 'site-nav is-open' : 'site-nav'}>
          <NavLink to="/about" onClick={() => setMenuOpen(false)}>Our heritage</NavLink>
          <NavLink to="/explore" onClick={() => setMenuOpen(false)}>Explore knowledge</NavLink>
          <NavLink to="/timeline" onClick={() => setMenuOpen(false)}>Timeline</NavLink>
          {user ? (
            <>
              <Link className="nav-portal" to={user.role === 'admin' ? '/admin' : '/student'}>My learning</Link>
              <button className="nav-text-button" onClick={leave}>Sign out</button>
            </>
          ) : (
            <>
              <Link className="nav-login" to="/login">Sign in</Link>
              <Link className="button button-small" to="/register">Begin learning <span aria-hidden="true">↗</span></Link>
            </>
          )}
        </nav>
      </header>
      <main><Outlet /></main>
      <footer className="site-footer">
        <div className="footer-top">
          <Link className="brand footer-brand" to="/">
            <span className="brand-mark"><BookOpen size={20} /></span>
            <span><b>IKS</b><small>A TRADITION OF INQUIRY</small></span>
          </Link>
          <p>Knowledge is a lamp that lights the path<br />from our past into the future.</p>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} IKS Learning Platform</span>
          <span>Built for curious minds, rooted in India.</span>
        </div>
      </footer>
    </>
  );
}
