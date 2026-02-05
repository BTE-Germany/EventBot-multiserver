# Quick Start Checklist

## Initial Setup

### 1. Database Migration
```bash
cd /workspaces/EventBot-multiserver
npx prisma generate
npx prisma db push
```

### 2. Configure Teams
Edit `config/teams.js`:
- [ ] Update team names
- [ ] Update team flags/emojis
- [ ] Add actual guild IDs for each team
- [ ] Ensure each guild ID appears only once

Example:
```javascript
{
  id: "team_red",
  name: "Red Team",
  flag: "🔴",
  guild_ids: ["123456789012345678"], // Your actual Discord server ID
}
```

### 3. Set Up Environment
Copy `.example.env` to `.env`:
- [ ] Add `BOT_TOKEN`
- [ ] Add `DATABASE_URL`
- [ ] Add `JUDGE_CHANNEL` (single channel for all servers)
- [ ] Add `PING_ROLE` (judge role ID)
- [ ] Add Azure storage credentials
- [ ] Add event info (name, image)

### 4. Configure Server Settings
For EACH build team server:

#### Server 1
- [ ] Create submission channel → copy channel ID
- [ ] Create leaderboard channel
- [ ] Send a message in leaderboard channel → copy message ID and channel ID
- [ ] Update `SERVERS_CONFIG`:
```json
{
  "YOUR_GUILD_ID_1": {
    "submission": "SUBMISSION_CHANNEL_ID",
    "leaderboard_channel": "LEADERBOARD_CHANNEL_ID",
    "leaderboard_message": "LEADERBOARD_MESSAGE_ID"
  }
}
```

#### Server 2
- [ ] Repeat above steps
- [ ] Add to same `SERVERS_CONFIG` JSON

Final `SERVERS_CONFIG` example:
```json
{"123456789":{"submission":"987654321","leaderboard_channel":"111111111","leaderboard_message":"222222222"},"333333333":{"submission":"444444444","leaderboard_channel":"555555555","leaderboard_message":"666666666"}}
```

### 5. Migrate Existing Data (if applicable)
If you have existing users/builds:
- [ ] Edit `migration.sql` with your team info
- [ ] Run SQL commands to assign teams to existing users
- [ ] Run SQL commands to assign guild_id to existing builds

### 6. Start Bot
```bash
npm start
```

### 7. Test Everything

#### Test Registration
- [ ] Run `/register` on Server 1 → should assign Team 1
- [ ] Run `/register` on Server 2 → should assign Team 2
- [ ] Try registering same user twice → should be blocked

#### Test Submissions
- [ ] Post image + coords in Server 1 submission channel
- [ ] Verify build appears in judge channel
- [ ] Post image + coords in Server 2 submission channel
- [ ] Verify both builds appear in judge channel

#### Test Judging
- [ ] Run `/judge` on a build
- [ ] Second judge rates same build
- [ ] Verify points awarded
- [ ] Check console for any multiplier application

#### Test Leaderboards
- [ ] Wait 5 minutes for auto-update OR restart bot
- [ ] Check Server 1 leaderboard → should show only Server 1 users
- [ ] Check Server 2 leaderboard → should show only Server 2 users
- [ ] Verify team flags appear before usernames
- [ ] Test pagination buttons

#### Test Boosters
- [ ] Grant a booster via API:
```bash
curl -X POST http://localhost:6969/grant_booster \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_DISCORD_USER_ID",
    "type": "points",
    "value": 50,
    "duration": null
  }'
```
- [ ] Run `/boosters` → should see the booster
- [ ] Run `/activate_booster <id>` → should add points instantly

- [ ] Grant a multiplier booster:
```bash
curl -X POST http://localhost:6969/grant_booster \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_DISCORD_USER_ID",
    "type": "multiplier",
    "value": 2.0,
    "duration": 1800000
  }'
```
- [ ] Activate the multiplier
- [ ] Submit and judge a build → verify 2x points

#### Test API
- [ ] GET `http://localhost:6969/leaderboard`
- [ ] GET `http://localhost:6969/leaderboard?guild_id=SERVER1_ID`
- [ ] Verify data is filtered correctly

## Common Issues

### "Dieser Server ist keinem Team zugeordnet"
- Guild ID not in `config/teams.js`
- Check guild_ids are strings: `"123456789"` not `123456789`

### Leaderboard not updating
- Check SERVERS_CONFIG is valid JSON (use a JSON validator)
- Verify bot has edit permissions on leaderboard messages
- Check console for errors

### Submissions ignored
- Channel not in SERVERS_CONFIG
- User not registered
- Check bot permissions in submission channel

### Booster not multiplying
- Verify booster is activated with `/boosters`
- Check it hasn't expired
- Look for "Booster-Multiplikator angewendet" in console logs

## Final Verification

- [ ] Multiple users registered across different servers
- [ ] Each server has submissions
- [ ] All builds judged successfully
- [ ] Leaderboards showing correct data per server
- [ ] Team flags displaying correctly
- [ ] Boosters working (both types)
- [ ] No errors in console
- [ ] Database has team and guild_id data

## Production Deployment

Before going live:
- [ ] Set proper `DATABASE_URL` for production
- [ ] Configure production Azure storage
- [ ] Set production `WEBHOOK_URL`
- [ ] Test with production guild IDs
- [ ] Set up monitoring/logging
- [ ] Document team assignments for admins
- [ ] Create backup of database

---

✅ **Setup Complete!** Your multi-server buildteam bot is ready to use.

Need help? Check:
- `SETUP_GUIDE.md` - Full documentation
- `CHANGES.md` - Technical details
- Console logs for errors
