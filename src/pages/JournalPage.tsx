import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Bold, BookText, Camera, Heading2, ImagePlus, Italic, Link as LinkIcon, List, ListOrdered, Plus, Trash2, Underline } from 'lucide-react';
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { createJournalEntry, deleteJournalEntry, journalDB, type JournalEntryDraft, type JournalEntryRecord, updateJournalEntry } from '../features/journal/db';
import { formatDateKey, formatDateTime, hasContent, parseTagsInput, todayDateKey } from '../features/journal/time';

type FormState = {
  dateKey: string;
  title: string;
  tagsInput: string;
  contentHtml: string;
  screenshots: string[];
};

const defaultFormState: FormState = {
  dateKey: todayDateKey(),
  title: '',
  tagsInput: '',
  contentHtml: '<p></p>',
  screenshots: []
};

export function JournalPage() {
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const entries = useLiveQuery(
    async () =>
      (await journalDB.entries.toArray()).sort((a, b) => {
        if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
        return b.updatedAt - a.updatedAt;
      }),
    []
  );
  const allEntries = useMemo(() => entries ?? [], [entries]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== form.contentHtml) {
      editor.innerHTML = form.contentHtml;
    }
  }, [form.contentHtml]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const entry of allEntries) {
      for (const tag of entry.tags) {
        set.add(tag);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    if (!activeTag) return allEntries;
    return allEntries.filter((entry) => entry.tags.some((tag) => tag.toLowerCase() === activeTag.toLowerCase()));
  }, [allEntries, activeTag]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, JournalEntryRecord[]>();
    for (const entry of filteredEntries) {
      const bucket = map.get(entry.dateKey) ?? [];
      bucket.push(entry);
      map.set(entry.dateKey, bucket);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredEntries]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorText('');

    try {
      const tags = parseTagsInput(form.tagsInput);
      const draft: JournalEntryDraft = {
        dateKey: form.dateKey,
        title: form.title.trim(),
        contentHtml: form.contentHtml,
        tags,
        screenshots: form.screenshots
      };

      if (!draft.dateKey) {
        throw new Error('Date is required.');
      }

      if (!draft.title && !hasContent(draft.contentHtml) && draft.screenshots.length === 0) {
        throw new Error('Add title, content, or screenshot before saving.');
      }

      if (editingId === null) {
        await createJournalEntry(draft);
      } else {
        await updateJournalEntry(editingId, draft);
      }

      setForm({
        ...defaultFormState,
        dateKey: todayDateKey()
      });
      setEditingId(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to save journal entry right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(entry: JournalEntryRecord) {
    if (!entry.id) return;
    setEditingId(entry.id);
    setErrorText('');
    setForm({
      dateKey: entry.dateKey,
      title: entry.title,
      tagsInput: entry.tags.join(', '),
      contentHtml: entry.contentHtml,
      screenshots: entry.screenshots
    });
  }

  async function removeEntry(id?: number) {
    if (!id) return;
    if (!window.confirm('Delete this note?')) return;
    await deleteJournalEntry(id);

    if (editingId === id) {
      setEditingId(null);
      setForm({
        ...defaultFormState,
        dateKey: todayDateKey()
      });
    }
  }

  async function handleScreenshotUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    try {
      const encoded = await Promise.all(files.map(fileToDataUrl));
      setForm((prev) => ({
        ...prev,
        screenshots: [...prev.screenshots, ...encoded].slice(0, 8)
      }));
    } finally {
      event.target.value = '';
    }
  }

  function removeScreenshot(index: number) {
    setForm((prev) => ({
      ...prev,
      screenshots: prev.screenshots.filter((_, currentIndex) => currentIndex !== index)
    }));
  }

  function applyEditorCommand(command: string, value?: string) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    setForm((prev) => ({
      ...prev,
      contentHtml: editor.innerHTML
    }));
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Journal</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Daily Notes</h2>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1.6fr]">
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          onSubmit={handleSubmit}
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_25px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6"
        >
          <div className="mb-5 flex items-center gap-2">
            <Plus className="h-4 w-4 text-glow" />
            <h3 className="font-display text-lg text-white">{editingId ? 'Edit Note' : 'New Note'}</h3>
          </div>

          <div className="space-y-3">
            <Input
              type="date"
              value={form.dateKey}
              onChange={(event) => setForm((prev) => ({ ...prev, dateKey: event.target.value }))}
              required
            />

            <Input
              placeholder="Title (optional)"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />

            <Input
              placeholder="Tags (comma separated)"
              value={form.tagsInput}
              onChange={(event) => setForm((prev) => ({ ...prev, tagsInput: event.target.value }))}
            />

            <div className="rounded-xl border border-slate-700 bg-panelAlt p-2">
              <div className="mb-2 flex flex-wrap gap-1">
                <EditorButton onClick={() => applyEditorCommand('bold')} icon={<Bold className="h-4 w-4" />} label="Bold" />
                <EditorButton onClick={() => applyEditorCommand('italic')} icon={<Italic className="h-4 w-4" />} label="Italic" />
                <EditorButton onClick={() => applyEditorCommand('underline')} icon={<Underline className="h-4 w-4" />} label="Underline" />
                <EditorButton
                  onClick={() => applyEditorCommand('formatBlock', 'h2')}
                  icon={<Heading2 className="h-4 w-4" />}
                  label="Heading"
                />
                <EditorButton onClick={() => applyEditorCommand('insertUnorderedList')} icon={<List className="h-4 w-4" />} label="Bullet List" />
                <EditorButton onClick={() => applyEditorCommand('insertOrderedList')} icon={<ListOrdered className="h-4 w-4" />} label="Numbered List" />
                <EditorButton
                  onClick={() => {
                    const link = window.prompt('Enter URL');
                    if (link) applyEditorCommand('createLink', link);
                  }}
                  icon={<LinkIcon className="h-4 w-4" />}
                  label="Link"
                />
              </div>

              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    contentHtml: (event.currentTarget as HTMLDivElement).innerHTML
                  }))
                }
                className="min-h-44 rounded-lg border border-slate-700 bg-panel px-3 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-slate-700 bg-panelAlt p-3">
              <div className="mb-2 flex items-center gap-2">
                <Camera className="h-4 w-4 text-glow" />
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Screenshots</p>
              </div>

              <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-600 bg-panel px-3 py-2 text-sm text-slate-100 hover:border-slate-500">
                <ImagePlus className="mr-2 h-4 w-4" />
                Upload images
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleScreenshotUpload} />
              </label>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <AnimatePresence>
                  {form.screenshots.map((image, index) => (
                    <motion.article
                      key={`${index}-${image.slice(0, 18)}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="relative overflow-hidden rounded-xl border border-white/10 bg-panel"
                    >
                      <img src={image} alt={`Upload ${index + 1}`} className="h-24 w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-md bg-black/70 p-1 text-white"
                        onClick={() => removeScreenshot(index)}
                        aria-label={`Remove screenshot ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingId ? 'Update Note' : 'Save Note'}
              </Button>
              {editingId !== null ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm({
                      ...defaultFormState,
                      dateKey: todayDateKey()
                    });
                    setErrorText('');
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </motion.form>

        <div className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <p className="text-sm text-slate-300">
              Total notes: <span className="font-semibold text-white">{allEntries.length}</span>
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Daily groups: <span className="font-semibold text-white">{entriesByDate.length}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${
                  activeTag === null
                    ? 'border-glow/60 bg-glow/10 text-white'
                    : 'border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                All tags
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(tag)}
                  className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${
                    activeTag?.toLowerCase() === tag.toLowerCase()
                      ? 'border-glow/60 bg-glow/10 text-white'
                      : 'border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <BookText className="h-4 w-4 text-glow" />
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Timeline</p>
            </div>

            <AnimatePresence mode="popLayout">
              {entriesByDate.length === 0 ? (
                <motion.article
                  key="empty-journal-list"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-dashed border-slate-700/80 bg-panel/60 p-5 text-center"
                >
                  <p className="text-sm text-slate-300">No journal entries yet. Add your first note.</p>
                </motion.article>
              ) : (
                entriesByDate.map(([dateKey, dateEntries]) => (
                  <motion.section
                    key={dateKey}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mb-4"
                  >
                    <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-400">{formatDateKey(dateKey)}</p>
                    <div className="space-y-2">
                      {dateEntries.map((entry) => (
                        <article key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-medium text-white">{entry.title || 'Untitled note'}</h3>
                              <p className="text-xs text-slate-400">{formatDateTime(entry.updatedAt)}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {entry.tags.map((tag) => (
                                <span
                                  key={`${entry.id}-${tag}`}
                                  className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div
                            className="prose prose-invert max-w-none text-sm prose-p:my-1 prose-headings:my-2 prose-a:text-cyan-300"
                            dangerouslySetInnerHTML={{ __html: entry.contentHtml || '<p></p>' }}
                          />

                          {entry.screenshots.length > 0 ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              {entry.screenshots.map((image, imageIndex) => (
                                <a
                                  key={`${entry.id}-screenshot-${imageIndex}`}
                                  href={image}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="overflow-hidden rounded-lg border border-white/10"
                                >
                                  <img src={image} alt={`Entry screenshot ${imageIndex + 1}`} className="h-20 w-full object-cover" />
                                </a>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button type="button" variant="secondary" className="px-3" onClick={() => startEdit(entry)}>
                              Edit
                            </Button>
                            <Button type="button" variant="ghost" className="px-3" onClick={() => removeEntry(entry.id)}>
                              Delete
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </motion.section>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

type EditorButtonProps = {
  onClick: () => void;
  icon: ReactNode;
  label: string;
};

function EditorButton({ onClick, icon, label }: EditorButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-lg border border-slate-700 bg-panel px-2 py-1 text-slate-200 transition hover:border-slate-500 hover:text-white"
    >
      {icon}
    </button>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
