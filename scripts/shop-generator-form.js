const MODULE_ID = "pf2e-shop-generator";
const PACK_CACHE = new Map();
const ITEM_TYPES = ["weapon", "shield", "armor", "equipment", "consumable", "treasure", "backpack", "kit", "scroll", "wand"];
const PHYSICAL_ITEM_TYPES = ["weapon", "shield", "armor", "equipment", "consumable", "treasure", "backpack", "kit"];
const RARITIES = ["common", "uncommon", "rare", "unique"];
const DEFAULT_IMAGE = "icons/svg/hanging-sign.svg";
const SCROLL_COMPENDIUM_IDS = {
  1: "RjuupS9xyXDLgyIr",
  2: "Y7UD64foDbDMV9sx",
  3: "ZmefGBXGJF3CFDbn",
  4: "QSQZJ5BC3DeHv153",
  5: "tjLvRWklAylFhBHQ",
  6: "4sGIy77COooxhQuC",
  7: "fomEZZ4MxVVK3uVu",
  8: "iPki3yuoucnj7bIt",
  9: "cFHomF3tty8Wi1e5",
  10: "o1XIHJ4MJyroAHfF",
};
const WAND_COMPENDIUM_IDS = {
  1: "UJWiN0K3jqVjxvKk",
  2: "vJZ49cgi8szuQXAD",
  3: "wrDmWkGxmwzYtfiA",
  4: "Sn7v9SsbEDMUIwrO",
  5: "5BF7zMnrPYzyigCs",
  6: "kiXh4SUWKr166ZeM",
  7: "nmXPj9zuMRQBNT60",
  8: "Qs8RgNH6thRPv2jt",
  9: "Fgv722039TVM5JTc",
};
const DEFAULT_CONFIG = {
  merchantName: "",
  merchantImage: DEFAULT_IMAGE,
  commonCount: "1-10",
  uncommonCount: "1-5",
  rareCount: "1",
  uniqueCount: "1",
  minLevel: 0,
  maxLevel: 10,
  buyRatio: 0.5,
  sellRatio: 1,
  categories: [...ITEM_TYPES],
  rarities: [...RARITIES],
  tags: "",
  labels: "",
  openSheet: true,
  replaceExisting: false,
};

