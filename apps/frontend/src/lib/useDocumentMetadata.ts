import { useEffect } from 'react';

export function useDocumentMetadata(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = descriptionTag?.content;
    const meta = descriptionTag ?? document.head.appendChild(document.createElement('meta'));
    meta.name = 'description';
    document.title = title;
    meta.content = description;

    return () => {
      document.title = previousTitle;
      if (descriptionTag) descriptionTag.content = previousDescription ?? '';
      else meta.remove();
    };
  }, [title, description]);
}
