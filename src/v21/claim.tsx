import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, useIdentity, useTask } from './client';
import { ErrorText, Frame } from './common';

export function ClaimStall() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token')), task = useTask(), identity = useIdentity(), [done, setDone] = useState(false);
  useEffect(() => { void task.run(async () => { await api('/auth/claim', 'POST', { token }); await identity.refresh(); history.replaceState(null, '', '/claim'); setDone(true); }); }, []);
  if (done) return <Navigate to="/kitchen" replace />;
  return <Frame><h1>Opening your stall</h1><ErrorText text={task.error} />{!task.error && <p>One moment, your stall is almost open.</p>}</Frame>;
}
