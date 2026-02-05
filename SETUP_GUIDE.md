# Multi-Server Buildteam Bot - Setup Guide

## Overview
This bot has been updated to support multiple build team servers with the following features:

### Features
1. **Team Assignment**: Users are permanently assigned to a team based on which server they register on
2. **Team Flags**: Each team has a flag/emoji displayed in leaderboards
3. **Per-Server Leaderboards**: Each server has its own leaderboard and submission channel
4. **Centralized Judging**: All judging happens in one central judge channel
5. **Booster System**: Users can earn, view, and activate boosters to gain bonus points

---

## Database Migration

After pulling these changes, you **MUST** run the following commands to update your database:

```bash
npx prisma generate
npx prisma db push
```

This will add the new fields and tables:
- `User` table: `team`, `team_flag`, `guild_id`
- `Build` table: `guild_id`
- New `Booster` table

---

## Configuration

### 1. Update Environment Variables

Copy `.example.env` to `.env` and configure:

```env
BOT_TOKEN=your_bot_token_here
DATABASE_URL="postgresql://user:password@host:5432/database"

# Judge channel (centralized - only on one server)
JUDGE_CHANNEL=123456789
PING_ROLE=987654321

# Server configurations (JSON format)
SERVERS_CONFIG={"GUILD_ID_1":{"submission":"CHANNEL_ID_1","leaderboard_channel":"CHANNEL_ID_2","leaderboard_message":"MESSAGE_ID_1"},"GUILD_ID_2":{"submission":"CHANNEL_ID_3","leaderboard_channel":"CHANNEL_ID_4","leaderboard_message":"MESSAGE_ID_2"}}

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING="your_connection_string"
CDN_URL="https://your-cdn.com"
CONTAINER_NAME="container_name"

# Event info
EVENT_NAME="Your Event Name"
EVENT_IMG="https://your-image-url.com/logo.gif"

# API
PORT=6969
WEBHOOK_URL="https://your-webhook-url.com/webhook"
```

### 2. Configure Teams

Edit `config/teams.js` to define your teams:

```javascript
teams: [
  {
    id: "team_red",
    name: "Red Team",
    flag: "🔴",
    guild_ids: ["123456789", "987654321"], // Guild IDs for red team servers
  },
  {
    id: "team_blue",
    name: "Blue Team",
    flag: "🔵",
    guild_ids: ["111111111"],
  },
  // Add more teams as needed
]
```

**Important**: Each guild ID should only appear in ONE team!

### 3. Set Up Leaderboard Messages

For each server:
1. Create a channel for the leaderboard
2. Send a placeholder message in that channel
3. Copy the message ID and channel ID
4. Add them to `SERVERS_CONFIG`

### 4. Set Up Submission Channels

For each server:
1. Create a channel for build submissions
2. Copy the channel ID
3. Add it to `SERVERS_CONFIG` under `"submission"`

---

## New Commands

### For Users

#### `/register <minecraft_name>`
- Registers a user on their current server's team
- **Once registered, users CANNOT change teams!**
- Shows which team they've been assigned to

#### `/boosters`
- View all available and active boosters
- Shows booster IDs, types, and values
- Displays expiration times for active boosters

#### `/activate_booster <id>`
- Activate a booster by its ID
- **Point Boosters**: Add points immediately
- **Multiplier Boosters**: Multiply points earned from builds for a duration
- Only one multiplier can be active at a time

### For Admins

Existing commands like `/judge`, `/delete`, `/clear_database` etc. remain unchanged.

---

## API Endpoints

### GET `/leaderboard?guild_id=<guild_id>`
Returns leaderboard data for a specific server (optional filter)

**Response:**
```json
{
  "users": [...],
  "builds": [...],
  "points": 12345
}
```

### POST `/grant_booster`
Grant a booster to a user (for minigame integration)

**Request Body:**
```json
{
  "user_id": "123456789",
  "type": "points",  // or "multiplier"
  "value": 50,       // points to add or multiplier (e.g., 2.0 for 2x)
  "duration": 1800000  // in milliseconds (30 min), null for instant points
}
```

**Response:**
```json
{
  "success": true,
  "booster": {
    "id": 1,
    "user_id": "123456789",
    "type": "points",
    "value": 50,
    ...
  }
}
```

---

## Booster Types

### 1. Instant Points Booster
- **Type**: `"points"`
- **Effect**: Adds points immediately when activated
- **Duration**: N/A (instant)
- **Example**: `{"type": "points", "value": 50, "duration": null}`

### 2. Multiplier Booster
- **Type**: `"multiplier"`
- **Effect**: Multiplies points earned from judged builds
- **Duration**: Specified in milliseconds
- **Example**: `{"type": "multiplier", "value": 2.0, "duration": 1800000}` (2x for 30 min)

**Note**: Only ONE multiplier can be active at a time per user.

---

## How It Works

### Registration Flow
1. User runs `/register` on any team server
2. Bot checks which team owns that guild (from `config/teams.js`)
3. User is permanently assigned to that team
4. Team flag is stored with user

### Submission Flow
1. User posts image + coordinates in their server's submission channel
2. Build is created with `guild_id` tracking which server it's from
3. Build appears in centralized judge channel
4. Build appears in that server's leaderboard

### Judging Flow
1. Judges use `/judge` in the central judge channel
2. When 2nd judge rates a build, points are calculated
3. Bot checks if user has an active multiplier booster
4. Points are multiplied if booster is active
5. Points are awarded to user

### Leaderboard Updates
- Runs every 5 minutes
- Updates ALL server leaderboards
- Each server only shows users from their team
- Team flags appear before usernames

---

## Migration from Single-Server

If you're migrating from a single-server setup:

1. **Backup your database first!**
2. Run `npx prisma db push` to add new fields
3. Manually update existing users with team data:
   ```sql
   UPDATE "User" SET team = 'team_name', team_flag = '🔴', guild_id = 'YOUR_GUILD_ID';
   ```
4. Update existing builds with guild_id:
   ```sql
   UPDATE "Build" SET guild_id = 'YOUR_GUILD_ID';
   ```
5. Update `.env` with new `SERVERS_CONFIG` format

---

## Testing Checklist

- [ ] Users can register on different servers
- [ ] Users get assigned correct team and flag
- [ ] Users cannot register twice
- [ ] Submissions work on all servers
- [ ] Each server has its own leaderboard
- [ ] Team flags appear in leaderboards
- [ ] Judging works and awards points correctly
- [ ] Boosters can be granted via API
- [ ] Users can view their boosters
- [ ] Point boosters add points immediately
- [ ] Multiplier boosters multiply build points
- [ ] Only one multiplier can be active at a time
- [ ] Expired boosters stop working

---

## Troubleshooting

### "Dieser Server ist keinem Team zugeordnet"
- Check that the guild ID is in `config/teams.js`
- Ensure guild_ids are strings, not numbers

### Leaderboard not updating
- Verify `SERVERS_CONFIG` is valid JSON
- Check that message IDs and channel IDs are correct
- Ensure the bot has permission to edit those messages

### Boosters not multiplying points
- Verify booster is activated and not expired
- Check console logs for multiplier application
- Ensure booster type is "multiplier" not "points"

### Submissions not working
- Check that the channel ID is in `SERVERS_CONFIG`
- Verify user is registered
- Ensure bot has permissions in submission channel

---

## Support

For issues or questions, check the logs:
- Registration events log team assignment
- Booster activation logs multiplier application
- Leaderboard updates log per-guild updates
- API calls log booster grants

All timestamps are logged for debugging.
