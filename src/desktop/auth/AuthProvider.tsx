import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "user";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  // Hydrate profile + roles for the current session.
  const loadUserData = async (uid: string) => {
    const [{ data: prof }, { data: rolesData }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_url").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile(prof ?? null);
    setRoles((rolesData ?? []).map((r: { role: AppRole }) => r.role));
  };

  useEffect(() => {
    // 1. Listener FIRST (synchronous) — never call async code directly inside.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        // Defer to avoid deadlocks with Supabase internal locks.
        setTimeout(() => {
          void loadUserData(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    // 2. Then read existing session.
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      if (existing?.user) {
        void loadUserData(existing.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null;
    return {
      loading,
      session,
      user,
      profile,
      roles,
      isAdmin: roles.includes("admin"),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password, displayName) => {
        const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: displayName ? { display_name: displayName } : undefined,
          },
        });
        return { error: error?.message ?? null };
      },
      signInWithMagicLink: async (email) => {
        const redirectTo =
          typeof window !== "undefined" ? `${window.location.origin}/compte` : undefined;
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
        });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      requestPasswordReset: async (email) => {
        // Always point to the public web URL — Electron's file:// origin is invalid for email links.
        const origin =
          typeof window !== "undefined" && window.location.protocol.startsWith("http")
            ? window.location.origin
            : "https://id-preview--f63c80d2-2913-4845-9f96-3da930676def.lovable.app";
        const redirectTo = `${origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        return { error: error?.message ?? null };
      },
      refreshProfile: async () => {
        if (session?.user) await loadUserData(session.user.id);
      },
    };
  }, [session, profile, roles, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
