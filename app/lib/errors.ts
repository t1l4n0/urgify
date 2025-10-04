export function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message || 'Unknown error';
  if (typeof err === 'string') return err || 'Unknown error';
  try { 
    return JSON.stringify(err); 
  } catch { 
    return 'Unknown error'; 
  }
}
