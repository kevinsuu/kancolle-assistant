# Strategy Room Pinned Links

KanColle Assistant adds a `常用連結` section between the KC3 Strategy Room logo and its first
`提督` menu.
Hovering or focusing a Strategy Room tab reveals a pin button. All available tabs can be pinned,
with no fixed count limit and the newest pin first. Adding a pin keeps every existing link, and
opening a tab never changes the pinned order. Press the pin again to remove that tab from `常用連結`.
An unpinned tab shows a gray outline pin on hover. A pinned tab keeps a solid blue pin visible; when
hovered or keyboard-focused, that button turns red and shows a remove symbol before unpinning.

Selecting a pinned link delegates to the original KC3 or KanColle Assistant menu item so each page
continues to use its existing navigation behavior.

Only tab IDs are stored in the Strategy Room origin's `localStorage`. Labels are read from the live
menu so they follow the current KC3 language. Existing recent-link data is retained as the initial
pinned list. Tabs that are missing, disabled, or hidden are removed from the displayed pins. If
storage is unavailable, normal Strategy Room navigation continues without persistence.
Reloading restores the entire saved list, including lists longer than five tabs. Structured console
diagnostics record restored counts, pin actions and persistence outcomes, and storage failures.

The added section heading, empty state, accessible labels, and pin actions also follow KC3's
configured language. English (`en`), Traditional Chinese (`tcn`), Simplified Chinese (`scn`), and
Japanese (`jp`) are supported; unsupported language codes fall back to English. Reopen or reload
Strategy Room after changing KC3's language.

Pinned links support mouse, Enter, and Space activation. Before any tabs are pinned, the section
explains how to add one.
