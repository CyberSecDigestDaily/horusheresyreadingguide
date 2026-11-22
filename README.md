# Horus Heresy Reading Log

The Horus Heresy and the Siege of Terra in reading order, with a verdict and score for every book, progress tracking and a Raven Guard path.

**Live:** https://cybersecdigestdaily.github.io/horusheresyreadingguide/

## How progress syncs

No accounts, tokens or setup on any device.

- Every tick is stamped with the time it was made. For each book the newest stamp wins.
- The page sends ticks through [ntfy.sh](https://ntfy.sh) (the `RELAY_TOPIC` in `index.html`), so open devices pick them up within about 30 seconds.
- `.github/workflows/save-progress.yml` runs every 15 minutes, merges the relay's messages into `progress.json` and commits it. The relay keeps messages for 12 hours, so nothing is lost if a run is late.
- On load the page merges `progress.json`, the relay's last 12 hours and anything the device hasn't sent yet. Ticks a browser saved before sync existed are carried over the first time it opens the page.
- If a tick still isn't in `progress.json` after 45 minutes, the device that has it sends it again (at most every 6 hours).

Trade-off: the relay topic is visible in the page source, so anyone who reads it could post ticks. Every version of `progress.json` is in git history. To undo unwanted changes, restore `progress.json` and change `RELAY_TOPIC` (the workflow reads it from `index.html`).
