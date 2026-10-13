# Northbound Games website

The portfolio site for Northbound Games, a game studio of SideQuestDigital. Static files, no build step.
Serve the folder over http (opening `index.html` as a file works for the arcade, but Deadzone needs http).

The look follows big studio sites (Respawn, KRAFTON, Raven): warm near-black, one accent (the gold of
the logo's star), sharp corners, Big Shoulders Display capitals for statements and Inter for text.
The front page opens on Deadzone's maps crossfading behind the studio statement, then the games
(Deadzone as the flagship, the six arcade games below), the studio, news and a closing call to action.
The Games page is the console launcher: the selected game runs live behind its info and a shelf of
tiles sits along the bottom (arrow keys, mouse, touch or a gamepad). Every page shares the same nav
and footer; if you change them, update all seven files. Tokens are at the top of `assets/css/site.css`.

```
index.html               Front page: map hero, games (flagship and arcade), studio, news, call to action
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
assets/js/site.js        nav, front page hero and arcade grid, launcher shelf, live game art, gamepad, map viewer, trophies, lab demo, snow
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
