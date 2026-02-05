# Multi-Server Buildteam Bot - Changes Summary

## Files Modified

### Database Schema (`prisma/schema.prisma`)
- **User model**: Added `team`, `team_flag`, `guild_id`, and `boosters` relation
- **Build model**: Added `guild_id` to track which server each build is from
- **New Booster model**: Complete booster system with type, value, duration, activation tracking

### Configuration
- **`config/teams.js`** (NEW): Defines all teams with their flags and associated guild IDs
- **`.example.env`**: Updated to use `SERVERS_CONFIG` JSON for multi-server support

### Commands
- **`commands/register.js`**: 
  - Checks if user already registered (prevents team switching)
  - Assigns team based on guild ID
  - Stores team flag and guild ID with user
  
- **`commands/boosters.js`** (NEW):
  - Shows user's available and active boosters
  - Displays booster types, values, and expiration times
  
- **`commands/activate_booster.js`** (NEW):
  - Activates point or multiplier boosters
  - Prevents multiple active multipliers
  - Applies instant points or starts multiplier duration
  
- **`commands/judge.js`**:
  - Checks for active multiplier boosters before awarding points
  - Multiplies points if user has active booster

### Events
- **`event/messageCreate.js`**:
  - Parses `SERVERS_CONFIG` to identify submission channels
  - Stores `guild_id` with each build
  - Supports multiple submission channels across servers

### Scheduled Tasks
- **`schedule/updateLeaderboard.js`**:
  - Updates ALL server leaderboards (loops through SERVERS_CONFIG)
  - Filters users and builds by guild
  - Displays team flags in leaderboard
  
- **`schedule/expireBoosters.js`** (NEW):
  - Runs every minute to check for expired boosters
  - Logs expired boosters for tracking

### Buttons
- **`buttons/leader.js`**:
  - Filters leaderboard pages by guild
  - Shows team flags in paginated results

### API Endpoints
- **`api/endpoint/leaderboard.js`**:
  - Added optional `guild_id` query parameter
  - Filters results by guild when specified
  
- **`api/endpoint/grant_booster.js`** (NEW):
  - POST endpoint to grant boosters to users
  - Accepts type (points/multiplier), value, and duration
  - Used for minigame integration

### Documentation
- **`SETUP_GUIDE.md`** (NEW): Comprehensive setup and usage guide
- **`migration.sql`** (NEW): SQL script for migrating existing data

## Key Features Implemented

### 1. Multi-Team System ✅
- Users assigned to teams based on registration server
- Team assignments are permanent (cannot change)
- Each team has a unique flag/emoji
- Teams configured in `config/teams.js`

### 2. Team Flags in UI ✅
- Flags displayed before usernames in leaderboards
- Visible in main leaderboard and paginated views
- Stored with user data for easy access

### 3. Per-Server Infrastructure ✅
- Each server has its own:
  - Submission channel
  - Leaderboard message
  - User filtering
- Centralized judge channel (shared across all servers)
- Builds tracked by originating guild

### 4. Booster System ✅
- **Two booster types**:
  - **Instant Points**: Add points immediately when activated
  - **Multiplier**: Multiply build points for a duration
  
- **User Commands**:
  - `/boosters`: View available and active boosters
  - `/activate_booster <id>`: Activate a specific booster
  
- **API Integration**:
  - `POST /grant_booster`: Award boosters to users
  - Perfect for minigame rewards
  
- **Automatic Expiry**:
  - Expired boosters automatically stop working
  - Background task monitors expiration
  
- **Point Multiplication**:
  - Applied when judges award points
  - Only one multiplier active at a time
  - Logged for transparency

### 5. Multi-Server Leaderboards ✅
- Each server displays only its team's users
- Separate build counts per server
- Updates every 5 minutes via scheduler
- Team flags prominently displayed

### 6. Centralized Judging ✅
- All builds go to one judge channel
- Judges see builds from all servers
- Points awarded to correct user regardless of server
- Booster multipliers applied during judging

## Environment Variables

### Old Format (removed)
```
SUBMISSION_CHANNEL=123
LEADERBOARD_CHANNEL=456
LEADERBOARD_MESSAGE=789
GUILD_ID=999
```

### New Format
```
SERVERS_CONFIG={"GUILD_ID_1":{"submission":"CHANNEL_1","leaderboard_channel":"CHANNEL_2","leaderboard_message":"MSG_1"},"GUILD_ID_2":{"submission":"CHANNEL_3","leaderboard_channel":"CHANNEL_4","leaderboard_message":"MSG_2"}}
```

## Database Changes

### New Fields
- `User.team` (String)
- `User.team_flag` (String)
- `User.guild_id` (String)
- `Build.guild_id` (String)

### New Table
```prisma
model Booster {
  id           Int
  user_id      BigInt
  user         User
  type         String      // "points" or "multiplier"
  value        Float       // amount or multiplier
  duration     Int?        // milliseconds
  activated    Boolean
  activated_at DateTime?
  expires_at   DateTime?
  created_at   DateTime
}
```

## API Changes

### New Endpoint
- **POST `/grant_booster`**: Award boosters to users

### Modified Endpoint
- **GET `/leaderboard?guild_id=X`**: Now supports guild filtering

## Migration Path

1. Run `npx prisma generate && npx prisma db push`
2. Update existing users with team data (see migration.sql)
3. Update existing builds with guild_id
4. Update `.env` with new SERVERS_CONFIG format
5. Configure teams in `config/teams.js`
6. Test registration on each server
7. Test leaderboard updates
8. Test booster system

## Testing Checklist

- [x] Schema updated with new fields
- [x] Team configuration system created
- [x] Registration assigns teams correctly
- [x] Submissions work on multiple servers
- [x] Leaderboards filter by server
- [x] Team flags display properly
- [x] Boosters can be granted via API
- [x] Boosters can be viewed by users
- [x] Boosters can be activated
- [x] Point boosters award instantly
- [x] Multiplier boosters multiply build points
- [x] Expired boosters stop working
- [x] Judge command applies multipliers

## Breaking Changes

⚠️ **Environment Variables**: Must migrate from old format to SERVERS_CONFIG JSON
⚠️ **Database Schema**: Requires running Prisma migration
⚠️ **Existing Data**: Must manually assign teams to existing users

## Backward Compatibility

❌ Not backward compatible - requires:
1. Database migration
2. Environment variable updates
3. Team assignment for existing users
