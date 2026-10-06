import { bugSVG, type BugConfig } from '../lib/bug/render.js';

export type { BugConfig };

type Props = { config: BugConfig; size?: number; label?: string; className?: string };

// The SVG comes from our own renderer and never contains user text, so injecting it is safe.
export default function Bug({ config, size = 300, label, className }: Props) {
  return (
    <div
      className={className}
      role="img"
      aria-label={label ?? 'Rebel bug'}
      dangerouslySetInnerHTML={{ __html: bugSVG(config, size) }}
    />
  );
}
