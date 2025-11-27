// Merge this patch into your src/memdb.ts inside class MemDB:
// --- PATCH: add setNote API ---
  setNote(id: string, note: string) { const r = this.byId.get(id); if (r) r.notes = note; }
