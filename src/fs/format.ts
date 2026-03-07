const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < SIZE_UNITS.length - 1) {
    size /= 1024;
    i++;
  }
  return i === 0 ? `${size} B` : `${size.toFixed(1)} ${SIZE_UNITS[i]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(date: Date): string {
  const month = MONTHS[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month} ${day} ${hours}:${minutes}`;
}

export function padColumn(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + " ".repeat(width - str.length);
}
