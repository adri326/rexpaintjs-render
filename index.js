const rexpaint = require("rexpaintjs-fork");
const crypto = require("crypto");
const fs = require("fs");
const {createCanvas, loadImage} = require("canvas");

const ROW_SIZE = 16;
const N_ROWS = 16; // used for font import

function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

module.exports.background_color = 0x0; // RGBA

module.exports.OUTPUT_URI = module.exports.OUTPUT_URI_PNG = Symbol("OUTPUT_URI_PNG");
module.exports.OUTPUT_URI_JPEG = Symbol("OUTPUT_URI_JPEG");
module.exports.OUTPUT_URI_BMP = Symbol("OUTPUT_URI_BMP");

/**
  Main function: call it with either an Image instance or a path to a rexpaint .XP file.
**/
const render = module.exports = function render(image, options = {}) {
  if (typeof image === "string") {
    return new Promise((resolve, reject) => {
      fs.readFile(image, (err, buffer) => {
        if (err) reject(err);
        rexpaint(buffer).then(data => {
          render(data, options).then(resolve).catch(reject);
        }).catch(reject);
      });
    });
  }

  options = {
    output: null,
    background: "transparent",
    layers: "all",
    ...options
  };

  return new Promise(async (resolve, reject) => {
    let res = await render_image(image, options);
    if (typeof options.output === "string") {
      let stream = res.createPNGStream();
      let out = fs.createWriteStream(options.output);
      stream.pipe(out);
      out.on("error", (err) => {
        reject(err);
      });
      out.on("finish", () => {
        resolve(res);
      });
    } else if (options.output === module.exports.OUTPUT_URI_PNG) {
      res.toDataURL("image/png", (err, data) => {
        if (err) reject(err);
        resolve(data);
      });
    } else if (options.output === module.exports.OUTPUT_URI_JPEG) {
      res.toDataURL("image/jpeg", (err, data) => {
        if (err) reject(err);
        resolve(data);
      });
    } else if (options.output === module.exports.OUTPUT_URI_BMP) {
      res.toDataURL("image/bmp", (err, data) => {
        if (err) reject(err);
        resolve(data);
      });
    } else {
      resolve(res);
    }
  });
}

/**
  Calls rexpaintjs-render's rexpaint() function with the current Image instance
**/
rexpaint.Image.prototype.render = function render(options = {}) {
  return module.exports(this, options);
}

module.exports.font = null;
let font_queue = [];

/**
  Loads a font as a Image, necessary to render any rexpaint image
**/
module.exports.load_font = function load_font(path, char_width = null, char_height = null) {
  return new Promise((resolve, reject) => {
    if (module.exports.font) {
      resolve(module.exports.font);
    } else {
      loadImage(path).then((img) => {
        if (char_width === null || char_height === null) {
          char_width = img.width / ROW_SIZE;
          char_height = img.height / N_ROWS;
        }
        let grid = new Array(256).fill(null).map((_, i) => {
          x = i % 16;
          y = Math.floor(i / 16);

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

          return [canvas, ctx.createPattern(canvas)];
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

  let [glyph_canvas, glyph_pattern] = font.grid[pixel.asciiCode % 256];

  let sx = x * font.char_width;
  let sy = y * font.char_height;

  // I don't know how I can reduce it to only two operations
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bg;
  ctx.fillRect(sx, sy, font.char_width, font.char_height);
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = glyph_pattern;
  ctx.fillRect(sx, sy, font.char_width, font.char_height);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = fg;
  ctx.fillRect(sx, sy, font.char_width, font.char_height);
}

/**
  Renders a rexpaint Image into a Image; this operation is quite slow (as it is done in Javascript),
  so you should cache the results as much as you can!
**/
const render_image = module.exports.render_image = async function render_image(image, options = {}) {
  let background = options.background ?? 0x0;
  let layers = options.layers ?? "all";

  let font = await get_font();
  let res = await canvas(image.width * font.char_width, image.height * font.char_height, background);
  let ctx = res.getContext("2d");

  if (background !== "transparent") {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, res.width, res.height);
  }

  let merged = image.mergeLayers(layers);
  for (let y = 0; y < merged.height; y++) {
    for (let x = 0; x < merged.width; x++) {
      let pixel = merged.get(x, y);
      if (!pixel.transparent) render_pixel(ctx, font, x, y, pixel);
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
function canvas(width, height, background = 0) {
  return new Promise((resolve, reject) => {
    resolve(createCanvas(width, height));
  });
}
