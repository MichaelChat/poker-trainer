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

/** Loads persisted {settings, stats, presets} — from the cloud when signed in, else this device.
 * On the very first sign-in on a device (account has no cloud data yet), this also migrates any
 * local guest progress up to the cloud as part of the same load, so there's no window where a
 * separate migration and a separate load could race and one clobber the other. */
export async function loadState(user) {
  if (!user) return loadLocalState();
  if (!firebaseEnabled) return null;
  const existing = await loadCloudState(user.uid);
  if (existing) return existing; // account already has cloud data — that's the source of truth, don't touch it
  const local = loadLocalState();
  if (local) await saveCloudState(user.uid, local); // first sign-in here — carry guest progress over
  return local;
}

/** Saves persisted {settings, stats, presets} — to the cloud when signed in, else this device. */
export async function saveState(user, state) {
  if (user) return saveCloudState(user.uid, state);
  saveLocalState(state);
  return null;
}
