const COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#000000' },
  { name: 'Pink', value: '#ff28ff' },
  { name: 'Cyan', value: '#5fe6eb' },
  { name: 'Yellow', value: '#ffd60a' },
  { name: 'Red', value: '#ff3b30' },
  { name: 'Green', value: '#34c759' },
  { name: 'Blue', value: '#0a84ff' },
];

const FONTS = [
  { name: 'Modern', family: "'TNT Sports Sans', 'Arial Narrow', Arial, sans-serif", weight: 700 },
  { name: 'Classic', family: "Georgia, 'Times New Roman', serif", weight: 400 },
  { name: 'Typewriter', family: "'Courier New', Courier, monospace", weight: 700 },
  { name: 'Strong', family: "Impact, 'Arial Black', sans-serif", weight: 400 },
  { name: 'Marker', family: "'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive", weight: 700 },
];

const PEN_SIZE = { min: 3, max: 40 };
const TEXT_SIZE = { min: 18, max: 96 };
const TEXT_SHADOW = { color: 'rgba(0, 0, 0, 0.45)', blur: 6, offsetY: 1 };

const ICONS = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>',
  pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>',
  rect: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1"/></svg>',
  circle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H9l-5-5a2 2 0 010-2.8L13.2 3a2 2 0 012.8 0L21 8a2 2 0 010 2.8L11 20"/><path d="M7 10l7 7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
};

const editableMode = (() => {
  const probe = document.createElement('div');
  try {
    probe.contentEditable = 'plaintext-only';
  } catch {
    return 'true';
  }
  return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
})();

function lerp(range, t) {
  return range.min + (range.max - range.min) * t;
}

