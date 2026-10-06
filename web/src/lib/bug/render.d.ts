// Types for the plain JS bug renderer (render.js is the source of truth).
export type BugOption = [value: string, label: string];
export type BugConfig = Record<string, string | number | undefined>;

export declare const INK: string;
export declare const COL: Record<string, string>;
export declare const ROLES: BugOption[];
export declare const SPECIES: [name: string, quip: string, role: string][];
export declare const SEVERITY: string[];
export declare const OPTS: Record<string, { label: string; items: BugOption[]; swatch?: boolean }>;
export declare const DEFAULT: BugConfig;
export declare function bugSVG(config: BugConfig, size?: number): string;
export declare function vbOf(config: BugConfig): [number, number];
