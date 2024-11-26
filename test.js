const render = require("./index.js");
const fs = require("fs");
const rexpaint = require("rexpaintjs-fork");
const Jimp = require("jimp");
const assert = require("assert");

if (!fs.existsSync("res")) {
  fs.mkdirSync("res", true);
}

// Setup
render.load_font("test/warale_df.png");
render.background_color = 0xFF00FFFF;

let render_normal = render("test/stars.xp", {output: "res/stars.png"});

let buffer = fs.readFileSync("test/stars.xp");
let render_method = rexpaint(buffer).then(img => render(img, {output: "res/stars2.png"}));
let load_reference = Jimp.read("test/stars.png");

Promise.all([load_reference, render_normal, render_method]).then(async ([reference, _normal, _method]) => {
  let normal = await Jimp.read("res/stars.png");
  let method = await Jimp.read("res/stars2.png");
  assert.equal(Jimp.distance(reference, normal), 0);
  assert.equal(Jimp.distance(reference, method), 0);
}).catch(console.error);

(async () => {
  let img_big = await rexpaint(fs.readFileSync("test/background.xp"));
  const ITERS = 10;
  let begin = Date.now();
  for (let n = 0; n < ITERS; n++) {
    await img_big.render();
  }
  console.log(`Average: ${(Date.now() - begin) / ITERS}ms`);
})();
