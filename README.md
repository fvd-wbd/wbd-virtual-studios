# TNT Sports Virtual Studio Viewer

A Three.js catalog and immersive viewer for Warner Bros. Discovery TNT Sports virtual studios. It supports pointer and touch navigation, zoom controls, and WebXR headsets.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Upload an equirectangular 360 image using the upload panel, then drag to look around and scroll to zoom.

On supported phones, open a panorama and tap **Phone motion** to look around by rotating the device. iPhone and iPad users must approve the browser motion permission. Motion sensors require HTTPS outside `localhost`; touch drag remains available when motion mode is off or unsupported.

## Add a studio

Install and initialize [Git LFS](https://git-lfs.com/) once before adding studio panoramas:

```bash
git lfs install
```

1. Add an equirectangular JPG, PNG, WEBP, or AVIF panorama to `public/images`.
2. Use a readable filename such as `atlanta_studio.png`. The catalog automatically displays it as `Atlanta Studio`.
3. Stage the image with `git add public/images/your_studio.png`. Files in this directory are tracked automatically by Git LFS.
4. Run `npm run dev`, or rebuild the deployed site with `npm run build`.

The Vite configuration generates `studios.json` from the folder contents. No JavaScript or HTML changes are needed when studios are added or removed.

The official TNT Sports fonts are loaded from `public/assets`. The current header uses a typographic TNT Sports lockup because no official logo artwork is stored in the project.

## First-person 3D studio

The catalog links to `/model-viewer/`, a desktop first-person view of the exported Blender environment. Click **Enter studio**, move the mouse to look around, use **W**, **A**, **S**, and **D** to walk, and press **Escape** to release the mouse. Collision and gravity keep the camera on the studio floor and stop it at scene geometry.

The browser loads `public/models/virtual_studio.glb`; the Blender `.blend` file is authoring source and is not included in the site. GLB files in `public/models` are tracked by Git LFS, so install LFS before staging a replacement model:

```bash
git lfs install
git add public/models/virtual_studio.glb
```

Run `npm run dev` and open `/model-viewer/` to test the model directly. The first version requires a desktop or laptop with a mouse and keyboard.

## Private upload preview

Open `/upload/` and choose or drop a panorama up to 50 MB. The file is loaded directly in the browser, is never sent to a server, and is not added to the public catalog. It is discarded when the page closes or reloads.

## Quest 2 VR mode

Open a studio in Quest Browser and use the `ENTER VR` button. Immersive WebXR requires a secure context, so deploy the app over HTTPS or use a secure development tunnel. A plain LAN URL such as `http://192.168.x.x:5173` will not normally allow VR sessions. `localhost` is useful for desktop testing, but it is not the URL to use from the headset.

## Publish with GitHub Pages

1. Create a new GitHub repository, then push this project to its `main` branch:

```bash
git init
git add .
git commit -m "Create TNT Sports virtual studio viewer"
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