class ShopGeneratorForm extends FormApplication {
  constructor(actor = null, options = {}) {
    super({}, options);
    this.actor = actor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "pf2e-shop-generator-form",
      title: game.i18n.localize("PF2EShopGenerator.Form.Title"),
      template: `modules/${MODULE_ID}/templates/shop-generator-form.hbs`,
      classes: ["pf2e", "pf2e-shop-generator"],
      width: 720,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false,
      resizable: true,
    });
  }

  getData() {
    const defaults = this.#getDefaults();

    return {
      categories: ITEM_TYPES.map((type) => ({
        value: type,
        label: getCategoryLabel(type),
        checked: defaults.categories.includes(type),
      })),
      rarities: RARITIES.map((rarity) => ({
        value: rarity,
        label: game.i18n.localize(CONFIG.PF2E.rarityTraits?.[rarity] ?? rarity),
        checked: defaults.rarities.includes(rarity),
      })),
      selectedTags: getSelectedTraitOptions(defaults.tags),
      traitOptions: getTraitOptions(),
      defaults,
      isRestock: Boolean(this.actor),
    };
  }

  async _updateObject(_event, formData) {
    if (game.system.id !== "pf2e") {
      ui.notifications.error(game.i18n.localize("PF2EShopGenerator.Notify.NoPf2e"));
      return;
    }
    if (!hasBetterMerchant()) {
      ui.notifications.error(game.i18n.localize("PF2EShopGenerator.Notify.ToolbeltRequired"));
      return;
    }

    const config = this.#normalizeFormData(formData);
    if (!this.actor && !config.merchantName) return;

    ui.notifications.info(game.i18n.localize("PF2EShopGenerator.Notify.Generating"));

    const actor = await createOrRestockMerchant({
      actor: this.actor,
      config,
      createActor: !this.actor,
    });
    if (!actor) return;

    await this.close({ force: true });

    if (!this.actor && config.openSheet) {
      actor.sheet?.render(true);
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-action='cancel']").on("click", (event) => {
      event.preventDefault();
      this.close();
    });

    html.find("button.file-picker").on("click", (event) => {
      event.preventDefault();
      const picker = FilePicker.fromButton(event.currentTarget);
      picker.render(true);
    });

    html.find("[data-action='add-trait']").on("click", (event) => {
      event.preventDefault();
      addTraitFromPicker(html[0]);
    });

    html.find("[data-trait-search]").on("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addTraitFromPicker(html[0]);
    });

    html.find("[data-trait-chips]").on("click", ".trait-chip", (event) => {
      event.preventDefault();
      removeTraitFromPicker(html[0], event.currentTarget.dataset.trait);
    });
  }

  #getDefaults() {
    if (!this.actor) return { ...DEFAULT_CONFIG };

    const stored = this.actor.getFlag(MODULE_ID, "generatorConfig") ?? {};
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      merchantName: this.actor.name,
      merchantImage: this.actor.img || stored.merchantImage || DEFAULT_IMAGE,
      categories: normalizeSelection(stored.categories, ITEM_TYPES),
      rarities: normalizeSelection(stored.rarities, RARITIES),
    };
  }

  #normalizeFormData(formData) {
    const expanded = foundry.utils.expandObject(formData);
    const categories = ensureArray(expanded.categories).filter(Boolean);
    const rarities = ensureArray(expanded.rarities).filter(Boolean);
    const minLevel = Math.max(0, Number(expanded.minLevel ?? 0) || 0);
    const maxLevel = Math.max(0, Number(expanded.maxLevel ?? 0) || 0);

    return {
      merchantName: this.actor ? this.actor.name : String(expanded.merchantName ?? "").trim(),
      merchantImage: String(expanded.merchantImage ?? "").trim() || DEFAULT_IMAGE,
      commonCount: String(expanded.commonCount ?? DEFAULT_CONFIG.commonCount).trim(),
      uncommonCount: String(expanded.uncommonCount ?? DEFAULT_CONFIG.uncommonCount).trim(),
      rareCount: String(expanded.rareCount ?? DEFAULT_CONFIG.rareCount).trim(),
      uniqueCount: String(expanded.uniqueCount ?? DEFAULT_CONFIG.uniqueCount).trim(),
      countRanges: {
        common: parseRangeInput(expanded.commonCount, DEFAULT_CONFIG.commonCount),
        uncommon: parseRangeInput(expanded.uncommonCount, DEFAULT_CONFIG.uncommonCount),
        rare: parseRangeInput(expanded.rareCount, DEFAULT_CONFIG.rareCount),
        unique: parseRangeInput(expanded.uniqueCount, DEFAULT_CONFIG.uniqueCount),
      },
      minLevel: Math.min(minLevel, maxLevel),
      maxLevel: Math.max(minLevel, maxLevel),
      buyRatio: clampRatio(expanded.buyRatio, DEFAULT_CONFIG.buyRatio),
      sellRatio: clampRatio(expanded.sellRatio, DEFAULT_CONFIG.sellRatio),
      categories: categories.length ? categories : [...ITEM_TYPES],
      rarities: rarities.length ? rarities : [...RARITIES],
      tags: normalizeCsv(expanded.tags),
      labels: normalizeCsv(expanded.labels),
      openSheet: Boolean(expanded.openSheet),
      replaceExisting: !this.actor && Boolean(expanded.replaceExisting),
    };
  }
}

async function createOrRestockMerchant({ actor = null, config, createActor = false }) {
  const matches = await getFilteredItems(config);
  if (!matches.length) {
    ui.notifications.warn(game.i18n.localize("PF2EShopGenerator.Notify.NoMatches"));
    return null;
  }

  const selected = pickRandomItems(matches, config.countRanges);
  let merchant = actor;

  if (createActor) {
    merchant = await createMerchantActor(config);
  }

  if (!merchant) return null;

  await addItemsToMerchant(merchant, selected);
  await merchant.update({
    "flags.pf2e-toolbelt.betterMerchant": createBetterMerchantFlags(config)["pf2e-toolbelt"].betterMerchant,
  });
  await merchant.setFlag(MODULE_ID, "generatorConfig", serializeGeneratorConfig(config));

  ui.notifications.info(
    game.i18n.format(createActor ? "PF2EShopGenerator.Notify.Created" : "PF2EShopGenerator.Notify.Restocked", {
      name: merchant.name,
      count: selected.length,
    }),
  );
  ui.notifications.info(game.i18n.localize("PF2EShopGenerator.Notify.FilterSetup"));

  return merchant;
}

