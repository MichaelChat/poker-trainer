import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, firebaseEnabled } from "../firebase.js";

const LOCAL_KEY = "pokerTrainerState.v1";

export function loadLocalState() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // storage unavailable (private browsing, quota, etc.) — fall back to in-memory defaults
  }
}

export function saveLocalState(state) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    // fail silently — in-memory state still works for the rest of this session
  }
}

export async function loadCloudState(uid) {
  if (!firebaseEnabled || !uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveCloudState(uid, state) {
  if (!firebaseEnabled || !uid) return;
  await setDoc(doc(db, "users", uid), state, { merge: true });
}

/** Loads persisted {settings, stats} — from the cloud when signed in, else this device. */
export async function loadState(user) {
  if (user) return loadCloudState(user.uid);
  return loadLocalState();
}

/** Saves persisted {settings, stats} — to the cloud when signed in, else this device. */
export async function saveState(user, state) {
  if (user) return saveCloudState(user.uid, state);
  saveLocalState(state);
  return null;
}

/**
 * Called right after a successful sign-in. If the user has no cloud data yet but does have
 * guest progress on this device, carries it over to their new account instead of discarding it.
 */
export async function migrateGuestDataOnSignIn(user) {
  if (!firebaseEnabled || !user) return;
  const existing = await loadCloudState(user.uid);
  if (existing) return; // already has cloud data — don't overwrite it with local guest data
  const local = loadLocalState();
  if (local) await saveCloudState(user.uid, local);
}
