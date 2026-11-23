export function countLabel(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".0", "") + "К";
  return String(n);
}

export function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "только что";
  if (diff < 3600) return Math.floor(diff / 60) + " мин";
  if (diff < 86400) return Math.floor(diff / 3600) + " ч";
  return Math.floor(diff / 86400) + " д";
}
