// src/contexts/AuthContext.tsx — Native JWT auth state backed directly by Neon & FastAPI
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import axios from 'axios';

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  provider?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
}

export interface AuthSession {
  access_token: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function formatUser(rawUser: any): AuthUser {
  const avatar = rawUser.avatar_url || undefined;
  const name = rawUser.full_name || undefined;
  return {
    id: rawUser.id,
    email: rawUser.email,
    full_name: name,
    avatar_url: avatar,
    provider: rawUser.provider || 'local',
    user_metadata: {
      full_name: name,
      name: name,
      avatar_url: avatar,
      picture: avatar,
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = useCallback(async (token: string) => {
    try {
      const res = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      });
      setUser(formatUser(res.data));
      setSession({ access_token: token });
    } catch {
      localStorage.removeItem('aegis_token');
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('aegis_token');
    if (token) {
      fetchCurrentUser(token);
    } else {
      setLoading(false);
    }
  }, [fetchCurrentUser]);

  const signIn = async (email: string, password: string) => {
    const res = await axios.post('/api/auth/signin', { email, password }, { timeout: 15_000 });
    const { access_token, user: rawUser } = res.data;
    localStorage.setItem('aegis_token', access_token);
    setSession({ access_token });
    setUser(formatUser(rawUser));
  };

  const signUp = async (name: string, email: string, password: string) => {
    const res = await axios.post('/api/auth/signup', { name, email, password }, { timeout: 15_000 });
    const { access_token, user: rawUser } = res.data;
    localStorage.setItem('aegis_token', access_token);
    setSession({ access_token });
    setUser(formatUser(rawUser));
  };

  const setToken = async (token: string) => {
    localStorage.setItem('aegis_token', token);
    await fetchCurrentUser(token);
  };

  const signOut = async () => {
    localStorage.removeItem('aegis_token');
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, loading, signIn, signUp, signOut, setToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
