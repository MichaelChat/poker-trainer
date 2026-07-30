import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { auth, googleProvider, firebaseEnabled } from "../firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still checking auth state, null = guest, object = signed in
  const [user, setUser] = useState(firebaseEnabled ? undefined : null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!firebaseEnabled) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return unsubscribe;
  }, []);

  const signIn = async () => {
    if (!firebaseEnabled) return;
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(e.message || "Sign-in failed");
    }
  };

  const signOutUser = async () => {
    if (!firebaseEnabled) return;
    await firebaseSignOut(auth);
  };

  const value = {
    user: user ?? null,
    loading: user === undefined,
    firebaseEnabled,
    signIn,
    signOut: signOutUser,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
