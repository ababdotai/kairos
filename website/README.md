# Kairos website

An independent, dependency-free static website. Product code and website are maintained in the Kairos repository; the main ABAB project forwards `/kairos` to this deployment. The visual treatment follows the spacious, light editorial layout of x.ai/bot, with original Kairos assets and an original SVG lesson illustration. The interactive lesson is illustrative; the product screenshot above it is an actual user-provided capture.

## Local development

```sh
cd website
npm run build
npm run dev
```

Open http://127.0.0.1:4173/kairos/. Edit `public/` and rebuild to refresh. No npm install is needed. `npm run build` writes only `website/dist/`; it does not touch the extension build.

## Independent Vercel project

1. Import the Kairos Git repository into a **new** Vercel project.
2. Root Directory: `website`; Framework Preset: **Other**.
3. Build Command: `npm run build`; Output Directory: `dist`; Install Command can be left empty. Configuration is included in `website/vercel.json`.
4. Deploy and get its stable production origin, e.g. `https://YOUR-KAIROS-PROJECT.vercel.app`. Verify `/kairos` and `/kairos/assets/kairos.png` return 200. Production origin must be publicly accessible for the main-site proxy; do not use a temporary or protected preview URL.
5. In the **abab.ai Vercel project**, set `KAIROS_SITE_ORIGIN` to that origin (no `/kairos` suffix). Redeploy the main project once.
6. Verify `https://www.abab.ai/kairos` and its JS/CSS/image requests. Future website updates deploy only the Kairos Vercel project.

The ABAB integration is in `config/kairos-rewrites.cjs`, referenced by both existing Next config files. It produces no routes until the environment variable is set, preserves existing routes, and rejects self-referential origins. A stable production origin has not been assigned by this development task, and no Vercel deployment has been performed.

All website assets use the `/kairos/` prefix and the generated files also live under `dist/kairos/`, so the same paths work directly and through the main-site rewrite. The canonical URL points at the main domain. Only this static page is provided; unknown paths return 404.

## Content and interactions

- Four demo steps, keyboard arrow navigation, automatic playback while visible, manual pause/selection respected, reduced-motion support.
- FAQ and an expandable installation guide with the actual source build workflow. No unverified Chrome Web Store link or invented customer claims.
- Replace the GitHub installation action with a verified store listing when it becomes available.
- No analytics, external fonts, cookies, remote images, or AI requests on the website itself.
- Theme defaults to the system, with Light / Dark / System overrides. Language follows the browser (Chinese or English fallback), with persistent manual overrides and a return-to-system option.
- The real product section uses `public/assets/text-note.png`, copied without edits from `../screenshots/text_note.png`; click to open the full image.
- The root READMEs use `../screenshots/marquee.png` as the banner and `public/assets/avatar.gif` as the animated avatar. Regenerate the GIF from the same hero artwork and CSS keyframes with `node website/scripts/render-readme-avatar.mjs` (Chrome and FFmpeg required on macOS).
- The hero uses the original high-resolution transparent Kairos brand image with native breathing and subtle pointer-follow motion. Reduced-motion disables both. This replaces the GIF to avoid keyed edges and visual state changes unrelated to the product.
- The illustrative product walkthrough animates pointer movement, selection, typing, saving and viewing. It is a UI reconstruction, not an actual captured video; it makes no live AI calls.

## Verification

With the local preview server running, run `node website/scripts/check.mjs` from the repository root. This uses an isolated Chrome profile on macOS, checks desktop/mobile layout, demo navigation, pause, installation guide, FAQ and resource responses, then saves screenshots under a temporary directory.

Reference: https://x.ai/bot
Vercel routing documentation: https://vercel.com/docs/routing/rewrites
