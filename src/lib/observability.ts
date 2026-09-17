type OperationalDetails = Record<string, string | number | boolean | null | undefined>;

export function reportOperationalError(
  operation: string,
  error: unknown,
  details: OperationalDetails = {},
) {
  const normalized = error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...("digest" in error ? { digest: String(error.digest) } : {}),
        ...(error.cause instanceof Error
          ? { cause: { name: error.cause.name, message: error.cause.message } }
          : error.cause === undefined
            ? {}
            : { cause: String(error.cause) }),
      }
    : { name: "UnknownError", message: String(error) };
  console.error("[dropday:operation-failed]", {
    operation,
    occurredAt: new Date().toISOString(),
    ...details,
    error: normalized,
  });
}