async function createMerchantActor(config) {
  const existing = game.actors.getName(config.merchantName);
  if (existing && !config.replaceExisting) {
    ui.notifications.error(game.i18n.localize("PF2EShopGenerator.Notify.ExistingActor"));
    return null;
  }

  if (existing && config.replaceExisting) {
    await existing.delete();
  }

  return Actor.create({
    name: config.merchantName,
    type: "loot",
    img: config.merchantImage || DEFAULT_IMAGE,
    system: {
      lootSheetType: "Merchant",
      hiddenWhenEmpty: false,
      details: {
        description: "",
        level: {
          value: config.maxLevel,
        },
      },
    },
    flags: {
      ...createBetterMerchantFlags(config),
      [MODULE_ID]: {
        generatorConfig: serializeGeneratorConfig(config),
      },
    },
  });
}

async function addItemsToMerchant(actor, selectedItems) {
  const itemDocuments = await Promise.all(
    selectedItems.map(async (entry) => {
      const item = await fromUuid(entry.uuid);
      if (!item) return null;

      const source = entry.kind === "spell-consumable" ? await createSpellConsumableSource(entry, item) : item.toObject();
      if (!source) return null;

      source.system ??= {};
      source.system.quantity ??= 1;
      return source;
    }),
  );

  const createData = itemDocuments.filter(Boolean);
  if (createData.length) {
    await actor.createEmbeddedDocuments("Item", createData);
  }
}

async function getFilteredItems(filters) {
  ui.notifications.info(game.i18n.localize("PF2EShopGenerator.Notify.Loading"));
  const allItems = await loadPackItems();
  const allSpells = await loadSpellConsumableItems(filters);

  return [...allItems, ...allSpells].filter((item) => {
    if (!filters.categories.includes(item.type)) return false;
    if (!filters.rarities.includes(item.rarity)) return false;
    if (item.level < filters.minLevel || item.level > filters.maxLevel) return false;
    if (item.priceValue <= 0) return false;
    if (filters.tags.length && !filters.tags.every((tag) => item.traits.includes(tag))) return false;
    if (filters.labels.length && !filters.labels.some((label) => item.searchBlob.includes(label))) return false;
    return true;
  });
}

function pickRandomItems(items, countRanges) {
  const selected = [];

  for (const rarity of RARITIES) {
    const pool = shuffle(items.filter((item) => item.rarity === rarity));
    const range = countRanges[rarity] ?? { min: 0, max: 0 };
    const count = Math.min(randomBetween(range.min, range.max), pool.length);
    selected.push(...pool.slice(0, count));
  }

  return selected;
}

async function loadPackItems() {
  if (PACK_CACHE.has("items")) {
    return PACK_CACHE.get("items");
  }

  const packs = game.packs.filter((pack) => {
    const packageName = pack.metadata.packageName ?? pack.metadata.package;
    return pack.documentName === "Item" && packageName === "pf2e";
  });
  const fields = [
    "system.level.value",
    "system.traits.value",
    "system.traits.rarity",
    "system.stackGroup",
    "system.slug",
    "system.category",
    "system.group",
    "system.price.value",
  ];

  const entries = [];
  for (const pack of packs) {
    const index = await pack.getIndex({ fields });
    for (const item of index) {
      if (!PHYSICAL_ITEM_TYPES.includes(item.type)) continue;
      if (item.type === "treasure" && item.system?.stackGroup === "coins") continue;

      const traits = ensureArray(item.system?.traits?.value).map((value) => String(value).toLowerCase());
      const rarity = String(item.system?.traits?.rarity ?? "common").toLowerCase();
      const category = String(item.system?.category ?? "").toLowerCase();
      const group = String(item.system?.group ?? "").toLowerCase();
      const slug = String(item.system?.slug ?? item.name ?? "").toLowerCase();
      const searchBlob = [item.name, slug, category, group].join(" ").toLowerCase();
      const priceValue = getPriceInCopper(item.system?.price?.value);
      if (priceValue <= 0) continue;

      entries.push({
        uuid: item.uuid,
        type: item.type,
        level: Number(item.system?.level?.value ?? 0) || 0,
        traits,
        rarity,
        searchBlob,
        priceValue,
      });
    }
  }

  const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.uuid, entry])).values());
  PACK_CACHE.set("items", uniqueEntries);
  return uniqueEntries;
}

