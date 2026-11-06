// STUB — replaced by the UI agent.
import { useEffect, useRef } from 'react';
import { stage } from '../core/stage';

export function App() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stage.mount(ref.current!);
    stage.start();
    return () => stage.dispose();
  }, []);
  return <div ref={ref} style={{ position: 'fixed', inset: 0 }} />;
}
