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
const blocked = async () => { throw new Error('Anteprima locale: nessuna scrittura o chiamata remota consentita.'); };
export const setDoc = blocked, updateDoc = blocked, deleteDoc = blocked, addDoc = blocked, runTransaction = blocked;
export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: blocked });
export const httpsCallable = () => blocked;
export const logEvent = async () => {};
export const recordActivity = async () => {};
