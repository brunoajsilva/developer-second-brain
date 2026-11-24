import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CloseIcon } from '../../components/Icons';
import { spring } from '../../components/motion';

/** Chip input: Enter or comma adds a tag (spaces allowed inside a tag); Backspace on empty removes the last one. */
export function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (tags: string[]) => void; suggestions: string[] }) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const add = (raw: string) => {
    const tag = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    setDraft('');
    if (!tag || value.some((v) => v.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };
  return (
    <div className="tag-input" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
      <AnimatePresence initial={false}>
        {value.map((tag) => (
          <motion.span key={tag} className="chip" layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring}>
            {tag}
            <button aria-label={`Remove tag ${tag}`} onClick={(e) => { e.stopPropagation(); onChange(value.filter((v) => v !== tag)); }}><CloseIcon size={12} /></button>
          </motion.span>
        ))}
      </AnimatePresence>
      <input list={listId} value={draft} placeholder={value.length ? '' : 'Add a tag…'} aria-label="Add a tag"
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add(draft); }
          else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft.trim() && add(draft)} />
      <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}
