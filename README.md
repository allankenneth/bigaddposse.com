# Big ADD Posse.com

The Big ADD Posse (BAP) are a group of skilled freestyle footbag players who have contributed to the progression of that sport in a unique way. The group is invite-only, and the only way to get an invitation is to shred hard in front of other members and prove your style.

## Contributing

Want to update member info, fix a typo, or add a video link? There are two ways to contribute:

### Option 1: Create an Issue

If you're not comfortable editing files directly, [open an issue](https://github.com/allankenneth/bigaddposse.com/issues/new) describing the change you'd like to make. Include details like:
- Member name
- What needs to be updated (photo, video link, nickname, etc.)
- Any relevant links or files

### Option 2: Submit a Pull Request

If you're comfortable with GitHub, you can submit changes directly:

1. Fork this repository
2. Edit `members.json` (see below)
3. Submit a pull request with your changes

## How the Site Works

The site is built automatically from `members.json`. When changes are pushed to this file, a GitHub Action rebuilds `index.html`.

### members.json Structure

Each member entry looks like this:

```json
{
  "name": "Player Name",
  "nickname": "Their Nickname",
  "year": 2001,
  "photo": "img/player-name.jpg",
  "video": "https://youtube.com/watch?v=..."
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Full name |
| `nickname` | No | BAP nickname (displayed in uppercase) |
| `year` | Yes | Year inducted into BAP |
| `photo` | Yes | Path to photo in `img/` folder |
| `video` | No | YouTube or Vimeo link to a shred video |

### Adding a New Member

1. Add the member's photo to the `img/` folder
   - Use lowercase with hyphens: `firstname-lastname.jpg`
   - Avoid special characters in filenames
2. Add an entry to `members.json` in the correct position (sorted by year, then alphabetically)
3. Submit a pull request

### Updating a Video Link

Find the member in `members.json` and add or update the `video` field with a YouTube or Vimeo URL.

## Local Development

To build the site locally:

```bash
node scripts/build.js
```

This generates `index.html` from `members.json`.
