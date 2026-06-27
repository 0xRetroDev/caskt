import type { Trigger } from "../../api/types";
import { Field, NumberInput, Select } from "./fields";

type IntervalUnit = "minutes" | "hours" | "days";
const UNIT_MS: Record<IntervalUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export function TriggerEditor({ trigger, onChange }: { trigger: Trigger; onChange: (t: Trigger) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Run">
        <Select
          value={trigger.type}
          onChange={(type) => onChange(defaultTrigger(type))}
          options={[
            ["onUnlock", "As items unlock"],
            ["interval", "On a repeat"],
            ["at", "Once, at a time"],
            ["manual", "Only when I run it"],
          ]}
        />
      </Field>

      {trigger.type === "interval" && <IntervalFields trigger={trigger} onChange={onChange} />}

      {trigger.type === "at" && (
        <Field label="At">
          <input
            type="datetime-local"
            value={toLocalInput(trigger.at)}
            onChange={(e) => onChange({ type: "at", at: new Date(e.target.value).getTime() })}
            className="rounded-md border border-line bg-ink-700 px-2.5 py-1.5 text-sm text-fg focus:border-accent-dim focus:outline-none"
          />
        </Field>
      )}

      {trigger.type === "onUnlock" && (
        <p className="max-w-xs text-[12px] leading-relaxed text-fg-faint">
          Checks continuously and files matching items the moment they leave their protection window.
        </p>
      )}
    </div>
  );
}

function IntervalFields({
  trigger,
  onChange,
}: {
  trigger: Extract<Trigger, { type: "interval" }>;
  onChange: (t: Trigger) => void;
}) {
  const { amount, unit } = fromMs(trigger.everyMs);
  return (
    <>
      <Field label="Every">
        <NumberInput
          value={amount}
          onChange={(v) => onChange({ type: "interval", everyMs: (v ?? 1) * UNIT_MS[unit] })}
        />
      </Field>
      <Field label="Unit">
        <Select
          value={unit}
          onChange={(u) => onChange({ type: "interval", everyMs: amount * UNIT_MS[u] })}
          options={[
            ["minutes", "Minutes"],
            ["hours", "Hours"],
            ["days", "Days"],
          ]}
        />
      </Field>
    </>
  );
}

function defaultTrigger(type: Trigger["type"]): Trigger {
  switch (type) {
    case "onUnlock":
      return { type: "onUnlock" };
    case "manual":
      return { type: "manual" };
    case "interval":
      return { type: "interval", everyMs: UNIT_MS.hours };
    case "at":
      return { type: "at", at: Date.now() + 3_600_000 };
  }
}

function fromMs(ms: number): { amount: number; unit: IntervalUnit } {
  if (ms % UNIT_MS.days === 0) return { amount: ms / UNIT_MS.days, unit: "days" };
  if (ms % UNIT_MS.hours === 0) return { amount: ms / UNIT_MS.hours, unit: "hours" };
  return { amount: Math.max(1, Math.round(ms / UNIT_MS.minutes)), unit: "minutes" };
}

function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}
