export function hasSuperAdminAccess(metadata: unknown): boolean {
  return Boolean(
    metadata
    && typeof metadata === "object"
    && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).superAdmin === true
  );
}
