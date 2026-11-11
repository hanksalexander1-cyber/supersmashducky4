// Loads and caches the duck sprite sheets, validates and normalizes duck data,
// and assembles each duck from its colored sprite parts. It also provides
// helpers used to display the composed sprites in the roster and game.
export function createDuckAssets({ sheets, spriteSheet, colors, escapeHtml }) {
  const spriteImages = new Map();
  const spriteCache = new Map();
  let sheetsReady = false;

  const spriteLoadPromise = Promise.all(
    Object.entries(sheets).map(([name, source]) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve([name, image, true]);
      image.onerror = () => resolve([name, image, false]);
      image.src = source;
    })),
  ).then((loadedSheets) => {
    loadedSheets.forEach(([name, image, loaded]) => {
      if (loaded) spriteImages.set(name, image);
    });
    sheetsReady = loadedSheets.every((sheet) => sheet[2]);
    return sheetsReady;
  });

  function normalizeDuck(rawDuck, duckIndex) {
    const body = rawDuck.body || rawDuck.parts || {};
    const stats = rawDuck.stats || {};
    const name = rawDuck.name || rawDuck.displayName || `Unnamed duck ${duckIndex + 1}`;
    const partNames = ['head', 'frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
    const partColors = partNames.map((partName) => String(body[partName] ?? '').toLowerCase());
    const duckColors = Object.fromEntries(partNames.map((partName, index) => [partName, partColors[index]]));
    const duckStats = { strength: stats.strength, health: stats.health, focus: stats.focus };
    const hasRequiredStats = Object.values(duckStats).every((value) => (
      value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))
    ));
    const hasSpriteColors = partColors.every((colorName) => Object.hasOwn(colors, colorName));

    return {
      id: String(rawDuck._id || rawDuck.id || name + duckIndex),
      name,
      creator: String(rawDuck.assembler || rawDuck.creator || rawDuck.creatorName || 'Unknown creator'),
      description: String(rawDuck.bio || rawDuck.description || ''),
      adjectives: Array.isArray(rawDuck.adjectives) ? rawDuck.adjectives : [],
      colors: duckColors,
      stats: duckStats,
      derpy: !!rawDuck.derpy,
      testOnly: isTestDuck(rawDuck, name),
      selectable: hasRequiredStats && hasSpriteColors && sheetsReady,
      missing: [
        ...(!hasRequiredStats ? ['stats'] : []),
        ...(!hasSpriteColors ? ['sprite colors'] : []),
        ...(!sheetsReady ? ['sprite sheets'] : []),
      ],
    };
  }

  function isTestDuck(rawDuck, name) {
    const hasTestFlag = [rawDuck.test, rawDuck.testOnly, rawDuck.isTest, rawDuck.isTestData, rawDuck.isTestDuck, rawDuck.testDuck]
      .some((flag) => flag === true || flag === 'true');
    const hasTestTag = Array.isArray(rawDuck.tags)
      && rawDuck.tags.some((tag) => String(tag).toLowerCase() === 'test');
    const hasTestName = /(^|[\s_-])test(?:$|[\s_-]|duck|\d)/i.test(
      `${name} ${rawDuck._id || ''} ${rawDuck.id || ''}`,
    );
    return hasTestFlag || hasTestTag || hasTestName;
  }

  function getDuckGraphic(duck) {
    if (!duck) {
      return '<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="61" rx="34" ry="25" fill="#647586"/><circle cx="52" cy="31" r="23" fill="#647586"/><path d="M69 34l20 7-20 7z" fill="#d89c3e"/></svg>';
    }
    if (spriteCache.has(duck.id)) {
      return `<img class="duck-sprite" src="${spriteCache.get(duck.id)}" alt="${escapeHtml(duck.name)}">`;
    }

    const colorRows = { red: 1, green: 2, yellow: 3, purple: 4, blue: 5, brown: 6, pink: 7 };
    const canvas = document.createElement('canvas');
    canvas.width = spriteSheet.canvasWidth;
    canvas.height = spriteSheet.canvasHeight;
    const context = canvas.getContext('2d');
    context.scale(spriteSheet.scale, spriteSheet.scale);
    const drawSpritePart = (image, colorName, x, y, width, height) => {
      if (!image) return;
      const row = colorRows[colorName] || 1;
      context.drawImage(image, 0, row * spriteSheet.cellHeight, spriteSheet.sourceWidth, spriteSheet.cellHeight, x, y, width, height);
    };

    context.fillStyle = '#0b1319';
    context.globalAlpha = 0.4;
    context.beginPath();
    context.ellipse(58, 103, 47, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    drawSpritePart(spriteImages.get('back'), duck.colors.rearLeft, -12, 34, 100, 66);
    drawSpritePart(spriteImages.get('front'), duck.colors.frontLeft, 24, 34, 100, 66);
    drawSpritePart(spriteImages.get(duck.derpy ? 'derpy' : 'normal'), duck.colors.head, 44, -2, 84, 60);

    const imageData = canvas.toDataURL('image/png');
    spriteCache.set(duck.id, imageData);
    return `<img class="duck-sprite" src="${imageData}" alt="${escapeHtml(duck.name)}">`;
  }

  return {
    get spriteSheetsReady() { return sheetsReady; },
    spriteCache,
    spriteLoadPromise,
    normalizeDuck,
    getDuckGraphic,
  };
}
