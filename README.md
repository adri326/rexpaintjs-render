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
  data.render({output: "your_file.png"}); // writes the image to `your_file.png`!
});
```

<!-- TODO -->
