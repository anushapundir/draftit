// Plain strings in a server-safe module: values exported from a client module are not usable in server components.
const pill = "inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
export const pillBlack = `${pill} bg-ink px-4 py-2 text-sm text-bg hover:opacity-85`;
export const pillAccent = `${pill} btn-accent px-5 py-2.5 text-[15px]`;
export const pillWhite = `${pill} border border-line bg-raised px-4 py-2 text-sm text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:bg-surface`;
