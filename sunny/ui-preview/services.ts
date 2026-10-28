// External I/O boundary for the LOCAL fixture preview. No live Firebase instance.
export const db = null, auth = null, functions = null;
export const doc = (...path: unknown[]) => ({ path });
export const collection = doc;
export const query = doc;
export const orderBy = doc;
export const where = doc;
export const limit = doc;
export const serverTimestamp = () => 0;
export const deleteField = () => null;
export const onSnapshot = (_ref: unknown, next: (snapshot: unknown) => void) => {
  queueMicrotask(() => next({ exists: () => false, data: () => ({}), docs: [], empty: true, forEach() {} }));
  return () => {};
};
export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
export const getDocs = async () => ({ docs: [], empty: true, forEach() {} });
export const getDocFromServer = getDoc, getDocsFromServer = getDocs;
const blocked = async () => { throw new Error('Anteprima locale: nessuna scrittura o chiamata remota consentita.'); };
// Explicit in-memory onboarding scenario; never forwards to Firebase.
export const fixtureWrites={count:0};
(window as any).__previewServiceWrites=fixtureWrites;
const localWrite=async()=>{const p=new URLSearchParams(location.search);if(!p.has('onboardingMemory'))return blocked();if(p.has('slowIo'))await new Promise(r=>setTimeout(r,500));fixtureWrites.count++;};
export const setDoc = localWrite, updateDoc = blocked, deleteDoc = blocked, addDoc = blocked, runTransaction = blocked;
export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: localWrite });
export const httpsCallable = () => blocked;
export const logEvent = async () => {};
export const recordActivity = async () => {};
