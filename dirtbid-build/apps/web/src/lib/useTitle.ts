import { useEffect } from 'react';
export function useTitle(title: string, description?: string): void {
  useEffect(() => {
    document.title = title.includes('DirtBid') ? title : `${title} | DirtBid Build`;
    if (description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m); }
      m.setAttribute('content', description);
    }
  }, [title, description]);
}
