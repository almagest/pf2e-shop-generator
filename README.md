# PF2E Shop Generator

Foundry VTT module for PF2E on Foundry V13 that creates a merchant actor and fills it with randomly selected inventory from PF2E system compendia.

## Current behavior

- Creates a new PF2E `loot` actor in `Merchant` mode.
- Filters random inventory by item category, rarity, item level, traits/tags, and label text.
- Requires `pf2e-toolbelt` and expects Better Merchant to be available.
- Configures Better Merchant buy and sell filters from the generator selections.
- Lets you choose the total number of generated items.
- Opens from the Actor Directory footer or from a Module Settings menu.
- Pulls items only from PF2E system compendia.

## Install

Install from Foundry's **Install Module** dialog with this manifest URL:

```text
https://github.com/almagest/pf2e-shop-generator/releases/latest/download/module.json
```

## Local Development

Copy the `pf2e-shop-generator` folder into your Foundry `Data/modules` directory, then enable the module in your world.

## Notes

- This version targets Foundry V13.
- Multiple selected tag filters are matched with `AND` semantics.
- Buy and sell ratios default to `0.5` and `1.0`.
