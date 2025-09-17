// 1x1 transparent GIF (43 bytes)
export const pixel1x1GifBuffer = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="),
  c => c.charCodeAt(0)
);
