import type { Filter } from "../../api/types";
import { Field, NumberInput, TextInput, TriSelect } from "./fields";

/** The shared "when an item matches" filter grid, used by both move rules and
 *  listing schedules. */
export function FilterFields({ when, onChange }: { when: Filter; onChange: (when: Filter) => void }) {
  const set = (patch: Partial<Filter>) => onChange({ ...when, ...patch });
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Field label="Name contains">
        <TextInput value={when.name ?? ""} onChange={(e) => set({ name: e.target.value || undefined })} placeholder="e.g. Redline" />
      </Field>
      <Field label="Weapon">
        <TextInput value={when.weapon ?? ""} onChange={(e) => set({ weapon: e.target.value || undefined })} placeholder="e.g. AK-47" />
      </Field>
      <Field label="Sticker name">
        <TextInput value={when.stickerName ?? ""} onChange={(e) => set({ stickerName: e.target.value || undefined })} placeholder="e.g. Katowice 2014" />
      </Field>
      <Field label="Collection">
        <TextInput value={when.collection ?? ""} onChange={(e) => set({ collection: e.target.value || undefined })} placeholder="e.g. Anubis" />
      </Field>
      <Field label="Tournament">
        <TextInput value={when.event ?? ""} onChange={(e) => set({ event: e.target.value || undefined })} placeholder="e.g. Antwerp 2022" />
      </Field>
      <Field label="Team / player">
        <TextInput value={when.team ?? ""} onChange={(e) => set({ team: e.target.value || undefined })} placeholder="e.g. Vitality" />
      </Field>
      <Field label="Min price">
        <NumberInput value={when.priceMin} onChange={(v) => set({ priceMin: v })} placeholder="0" />
      </Field>
      <Field label="Max price">
        <NumberInput value={when.priceMax} onChange={(v) => set({ priceMax: v })} placeholder="∞" />
      </Field>
      <Field label="Max float">
        <NumberInput step={0.001} value={when.floatMax} onChange={(v) => set({ floatMax: v })} placeholder="1.0" />
      </Field>
      <Field label="StatTrak">
        <TriSelect value={when.stattrak} onChange={(v) => set({ stattrak: v })} />
      </Field>
      <Field label="Has stickers">
        <TriSelect value={when.hasStickers} onChange={(v) => set({ hasStickers: v })} />
      </Field>
    </div>
  );
}
