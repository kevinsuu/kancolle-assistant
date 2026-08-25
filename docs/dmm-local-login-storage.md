# DMM local login storage

KanColle Assistant keeps the Electron browser profile under its configured user-data location. DMM
session cookies, including a server-issued persistent "stay signed in" cookie, therefore survive
app restarts and packaged-app updates until DMM expires or revokes them.

When a DMM login form is submitted, KanColle Assistant asks before saving the account and password.
The saved credential has the following constraints:

- It is stored outside the executable under `userdata/secure-storage/dmm-login.json`.
- Its complete payload is encrypted with Electron `safeStorage`. Windows uses protection tied to
  the current Windows user; macOS uses Keychain. Linux storage is disabled when only the insecure
  `basic_text` backend is available.
- It is only decrypted for the top-level HTTPS login page on the exact `accounts.dmm.com` host.
- It fills the login fields but never submits the form automatically.
- It is never written to the regular KanColle Assistant configuration or application logs.

The encrypted file is not portable between operating-system accounts. Anyone who can run code as
the same signed-in OS user may still be able to access the credential, so the OS account should use
a password and normal device encryption. To remove the saved credential, close KanColle Assistant
and delete `userdata/secure-storage/dmm-login.json`, or remove the configured KanColle Assistant
user-data directory to also clear cookies and other browser profile data.

## Regional access handling

DMM determines regional availability from the connection used to load its pages. KCCacheProxy
only handles KanColle game-server traffic and does not change the public IP used by DMM.

When DMM redirects a tab to `https://special.dmm.com/not-available-in-your-region/`, KanColle
Assistant shows an actionable warning. A user who already has access to an authorized HTTP/HTTPS
forward proxy can configure it with Proxy mode `all-external`. Applying or clearing proxy settings
reloads Electron's proxy configuration, closes pooled connections, and retries tabs currently on
the DMM regional error page.

Proxy credentials are intentionally unsupported by this setting because regular application
configuration is not an appropriate place to store them. KanColle Assistant does not bundle,
discover, or recommend public proxies; DMM credentials should only be sent through a trusted
endpoint.
