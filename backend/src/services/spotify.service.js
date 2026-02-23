const spotifyService = require("./spotify/index");

module.exports = {
  resolveSpotifyToYoutube: spotifyService.resolveSpotifyToYoutube,
  fetchIsrcFromDeezer: spotifyService.fetchIsrcFromDeezer,
  saveToBrain: spotifyService.saveToBrain,
};
