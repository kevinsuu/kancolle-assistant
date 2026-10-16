# Daily Improvement Filter

KanColle Assistant opens KC3Kai's **Daily Improvements** page with KC3's full list for the selected
day visible by default. This includes unavailable rows, which KC3 marks as disabled, equipped, or
insufficient. KC3's **Toggle improvable equipment** control remains available when you want to hide
those rows.

KC3 supplies the equipment rows and weekday availability. KanColle Assistant builds its category
filter from every row KC3 renders for the selected day and does not maintain a separate schedule
catalog.

Directly below the weekday selector, KanColle Assistant adds an **Equipment type** row. It contains
an **All** button and every equipment category present in KC3's list for that day, including
categories that only occur on unavailable rows. Choose an icon to keep only that type of equipment
visible. Changing the weekday resets the category to **All**, and a long category list scrolls
horizontally instead of widening the Strategy Room page. Button labels follow KC3's English,
Traditional Chinese, Simplified Chinese, or Japanese locale.

KC3 marks an equipment row as disabled when the account does not own that equipment or does not
have one of the helper ships required for the selected day. The legacy theme renders those rows
with a pale red background and reduced opacity, which makes the complete row look gray. KC3 also
tracks equipped copies and insufficient resources or consumed equipment. The native toggle hides
those unavailable rows according to KC3's own inventory and configuration rules, so the shell does
not duplicate or reinterpret improvement requirements.

The equipment-type filter uses the `data-item_type3` category and configured icon that KC3 already
renders on each equipment row. It adds its own hidden class, so it composes with KC3's native
improvable-equipment toggle: an equipment row must pass both filters to remain visible. Returning
to **All** clears only the type filter; the KC3 toggle continues to control whether unavailable
rows are visible.

The preload observes Strategy Room content because KC3 replaces the tab markup during navigation.
It only mounts the category filter; it does not change the state of KC3's native availability
toggle. Later user clicks remain in effect, and changing the day or reopening the page rebuilds the
category buttons from that day's KC3 rows.
