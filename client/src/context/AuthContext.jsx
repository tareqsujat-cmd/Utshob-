import { createContext, useCallback, useEffect, useState } from 'react';
import { api, saveToken, clearToken, getToken } from '../api/client.js';

// Holds the logged-in user for the whole app. Read it with useAuth() (hooks/useAuth.js).
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true); // true until we know whether someone is logged in

  // Ask the server who we are (uses the saved token).
  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
      setPlan(data.plan);
    } catch {
      clearToken(); // token missing, expired or invalid
      setUser(null);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // On first load: restore the session if a token was saved.
  useEffect(() => {
    if (getToken()) refresh();
    else setLoading(false);
  }, [refresh]);

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    saveToken(data.token);
    await refresh();
  }

  async function signup(form) {
    const data = await api.post('/auth/signup', form);
    saveToken(data.token);
    await refresh();
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* logging out locally is enough even if the server call fails */
    }
    clearToken();
    setUser(null);
    setPlan(null);
  }

  const value = { user, plan, loading, login, signup, logout, refresh };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
