/** Public file under Vite `public/`. Works on GitHub Pages subpath. */
export function pub(path: string): string {
  const p = path.replace(/^\//, "");
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? `${base}${p}` : `${base}/${p}`;
}
