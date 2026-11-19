import { useEffect, useState } from 'react';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { getRuntime } from '../../app/runtime';
import { AnimatedImage } from '../../shared/ui/AnimatedImage';

type Gif = { id: string; url: string; preview: string; description: string };
const NO_FAVORITES: string[] = [];

export function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Gif[]>([]);
  const [categories, setCategories] = useState<{ searchterm: string; name: string }[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const favorites = useSessionStore((s) => s.settings.preferences?.favorite_gifs ?? NO_FAVORITES);

  useEffect(() => { void getRuntime().api.gifCategories().then((r) => setCategories(r.tags ?? [])).catch(() => undefined); }, []);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void getRuntime().api.gifs(query.trim() || undefined).then((r) => {
        if (!current) return;
        setItems((r.results ?? []).flatMap((gif) => {
          const url = gif.media_formats?.gif?.url;
          if (!url || !url.startsWith('https://')) return [];
          const preview = gif.media_formats.tinygif?.url;
          return [{ id: gif.id, url, preview: preview?.startsWith('https://') ? preview : url, description: gif.content_description ?? 'GIF' }];
        }));
        setError('');
      }).catch(() => { if (current) setError('GIFs are unavailable right now.'); }).finally(() => { if (current) setLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [query]);

  const toggleFavorite = async (url: string) => {
    const next = favorites.includes(url) ? favorites.filter((v) => v !== url) : [...favorites, url].slice(-100);
    try {
      const settings = await getRuntime().api.updateSettings({ preferences: { favorite_gifs: next } });
      useSessionStore.getState().setSettings(settings);
    } catch { setError('Could not save favorites.'); }
  };
  const visible = favoritesOnly ? favorites.map((url) => ({ id: url, url, preview: url, description: 'Favorite GIF' })) : items;
  return <div className="gif-picker" role="dialog" aria-label="GIF picker" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
    <div className="gif-picker-header"><strong>GIFs</strong><button type="button" onClick={onClose} aria-label="Close GIF picker">×</button></div>
    <input autoFocus aria-label="Search GIFs" placeholder="Search GIFs" value={query} onChange={(e) => { setFavoritesOnly(false); setQuery(e.target.value); }} />
    <div className="gif-picker-categories"><button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>Favorites</button>{categories.map((category) => <button type="button" key={category.searchterm} onClick={() => { setFavoritesOnly(false); setQuery(category.searchterm); }}>{category.name}</button>)}</div>
    {error && <p role="status">{error}</p>}
    {loading && !favoritesOnly ? <p role="status">Loading GIFs…</p> : <div className="gif-picker-grid">{visible.map((gif) => <div className="gif-picker-item" key={gif.id}><button type="button" onClick={() => onPick(gif.url)} aria-label={`Insert ${gif.description}`}><AnimatedImage kind="gif" animated src={gif.preview} alt={gif.description} loading="lazy" /></button><button type="button" className="gif-picker-favorite" aria-label={favorites.includes(gif.url) ? 'Remove favorite' : 'Add favorite'} aria-pressed={favorites.includes(gif.url)} onClick={() => void toggleFavorite(gif.url)}>{favorites.includes(gif.url) ? '★' : '☆'}</button></div>)}</div>}
  </div>;
}
