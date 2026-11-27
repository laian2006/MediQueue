import { useEffect, useRef, useState } from 'react';

const pollInterval = 3000;
const readTimeout = 8000;

export function isTicketInScope(view, patientId, sessionId) {
  const ticket = view?.ticket;
  return Boolean(ticket && ticket.patientId === patientId && ticket.sessionId === sessionId);
}

export function usePatientTicket({ api, patientId, initialSession, paused, busy, demo, onAccessError }) {
  const [snapshot, setSnapshot] = useState(null);
  const latest = useRef(null);
  const [refresh, setRefresh] = useState(0);
  const resumeAfterWrite = useRef(false);

  function saveSnapshot(value) {
    latest.current = value;
    setSnapshot(value);
  }

  useEffect(() => {
    if (!patientId) return;
    if (paused) {
      resumeAfterWrite.current = true;
      return;
    }

    const controller = new AbortController();
    const scope = { patientId, initialSession };
    let timer;

    async function read() {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(readTimeout)]);
      const previous = latest.current;
      try {
        const session = demo ? initialSession : (await api.getCurrentSession({ signal })).data;
        let view = null;
        if (session) {
          const params = { patientId, sessionId: session.sessionId };
          ({ data: view } = await api.getActiveTicket(params, { signal }));
          // Once a ticket leaves the active list, read its final status by ID.
          if (!view && isTicketInScope(previous?.view, patientId, session.sessionId)) {
            try {
              ({ data: view } = await api.getTicket(previous.view.ticket.ticketId, { signal }));
            } catch (error) {
              if (error.status !== 404) throw error;
            }
          }
          if (view && !isTicketInScope(view, patientId, session.sessionId)) {
            throw new Error('Ticket does not match the selected profile and session');
          }
        }
        if (controller.signal.aborted || busy.current) return;
        saveSnapshot({ ...scope, session, view, syncedAt: Date.now(), stale: false });
      } catch (error) {
        if (controller.signal.aborted || busy.current) return;
        if (error.status === 401 || error.status === 403) {
          saveSnapshot(null);
          onAccessError(error.status);
          return;
        }
        const retained = previous?.patientId === patientId && previous.initialSession === initialSession ? previous : null;
        saveSnapshot({ ...retained, ...scope, stale: true, checking: false });
      }
      if (!demo && !controller.signal.aborted) timer = setTimeout(read, pollInterval);
    }

    // Allow a retry of an unconfirmed write before the next automatic read.
    if (resumeAfterWrite.current && !latest.current?.checking) {
      if (!demo) timer = setTimeout(read, pollInterval);
    } else {
      void read();
    }
    resumeAfterWrite.current = false;
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, patientId, initialSession, paused, busy, demo, onAccessError, refresh]);

  const current = snapshot?.patientId === patientId && snapshot.initialSession === initialSession ? snapshot : null;
  return {
    session: current && 'session' in current ? current.session : initialSession,
    view: current?.view ?? null,
    syncedAt: current?.syncedAt ?? null,
    stale: current?.stale ?? false,
    checking: current?.checking ?? false,
    loading: Boolean(patientId && !current),
    refresh: () => setRefresh((value) => value + 1),
    clear: () => saveSnapshot(null),
    invalidate: () => saveSnapshot({ ...latest.current, patientId, initialSession, checking: true }),
    accept: (session, view) => saveSnapshot({ patientId, initialSession, session, view, syncedAt: Date.now(), stale: false }),
  };
}
