import { type ChangeEvent, type JSX, useId, useState } from 'react';
import { CONFIG } from '../../config';
import { KIND_LABELS, KIND_ORDER, normaliseColour, STYLE_OPTIONS, SWATCHES, type StyleOption } from '../../domain/furniture/recipe';
import { PRODUCT_TEXT_LIMITS } from '../../domain/planSchema';
import type { Item, ItemColours, Kind } from '../../domain/types';
import { runKeyed } from '../../state/historyStore';
import { usePlanStore } from '../../state/planStore';
import { Segmented } from '../ui/Segmented';
import { DimInput } from './DimInput';
import './itemList.css';

/** The visible and accessible names of the two colour groups and their custom colour inputs. */
const COLOUR_LABELS: Readonly<Record<keyof ItemColours, { group: string; custom: string }>> = {
  main: { group: 'Main colour', custom: 'Custom main colour' },
  accent: { group: 'Accent colour', custom: 'Custom accent colour' },
};

/** The stored kind whose value is `value`, or null for any other text. */
function kindOf(value: string): Kind | null {
  return KIND_ORDER.find((k) => k === value) ?? null;
}

/**
 * The Name field. It shows a local draft so the user can clear and retype: each change is offered
 * to the store, which keeps only a valid name (trimmed, 1 to 200 characters), so an empty draft
 * leaves the stored name alone. Leaving the field with a draft that is not the stored name shows
 * the stored name again. A stored name changed elsewhere (undo, a type change) re-seeds the draft.
 */
function NameField({ item }: { item: Item }): JSX.Element {
  const id = useId();
  const updateItem = usePlanStore((s) => s.updateItem);
  const [draft, setDraft] = useState(item.name);
  const [seenName, setSeenName] = useState(item.name);

  // Adjust state during render (not in an effect) so the input never shows a stale draft. A draft
  // that trims to the stored name (say with a space typed before the next word) is kept.
  if (seenName !== item.name) {
    if (draft.trim() !== item.name) setDraft(item.name);
    setSeenName(item.name);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDraft(raw);
    updateItem(item.id, { name: raw });
  }

  return (
    <div className="field">
      <label htmlFor={id}>Name</label>
      {/* React renders the name back as a value, never as markup. */}
      <input
        id={id}
        className="input"
        type="text"
        maxLength={PRODUCT_TEXT_LIMITS.nameMax}
        value={draft}
        onChange={onChange}
        onBlur={() => {
          if (draft.trim() !== item.name) setDraft(item.name);
        }}
      />
    </div>
  );
}

/** One style option: its label as visible text over a segmented radio group of its values. */
function StyleChoice({ item, option }: { item: Item; option: StyleOption }): JSX.Element {
  const updateItem = usePlanStore((s) => s.updateItem);
  return (
    <div className="item-editor-choice">
      <span className="item-editor-caption" aria-hidden="true">
        {option.label}
      </span>
      <Segmented<string>
        className="item-editor-options"
        name={`style-${item.id}-${option.key}`}
        aria-label={option.label}
        value={item.style[option.key] ?? option.fallback}
        options={option.values}
        onChange={(v) => updateItem(item.id, { style: { [option.key]: v } })}
      />
    </div>
  );
}

/**
 * One colour slot: a group of swatch buttons, the stored colour's one pressed, then a colour input
 * for any other colour. A swatch's colour is set as a style property value, never as CSS text. The
 * colour input reports every step of a drag through the picker; each is keyed to the item and slot,
 * so a drag is one undo step.
 */
function ColourChoice({ item, slot }: { item: Item; slot: keyof ItemColours }): JSX.Element {
  const updateItem = usePlanStore((s) => s.updateItem);
  const labels = COLOUR_LABELS[slot];
  const stored = item.colours[slot];

  function onCustom(e: ChangeEvent<HTMLInputElement>) {
    const colour = normaliseColour(e.target.value);
    if (colour === null) return;
    runKeyed('item-colour:' + item.id + ':' + slot, () => updateItem(item.id, { colours: { [slot]: colour } }));
  }

  return (
    <div className="item-editor-choice">
      <span className="item-editor-caption" aria-hidden="true">
        {labels.group}
      </span>
      <div className="item-editor-options" role="group" aria-label={labels.group}>
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.label}
            type="button"
            className="item-swatch"
            aria-label={swatch.label}
            aria-pressed={stored === swatch.colour}
            style={{ backgroundColor: swatch.colour }}
            onClick={() => updateItem(item.id, { colours: { [slot]: swatch.colour } })}
          />
        ))}
        <input className="item-editor-custom" type="color" aria-label={labels.custom} value={stored} onChange={onCustom} />
      </div>
    </div>
  );
}

/**
 * The selected piece's editor, shown under its row in the item list: its name, type, size, the
 * style options of its kind and its two colours. Every change goes through `updateItem`, which
 * refuses an invalid value and changes nothing. Item shortcuts do not act on keys pressed in it
 * (see useKeyboardShortcuts and `data-item-editor`).
 */
export function ItemEditor({ item }: { item: Item }): JSX.Element {
  const typeId = useId();
  const updateItem = usePlanStore((s) => s.updateItem);
  const range = { min: CONFIG.itemDimMin, max: CONFIG.itemDimMax };

  return (
    <div className="item-editor" data-item-editor="">
      <NameField item={item} />
      <div className="field">
        <label htmlFor={typeId}>Type</label>
        <select
          id={typeId}
          className="input"
          value={item.kind}
          onChange={(e) => {
            const kind = kindOf(e.target.value);
            if (kind !== null) updateItem(item.id, { kind });
          }}
        >
          {KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className="field-grid-3 item-editor-sizes">
        <DimInput label="Width" stored={item.w} {...range} onValue={(w) => updateItem(item.id, { w })} />
        <DimInput label="Depth" stored={item.d} {...range} onValue={(d) => updateItem(item.id, { d })} />
        <DimInput label="Height" stored={item.h} {...range} onValue={(h) => updateItem(item.id, { h })} />
      </div>
      {STYLE_OPTIONS[item.kind].map((option) => (
        <StyleChoice key={option.key} item={item} option={option} />
      ))}
      <ColourChoice item={item} slot="main" />
      <ColourChoice item={item} slot="accent" />
    </div>
  );
}
