# rexpaintjs-render

Renders [rexpaintjs-fork Images](https://github.com/adri326/rexpaintjs-fork) into [canvas](https://www.npmjs.com/package/canvas) images.

## Installation

Install this module by running:

```sh
npm install --save adri326/rexpaintjs-render
```

Then, import the node module:

```js
const render = require('rexpaintjs-render');
```

You can then quickly convert your `Image`s into `Image` instances with the imported `render` method:

```js
const fs = require("fs");

let buffer = fs.readFileSync("your_file.xp");
rexpaint(buffer, (err, data) => {
  if (err) {
    throw new Error(err);
  }
  render(data, {output: "your_file.png"}); // writes the image to `your_file.png`!
});
```

## Changelog

- `1.0.0`:
  - Switch from `canvas` to `@napi-rs/canvas`, as `canvas` [has been failing](https://github.com/Automattic/node-canvas/issues/2448) to compile on `node>=22.11.0` for several months.
  - Remove `Image.render(options)`, use `render(image, options)` instead.
  - Add typescript types through JSDoc. These require `rexpaintjs-fork>=0.2.6` and `@types/node` to work properly.
  - Fix default background colors being passed as numbers to `canvas`.
  - Fix `render()` crashing if the image has no layers.
- `0.3.0`: switch to `canvas` for better performance
