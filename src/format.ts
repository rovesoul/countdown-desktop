/** Formats a duration the way the progress bar captions expect it. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  if (total >= 3600) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${pad(hours)}:${pad(minutes)}:${pad(total % 60)}`;
  }
  if (total >= 60) {
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }
  return `${total}s`;
}

/** Formats the big clock, which always shows at least minutes and seconds. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  if (total >= 3600) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${pad(hours)}:${pad(minutes)}:${pad(total % 60)}`;
  }
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function splitDuration(seconds: number): [number, number, number] {
  const total = Math.max(0, Math.round(seconds));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
