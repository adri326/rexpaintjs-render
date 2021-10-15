const Jimp = require("jimp");
const rexpaint = require("rexpaintjs-fork");
const crypto = require("crypto");
const fs = require("fs");

const ROW_SIZE = 16;
const N_ROWS = 16; // used for font import

function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

module.exports.background_color = 0x0;

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
      res.write(options.output, (err) => {
        if (err) reject(err);
        resolve(res);
      });
    } else if (options.output === module.exports.OUTPUT_URI_PNG) {
      res.getBase64(Jimp.MIME_PNG, (err, data) => {
        if (err) reject(err);
        resolve(data);
      });
    } else if (options.output === module.exports.OUTPUT_URI_JPEG) {
      res.getBase64(Jimp.MIME_JPEG, (err, data) => {
        if (err) reject(err);
        resolve(data);
      });
    } else if (options.output === module.exports.OUTPUT_URI_BMP) {
      res.getBase64(Jimp.MIME_BMP, (err, data) => {
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
  Loads a font as a Jimp image, necessary to render any rexpaint image
**/
module.exports.load_font = function load_font(path, char_width = null, char_height = null) {
  return new Promise((resolve, reject) => {
    if (module.exports.font) {
      resolve(module.exports.font);
    } else {
      Jimp.read(path).then((img) => {
        if (char_width === null || char_height === null) {
          char_width = img.bitmap.width / ROW_SIZE;
          char_height = img.bitmap.height / N_ROWS;
        }
        module.exports.font = {img, char_width, char_height};

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
function render_pixel(image, font, x, y, pixel) {
  let fx = (pixel.asciiCode % ROW_SIZE) * font.char_width;
  let fy = ~~(pixel.asciiCode / ROW_SIZE) * font.char_height;

  let fg = Jimp.rgbaToInt(pixel.fg.r, pixel.fg.g, pixel.fg.b, 255);
  let bg = Jimp.rgbaToInt(pixel.bg.r, pixel.bg.g, pixel.bg.b, pixel.transparent ? 0 : 255);

  // Following is the slowest operation of this module
  // There isn't much to be done, except to use a C module (which I could honestly write but don't really have the time for) with SIMD or go for hardware acceleration (out of my reach for now)
  for (let dy = 0; dy < font.char_height; dy++) {
    for (let dx = 0; dx < font.char_width; dx++) {
      let pixel_from = font.img.getPixelColor(fx + dx, fy + dy);
      let color;
      if (pixel_from == module.exports.background_color) {
        color = bg;
      } else {
        color = fg;
      }
      image.setPixelColor(color, x * font.char_width + dx, y * font.char_height + dy);
    }
  }
}

/**
  Renders a rexpaint Image into a Jimp image; this operation is quite slow (as it is done in Javascript),
  so you should cache the results as much as you can!
**/
const render_image = module.exports.render_image = async function render_image(image, options = {}) {
  let background = options.background ?? 0x0;
  let layers = options.layers ?? "all";
  if (background === "transparent") {
    background = 0x0;
  } else if (typeof background === "string") {
    background = Jimp.cssColorToHex(options.background);
  }

  let font = await get_font();
  let res = await jimp_create(image.width * font.char_width, image.height * font.char_height, background);

  let merged = image.mergeLayers(layers);
  for (let y = 0; y < merged.height; y++) {
    for (let x = 0; x < merged.width; x++) {
      let pixel = merged.get(x, y);
      if (!pixel.transparent) render_pixel(res, font, x, y, pixel);
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
  Wrapper around `new Jimp` to return a Promise instead
**/
function jimp_create(width, height, background = 0) {
  return new Promise((resolve, reject) => {
    new Jimp(width, height, background, (err, img) => {
      if (err) reject(err);
      else resolve(img);
    });
  });
}
