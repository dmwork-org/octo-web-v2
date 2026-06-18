const DEFAULT_FAVICON_HREF = "/favicon.ico?v=2";
const FAVICON_SIZE = 64;
const BADGE_CENTER = 55;
const BADGE_OUTER_RADIUS = 12;
const BADGE_INNER_RADIUS = 9;

interface FaviconSnapshot {
  href: string;
  type: string | null;
}

let originalFavicon: FaviconSnapshot | null = null;
let badgedFaviconPromise: Promise<string> | null = null;
let lastRequestedUnread: boolean | null = null;

function ensureFaviconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  const existing = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (existing) return existing;

  const link = document.createElement("link");
  link.rel = "icon";
  link.href = DEFAULT_FAVICON_HREF;
  document.head.appendChild(link);
  return link;
}

function getOriginalFavicon(link: HTMLLinkElement): FaviconSnapshot {
  if (!originalFavicon) {
    const storedHref = link.dataset.octoOriginalHref;
    const storedType = link.dataset.octoOriginalType;
    const href = storedHref || (link.href.startsWith("data:") ? DEFAULT_FAVICON_HREF : link.href);
    const type =
      storedType == null ? link.getAttribute("type") : storedType.length > 0 ? storedType : null;
    originalFavicon = {
      href: href || DEFAULT_FAVICON_HREF,
      type,
    };
    link.dataset.octoOriginalHref = originalFavicon.href;
    link.dataset.octoOriginalType = originalFavicon.type ?? "";
  }
  return originalFavicon;
}

function applyFavicon(link: HTMLLinkElement, href: string, type: string | null): void {
  link.href = href;
  if (type) {
    link.type = type;
  } else {
    link.removeAttribute("type");
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load favicon image"));
    image.src = src;
  });
}

async function createBadgedFavicon(sourceHref: string): Promise<string> {
  const image = await loadImage(sourceHref);
  const canvas = document.createElement("canvas");
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceHref;

  const sourceWidth = image.naturalWidth || FAVICON_SIZE;
  const sourceHeight = image.naturalHeight || FAVICON_SIZE;
  const scale = Math.min(FAVICON_SIZE / sourceWidth, FAVICON_SIZE / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const dx = (FAVICON_SIZE - drawWidth) / 2;
  const dy = (FAVICON_SIZE - drawHeight) / 2;

  ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);

  ctx.beginPath();
  ctx.arc(BADGE_CENTER, BADGE_CENTER, BADGE_OUTER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(BADGE_CENTER, BADGE_CENTER, BADGE_INNER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#ff3b30";
  ctx.fill();

  return canvas.toDataURL("image/png");
}

export function setFaviconUnreadBadge(hasUnread: boolean): void {
  const link = ensureFaviconLink();
  if (!link) return;

  const original = getOriginalFavicon(link);
  if (lastRequestedUnread === hasUnread) return;
  lastRequestedUnread = hasUnread;

  if (!hasUnread) {
    applyFavicon(link, original.href, original.type);
    return;
  }

  badgedFaviconPromise ??= createBadgedFavicon(original.href);
  void badgedFaviconPromise
    .then((badgedHref) => {
      if (lastRequestedUnread !== true) return;
      const currentLink = ensureFaviconLink();
      if (currentLink) applyFavicon(currentLink, badgedHref, "image/png");
    })
    .catch(() => {
      badgedFaviconPromise = null;
      lastRequestedUnread = null;
    });
}
