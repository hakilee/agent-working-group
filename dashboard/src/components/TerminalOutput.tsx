import { useEffect, useRef } from 'react';

interface Props {
  text: string;
  autoScroll?: boolean;
}

export default function TerminalOutput({ text, autoScroll = true }: Props) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!autoScroll || !ref.current) return;
    const el = ref.current;
    el.scrollTop = el.scrollHeight;
  }, [text, autoScroll]);

  return (
    <pre
      ref={ref}
      className="h-[28rem] overflow-auto rounded-lg border border-slate-800 bg-black/80 p-4 font-mono text-xs leading-snug text-slate-200 whitespace-pre-wrap"
    >
      {text || '(no output yet)'}
    </pre>
  );
}
