# Foreign Build Flag & Multilanguage Support - Update Guide

## New Features Added

### 1. Foreign Build Flag 🌍
Judges can now mark builds as "foreign builds" which multiplies the points awarded by a configurable factor.

### 2. Multilanguage Support 🗣️
Complete multilanguage system with 14 languages:
- **English** (en) - Default
- **German** (de)
- **French** (fr)
- **Albanian** (sq)
- **Bosnian** (bs)
- **Bulgarian** (bg)
- **Croatian** (hr)
- **Greek** (el)
- **Macedonian** (mk)
- **Romanian** (ro)
- **Serbian** (sr)
- **Slovenian** (sl)
- **Swiss German** (gsw)
- **Romansh** (rm)

---

## Database Migration

**IMPORTANT:** Run this after pulling the changes:

```bash
npx prisma generate
npx prisma db push
```

### New Fields Added:
- `User.language` - String, default "en"
- `Build.foreign_build` - Boolean, default false

---

## Configuration

### Environment Variables

Add to your `.env`:

```env
# Points multiplier for foreign builds (e.g., 1.5 = 150%, 2.0 = 200%)
FOREIGN_BUILD_FACTOR=1.5
```

**Examples:**
- `FOREIGN_BUILD_FACTOR=1.5` → Foreign builds get 50% more points
- `FOREIGN_BUILD_FACTOR=2.0` → Foreign builds get double points
- `FOREIGN_BUILD_FACTOR=1.2` → Foreign builds get 20% more points

---

## How Foreign Builds Work

### 1. Judge Command
When judging a build, judges now have a new option:
```
/judge id:123 details:8 aufwand:7 grundpunkte:true foreign_build:true
```

### 2. Point Calculation
Points are calculated in this order:
1. **Base calculation:** (Details + Effort) / 2
2. **Base points modifier:** +0 or -5
3. **Foreign build multiplier:** × FOREIGN_BUILD_FACTOR (if flagged)
4. **User booster multiplier:** × booster value (if active)

### Example:
- Details: 8, Effort: 7, Base points: Yes
- Normal points: (8 + 7) / 2 = 7.5
- Foreign build (1.5x): 7.5 × 1.5 = 11.25
- With 2x booster: 11.25 × 2 = 22.5 final points

### 3. Display
- First judge sees: "Foreign build: Yes/No"
- Final judged build shows: "Foreign build: Yes/No" in rating details
- Logged in console for tracking

---

## How Multilanguage Works

### 1. Registration
Users select their language during registration:
```
/register minecraft:PlayerName language:Deutsch
```

Available choices:
- English
- Deutsch
- Français
- Shqip
- Bosanski
- Български
- Hrvatski
- Ελληνικά
- Македонски
- Română
- Српски
- Slovenščina
- Schwyzerdütsch
- Rumantsch

### 2. Changing Language
Users can change their language anytime:
```
/language new_language:Français
```

### 3. What Gets Translated

**All user-facing messages:**
- Registration responses
- Error messages
- Booster notifications
- Judge feedback
- Leaderboard text
- Button labels
- Command descriptions

**Examples in German:**
```
✅ Booster aktiviert! Du hast 50 Punkte sofort erhalten!
```

**Examples in French:**
```
✅ Booster activé! Vous avez reçu 50 points instantanément!
```

### 4. How It Works
- Each user's language preference is stored in the database
- All messages use translation keys
- Falls back to English if translation missing
- Works with all commands and events

---

## Commands Updated

### `/register`
- Now requires language selection
- Description in English/German/French
- Saves language preference

### `/language` (NEW)
- Change language anytime
- Shows current language
- All 14 languages available

### `/judge`
- New `foreign_build` option (boolean)
- First judge decision is saved
- Applied during second judge calculation
- Multilingual responses

### `/boosters`
- Fully translated
- Shows boosters in user's language

### `/activate_booster`
- Fully translated
- Success messages in user's language

---

## Translation System

### File Structure
```
config/translations.js
```

### Adding New Translations

To add a new language:

```javascript
// In config/translations.js
translations.xx = {  // Language code
  already_registered: "Translation here",
  minecraft_taken: "Translation here",
  // ... all keys
};

languages.xx = "Language Name";
```

### Translation Keys
All keys are documented in `config/translations.js`:
- Registration messages
- Booster messages
- Judge messages
- Language settings
- General messages
- Command descriptions

