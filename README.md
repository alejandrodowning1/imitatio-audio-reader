# Imitatio Web

A static, installable web companion for the Imitatio iPhone app. It streams the LibriVox recordings from Internet Archive when online; readers can explicitly download the 16 MP3s (about 405 MB) into browser storage for offline playback. The reader text and all word-level timing data are generated from the bundled Pohl text and alignment files.

## Preview on this Mac

From the repository root, run:

```sh
python3 -m http.server 8000 --directory Web
```

Then open `http://localhost:8000`. Service workers and installable PWAs require HTTPS outside localhost.

## Share it free with GitHub Pages

1. Create a new **public** repository on GitHub for the web version.
2. Upload the **contents of this `Web` folder** to the repository root (include `data/book.json`; do not upload the much larger iPhone project/audio folder).
3. In that repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
4. When GitHub Pages publishes the site, open its HTTPS URL on iPhone in Safari and choose **Share → Add to Home Screen**.
5. Open the installed web app while online, tap **Download for offline**, and keep it open until all 16 recordings finish. After that, the cached reader and saved recordings can be used without a connection on that device.

The audio files are streamed from Internet Archive and stored only on the reader’s device after download. Browser storage availability varies; the app displays an estimate before downloading. iOS may remove website data under storage pressure, so retain the original public link and download again if needed.
