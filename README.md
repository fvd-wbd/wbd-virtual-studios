# Horizon 360 Viewer

A lightweight Three.js panorama viewer with local image upload and drag-and-drop support.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Upload an equirectangular 360 image using the upload panel, then drag to look around and scroll to zoom.

## Quest 2 VR mode

Open the viewer in Quest Browser and use the `ENTER VR` button. Immersive WebXR requires a secure context, so deploy the app over HTTPS or use a secure development tunnel. A plain LAN URL such as `http://192.168.x.x:5173` will not normally allow VR sessions. `localhost` is useful for desktop testing, but it is not the URL to use from the headset.

## Publish with GitHub Pages

1. Create a new GitHub repository, then push this project to its `main` branch:

```bash
git init
git add .
git commit -m "Create Horizon 360 viewer"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

2. In GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Wait for the **Deploy to GitHub Pages** workflow to finish.
4. Open the displayed Pages URL in Quest Browser:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

The included workflow rebuilds and republishes the site whenever you push to `main`. Uploaded panoramas remain local to the current browser session; GitHub Pages does not store them.