### Using Translations in Code

```javascript
const { t, getUserLanguage } = require("../config/translations.js");

// Get user's language
const lang = await getUserLanguage(prisma, userId);

// Translate a message
const message = t(lang, "key_name");

// Translate with replacements
const message = t(lang, "key_name", { 
  team: "Red Team",
  flag: "🔴"
});
```

---

## Migration from Previous Version

### For Existing Users
Existing users will:
- Default to English language
- Can change language with `/language` command
- No data loss

### SQL to Update Existing Users (Optional)

```sql
-- Set all existing users to German
UPDATE "User" SET language = 'de' WHERE language = 'en';

-- Set specific users to specific language
UPDATE "User" SET language = 'fr' WHERE id IN ('123', '456');
```

---

## Testing Checklist

### Foreign Build Feature
- [ ] Judge can set `foreign_build:true`
- [ ] First judge sees foreign build flag in embed
- [ ] Second judge calculation applies FOREIGN_BUILD_FACTOR
- [ ] Final embed shows foreign build status
- [ ] Console logs show foreign build multiplier
- [ ] Points are correct (manual calculation)

### Multilanguage Feature
- [ ] Registration requires language selection
- [ ] All 14 languages appear in dropdown
- [ ] Language is saved to database
- [ ] `/language` command works
- [ ] Messages appear in correct language
- [ ] Registration messages translated
- [ ] Booster messages translated
- [ ] Judge messages translated
- [ ] Leaderboard buttons translated
- [ ] Error messages translated
- [ ] Fallback to English works

### Combined Features
- [ ] Foreign build works with boosters
- [ ] Translations work for all commands
- [ ] User language persists across sessions
- [ ] No errors in console

---

## Language Coverage

### Complete Translations
- English (100%)
- German (100%)
- French (100%)

### Partial Translations
All other languages have:
- Core messages (registration, errors)
- Key phrases (yes/no, coordinates, points)
- Important feedback messages

**Note:** Balkan languages have essential phrases. Expand as needed.

---

## Examples

### Foreign Build in Action

**Scenario:** Build rated 8/7, base points yes, foreign build yes, 1.5x factor

```
Judge 1: /judge id:10 details:8 aufwand:7 grundpunkte:true foreign_build:true
Bot: Build #10 bewertet. Du warst der 1. Judge.

Judge 2: /judge id:10 details:8 aufwand:8
Bot: Build #10 bewertet. Punkte wurden dem User gutgeschrieben.

Console: Foreign build multiplier (1.5x) applied for build 10
Points: ((8+8)/2 + (7+8)/2 + 0) * 1.5 = 11.25
```

### Multilanguage in Action

**User registers in French:**
```
User: /register minecraft:Pierre language:Français
Bot: Vous avez été inscrit avec succès pour Red Team 🔴!
```

**User activates booster:**
```
User: /activate_booster id:5
Bot: ✅ Booster activé! Vous avez reçu 50 points instantanément!
```

**User changes language:**
```
User: /language new_language:Deutsch
Bot: ✅ Sprache auf Deutsch aktualisiert!
```

---

## Troubleshooting

### Foreign build multiplier not applying
- Check `FOREIGN_BUILD_FACTOR` in `.env`
- Verify first judge set `foreign_build:true`
- Check console logs for "Foreign build multiplier applied"
- Ensure factor is a number (1.5 not "1.5")

### Translations not working
- Check database has `language` field
- Run `npx prisma db push`
- Verify user has language set
- Check console for translation errors
- Ensure translation key exists in `config/translations.js`

### Language not saving
- Verify user is registered
- Check database write permissions
- Look for Prisma errors in console
- Ensure language code is valid (en, de, fr, etc.)

---

## API Changes

No API changes required. The system works internally with existing endpoints.

---

## Performance Impact

- **Translation lookups:** Minimal (in-memory)
- **Database queries:** +1 per interaction (language fetch)
- **Storage:** +1 field per user, +1 field per build
- **Overall:** Negligible impact

---

## Future Enhancements

Possible additions:
1. Auto-detect language from Discord locale
2. Add more Balkan language translations
3. Community-contributed translations
4. Admin command to set server default language
5. Translation management UI

---

## Support

Check logs for:
- Foreign build multiplier application
- Language preference storage
- Translation key usage
- Fallback to English

All operations are logged with timestamps for debugging.
