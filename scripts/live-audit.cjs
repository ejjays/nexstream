const SeoAnalyzer = require("seo-analyzer");

console.log("--- Auditing LIVE Site: https://ej-nexstream.vercel.app ---");

new SeoAnalyzer()
  .inputFolders(["public"]) // Checks local assets too
  .addRule("titleLengthRule", { min: 10, max: 60 })
  .addRule("metaDescriptionRule", { min: 70, max: 160 })
  .addRule("canonicalTagRule")
  .addRule("metaCustomTagRule", { name: "keywords" })
  .outputConsole()
  .run();
