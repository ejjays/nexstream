const SeoAnalyzer = require("seo-analyzer");

new SeoAnalyzer()
  .inputFiles(["index.html"])
  .addRule("titleLengthRule", { min: 10, max: 60 })
  .addRule("metaDescriptionRule", { min: 70, max: 160 })
  .addRule("imgTagWithAltAttributeRule")
  .addRule("aTagWithRelAttributeRule")
  .addRule("canonicalTagRule")
  .addRule("metaCustomTagRule", {
    name: "keywords",
  })
  .outputConsole()
  .run();
