type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  requestId?: string;
  route?: string;
  shop?: string;
  topic?: string;
  status?: number;
  [key: string]: unknown;
}

function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    if (/access|token|secret|password/i.test(value)) return "[REDACTED]";
    return value;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|authorization/i.test(k)) out[k] = "[REDACTED]";
      else out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

export function log(level: LogLevel, message: string, context: LogContext = {}): void {
  const scrubbedContext = scrub(context);
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(typeof scrubbedContext === 'object' && scrubbedContext !== null ? scrubbedContext as Record<string, unknown> : {}),
  } as Record<string, unknown>;
  const line = JSON.stringify(entry);
  switch (level) {
    case "debug":
    case "info":
      console.log(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

export function withRequestId(request: Request): string | undefined {
  return request.headers.get("x-request-id") || undefined;
}


