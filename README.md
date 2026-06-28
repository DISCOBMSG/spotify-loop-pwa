# Spotify 3 Hour Loop PWA

This is a browser-only PWA. Each user enters their own Spotify Client ID.

## Local test

1. Add this Redirect URI in Spotify Developer Dashboard:

```text
http://127.0.0.1:5500/
```

2. Start a local server from this folder:

```powershell
python -m http.server 5500
```

3. Open:

```text
http://127.0.0.1:5500/
```

## Public deploy

Upload these files to GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

After deploy, add the public URL as a Spotify Redirect URI. Example:

```text
https://yourname.github.io/spotify-loop-pwa/
```

Users must create their own Spotify Developer app and paste their own Client ID.

## Notes

- Client Secret is not used.
- Spotify login uses Authorization Code with PKCE.
- If track-duration lookup is blocked by Spotify, enter lengths manually.
