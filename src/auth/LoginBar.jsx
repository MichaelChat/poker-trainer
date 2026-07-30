import React from "react";
import { useAuth } from "./AuthProvider.jsx";

const C = {
  panel: "#132420",
  panelLine: "#234238",
  cream: "#EFE6D3",
  creamDim: "#B9AF9B",
  gold: "#C9A24B",
  ink: "#0D1210",
};

export default function LoginBar() {
  const { user, loading, firebaseEnabled, signIn, signOut, error } = useAuth();

  if (loading) {
    return (
      <div style={barStyle}>
        <span style={{ color: C.creamDim, fontSize: 12 }}>Checking sign-in…</span>
      </div>
    );
  }

  return (
    <div style={barStyle}>
      {user ? (
        <>
          {user.photoURL && (
            <img src={user.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} referrerPolicy="no-referrer" />
          )}
          <span style={{ color: C.cream, fontSize: 12, flex: 1 }}>{user.displayName || user.email}</span>
          <button onClick={signOut} style={btnStyle}>Sign out</button>
        </>
      ) : (
        <>
          <span style={{ color: C.creamDim, fontSize: 12, flex: 1 }}>
            {firebaseEnabled
              ? "Playing as guest — sign in to sync stats across devices"
              : "Playing as guest — stats saved on this device only"}
          </span>
          {firebaseEnabled && (
            <button onClick={signIn} style={{ ...btnStyle, background: C.gold, color: C.ink, borderColor: C.gold }}>
              Sign in with Google
            </button>
          )}
        </>
      )}
      {error && <div style={{ color: "#BE4B45", fontSize: 11, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const barStyle = {
  display: "flex", alignItems: "center", gap: 8,
  background: C.panel, border: `1px solid ${C.panelLine}`, borderRadius: 12,
  padding: "8px 12px", marginBottom: 14, fontFamily: "'IBM Plex Mono', monospace",
};

const btnStyle = {
  padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.panelLine}`,
  background: "transparent", color: C.creamDim, fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};
