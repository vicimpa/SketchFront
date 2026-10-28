# Авторы и лицензии

Каждый внешний ассет — строка в этой таблице: файл, источник, автор, лицензия, изменения.
Без записи ассет в репозиторий не попадает (см. docs/GAME_BRIEF.md §9). Экран «Авторы»
в игре строится из этого файла.

## Модели и карты

| Файл | Источник | Автор | Лицензия | Изменения |
|---|---|---|---|---|
| `packages/client/public/assets/world.glb`, `assets/blend/world.blend` | [Sketchbook](https://github.com/swift502/Sketchbook) | Jan Blaha (swift502) | MIT | — |
| `packages/client/public/assets/boxman.glb`, `assets/blend/boxman.blend` | [Sketchbook](https://github.com/swift502/Sketchbook) | Jan Blaha (swift502) | MIT | — |
| `packages/client/public/assets/car.glb`, `assets/blend/car.blend` | [Sketchbook](https://github.com/swift502/Sketchbook) | Jan Blaha (swift502) | MIT | — |
| `packages/client/public/assets/heli.glb`, `assets/blend/heli.blend` | [Sketchbook](https://github.com/swift502/Sketchbook) | Jan Blaha (swift502) | MIT | — |
| `packages/client/public/assets/airplane.glb`, `assets/blend/airplane.blend` | [Sketchbook](https://github.com/swift502/Sketchbook) | Jan Blaha (swift502) | MIT | — |

## Шрифты

Подключаются с Google Fonts, в репозитории не лежат.

| Шрифт | Автор | Лицензия |
|---|---|---|
| Alfa Slab One | JM Solé | OFL 1.1 |
| Solway | The Northern Block | OFL 1.1 |
| Cutive Mono | Vernon Adams | OFL 1.1 |

## Вендорный код

| Файл | Источник | Лицензия | Изменения |
|---|---|---|---|
| `packages/client/src/lib/utils/dat.gui.js` | [dat.gui](https://github.com/dataarts/dat.gui) | Apache 2.0 | правки Sketchbook; UMD-обёртка заменена на ES-модуль |
| `packages/client/src/lib/utils/Stats.js` | [stats.js](https://github.com/mrdoob/stats.js) | MIT | правки Sketchbook |
| `packages/client/src/lib/cannon/CannonDebugRenderer.js` | [cannon.js](https://github.com/schteppe/cannon.js) | MIT | перенесён на cannon-es и BufferGeometry |
| `packages/client/src/lib/shaders/SkyShader.js` | [three.js](https://github.com/mrdoob/three.js) Sky (модель Preetham; Simon Wallner, Martin Upitis, zz85, Danila Loginov) | MIT | правки Sketchbook; uniform `luminance` переименован в `skyLuminance` |
| `packages/client/src/lib/shaders/WaterShader.js` | [CodePen](https://codepen.io/knoland/pen/XKxAJb), Jonathan Blaire; адаптация Sketchbook | MIT (публичные пены CodePen) | — |
