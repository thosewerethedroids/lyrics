import { useMemo, useRef, useState } from 'react';
import { tight } from '../../core/normalize';
import { normaliseTags } from '../../db/pages';

type Props = {
  value: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  label?: string;
};

/**
 * Free-form tag entry with autocomplete over tags already in use.
 *
 * Suggestions are ranked by how much of the typed text they match at the *start* of the tag, then
 * alphabetically. Offering an existing tag is the only thing stopping "acoustic" and "Acoustic"
 * and "accoustic" from all ending up in the library.
 */
export function TagInput({ value, suggestions, onChange, label = 'Tags' }: Props) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const key = tight(draft);
    const taken = new Set(value.map(tight));
    const pool = suggestions.filter((tag) => !taken.has(tight(tag)));
    if (!key) return pool.slice(0, 8);
    return pool
      .filter((tag) => tight(tag).includes(key))
      .sort((a, b) => {
        const aStarts = tight(a).startsWith(key) ? 0 : 1;
        const bStarts = tight(b).startsWith(key) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      })
      .slice(0, 8);
  }, [draft, suggestions, value]);

  function commit(tag: string) {
    const next = normaliseTags([...value, tag]);
    onChange(next);
    setDraft('');
    input.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      if (!draft.trim()) return;
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
    if (event.key === 'Escape') setOpen(false);
  }

  return (
    <div className="tag-input">
      <span className="label">{label}</span>
      <div className="tag-input__box">
        {value.map((tag) => (
          <span className="chip chip--removable" key={tag}>
            {tag}
            <button
              type="button"
              className="chip__remove"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={input}
          className="tag-input__field"
          value={draft}
          placeholder={value.length === 0 ? 'Add a tag' : ''}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // A click on a suggestion blurs the field first, so closing has to wait a tick.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          aria-label="Add a tag"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      {open && (matches.length > 0 || draft.trim()) ? (
        <ul className="tag-input__menu">
          {draft.trim() && !matches.some((tag) => tight(tag) === tight(draft)) ? (
            <li>
              <button type="button" className="tag-input__option" onMouseDown={() => commit(draft)}>
                Create “{draft.trim()}”
              </button>
            </li>
          ) : null}
          {matches.map((tag) => (
            <li key={tag}>
              <button type="button" className="tag-input__option" onMouseDown={() => commit(tag)}>
                {tag}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