function contrastColor(hex) {
  const value = parseInt(hex.slice(1), 16);
  const brightness = ((value >> 16) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
  return brightness > 150 ? '#000000' : '#ffffff';
}

function fontString(font, size) {
  return `${font.weight} ${size}px ${font.family}`;
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function constrainSquare(start, end) {
  const side = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  return {
    x: start.x + Math.sign(end.x - start.x || 1) * side,
    y: start.y + Math.sign(end.y - start.y || 1) * side,
  };
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Shapes are outlines, so only the border (plus some slack for fingers) counts as a hit.
function hitStroke(stroke, p) {
  const tolerance = stroke.size / 2 + 10;
  const { points } = stroke;

  if (stroke.shape === 'pen') {
    if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y) <= tolerance;
    for (let i = 1; i < points.length; i += 1) {
      if (distanceToSegment(p, points[i - 1], points[i]) <= tolerance) return true;
    }
    return false;
  }

  const [start, end] = points;
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  const inOuter = p.x >= x - tolerance && p.x <= x + w + tolerance && p.y >= y - tolerance && p.y <= y + h + tolerance;
  if (!inOuter) return false;

  if (stroke.shape === 'rect') {
    const inInner = p.x > x + tolerance && p.x < x + w - tolerance && p.y > y + tolerance && p.y < y + h - tolerance;
    return !inInner;
  }

  const rx = w / 2;
  const ry = h / 2;
  if (rx < tolerance || ry < tolerance) return true;
  const dx = p.x - (x + rx);
  const dy = p.y - (y + ry);
  const distance = Math.hypot(dx, dy);
  if (!distance) return Math.min(rx, ry) <= tolerance;
  const radius = distance / Math.hypot(dx / rx, dy / ry);
  return Math.abs(distance - radius) <= tolerance;
}

function drawStroke(ctx, stroke) {
  const { points } = stroke;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (stroke.shape !== 'pen') {
    const [start, end] = points;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    if (stroke.shape === 'rect') ctx.rect(x, y, w, h);
    else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  if (points.length === 1) {
    ctx.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function createAnnotator({ captureFrame, getLabel, onOpen, onClose, showToast }) {
  const layer = document.createElement('div');
  layer.className = 'annotate-layer is-hidden';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-label', 'Add comments');
  layer.innerHTML = `
    <canvas class="annotate-backdrop" aria-hidden="true"></canvas>
    <canvas class="annotate-ink" aria-label="Drawing surface"></canvas>
    <div class="annotate-texts"><div class="annotate-dim"></div></div>
    <div class="annotate-top">
      <div class="annotate-actions" data-when="idle">
        <button class="annotate-round" type="button" data-action="cancel" aria-label="Discard comments">${ICONS.close}</button>
        <button class="annotate-round" type="button" data-action="undo" aria-label="Undo">${ICONS.undo}</button>
      </div>
      <button class="annotate-round annotate-style" type="button" data-action="style" data-when="edit" aria-label="Text background" aria-pressed="false"><span>A</span></button>
      <button class="annotate-save" type="button" data-action="save" data-when="idle">Save feedback</button>
      <button class="annotate-save" type="button" data-action="done" data-when="edit">Done</button>
    </div>
    <div class="annotate-tools" data-when="idle">
      <button class="annotate-round" type="button" data-action="tool" data-tool="pen" aria-label="Draw" title="Draw">${ICONS.pen}</button>
      <button class="annotate-round" type="button" data-action="tool" data-tool="rect" aria-label="Box" title="Box">${ICONS.rect}</button>
      <button class="annotate-round" type="button" data-action="tool" data-tool="circle" aria-label="Circle" title="Circle">${ICONS.circle}</button>
      <button class="annotate-round annotate-aa" type="button" data-action="tool" data-tool="text" aria-label="Add text" title="Add text">Aa</button>
      <button class="annotate-round" type="button" data-action="tool" data-tool="eraser" aria-label="Eraser" title="Eraser">${ICONS.eraser}</button>
    </div>
    <div class="annotate-fonts" data-when="edit">
      ${FONTS.map((font, index) => `<button type="button" data-font="${index}" style="font-family:${font.family.replace(/"/g, '&quot;')};font-weight:${font.weight}">${font.name}</button>`).join('')}
    </div>
    <div class="annotate-colors">
      ${COLORS.map((color) => `<button class="annotate-swatch" type="button" data-color="${color.value}" style="--swatch:${color.value}" aria-label="${color.name}"></button>`).join('')}
    </div>
    <div class="annotate-size"><input type="range" min="0" max="100" step="1" aria-label="Size" /></div>
    <div class="annotate-trash" aria-hidden="true">${ICONS.trash}</div>
    <div class="annotate-size-preview" aria-hidden="true"></div>
    <p class="annotate-hint">Draw, add a box or circle, or tap <b>Aa</b> for text</p>
  `;
  document.body.append(layer);

  const backdrop = layer.querySelector('.annotate-backdrop');
  const ink = layer.querySelector('.annotate-ink');
  const inkCtx = ink.getContext('2d');
  const textLayer = layer.querySelector('.annotate-texts');
  const dim = layer.querySelector('.annotate-dim');
  const sizeInput = layer.querySelector('.annotate-size input');
  const sizePreview = layer.querySelector('.annotate-size-preview');
  const trash = layer.querySelector('.annotate-trash');
  const hint = layer.querySelector('.annotate-hint');
  const saveButton = layer.querySelector('[data-action="save"]');
  const undoButton = layer.querySelector('[data-action="undo"]');
  const toolButtons = [...layer.querySelectorAll('[data-tool]')];
  const styleButton = layer.querySelector('[data-action="style"]');
  const swatches = [...layer.querySelectorAll('[data-color]')];
  const fontChips = [...layer.querySelectorAll('[data-font]')];

  let isOpen = false;
  let width = 0;
  let height = 0;
  let scale = 1;
  let maxTextWidth = 0;
  let tool = 'pen';
  let color = '#ff28ff';
  let penSize = 8;
  let textSize = 36;
  let fontIndex = 0;
  let strokes = [];
  let texts = [];
  let actions = [];
  let currentStroke = null;
  let editing = null;
  let drag = null;
  let shapeDrag = null;
  let erasingPointer = null;
  let suppressClick = false;
  let redrawQueued = false;

  const drawsInk = () => tool === 'pen' || tool === 'rect' || tool === 'circle';

  function pointFrom(event) {
    const rect = ink.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function redrawInk() {
    redrawQueued = false;
    inkCtx.clearRect(0, 0, width, height);
    strokes.forEach((stroke) => drawStroke(inkCtx, stroke));
  }

  function requestRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    window.requestAnimationFrame(redrawInk);
  }

  function syncControls() {
    swatches.forEach((swatch) => {
      const active = swatch.dataset.color === color;
      swatch.classList.toggle('is-active', active);
      swatch.setAttribute('aria-pressed', String(active));
    });
    fontChips.forEach((chip) => chip.classList.toggle('is-active', Number(chip.dataset.font) === fontIndex));

    const textTarget = editing || tool === 'text';
    const range = textTarget ? TEXT_SIZE : PEN_SIZE;
    const value = editing ? editing.size : textTarget ? textSize : penSize;
    sizeInput.value = String(Math.round(((value - range.min) / (range.max - range.min)) * 100));

    toolButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)));
    styleButton.setAttribute('aria-pressed', String(Boolean(editing?.boxed)));
    undoButton.disabled = actions.length === 0;
    layer.dataset.activeTool = tool;
  }

  function hideHint() {
    hint.classList.add('is-hidden');
  }

  function showSizePreview() {
    sizePreview.style.width = `${penSize}px`;
    sizePreview.style.height = `${penSize}px`;
    sizePreview.style.background = color;
    sizePreview.classList.add('visible');
    window.clearTimeout(showSizePreview.timeout);
    showSizePreview.timeout = window.setTimeout(() => sizePreview.classList.remove('visible'), 600);
  }

  function applyTextStyle(item) {
    const font = FONTS[item.fontIndex];
    const { style } = item.el;
    style.fontFamily = font.family;
    style.fontWeight = String(font.weight);
    style.fontSize = `${item.size}px`;
    style.background = item.boxed ? item.color : 'transparent';
    style.color = item.boxed ? contrastColor(item.color) : item.color;
    style.textShadow = item.boxed ? 'none' : `0 ${TEXT_SHADOW.offsetY}px ${TEXT_SHADOW.blur}px ${TEXT_SHADOW.color}`;
  }

  function positionText(item) {
    item.el.style.left = `${item.x}px`;
    item.el.style.top = `${item.y}px`;
  }

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function startEditing(item) {
    if (editing && editing !== item) finishEditing();
    editing = item;
    color = item.color;
    fontIndex = item.fontIndex;
    textSize = item.size;
    item.el.contentEditable = editableMode;
    item.el.classList.add('is-editing');
    layer.classList.add('is-editing');
    item.el.focus();
    placeCaretAtEnd(item.el);
    syncControls();
  }

  function removeText(item) {
    item.el.remove();
    texts = texts.filter((text) => text !== item);
    actions = actions.filter((action) => action.item !== item);
    if (editing === item) {
      editing = null;
      layer.classList.remove('is-editing');
    }
    syncControls();
  }

  function finishEditing() {
    if (!editing) return;
    const item = editing;
    editing = null;
    item.el.contentEditable = 'false';
    item.el.classList.remove('is-editing');
    layer.classList.remove('is-editing');
    item.el.blur();
    window.getSelection()?.removeAllRanges();
    if (!item.el.innerText.trim()) removeText(item);
    syncControls();
  }

  function isOverTrash(event) {
    const rect = trash.getBoundingClientRect();
    return Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2)) < 56;
  }

  function endDrag() {
    drag = null;
    layer.classList.remove('is-dragging-object');
    trash.classList.remove('is-over');
  }

  function eraseItem(kind, item) {
    const list = kind === 'text' ? texts : strokes;
    const index = list.indexOf(item);
    if (index === -1) return;
    list.splice(index, 1);
    if (kind === 'text') item.el.remove();
    else requestRedraw();
    actions.push({ type: 'erase', kind, item, index });
    hideHint();
    syncControls();
  }

  function restoreErased({ kind, item, index }) {
    if (kind === 'text') {
      texts.splice(index, 0, item);
      textLayer.append(item.el);
    } else {
      strokes.splice(index, 0, item);
      requestRedraw();
    }
  }

  function findTextAt(point) {
    const origin = ink.getBoundingClientRect();
    return [...texts].reverse().find((item) => {
      const rect = item.el.getBoundingClientRect();
      const x = point.x + origin.left;
      const y = point.y + origin.top;
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
  }

  function findStrokeAt(point, shapesOnly = false) {
    return [...strokes].reverse().find((stroke) => (!shapesOnly || stroke.shape !== 'pen') && hitStroke(stroke, point));
  }

  function eraseAt(point) {
    const text = findTextAt(point);
    if (text) {
      eraseItem('text', text);
      return;
    }
    const stroke = findStrokeAt(point);
    if (stroke) eraseItem('stroke', stroke);
  }

  function attachTextEvents(item) {
    const { el } = item;
    el.addEventListener('pointerdown', (event) => {
      if (editing === item) return;
      event.preventDefault();
      event.stopPropagation();
      if (tool === 'eraser') {
        eraseItem('text', item);
        return;
      }
      finishEditing();
      el.setPointerCapture(event.pointerId);
      drag = { item, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: item.x, originY: item.y, moved: false };
    });
    el.addEventListener('pointermove', (event) => {
      if (drag?.item !== item || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        layer.classList.add('is-dragging-object');
      }
      item.x =Math.min(Math.max(drag.originX + dx, 0), width);
      item.y = Math.min(Math.max(drag.originY + dy, 0), height);
      positionText(item);
      trash.classList.toggle('is-over', isOverTrash(event));
    });
    el.addEventListener('pointerup', (event) => {
      if (drag?.item !== item || event.pointerId !== drag.pointerId) return;
      const { moved, originX, originY } = drag;
      endDrag();
      if (!moved) startEditing(item);
      else if (isOverTrash(event)) removeText(item);
      else {
        actions.push({ type: 'move', item, from: { x: originX, y: originY } });
        syncControls();
      }
    });
    el.addEventListener('pointercancel', () => {
      if (drag?.item === item) endDrag();
    });
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishEditing();
      }
    });
    if (editableMode === 'true') {
      el.addEventListener('paste', (event) => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
      });
    }
  }

  function addText(point) {
    finishEditing();
    const el = document.createElement('div');
    el.className = 'annotate-text';
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-label', 'Comment text');
    el.spellcheck = false;
    const item = { el, x: point.x, y: point.y, color, fontIndex, size: textSize, boxed: false };
    texts.push(item);
    actions.push({ type: 'text', item });
    applyTextStyle(item);
    positionText(item);
    attachTextEvents(item);
    textLayer.append(el);
    hideHint();
    startEditing(item);
  }

  function undo() {
    finishEditing();
    const action = actions.pop();
    if (!action) return;
    if (action.type === 'erase') {
      restoreErased(action);
    } else if (action.type === 'move') {
      if (action.item.el) {
        Object.assign(action.item, action.from);
        positionText(action.item);
      } else {
        action.item.points = action.from;
        requestRedraw();
      }
    } else if (action.type === 'stroke') {
      strokes = strokes.filter((stroke) => stroke !== action.item);
      requestRedraw();
    } else {
      removeText(action.item);
    }
    syncControls();
  }

  function drawText(ctx, item) {
    const text = item.el.innerText.replace(/\n+$/, '');
    if (!text.trim()) return;
    const font = FONTS[item.fontIndex];
    ctx.font = fontString(font, item.size);
    const padX = item.size * 0.35;
    const padY = item.size * 0.12;
    const lineHeight = item.size * 1.2;
    const lines = wrapLines(ctx, text, maxTextWidth - padX * 2);
    const blockWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const blockHeight = lines.length * lineHeight;

    ctx.save();
    if (item.boxed) {
      const boxX = item.x - blockWidth / 2 - padX;
      const boxY = item.y - blockHeight / 2 - padY;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(boxX, boxY, blockWidth + padX * 2, blockHeight + padY * 2, item.size * 0.25);
      else ctx.rect(boxX, boxY, blockWidth + padX * 2, blockHeight + padY * 2);
      ctx.fill();
      ctx.fillStyle = contrastColor(item.color);
    } else {
      // Shadow values ignore the canvas transform, so scale them by hand.
      ctx.fillStyle = item.color;
      ctx.shadowColor = TEXT_SHADOW.color;
      ctx.shadowBlur = TEXT_SHADOW.blur * scale;
      ctx.shadowOffsetY = TEXT_SHADOW.offsetY * scale;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, index) => {
      ctx.fillText(line, item.x, item.y - blockHeight / 2 + lineHeight * (index + 0.5));
    });
    ctx.restore();
  }

  function exportImage() {
    const output = document.createElement('canvas');
    output.width = backdrop.width;
    output.height = backdrop.height;
    const ctx = output.getContext('2d');
    ctx.drawImage(backdrop, 0, 0);
    ctx.drawImage(ink, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    texts.forEach((item) => drawText(ctx, item));
    return new Promise((resolve, reject) => {
      output.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed.'))), 'image/png');
    });
  }

  function feedbackFilename() {
    const slug = (getLabel() || 'studio')
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'studio';
    return `feedback-${slug}-${timestamp()}.png`;
  }

  function open() {
    if (isOpen) return;
    onOpen();
    const source = captureFrame();
    if (!source.width || !source.height) {
      onClose();
      return;
    }
    width = window.innerWidth;
    height = window.innerHeight;
    scale = source.width / width;
    maxTextWidth = width - 48;

    backdrop.width = source.width;
    backdrop.height = source.height;
    backdrop.getContext('2d').drawImage(source, 0, 0);
    ink.width = source.width;
    ink.height = source.height;
    inkCtx.setTransform(scale, 0, 0, scale, 0, 0);
    [backdrop, ink, textLayer].forEach((el) => {
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
    });
    layer.style.setProperty('--max-text-width', `${maxTextWidth}px`);

    strokes = [];
    texts.forEach((item) => item.el.remove());
    texts = [];
    actions = [];
    currentStroke = null;
    shapeDrag = null;
    erasingPointer = null;
    editing = null;
    tool = 'pen';
    redrawInk();
    hint.classList.remove('is-hidden');
    layer.classList.remove('is-editing', 'is-dragging-object');
    layer.classList.remove('is-hidden');
    isOpen = true;
    syncControls();
  }

  function close() {
    if (!isOpen) return;
    finishEditing();
    endDrag();
    isOpen = false;
    layer.classList.add('is-hidden');
    texts.forEach((item) => item.el.remove());
    texts = [];
    strokes = [];
    actions = [];
    onClose();
  }

  async function save() {
    finishEditing();
    saveButton.disabled = true;
    try {
      await document.fonts?.ready;
      downloadBlob(await exportImage(), feedbackFilename());
      close();
      showToast('Feedback saved as PNG.');
    } catch (error) {
      console.error(error);
      showToast('Feedback could not be saved. Try again.');
    } finally {
      saveButton.disabled = false;
    }
  }

  function cancel() {
    if (actions.length && !window.confirm('Discard your comments and return to the 360 view?')) return;
    close();
  }

  function removeStroke(stroke) {
    strokes = strokes.filter((item) => item !== stroke);
    actions = actions.filter((action) => action.item !== stroke);
    syncControls();
    requestRedraw();
  }

  ink.addEventListener('pointerdown', (event) => {
    if (currentStroke || shapeDrag || erasingPointer !== null) return;
    const start = pointFrom(event);

    if (tool === 'eraser') {
      event.preventDefault();
      ink.setPointerCapture(event.pointerId);
      erasingPointer = event.pointerId;
      eraseAt(start);
      return;
    }

    // Grabbing an existing box or circle moves it instead of drawing.
    const shape = findStrokeAt(start, true);
    if (shape) {
      event.preventDefault();
      ink.setPointerCapture(event.pointerId);
      shapeDrag = { stroke: shape, pointerId: event.pointerId, start, origin: shape.points.map((p) => ({ ...p })), moved: false };
      suppressClick = true;
      return;
    }

    if (tool === 'text') return;
    event.preventDefault();
    ink.setPointerCapture(event.pointerId);
    const points = tool === 'pen' ? [start] : [start, start];
    currentStroke = { pointerId: event.pointerId, shape: tool, color, size: penSize, points };
    strokes.push(currentStroke);
    actions.push({ type: 'stroke', item: currentStroke });
    hideHint();
    syncControls();
    requestRedraw();
  });
  ink.addEventListener('pointermove', (event) => {
    if (shapeDrag?.pointerId === event.pointerId) {
      const point = pointFrom(event);
      const dx = point.x - shapeDrag.start.x;
      const dy = point.y - shapeDrag.start.y;
      if (!shapeDrag.moved && Math.hypot(dx, dy) < 4) return;
      if (!shapeDrag.moved) {
        shapeDrag.moved = true;
        layer.classList.add('is-dragging-object');
      }
      shapeDrag.stroke.points = shapeDrag.origin.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      trash.classList.toggle('is-over', isOverTrash(event));
      requestRedraw();
      return;
    }
    if (erasingPointer === event.pointerId) {
      eraseAt(pointFrom(event));
      return;
    }
    if (currentStroke?.pointerId !== event.pointerId) {
      // Hover feedback for mouse users: show what can be grabbed or erased.
      if (event.pointerType === 'mouse' && !currentStroke) {
        const point = pointFrom(event);
        const target = tool === 'eraser' ? findStrokeAt(point) : findStrokeAt(point, true);
        ink.classList.toggle('is-over-object', Boolean(target));
      }
      return;
    }
    if (currentStroke.shape === 'pen') {
      const coalesced = event.getCoalescedEvents?.() ?? [];
      (coalesced.length ? coalesced : [event]).forEach((item) => currentStroke.points.push(pointFrom(item)));
    } else {
      // Hold Shift for a perfect square or circle.
      const [start] = currentStroke.points;
      const end = pointFrom(event);
      currentStroke.points[1] = event.shiftKey ? constrainSquare(start, end) : end;
    }
    requestRedraw();
  });
  const endStroke = (event) => {
    if (shapeDrag?.pointerId === event.pointerId) {
      const { stroke, origin, moved } = shapeDrag;
      shapeDrag = null;
      layer.classList.remove('is-dragging-object');
      trash.classList.remove('is-over');
      if (!moved) return;
      if (event.type === 'pointerup' && isOverTrash(event)) {
        removeStroke(stroke);
      } else {
        actions.push({ type: 'move', item: stroke, from: origin });
        syncControls();
      }
      return;
    }
    if (erasingPointer === event.pointerId) {
      erasingPointer = null;
      return;
    }
    if (currentStroke?.pointerId !== event.pointerId) return;
    const stroke = currentStroke;
    currentStroke = null;
    if (stroke.shape === 'pen') return;
    // Drop shapes from a tap without a drag.
    const [start, end] = stroke.points;
    if (Math.abs(end.x - start.x) < 4 && Math.abs(end.y - start.y) < 4) removeStroke(stroke);
  };
  ink.addEventListener('pointerup', endStroke);
  ink.addEventListener('pointercancel', endStroke);
  // Text placement uses click so mobile browsers treat the focus as user-initiated and open the keyboard.
  ink.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (tool === 'text' && !editing) addText(pointFrom(event));
  });
  dim.addEventListener('click', finishEditing);

  // Keep focus in the text being edited while tapping toolbar buttons.
  layer.addEventListener('mousedown', (event) => {
    if (editing && event.target.closest('button')) event.preventDefault();
  });

  layer.addEventListener('click', (event) => {
    const swatch = event.target.closest('[data-color]');
    if (swatch) {
      color = swatch.dataset.color;
      if (editing) {
        editing.color = color;
        applyTextStyle(editing);
      } else if (drawsInk()) {
        showSizePreview();
      }
      syncControls();
      return;
    }

    const chip = event.target.closest('[data-font]');
    if (chip) {
      fontIndex = Number(chip.dataset.font);
      if (editing) {
        editing.fontIndex = fontIndex;
        applyTextStyle(editing);
      }
      syncControls();
      return;
    }

    switch (event.target.closest('[data-action]')?.dataset.action) {
      case 'cancel': cancel(); break;
      case 'save': save(); break;
      case 'undo': undo(); break;
      case 'done': finishEditing(); break;
      case 'tool':
        tool = event.target.closest('[data-tool]').dataset.tool;
        if (tool === 'text') addText({ x: width / 2, y: height * 0.35 });
        else syncControls();
        break;
      case 'style':
        if (editing) {
          editing.boxed = !editing.boxed;
          applyTextStyle(editing);
          syncControls();
        }
        break;
      default:
    }
  });

  sizeInput.addEventListener('input', () => {
    const t = Number(sizeInput.value) / 100;
    if (editing) {
      textSize = editing.size = Math.round(lerp(TEXT_SIZE, t));
      applyTextStyle(editing);
    } else if (drawsInk()) {
      penSize = Math.round(lerp(PEN_SIZE, t));
      showSizePreview();
    } else {
      textSize = Math.round(lerp(TEXT_SIZE, t));
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!isOpen || editing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
  });

  return {
    open,
    close,
    get isOpen() {
      return isOpen;
    },
  };
}
