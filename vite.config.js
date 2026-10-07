import { readdir, writeFile } from 'node:fs/promises';
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

const supportedModel = /\.glb$/i;

async function createModelManifest(root) {
  let filenames = [];

  try {
    filenames = await readdir(path.join(root, 'public', 'models'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return filenames
    .filter((filename) => supportedModel.test(filename))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((filename) => {
      const basename = path.parse(filename).name;
      const poster = filenames.find((file) => supportedImage.test(file) && path.parse(file).name === basename);
      return {
        id: basename.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: formatStudioName(filename),
        filename,
        model: `models/${encodeURIComponent(filename)}`,
        poster: poster ? `models/${encodeURIComponent(poster)}` : null,
      };
    });
}

const maxPosterBytes = 5 * 1024 * 1024;

async function saveModelPoster(root, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405;
    response.end();
    return;
  }

  const modelId = new URL(request.url, 'http://localhost').searchParams.get('model');
  const model = (await createModelManifest(root)).find((item) => item.id === modelId);
  if (!model) {
    response.statusCode = 404;
    response.end();
    return;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxPosterBytes) {
      response.statusCode = 413;
      response.end();
      return;
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);
  if (body[0] !== 0xff || body[1] !== 0xd8) {
    response.statusCode = 415;
    response.end();
    return;
  }

  const posterName = `${path.parse(model.filename).name}.jpg`;
  await writeFile(path.join(root, 'public', 'models', posterName), body);
  response.statusCode = 204;
  response.end();
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
      server.middlewares.use('/models.json', async (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(await createModelManifest(projectRoot)));
      });
      server.middlewares.use('/__model-poster', (request, response, next) => {
        saveModelPoster(projectRoot, request, response).catch(next);
      });
    },
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'studios.json',
        source: JSON.stringify(await createStudioManifest(projectRoot), null, 2),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'models.json',
        source: JSON.stringify(await createModelManifest(projectRoot), null, 2),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [studioManifestPlugin()],
  server: {
    // Windows locks large GLBs during export/scans, which crashes the watcher; restart dev after adding a model.
    watch: { ignored: ['**/public/models/*.glb'] },
  },
  build: {
    rollupOptions: {
      input: {
        catalog: path.resolve('index.html'),
        viewer: path.resolve('viewer/index.html'),
        upload: path.resolve('upload/index.html'),
        modelViewer: path.resolve('model-viewer/index.html'),
      },
    },
  },
});
