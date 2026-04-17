import { ShopGeneratorForm, MODULE_ID } from "./shop-generator-form.js";

Hooks.once("init", () => {
  game.modules.get(MODULE_ID).api = {
    openGenerator: () => new ShopGeneratorForm().render(true),
    openRestock: (actor) => new ShopGeneratorForm(actor).render(true),
  };

  game.settings.registerMenu(MODULE_ID, "open-generator", {
    name: "PF2EShopGenerator.Settings.OpenName",
    hint: "PF2EShopGenerator.Settings.OpenHint",
    label: "PF2EShopGenerator.Button",
    icon: "fas fa-store",
    type: ShopGeneratorForm,
    restricted: true,
  });
});

Hooks.on("renderActorDirectory", (app, html) => {
  injectLaunchButton(app, html);
});

Hooks.on("renderSidebarTab", (app, html) => {
  injectLaunchButton(app, html);
});

Hooks.on("getApplicationV1HeaderButtons", (app, buttons) => {
  addRestockHeaderButton(app, buttons);
});

Hooks.on("getApplicationHeaderButtons", (app, buttons) => {
  addRestockHeaderButton(app, buttons);
});

Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  addRestockHeaderButton(app, buttons);
});

Hooks.on("renderActorSheet", (app, html) => {
  if (!isMerchantSheet(app)) return;

  const root = resolveRootElement(html);
  const header = root?.closest?.(".app")?.querySelector?.(".window-header .window-title") ?? root?.parentElement?.querySelector?.(".window-header .window-title");
  const controls = header?.parentElement;
  if (!controls || controls.querySelector(".pf2e-shop-generator-restock")) return;

  const button = document.createElement("a");
  button.className = "header-button pf2e-shop-generator-restock";
  button.innerHTML = `<i class="fa-solid fa-box-open"></i> ${game.i18n.localize("PF2EShopGenerator.RestockButton")}`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    new ShopGeneratorForm(app.actor).render(true);
  });
  controls.insertBefore(button, controls.firstChild);
});

function addRestockHeaderButton(app, buttons) {
  if (!isMerchantSheet(app)) return;
  if (buttons.some((button) => button.class === "pf2e-shop-generator-restock")) return;

  buttons.unshift({
    label: game.i18n.localize("PF2EShopGenerator.RestockButton"),
    class: "pf2e-shop-generator-restock",
    icon: "fa-solid fa-box-open",
    onclick: () => new ShopGeneratorForm(app.actor).render(true),
  });
}

function injectLaunchButton(app, html) {
  if (!game.user.isGM || game.system.id !== "pf2e") return;
  if (!isActorSidebar(app)) return;

  const root = resolveRootElement(html);
  if (!root || root.querySelector(".pf2e-shop-generator-launch")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pf2e-shop-generator-launch";
  button.innerHTML = `<i class="fas fa-store"></i> ${game.i18n.localize("PF2EShopGenerator.Button")}`;
  button.addEventListener("click", () => new ShopGeneratorForm().render(true));

  const footer = root.querySelector(".directory-footer");
  const actionButtons = root.querySelector(".action-buttons");
  const header = root.querySelector("header, .directory-header");

  if (footer) {
    footer.prepend(button);
    return;
  }

  if (actionButtons) {
    actionButtons.prepend(button);
    return;
  }

  if (header?.parentElement) {
    header.parentElement.insertBefore(button, header.nextSibling);
    return;
  }

  root.prepend(button);
}

function isActorSidebar(app) {
  return app?.tabName === "actors" || app?.options?.collection === game.actors || app?.collection === game.actors;
}

function resolveRootElement(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (html[0] instanceof HTMLElement) return html[0];
  if (html.element instanceof HTMLElement) return html.element;
  if (html.element?.[0] instanceof HTMLElement) return html.element[0];
  return null;
}

function isMerchantSheet(app) {
  const actor = app?.actor;
  return Boolean(
    game.user.isGM &&
      actor?.type === "loot" &&
      actor?.system?.lootSheetType === "Merchant" &&
      app.constructor?.name !== "ShopGeneratorForm",
  );
}
