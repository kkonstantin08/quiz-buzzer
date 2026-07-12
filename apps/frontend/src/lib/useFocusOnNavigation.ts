import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function useFocusOnNavigation() {
  const location = useLocation();

  useEffect(() => {
    // We delay slightly to allow DOM updates after route change
    const timer = setTimeout(() => {
      const heading = document.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
        heading.style.outline = 'none'; // Prevent visual outline on programmatic focus
      } else {
        const main = document.getElementById('main-content');
        if (main) {
          main.setAttribute('tabindex', '-1');
          main.focus();
          main.style.outline = 'none';
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [location.pathname]);
}
