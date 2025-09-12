import React, { createContext, useContext, useEffect, useState } from "react";
import { AuthApi } from "../api/auth";

const AuthContext = createContext({ user: null, loading: true, refresh: () => {}, login: async()=>{}, logout: async()=>{} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);   // { username, email, role, authenticated, lan_guest }
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await AuthApi.me();
      setUser(data);
    } catch {
      setUser({ username: null, email: null, role: "guest", authenticated: false, lan_guest: true });
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    await AuthApi.login(username, password);
    await refresh();
  };

  const logout = async () => {
    await AuthApi.logout();
    await refresh();
  };

  useEffect(() => { refresh(); }, []);
  return <AuthContext.Provider value={{ user, loading, refresh, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
