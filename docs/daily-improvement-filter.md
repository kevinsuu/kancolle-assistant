# Daily Improvement Filter

KanColle Assistant opens KC3Kai's **Daily Improvements** page with KC3's existing
**Toggle improvable equipment** filter applied once by default. This keeps the initial list focused
on improvements that the current account can perform on the selected day. The toggle remains
available; clicking it again shows KC3's full daily list.

KC3 marks an equipment row as disabled when the account does not own that equipment or does not
have one of the helper ships required for the selected day. The legacy theme renders those rows
with a pale red background and reduced opacity, which makes the complete row look gray. KC3 also
tracks equipped copies and insufficient resources or consumed equipment. The native toggle hides
those unavailable rows according to KC3's own inventory and configuration rules, so the shell does
not duplicate or reinterpret improvement requirements.

The preload observes Strategy Room content because KC3 replaces the tab markup during navigation.
Each newly rendered Daily Improvements toggle is activated at most once. Later user clicks are not
overridden, and selecting another day or reopening the page applies the default to the newly
rendered view.
