# Theme personalization

KanColle Assistant keeps its existing preset themes and exposes appearance controls in the
dedicated `KanColle Assistant Settings → Theme` tab.

## Browser color

KanColle Assistant defaults to the `#514d56` browser color. Choose any existing theme to restore its
preset palette. To create a personal palette, use the color picker or enter a six-digit hexadecimal
value such as `#514d56`. KanColle Assistant selects the `custom` theme automatically and derives the
middle and dark browser-chrome shades from that color. Text switches between light and dark
automatically to retain contrast.

Dragging the color picker previews the palette in the settings page without repeatedly saving the
configuration or repainting every browser window. The selected color is applied globally after the
picker commits the selection.

Brightness remains independent from the browser color. `system`, `light`, and `dark` control the
settings and content surfaces as before.

## Settings icon

The default settings icon is `packages/shell/browser/ui/assets/icons/logo.png`. A replacement can
be uploaded from the Theme tab with these limits:

- PNG, JPEG, and WebP images are accepted.
- The image must be 2 MB or smaller.
- Square images provide the clearest result.

The replacement is stored in the local KanColle Assistant configuration and is applied to the
KanColle Assistant item in the settings sidebar, its preview, and the settings-page favicon. It
does not rewrite the packaged operating-system application icon (`.ico` or `.icns`). Select
`Use default` to remove the stored replacement and restore `logo.png`.

The packaged operating-system icon and the macOS Dock icon use the repository-level `logo.png`.
Changing the icon in Theme settings affects only the in-app surfaces listed above.
