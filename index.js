//@ts-check

const rexpaint = require("rexpaintjs-fork");
const crypto = require("node:crypto");
const fs = require("node:fs");
const {createCanvas, loadImage} = require("@napi-rs/canvas");

const ROW_SIZE = 16;
const N_ROWS = 16; // used for font import

function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

module.exports.background_color = 0x0; // RGBA

module.exports.OUTPUT_URI = module.exports.OUTPUT_URI_PNG = Symbol("OUTPUT_URI_PNG");
module.exports.OUTPUT_URI_JPEG = Symbol("OUTPUT_URI_JPEG");

/**
 * @typedef {Object} RenderOptions
 * @property {string | symbol | null | undefined} [output]
 * @property {string} [background] Color to use as background.
 * @property {import("rexpaintjs-fork").LayerOption} [layers] Which layers to render.
 */

/**
 * @overload
 * @param {string | import("rexpaintjs-fork").Image} image
 * @param {RenderOptions & {output: symbol}} options
 * @returns {Promise<Buffer>}
 */
/**
 * @overload
 * @param {string | import("rexpaintjs-fork").Image} image
 * @param {RenderOptions & {output?: string}} options
 * @returns {Promise<import("@napi-rs/canvas").Canvas>}
 */
/**
  Main function: call it with either an Image instance or a path to a rexpaint .XP file.

  @overload
  @param {string | import("rexpaintjs-fork").Image} image
  @param {RenderOptions} [options]
  @returns {Promise<Buffer | import("@napi-rs/canvas").Canvas>}
**/
module.exports = function render(image, options = {}) {
  if (typeof image === "string") {
    return new Promise((resolve, reject) => {
      fs.readFile(image, (err, buffer) => {
        if (err) return reject(err);

        rexpaint(buffer).then(data => {
          render(data, options).then(resolve).catch(reject);
        }).catch(reject);
      });
    });
  }

  /** @type {RenderOptions} */
  options = {
    output: null,
    background: "transparent",
    layers: "all",
    ...options
  };

  return new Promise(async (resolve, reject) => {
    let res = await render_image(image, options);
    if (typeof options.output === "string") {
      let stream = await res.encode("png");
      fs.writeFile(options.output, stream, (err) => {
        if (err) reject(err);
        else resolve(res);
      });
    } else if (options.output === module.exports.OUTPUT_URI_PNG) {
      return res.toDataURLAsync("image/png");
    } else if (options.output === module.exports.OUTPUT_URI_JPEG) {
      return res.toDataURLAsync("image/jpeg");
    } else {
      resolve(res);
    }
  });
}

module.exports.font = null;
let font_queue = [];

/**
 * @overload
 * @param {String} path
 */
/**
 * Loads a font as a Image, necessary to render any rexpaint image

 * @overload
 * @param {String} path
 * @param {number} char_width
 * @param {number} char_height
 * @returns {Promise<void>}
**/
module.exports.load_font = function load_font(path, char_width = -1, char_height = -1) {
  return new Promise((resolve, reject) => {
    if (module.exports.font) {
      resolve(module.exports.font);
    } else {
      loadImage(path).then((img) => {
        if (char_width === -1 || char_width === null || char_height === -1 || char_height === null) {
          char_width = img.width / ROW_SIZE;
          char_height = img.height / N_ROWS;
        }
        let grid = new Array(256).fill(null).map((_, i) => {
          let x = i % 16;
          let y = Math.floor(i / 16);

          let canvas = createCanvas(char_width, char_height);
          let ctx = canvas.getContext("2d");
          ctx.drawImage(img, x * char_width, y * char_width, char_width, char_height, 0, 0, char_width, char_height);

          let data = ctx.getImageData(0, 0, char_width, char_height);
          for (let n = 0; n < data.width * data.height * 4; n += 4) {
            let r = data.data[n];
            let g = data.data[n + 1];
            let b = data.data[n + 2];
            let a = data.data[n + 3];
            let color = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
            if (color == module.exports.background_color) {
              data.data[n + 3] = 0;
            }
          }

          ctx.putImageData(data, 0, 0);

          return canvas;
        });
        module.exports.font = {img, grid, char_width, char_height};

        for (let listener of font_queue) {
          setImmediate(() => listener(module.exports.font));
        }
        font_queue = [];

        resolve(module.exports.font);
      }).catch(reject);
    }
  });
}

/**
  Renders a single "pixel" of the rexpaint Image (ie. a single character) into the target image
**/
function render_pixel(ctx, font, x, y, pixel) {
  let fg = `rgb(${pixel.fg.r}, ${pixel.fg.g}, ${pixel.fg.b})`;
  let bg = `rgba(${pixel.bg.r}, ${pixel.bg.g}, ${pixel.bg.b}, ${pixel.transparent ? 0 : 1})`;

  let glyph_canvas = font.grid[pixel.asciiCode % 256];

  let sx = x * font.char_width;
  let sy = y * font.char_height;

  // I don't know how I can reduce it to only two operations
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bg;
  ctx.fillRect(sx, sy, font.char_width, font.char_height);
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(glyph_canvas, 0, 0, font.char_width, font.char_height, sx, sy, font.char_width, font.char_height);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = fg;
  ctx.fillRect(sx, sy, font.char_width, font.char_height);
}

/**
 * @typedef {Object} RenderImageOptions
 * @property {string} [background] Color to use as background.
 * @property {import("rexpaintjs-fork").LayerOption} [layers] Which layers to render.
 */

/**
  Renders a rexpaint Image into a Image; this operation can be quite slow,
  so you should cache the results as much as you can!

  @param {import("rexpaintjs-fork").Image} image
  @param {RenderImageOptions} options
  @returns {Promise<import("@napi-rs/canvas").Canvas>}
**/
const render_image = module.exports.render_image = async function render_image(image, options = {}) {
  let background = options.background ?? "black";
  let layers = options.layers ?? "all";

  let font = await get_font();
  let res = await canvas(image.width * font.char_width, image.height * font.char_height);
  let ctx = res.getContext("2d");

  if (background !== "transparent") {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, res.width, res.height);
  }

  let merged = image.mergeLayers(layers);
  if (!merged) return res;

  for (let y = 0; y < merged.height; y++) {
    for (let x = 0; x < merged.width; x++) {
      let pixel = merged.get(x, y);
      if (!pixel?.transparent) render_pixel(ctx, font, x, y, pixel);
    }
  }

  return res;
}

/**
  Promises that resolves to the loaded font, once it has been loaded.
  Immediately resolves if the font was loaded.
**/
function get_font() {
  return new Promise((resolve, reject) => {
    if (module.exports.font !== null) {
      resolve(module.exports.font);
    } else {
      font_queue.push(resolve);
    }
  });
}

/**
  Wrapper around `createCanvas` to return a Promise instead
**/
function canvas(width, height) {
  return new Promise((resolve, reject) => {
    resolve(createCanvas(width, height));
  });
}
