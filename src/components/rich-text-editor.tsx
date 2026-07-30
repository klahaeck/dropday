"use client";

import { Bold, Italic, List } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useRef,
  type ClipboardEvent,
  type ForwardedRef,
} from "react";

type RichTextEditorProps = {
  id: string;
  labelledBy: string;
  toolbarLabel: string;
  placeholder: string;
  initialHtml?: string;
  compact?: boolean;
  required?: boolean;
  onValueChange: (html: string, text: string) => void;
};

function assignRef(ref: ForwardedRef<HTMLDivElement>, editor: HTMLDivElement | null) {
  if (typeof ref === "function") {
    ref(editor);
  } else if (ref) {
    ref.current = editor;
  }
}

function insertPlainText(editor: HTMLDivElement, text: string) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;

  if (!range || !editor.contains(range.commonAncestorContainer)) {
    editor.append(document.createTextNode(text));
    return;
  }

  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export const RichTextEditor = forwardRef<HTMLDivElement, RichTextEditorProps>(function RichTextEditor({
  id,
  labelledBy,
  toolbarLabel,
  placeholder,
  initialHtml = "",
  compact = false,
  required = false,
  onValueChange,
}, forwardedRef) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  // The browser owns the editable DOM after mount. Keeping this exact object
  // stable prevents React from restoring the initial HTML after every input
  // state update, which would move the caret and discard newly typed text.
  const initialContent = useRef({ __html: initialHtml }).current;
  const setEditorRef = useCallback((editor: HTMLDivElement | null) => {
    editorRef.current = editor;
    assignRef(forwardedRef, editor);
  }, [forwardedRef]);

  function updateValue() {
    const editor = editorRef.current;
    if (!editor) return;
    onValueChange(editor.innerHTML, editor.innerText);
  }

  function format(command: "bold" | "italic" | "insertUnorderedList") {
    editorRef.current?.focus();
    document.execCommand(command, false);
    updateValue();
  }

  function paste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) return;

    const text = event.clipboardData.getData("text/plain");
    const inserted = typeof document.execCommand === "function"
      && document.execCommand("insertText", false, text);
    if (!inserted) insertPlainText(editor, text);
    updateValue();
  }

  return <div className="rich-text-shell">
    <div className="rich-text-toolbar" role="toolbar" aria-label={toolbarLabel}>
      <button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => format("bold")}><Bold size={16} /></button>
      <button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => format("italic")}><Italic size={16} /></button>
      <button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => format("insertUnorderedList")}><List size={16} /></button>
    </div>
    <div
      ref={setEditorRef}
      id={id}
      className={`rich-text-editor${compact ? " rich-text-editor-compact" : ""}`}
      contentEditable
      role="textbox"
      aria-labelledby={labelledBy}
      aria-multiline="true"
      aria-required={required || undefined}
      data-placeholder={placeholder}
      onInput={updateValue}
      onPaste={paste}
      suppressContentEditableWarning
      dangerouslySetInnerHTML={initialContent}
    />
  </div>;
});