async function loadSpellConsumableItems(filters) {
  const requestedTypes = filters.categories.filter((type) => type === "scroll" || type === "wand");
  if (!requestedTypes.length) return [];

  const cacheKey = "spell-consumables";
  if (PACK_CACHE.has(cacheKey)) {
    return PACK_CACHE.get(cacheKey);
  }

  const packs = game.packs.filter((pack) => {
    const packageName = pack.metadata.packageName ?? pack.metadata.package;
    return pack.documentName === "Item" && packageName === "pf2e" && pack.collection.includes("spells");
  });
  const fields = [
    "system.level.value",
    "system.traits.value",
    "system.traits.rarity",
    "system.traits.traditions",
    "system.ritual",
  ];

  const entries = [];
  for (const pack of packs) {
    const index = await pack.getIndex({ fields });
    for (const spell of index) {
      if (spell.type !== "spell") continue;

      const traits = ensureArray(spell.system?.traits?.value).map((value) => String(value).toLowerCase());
      const traditions = ensureArray(spell.system?.traits?.traditions).map((value) => String(value).toLowerCase());
      const rank = Number(spell.system?.level?.value ?? 0) || 0;
      const isCantrip = traits.includes("cantrip");
      const isFocus = traits.includes("focus") || (isCantrip && traditions.length === 0);
      const isRitual = Boolean(spell.system?.ritual);
      if (rank < 1 || isCantrip || isFocus || isRitual) continue;

      const rarity = String(spell.system?.traits?.rarity ?? "common").toLowerCase();
      const searchBlob = [spell.name].join(" ").toLowerCase();
      const itemLevelEquivalent = (rank * 2) - 1;

      for (const type of ["scroll", "wand"]) {
        if (type === "wand" && rank > 9) continue;

        const baseItemId = getSpellConsumableBaseId(type, rank);
        const basePrice = await getSpellConsumableBasePrice(type, rank);
        if (!baseItemId || basePrice <= 0) continue;

        entries.push({
          kind: "spell-consumable",
          uuid: spell.uuid,
          type,
          rank,
          baseItemId,
          level: itemLevelEquivalent,
          traits: [...new Set([...traits, ...traditions, type])],
          rarity,
          searchBlob,
          priceValue: basePrice,
        });
      }
    }
  }

  PACK_CACHE.set(cacheKey, entries);
  return entries;
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function normalizeCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeSelection(value, fallback) {
  const selected = ensureArray(value).filter(Boolean);
  return selected.length ? selected : [...fallback];
}

function getCategoryLabel(type) {
  if (type === "scroll") return game.i18n.localize("PF2EShopGenerator.Category.Scroll");
  if (type === "wand") return game.i18n.localize("PF2EShopGenerator.Category.Wand");
  return game.i18n.localize(`TYPES.Item.${type}`);
}

function getSelectedTraitOptions(tags) {
  const options = getTraitOptions();
  const optionMap = new Map(options.map((option) => [option.value, option]));
  return normalizeCsv(tags).map((tag) => optionMap.get(tag) ?? { value: tag, label: tag });
}

function getTraitOptions() {
  const traitConfig = {
    ...CONFIG.PF2E.armorTraits,
    ...CONFIG.PF2E.consumableTraits,
    ...CONFIG.PF2E.equipmentTraits,
    ...CONFIG.PF2E.shieldTraits,
    ...CONFIG.PF2E.spellTraits,
    ...CONFIG.PF2E.magicTraditions,
    ...CONFIG.PF2E.weaponTraits,
  };

  return Object.entries(traitConfig)
    .map(([value, label]) => ({
      value,
      label: game.i18n.localize(label),
      search: `${value} ${game.i18n.localize(label)}`.toLowerCase(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

function addTraitFromPicker(root) {
  const search = root.querySelector("[data-trait-search]");
  const typed = search?.value?.trim();
  if (!typed) return;

  const options = getTraitOptions();
  const query = typed.toLowerCase();
  const option =
    options.find((entry) => entry.value === query) ??
    options.find((entry) => entry.label.toLowerCase() === query) ??
    options.find((entry) => entry.search.includes(query));

  if (!option) return;

  const tagsInput = root.querySelector("[data-tags-value]");
  const tags = new Set(normalizeCsv(tagsInput.value));
  tags.add(option.value);
  tagsInput.value = Array.from(tags).join(", ");
  search.value = "";
  renderTraitChips(root);
}

function removeTraitFromPicker(root, trait) {
  const tagsInput = root.querySelector("[data-tags-value]");
  const tags = normalizeCsv(tagsInput.value).filter((tag) => tag !== trait);
  tagsInput.value = tags.join(", ");
  renderTraitChips(root);
}

function renderTraitChips(root) {
  const chips = root.querySelector("[data-trait-chips]");
  const tagsInput = root.querySelector("[data-tags-value]");
  if (!chips || !tagsInput) return;

  chips.replaceChildren(
    ...getSelectedTraitOptions(tagsInput.value).map((trait) => {
      const button = document.createElement("button");
      const label = document.createElement("span");
      const icon = document.createElement("i");
      button.type = "button";
      button.className = "trait-chip";
      button.dataset.trait = trait.value;
      label.textContent = trait.label;
      icon.className = "fas fa-times";
      button.append(label, icon);
      return button;
    }),
  );
}

function clampRatio(value, fallback) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return fallback;
  return Math.min(10, Math.max(0, Math.round(ratio * 100) / 100));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseRangeInput(value, fallback) {
  const text = String(value ?? "").trim() || fallback;
  const match = text.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return parseRangeInput(fallback, fallback);

  const first = Math.max(0, Number(match[1]) || 0);
  const second = Math.max(0, Number(match[2] ?? match[1]) || first);
  return {
    min: Math.min(first, second),
    max: Math.max(first, second),
  };
}

function shuffle(items) {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool;
}

function getPriceInCopper(priceValue) {
  if (!priceValue) return 0;
  if (typeof priceValue === "string") {
    return game.pf2e.Coins.fromString(priceValue).copperValue;
  }
  return new game.pf2e.Coins(priceValue).copperValue;
}

async function createSpellConsumableSource(entry, spell) {
  const pack = game.packs.find((candidate) => candidate.collection === "pf2e.equipment-srd");
  const base = await pack?.getDocument(entry.baseItemId);
  if (!base) return null;

  const source = base.toObject();
  source._id = null;

  const spellSource = spell.toObject();
  const spellTraits = ensureArray(spellSource.system?.traits?.value);
  const baseTraits = source.system.traits;
  baseTraits.value = [...new Set([...baseTraits.value, ...spellTraits])].sort();
  baseTraits.rarity = spellSource.system?.traits?.rarity ?? baseTraits.rarity;

  source.name = getSpellConsumableName(entry.type, spell.name, entry.rank);
  source.system.description.value = createSpellConsumableDescription(source.system.description.value, spell);
  source.system.spell = foundry.utils.mergeObject(
    spellSource,
    {
      _id: randomID(),
      system: {
        location: {
          value: null,
          heightenedLevel: entry.rank,
        },
      },
    },
    { inplace: false },
  );

  return source;
}

function createSpellConsumableDescription(baseDescription, spell) {
  const paragraph = document.createElement("p");
  paragraph.append(spell.uuid ? `@UUID[${spell.uuid}]{${spell.name}}` : spell.name);

  const container = document.createElement("div");
  const hr = document.createElement("hr");
  container.append(paragraph, hr);
  hr.insertAdjacentHTML("afterend", baseDescription);
  return container.innerHTML;
}

function getSpellConsumableName(type, spellName, rank) {
  const template = type === "scroll" ? "PF2E.Item.Physical.FromSpell.Scroll" : "PF2E.Item.Physical.FromSpell.Wand";
  return game.i18n.format(template, { name: spellName, level: rank });
}

function getSpellConsumableBaseId(type, rank) {
  return type === "scroll" ? SCROLL_COMPENDIUM_IDS[rank] : WAND_COMPENDIUM_IDS[rank];
}

async function getSpellConsumableBasePrice(type, rank) {
  const cacheKey = `${type}-base-price-${rank}`;
  if (PACK_CACHE.has(cacheKey)) return PACK_CACHE.get(cacheKey);

  const pack = game.packs.find((candidate) => candidate.collection === "pf2e.equipment-srd");
  const base = await pack?.getDocument(getSpellConsumableBaseId(type, rank) ?? "");
  const price = getPriceInCopper(base?.system?.price?.value);
  PACK_CACHE.set(cacheKey, price);
  return price;
}

function createBetterMerchantFlags(filters) {
  const physicalCategories = filters.categories.filter((type) => PHYSICAL_ITEM_TYPES.includes(type));
  const consumableCategories = filters.categories.filter((type) => type === "scroll" || type === "wand");
  const selectedItemTypes = [...new Set([...physicalCategories, ...(consumableCategories.length ? ["consumable"] : [])])];

  const buyFilter = createEquipmentFilter({
    itemTypes: selectedItemTypes,
    rarities: filters.rarities,
    tags: filters.tags,
    labels: filters.labels,
    minLevel: filters.minLevel,
    maxLevel: filters.maxLevel,
  });
  const sellFilter = createEquipmentFilter({
    itemTypes: selectedItemTypes,
    rarities: [],
    tags: [],
    labels: [],
    minLevel: 0,
    maxLevel: 30,
  });

  return {
    "pf2e-toolbelt": {
      betterMerchant: {
        infiniteAll: false,
        filters: {
          buy: [
            {
              id: randomID(),
              name: "Generated Buy Filter",
              enabled: true,
              ratio: filters.buyRatio,
              filter: buyFilter,
            },
          ],
          sell: [
            {
              id: randomID(),
              name: "Generated Sell Filter",
              enabled: true,
              ratio: filters.sellRatio,
              filter: sellFilter,
            },
          ],
        },
        default: {
          buy: {
            enabled: false,
            ratio: filters.buyRatio,
          },
          sell: {
            enabled: true,
            ratio: filters.sellRatio,
          },
        },
      },
    },
  };
}

function createEquipmentFilter({ itemTypes, rarities, tags, labels, minLevel, maxLevel }) {
  return {
    checkboxes: {
      itemTypes: {
        selected: itemTypes,
      },
      rarity: {
        selected: rarities,
      },
      armorTypes: {
        selected: [],
      },
      weaponTypes: {
        selected: [],
      },
    },
    traits: {
      conjunction: "and",
      selected: tags,
    },
    source: {
      selected: [],
    },
    level: {
      from: minLevel,
      to: maxLevel,
    },
    search: {
      text: labels.join(" "),
    },
  };
}

function serializeGeneratorConfig(config) {
  return {
    merchantName: config.merchantName,
    merchantImage: config.merchantImage,
    commonCount: config.commonCount,
    uncommonCount: config.uncommonCount,
    rareCount: config.rareCount,
    uniqueCount: config.uniqueCount,
    minLevel: config.minLevel,
    maxLevel: config.maxLevel,
    buyRatio: config.buyRatio,
    sellRatio: config.sellRatio,
    categories: [...config.categories],
    rarities: [...config.rarities],
    tags: config.tags.join(", "),
    labels: config.labels.join(", "),
    openSheet: config.openSheet,
    replaceExisting: false,
  };
}

function hasBetterMerchant() {
  return Boolean(game.modules.get("pf2e-toolbelt")?.active && game.toolbelt?.api?.betterMerchant);
}

export { MODULE_ID, ShopGeneratorForm, createOrRestockMerchant };
