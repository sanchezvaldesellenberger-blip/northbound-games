# Northbound Games website

The portfolio site for Northbound Games, a game studio of SideQuestDigital. Static files, no build step.
Serve the folder over http (opening `index.html` as a file works for the arcade, but Deadzone needs http).

The front page is a showreel: every game's live art crossfades behind the studio name, with the
news feed, the games row and the studio hub below it. The Games page is a console home screen: the
selected game runs live behind its info and a shelf of game tiles sits along the bottom (arrow keys,
mouse, touch or a gamepad). The rest of the site is separate library pages. Pages slide between each other (cross-document view transitions in Chrome/Edge), and
Q / E or a controller's LB / RB switch tabs. The inner pages share a header and footer that were generated
once; if you change the top bar, update it in all seven files. Barlow + Barlow Semi Condensed, dark only. Tokens are at the top of `assets/css/site.css`.

```
index.html               Front page: the showreel, What's new, the games row, Around the studio
games.html               Games: the console launcher (full screen)
deadzone.html            Deadzone game page: facts, map viewer, modes, features, update history
about.html               About: the studio, Deadzone, how the games are made, SideQuestDigital
trophies.html            Trophies and the high-score board
lab.html                 Under the hood: the game feel demo
help.html                Help: FAQ and contact
assets/css/site.css      all styles (tokens first, then the home screen, library panels and player)
assets/brand/            logo cutouts from northbound_games_pfp.jpg, favicons, a small SideQuest mark
assets/projects/         portfolio images (Deadzone screenshot, and deadzone/ map art from Deadzone Web's public/loading)
assets/js/core.js        shared helpers, palette, season switch, and the WebAudio synth
assets/js/runner.js      the game player: loop, input, particles, READY/GO intro, slow motion, high scores
assets/js/site.js        showreel, feed, launcher shelf, live game art, gamepad browsing, map viewer, trophies, lab demo, snow
assets/js/games/*.js     one file per arcade game
deadzone/                the offline Deadzone build (git-ignored, about 530 MB; see below)
```

## Seasons

Snow and winter art appear only in December: the games switch to their winter scenes and snow falls on the
site. Preview it any time with `?season=winter` (or force the normal look with `?season=default`).
Games read `NB.winter` inside `create()` and `thumb()`.

## Deadzone offline edition

Built from `Documents\Deadzone Web` with its offline mode (no multiplayer, accounts or feedback; bots, free roam
and the training range work with no server). To rebuild:

1. In `Deadzone Web`, run `npm run build:offline` (output goes to `dist-offline/`).
2. Replace the contents of `northbound/deadzone/` with `dist-offline/*`.

The folder is git-ignored in the SQD repo because of its size, so upload it separately when deploying.
No file is over 25 MB (the largest model is about 19 MB), which fits Cloudflare's per-file limit.

## Adding an arcade game

1. Create `assets/js/games/your-game.js` and call `NB.register({...})` (copy an existing game).
2. Add `<script defer src="assets/js/games/your-game.js"></script>` in `index.html` and `games.html` next to the others.

`api` gives you `score(n)`, `over(delay)`, `burst(x, y, opts)`, `ring(x, y, opts)`, `float(x, y, text, opts)`,
`shake(px)`, `flash(color, alpha)` and `sfx(name)`. Games draw in an 800×500 space.

Secret: ↑↑↓↓←→←→BA on the page lets it snow and unlocks the True North trophy (hinted at in the footer).
