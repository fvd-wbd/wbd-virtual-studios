import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';

const supportedImage = /\.(?:jpe?g|png|webp|avif)$/i;

function formatStudioName(filename) {
  const basename = path.parse(filename).name;
  return basename
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/virtualstudio/gi, 'virtual studio')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function createStudioManifest(root) {
  const imagesDirectory = path.join(root, 'public', 'images');
  let filenames = [];

  try {
    filenames = await readdir(imagesDirectory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return filenames
    .filter((filename) => supportedImage.test(filename))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((filename) => ({
      id: path.parse(filename).name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: formatStudioName(filename),
      filename,
      image: `images/${encodeURIComponent(filename)}`,
    }));
}

function studioManifestPlugin() {
  let projectRoot;

  return {
    name: 'studio-manifest',
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/studios.json', async (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(await createStudioManifest(projectRoot)));
      });
    },
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'studios.json',
        source: JSON.stringify(await createStudioManifest(projectRoot), null, 2),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [studioManifestPlugin()],
  build: {
    rollupOptions: {
      input: {
        catalog: path.resolve('index.html'),
        viewer: path.resolve('viewer/index.html'),
        upload: path.resolve('upload/index.html'),
      },
    },
  },
});
