import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProfileByEmployeeId } from "@/lib/auth.functions";

export type Profile = {
  id: string;
  employee_id: string;
  name: string;
  avatar_url: string | null;
  total_points: number;
  rank: number | null;
  is_admin?: boolean;
  brand_name?: string | null;
};

const STORAGE_KEY = "current_user_id";

type AuthContextValue = {
  loading: boolean;
  user: { id: string; employee_id: string } | null;
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  refreshProfile: () => Promise<void>;
  signIn: (p: Profile) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchProfile = useServerFn(getProfileByEmployeeId);

  const loadFromStorage = async () => {
    const empId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!empId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const p = await fetchProfile({ data: { employeeId: empId } });
      if (p) setProfile(p as Profile);
      else {
        localStorage.removeItem(STORAGE_KEY);
        setProfile(null);
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthContextValue = {
    loading,
    user: profile ? { id: profile.id, employee_id: profile.employee_id } : null,
    profile,
    setProfile,
    refreshProfile: loadFromStorage,
    signIn: (p) => {
      localStorage.setItem(STORAGE_KEY, p.employee_id);
      setProfile(p);
    },
    signOut: async () => {
      localStorage.removeItem(STORAGE_KEY);
      setProfile(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}