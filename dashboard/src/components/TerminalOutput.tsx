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
    <pre ref={ref} className="awg-terminal">
      {text || '(no output yet)'}
    </pre>
  );
}
