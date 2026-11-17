import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { getApiError } from '../services/api.js';

function AuthShell({ title, subtitle, children, alternate }) {
  return <section className="auth-page">
    <div className="auth-story">
      <Link to="/" className="brand auth-brand"><span className="brand-mark"><BookOpen size={21} /></span><span><b>IKS</b><small>INDIAN KNOWLEDGE SYSTEMS</small></span></Link>
      <div className="auth-story-copy"><div className="eyebrow eyebrow-light"><span /> A TRADITION OF INQUIRY</div><h2>Let the past<br />open a <em>new path.</em></h2><p>Begin your journey through India's living heritage of knowledge.</p></div>
      <span className="auth-story-foot">ज्ञानं परमं बलम् &nbsp;·&nbsp; KNOWLEDGE IS THE HIGHEST STRENGTH</span>
    </div>
    <div className="auth-form-wrap"><div className="auth-form-box">
      <div className="eyebrow"><span /> {title === 'Welcome back' ? 'RETURN TO YOUR JOURNEY' : 'A NEW CHAPTER BEGINS'}</div>
      <h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>
      {children}
      <div className="auth-alternate">{alternate}</div>
    </div></div>
  </section>;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(form.email, form.password);
      const fallback = user.role === 'admin' ? '/admin' : '/student';
      navigate(location.state?.from?.pathname || fallback, { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return <AuthShell title="Welcome back" subtitle="Sign in to pick up where your learning left off." alternate={<>New to the library? <Link to="/register">Create a learner account <ArrowRight size={14} /></Link></>}>
    <form className="auth-form" onSubmit={submit}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <label>Email address<input type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password" /></label>
      <button className="button auth-submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Opening your account…</> : <>Sign in securely <ArrowRight size={17} /></>}</button>
    </form>
  </AuthShell>;
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', age_group: '14-16' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/student', { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return <AuthShell title="Begin your journey" subtitle="Create your learner account and explore at your own pace." alternate={<>Already have an account? <Link to="/login">Sign in <ArrowRight size={14} /></Link></>}>
    <form className="auth-form" onSubmit={submit}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <label>Your name<input autoComplete="name" required maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="How should we address you?" /></label>
      <label>Email address<input type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
      <div className="form-row">
        <label>Age group<select value={form.age_group} onChange={(event) => setForm({ ...form, age_group: event.target.value })}><option value="10-13">10–13</option><option value="14-16">14–16</option><option value="17-19">17–19</option><option value="20+">20+</option></select></label>
        <label>Password<input type="password" autoComplete="new-password" minLength="8" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 8 characters" /></label>
      </div>
      <button className="button auth-submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Creating your account…</> : <>Create learner account <ArrowRight size={17} /></>}</button>
      <small className="auth-privacy">Public sign-up creates a student account. Administrator access is provisioned separately.</small>
    </form>
  </AuthShell>;
}
