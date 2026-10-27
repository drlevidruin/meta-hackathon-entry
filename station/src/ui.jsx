import { useEffect, useState } from 'react';
import { savePin } from './storage.js';

export function Star({ filled = false, filling = false }) {
  return <svg className={`star ${filled ? 'filled' : ''} ${filling ? 'filling' : ''}`} viewBox="0 0 32 32" aria-hidden="true">
    <path d="m16 2 4.2 8.5 9.4 1.4-6.8 6.6 1.6 9.4-8.4-4.4-8.4 4.4 1.6-9.4L2.4 11.9l9.4-1.4Z" />
  </svg>;
}

export function Brand() {
  return <a className="wordmark" href="#/" aria-label="Kriah Listener home"><span className="brand-mark" aria-hidden="true">ק</span><span>Kriah<br />Listener</span></a>;
}

export function Loading() {
  return <div className="loading-screen" role="status" aria-label="Loading"><Star filled filling /></div>;
}

export function ErrorView({ error, retry }) {
  return <div className="request-error"><p role="alert">{error?.message || 'Try again'}</p><button className="secondary" onClick={retry}>Try again</button></div>;
}

export function useResource(fetcher, key = '') {
  const [state, setState] = useState({ key, data: null, error: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ key, data: null, error: null });
    Promise.resolve().then(fetcher).then(data => {
      if (active) setState({ key, data, error: null });
    }).catch(error => {
      if (!active) return;
      if (error.status === 403) {
        savePin('');
        window.dispatchEvent(new Event('teacher-lock'));
      }
      setState({ key, data: null, error });
    });
    return () => { active = false; };
  }, [key, revision]);
  return { ...(state.key === key ? state : { data: null, error: null }), retry: () => setRevision(value => value + 1) };
}

export function Resource({ resource, children }) {
  if (resource.error) return <ErrorView error={resource.error} retry={resource.retry} />;
  if (!resource.data) return <Loading />;
  return children(resource.data);
}
