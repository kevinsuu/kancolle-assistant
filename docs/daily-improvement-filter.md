# Daily Improvement Filter

KanColle Assistant opens KC3Kai's **Daily Improvements** page with KC3's existing
**Toggle improvable equipment** filter applied once by default. This keeps the initial list focused
on improvements that the current account can perform on the selected day. The toggle remains
available; clicking it again shows KC3's full daily list.

Directly below the weekday selector, KanColle Assistant adds an **Equipment type** row. It contains
an **All** button and only the KC3 equipment-category icons belonging to rows KC3 marks as
improvable. Categories that only occur on disabled, equipped, or insufficient rows are omitted.
Choose an icon to keep only that type of equipment visible. Changing the weekday resets the
category to **All**, and a long category list scrolls horizontally instead of widening the Strategy
Room page. Button labels follow KC3's English, Traditional Chinese, Simplified Chinese, or Japanese
locale.

KC3 marks an equipment row as disabled when the account does not own that equipment or does not
have one of the helper ships required for the selected day. The legacy theme renders those rows
with a pale red background and reduced opacity, which makes the complete row look gray. KC3 also
tracks equipped copies and insufficient resources or consumed equipment. The native toggle hides
those unavailable rows according to KC3's own inventory and configuration rules, so the shell does
not duplicate or reinterpret improvement requirements.

The equipment-type filter uses the `data-item_type3` category and configured icon that KC3 already
renders on each equipment row. It adds its own hidden class, so it composes with KC3's native
improvable-equipment toggle: an equipment row must pass both filters to remain visible. Returning
to **All** only clears the type filter and does not expose rows hidden by KC3.

The preload observes Strategy Room content because KC3 replaces the tab markup during navigation.
Each newly rendered Daily Improvements toggle is activated at most once. Later user clicks are not
overridden, and selecting another day or reopening the page applies the default to the newly
rendered view.
