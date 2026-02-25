# BTE Germany EventBot

# What is this?

This bot is supposed to simplify the submission and judging of buildings built during an Event. It connects Discord and Minecraft accounts for seamless integration. An API is provided to create a leaderboard.

# Quickstart
To get started, run the following commands in  a new folder

```
$ curl -O https://raw.githubusercontent.com/BTE-Germany/EventBot/DiscordJS/docker-compose.yml
$ docker pull ghcr.io/bte-germany/eventbot:latest
$ docker pull postgres:14.1-alpine
$ docker-compose up -d
```

The port 6970 will be exposed for management of the built-in database. If you do not want to use the built-in database or don't want this port to be exposed, please edit the `docker-compose.yml` file accordingly. 
The port 6969 will be exposed for access to the built-in API. If you do not want to use the built-in API or don't want this port to be exposed, please edit the `docker-compose.yml` file accordingly.

# Recovery script for missed builds

If a specific server missed submissions, you can re-post specific build IDs into that server's submission channel and sync them in the database.

Command:

```
npm run recover-builds -- --guild <GUILD_ID> --ids "100-110,120,123"
```

Optional flags:

- `--builder <DISCORD_USER_ID>`: required only for IDs that do not yet exist in DB (creates placeholder builds)
- `--location "Recovered build"`: custom location prefix for created placeholders
- `--dry-run`: validate parsing and config without posting/saving

Examples:

```
npm run recover-builds -- --guild 123456789012345678 --ids "500-520,530,540"
npm run recover-builds -- --guild 123456789012345678 --ids "700,701,702" --builder 999999999999999999
```

# Lossless image migration to WebP

To reduce blob storage usage without visible quality loss, you can migrate already stored build images to lossless WebP.

Run a dry-run first:

```
npm run migrate-images-webp -- --dry-run
```

Then run the actual migration:

```
npm run migrate-images-webp
```

Optional flags:

- `--ids "100-120,150"`: migrate only selected build IDs
- `--limit 500`: process only the first N builds (ascending ID)
- `--keep-original`: do not delete old source blobs after migration

Examples:

```
npm run migrate-images-webp -- --dry-run --ids "1-200"
npm run migrate-images-webp -- --ids "1-200"
```

# Update existing embed image URLs to .webp

After migrating blob files, update already posted Discord embeds (judge + all submission messages) so image URLs end with `.webp`.

Run a dry-run first:

```
npm run update-embed-urls-webp -- --dry-run
```

Then apply changes:

```
npm run update-embed-urls-webp
```

Optional flags:

- `--ids "100-120,150"`: update only selected build IDs
- `--limit 500`: process only first N builds (ascending ID)
- `--force`: do not skip messages where URLs are already `.webp`; force a message edit

# Re-sync Discord messages from database

If you made manual DB edits (e.g. build coordinates, flags, ratings, team flag, or points), you can rebuild all related Discord messages from the current database state.

Run a dry-run first:

```
npm run resync-messages -- --dry-run
```

Then apply changes:

```
npm run resync-messages
```

Optional flags:

- `--ids "100-120,150"`: sync only selected build IDs
- `--limit 500`: process only first N builds (ascending ID)
- `--skip-leaderboards`: do not update leaderboard messages

Examples:

```
npm run resync-messages -- --dry-run --ids "1-200"
npm run resync-messages -- --ids "1-200"
npm run resync-messages -- --skip-leaderboards
```

