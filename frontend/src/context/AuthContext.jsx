import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('iks_access_token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      localStorage.removeItem('iks_access_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('iks_access_token', data.access_token);
    setUser(data.user);
    return data.user;
  };

  const register = async (values) => {
    const { data } = await api.post('/auth/register', values);
    localStorage.setItem('iks_access_token', data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      if (localStorage.getItem('iks_access_token')) await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('iks_access_token');
      setUser(null);
    }
  };

  const value = useMemo(() => ({ user, loading, login, register, logout, refreshUser }), [user, loading, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
