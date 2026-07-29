import type { InputHTMLAttributes } from "react";
import { useDebouncedSave } from "../../hooks/useDebouncedSave.js";

interface DebouncedTextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onSave: (value: string) => Promise<void>;
}

/**
 * A text-like input (text/url/email/phone/number) bound to server state via
 * a debounced, serialized save - see useDebouncedSave for why a plain
 * controlled input wired straight to a per-keystroke mutation loses
 * characters under real network latency.
 */
export function DebouncedTextInput({ value: externalValue, onSave, ...inputProps }: DebouncedTextInputProps) {
  const [value, setValue] = useDebouncedSave(externalValue, onSave);
  return <input {...inputProps} value={value} onChange={(e) => setValue(e.target.value)} />;
}
