import { Navigate, Route, Routes } from 'react-router-dom';
import SiteLayout from './components/SiteLayout.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import HomePage from './pages/HomePage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import ExplorePage from './pages/ExplorePage.jsx';
import TimelinePage from './pages/TimelinePage.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import { StudentHome } from './pages/DashboardPlaceholder.jsx';

export default function App() {
  return <Routes>
    <Route element={<SiteLayout />}>
      <Route index element={<HomePage />} />
      <Route path="about" element={<AboutPage />} />
      <Route path="explore" element={<ExplorePage />} />
      <Route path="timeline" element={<TimelinePage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute roles={['student']} />}><Route path="student" element={<StudentHome />} /></Route>
      <Route element={<ProtectedRoute roles={['admin']} />}><Route path="admin" element={<AdminDashboard />} /></Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}
