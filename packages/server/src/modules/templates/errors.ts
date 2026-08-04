/** Split out from interpreter.ts so filters.ts (imported BY interpreter.ts) can throw it too without a circular import. */
export class TemplateRuntimeError extends Error {}
