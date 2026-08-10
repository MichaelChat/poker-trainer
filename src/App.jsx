import React from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider.jsx";
import PokerTrainer from "./components/PokerTrainer.jsx";

function AppInner() {
  const { loading } = useAuth();

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
