/** Generate a UUID v4 for node IDs (CRDT-prep). */
export function generateId(): string {
  return crypto.randomUUID();
}
