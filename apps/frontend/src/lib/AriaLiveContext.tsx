import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type AnnounceFn = (message: string, assertiveness?: 'polite' | 'assertive') => void;

const AriaLiveContext = createContext<AnnounceFn>(() => {});

export function AriaLiveProvider({ children }: { children: ReactNode }) {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');

  const announce = useCallback((message: string, assertiveness: 'polite' | 'assertive' = 'polite') => {
    if (assertiveness === 'assertive') {
      setAssertiveMessage(message);
      setTimeout(() => setAssertiveMessage(''), 3000);
    } else {
      setPoliteMessage(message);
      setTimeout(() => setPoliteMessage(''), 3000);
    }
  }, []);

  return (
    <AriaLiveContext.Provider value={announce}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {politeMessage ? <span>{politeMessage}</span> : null}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {assertiveMessage ? <span>{assertiveMessage}</span> : null}
      </div>
    </AriaLiveContext.Provider>
  );
}

export function useAriaLive() {
  return useContext(AriaLiveContext);
}
