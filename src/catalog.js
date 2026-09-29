import './tnt.css';

const grid = document.querySelector('#studio-grid');
const count = document.querySelector('#studio-count');
const manifestUrl = new URL(/* @vite-ignore */ '../studios.json', import.meta.url);

function renderEmptyState(message) {
  grid.innerHTML = `
    <div class="empty-state">
      <span class="empty-index">00</span>
      <h2>No studios available</h2>
      <p>${message}</p>
    </div>
  `;
  grid.setAttribute('aria-busy', 'false');
  count.textContent = '0';
}

function createStudioCard(studio, index) {
  const article = document.createElement('article');
  article.className = 'studio-card';
  article.style.setProperty('--order', index);

  const link = document.createElement('a');
  const viewerUrl = new URL('viewer/', manifestUrl);
  viewerUrl.searchParams.set('studio', studio.id);
  link.href = viewerUrl.href;
  link.setAttribute('aria-label', `Explore ${studio.name} in 360 degrees`);

  const image = document.createElement('img');
  image.src = new URL(studio.image, manifestUrl).href;
  image.alt = '';
  image.loading = index < 2 ? 'eager' : 'lazy';
  image.decoding = 'async';

  const number = document.createElement('span');
  number.className = 'studio-number';
  number.textContent = String(index + 1).padStart(2, '0');

  const details = document.createElement('span');
  details.className = 'studio-details';
  const title = document.createElement('strong');
  title.textContent = studio.name;
  const action = document.createElement('span');
  action.textContent = 'Explore in 360 ';
  const arrow = document.createElement('b');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '\u2197';
  action.append(arrow);
  details.append(title, action);

  link.append(image, number, details);
  article.append(link);
  return article;
}

async function loadStudios() {
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);

    const studios = await response.json();
    if (!Array.isArray(studios) || studios.length === 0) {
      renderEmptyState('Add an equirectangular image to public/images and rebuild the site.');
      return;
    }

    const fragment = document.createDocumentFragment();
    studios.forEach((studio, index) => fragment.append(createStudioCard(studio, index)));
    grid.replaceChildren(fragment);
    grid.setAttribute('aria-busy', 'false');
    count.textContent = String(studios.length).padStart(2, '0');
  } catch (error) {
    console.error(error);
    renderEmptyState('The studio catalog could not be loaded. Please refresh and try again.');
  }
}

loadStudios();
