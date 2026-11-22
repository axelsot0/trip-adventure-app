import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type Tab = 'adventure' | 'map' | 'calendar' | 'budget';
export type Overlay = null | 'menu' | 'import' | 'export' | 'editor' | 'prep' | 'settings' | 'data' | 'complete';

interface UI {
  tab: Tab;
  setTab: (t: Tab) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  overlay: Overlay;
  open: (o: Overlay) => void;
  close: () => void;
  editorTarget: string | null;
  edit: (id: string | null) => void;
  calendarDate: string | null;
  showDay: (d: string) => void;
  mapFocus: { id: string; at: number } | null;
  showOnMap: (id: string) => void;
  toast: { text: string; kind: 'success' | 'info' | 'error'; at: number } | null;
  notify: (text: string, kind?: 'success' | 'info' | 'error') => void;
  celebrate: { id: string; at: number } | null;
  fireCelebrate: (id: string) => void;
}

const Ctx = createContext<UI | null>(null);
export const useUI = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('UIProvider missing');
  return c;
};

export function UIProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('adventure');
  const [selectedId, select] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [editorTarget, setEditorTarget] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<UI['mapFocus']>(null);
  const [toast, setToast] = useState<UI['toast']>(null);
  const [celebrate, setCelebrate] = useState<UI['celebrate']>(null);

  const notify = useCallback((text: string, kind: 'success' | 'info' | 'error' = 'info') => setToast({ text, kind, at: Date.now() }), []);

  return (
    <Ctx.Provider value={{
      tab, setTab, selectedId, select, overlay,
      open: setOverlay, close: () => setOverlay(null),
      editorTarget, edit: id => { setEditorTarget(id); setOverlay('editor'); select(null); },
      calendarDate, showDay: d => { setCalendarDate(d); setTab('calendar'); },
      mapFocus, showOnMap: id => { setMapFocus({ id, at: Date.now() }); setTab('map'); select(null); },
      toast, notify,
      celebrate, fireCelebrate: id => setCelebrate({ id, at: Date.now() }),
    }}>
      {children}
    </Ctx.Provider>
  );
}
