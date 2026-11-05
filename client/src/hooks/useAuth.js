import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

// const { user, plan, login, logout } = useAuth();
export function useAuth() {
  return useContext(AuthContext);
}
