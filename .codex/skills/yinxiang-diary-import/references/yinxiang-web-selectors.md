# Yinxiang Web Selectors

Use these selectors as hints only; verify against the live DOM before clicking.

- Left sidebar notebooks button: `#gwt-debug-Sidebar-notebooksButton`
- Left notebook drawer root: `#gwt-debug-NotebooksDrawerView-root`
- Notebook rows in the drawer: `.qa-notebookWidget`
- Current notebook header: `#gwt-debug-NotebookHeader-name`
- Note list scroll area: `.NotesView-ScrollWindow`
- Note rows: `.focus-NotesView-Note`
- Note row title: `.qa-title`
- Current note title input: `#gwt-debug-NoteTitleView-textBox`
- Editor body frame: `iframe.RichTextArea-entinymce`

Important: do not use `#gwt-debug-NotebookSelectMenu-root` for month navigation. That control changes the selected note's notebook.

The note list is virtualized. Rows may exist in the DOM outside the visible viewport. Click only rows with onscreen coordinates. If a boundary day is missing, scroll slightly so the row's `y` coordinate is inside the viewport, then click it.
