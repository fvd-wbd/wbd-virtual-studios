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

Every `.glb` in `public/models` appears automatically as a card in the **Explore in 3D** section, the same way panoramas do. To add an environment:

1. Export the Blender scene as GLB to `public/models`, for example `public/models/my_studio.glb`. The card is named `My Studio`.
2. Optionally add a thumbnail with the same base name, such as `public/models/my_studio.jpg` (JPG, PNG, WEBP, or AVIF). If there is none, opening the model once with `npm run dev` saves a snapshot of the starting view as `my_studio.jpg`. To replace it with a better angle, walk to the spot in the dev viewer and press **P**. Commit the generated JPG so it appears in the deployed site.
3. Optionally add an Empty named `PlayerSpawn` in Blender to set where the player starts.
4. Stage the model with Git LFS and rebuild:

```bash
git lfs install
git add public/models/my_studio.glb
```

The Blender `.blend` file is authoring source and is not included in the site. The 3D viewer requires a desktop or laptop with a mouse and keyboard, or a WebXR headset.

### 3D studios on Quest 3

Open a 3D studio in Quest Browser over HTTPS (for example the GitHub Pages URL) and select **Enter VR**. Look around with your head, walk with the **left thumbstick** in the direction you are facing, and **flick the right thumbstick** to snap-turn 30°. Collision, gravity, and `PlayerSpawn` work the same as on desktop, and the view uses your real eye height. The **Enter VR** button only appears in browsers that support immersive VR.

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
