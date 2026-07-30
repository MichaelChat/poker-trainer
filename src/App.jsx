import React, { useEffect, useRef } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider.jsx";
import PokerTrainer from "./components/PokerTrainer.jsx";
import { migrateGuestDataOnSignIn } from "./storage/persistence.js";

function AppInner() {
  const { user, loading } = useAuth();
  const migratedRef = useRef(false);

  // The first time we see a signed-in user this session, carry over any guest progress
  // from this device instead of silently discarding it.
  useEffect(() => {
    if (user && !migratedRef.current) {
      migratedRef.current = true;
      migrateGuestDataOnSignIn(user);
    }
    if (!user) migratedRef.current = false;
  }, [user]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#B9AF9B", fontFamily: "'IBM Plex Mono', monospace" }}>
        Loading…
      </div>
    );
  }

  return <PokerTrainer />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
