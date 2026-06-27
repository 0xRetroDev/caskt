import type { ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "rounded-md border border-line bg-ink-700 px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-faint focus:border-accent-dim focus:outline-none";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  step?: number;
}) {
  return (
    <input
      type="number"
      step={step}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className={inputCls}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** any / yes / no, mapped to undefined / true / false. */
export function TriSelect({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  const str = value === undefined ? "any" : value ? "yes" : "no";
  return (
    <Select
      value={str}
      onChange={(v) => onChange(v === "any" ? undefined : v === "yes")}
      options={[
        ["any", "Any"],
        ["yes", "Yes"],
        ["no", "No"],
      ]}
    />
  );
}
