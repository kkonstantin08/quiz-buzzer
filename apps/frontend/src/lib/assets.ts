type AssetUrlOptions = {
  development?: boolean;
  backendOrigin?: string;
};

const backendOrigin = () => (import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`)
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '');

export function resolveAssetUrl(
  url: string | null | undefined,
  options: AssetUrlOptions = {},
) {
  if (!url || /^https?:\/\//.test(url) || !url.startsWith('/uploads/')) return url;
  if (options.development ?? import.meta.env.DEV) {
    return `${(options.backendOrigin || backendOrigin()).replace(/\/api\/?$/, '').replace(/\/$/, '')}${url}`;
  }
  return url;
}
