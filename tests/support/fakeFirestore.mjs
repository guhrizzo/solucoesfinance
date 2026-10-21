// tests/support/fakeFirestore.mjs
// Firestore em memória com o subconjunto da API do Admin SDK que
// lib/compras/service.ts usa: doc/collection/get/set/update/create/delete e
// runTransaction. As transações rodam em fila (serializadas, como o Firestore
// garante pra docs em conflito) e exigem LEITURAS ANTES DAS ESCRITAS — a mesma
// regra do SDK real, pra pegar bug de ordem na lógica.

let autoId = 0;
const nextId = () => `auto${String(++autoId).padStart(6, "0")}`;
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

function snapshot(path, data) {
  const id = path.split("/").pop();
  return { id, exists: data !== undefined, ref: { path, id }, data: () => clone(data) };
}

export function createFakeFirestore() {
  const store = new Map(); // path → data
  let queue = Promise.resolve();

  const docRef = (path) => ({
    path,
    id: path.split("/").pop(),
    async get() { return snapshot(path, store.get(path)); },
    async set(data, opts) { applySet(path, data, opts); },
    async update(data) { applyUpdate(path, data); },
    async create(data) { applyCreate(path, data); },
    async delete() { store.delete(path); },
  });

  function applySet(path, data, opts) {
    if (opts?.merge && store.has(path)) store.set(path, { ...store.get(path), ...clone(data) });
    else store.set(path, clone(data));
  }
  function applyUpdate(path, data) {
    if (!store.has(path)) throw Object.assign(new Error(`NOT_FOUND: ${path}`), { code: 5 });
    store.set(path, { ...store.get(path), ...clone(data) });
  }
  function applyCreate(path, data) {
    if (store.has(path)) throw Object.assign(new Error(`ALREADY_EXISTS: ${path}`), { code: 6 });
    store.set(path, clone(data));
  }

  const collectionRef = (path) => ({
    path,
    doc(id) { return docRef(`${path}/${id ?? nextId()}`); },
    async get() {
      const depth = path.split("/").length + 1;
      const docs = [...store.entries()]
        .filter(([p]) => p.startsWith(path + "/") && p.split("/").length === depth)
        .map(([p, d]) => snapshot(p, d));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });

  const db = {
    store,
    doc: docRef,
    collection: collectionRef,
    runTransaction(fn) {
      const run = async () => {
        const writes = [];
        let wrote = false;
        const tx = {
          async get(ref) {
            if (wrote) throw new Error("Firestore: todas as leituras precisam vir antes das escritas na transação.");
            return snapshot(ref.path, store.get(ref.path));
          },
          set(ref, data, opts) { wrote = true; writes.push(() => applySet(ref.path, data, opts)); return tx; },
          update(ref, data) { wrote = true; writes.push(() => applyUpdate(ref.path, data)); return tx; },
          create(ref, data) { wrote = true; writes.push(() => applyCreate(ref.path, data)); return tx; },
          delete(ref) { wrote = true; writes.push(() => store.delete(ref.path)); return tx; },
        };
        const result = await fn(tx);
        // Commit atômico: valida tudo numa cópia antes de aplicar.
        const backup = new Map(store);
        try {
          for (const w of writes) w();
        } catch (err) {
          store.clear();
          for (const [k, v] of backup) store.set(k, v);
          throw err;
        }
        return result;
      };
      const p = queue.then(run, run);
      queue = p.catch(() => undefined);
      return p;
    },
  };
  return db;
}
