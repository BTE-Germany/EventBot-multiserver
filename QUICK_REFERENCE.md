# Quick Reference: New Features

## 🌍 Foreign Build Flag

### Judge Command
```
/judge id:<build_id> details:<1-10> aufwand:<1-10> grundpunkte:<true/false> foreign_build:<true/false>
```

### Example
```
/judge id:42 details:9 aufwand:8 grundpunkte:true foreign_build:true
```

### Environment Variable
```env
FOREIGN_BUILD_FACTOR=1.5
```

### Point Calculation Order
1. Average(Details, Effort) / 2
2. Base points modifier (+0 or -5)
3. **Foreign build multiplier** ← NEW
4. User booster multiplier

---

## 🗣️ Multilanguage Support

### Supported Languages (14)
| Code | Language | Native Name |
|------|----------|-------------|
| en | English | English |
| de | German | Deutsch |
| fr | French | Français |
| sq | Albanian | Shqip |
| bs | Bosnian | Bosanski |
| bg | Bulgarian | Български |
| hr | Croatian | Hrvatski |
| el | Greek | Ελληνικά |
| mk | Macedonian | Македонски |
| ro | Romanian | Română |
| sr | Serbian | Српски |
| sl | Slovenian | Slovenščina |
| gsw | Swiss German | Schwyzerdütsch |
| rm | Romansh | Rumantsch |

### Commands

#### Register (with language)
```
/register minecraft:<name> language:<language>
```
Example:
```
/register minecraft:Steve language:Deutsch
```

#### Change Language
```
/language new_language:<language>
```
Example:
```
/language new_language:Français
```

---

## Database Migration

```bash
# Run after updating code
npx prisma generate
npx prisma db push
```

---

## Environment Setup

Add to `.env`:
```env
FOREIGN_BUILD_FACTOR=1.5
```

---

## What's Translated?

✅ Registration messages  
✅ Error messages  
✅ Booster notifications  
✅ Judge feedback  
✅ Leaderboard text  
✅ Button labels  
✅ Command responses  

---

## Files Modified

- `prisma/schema.prisma` - Added `language`, `foreign_build`
- `config/translations.js` - NEW - Translation system
- `commands/register.js` - Language selection
- `commands/language.js` - NEW - Change language
- `commands/judge.js` - Foreign build flag + translations
- `commands/boosters.js` - Translations
- `commands/activate_booster.js` - Translations
- `event/messageCreate.js` - Translations
- `buttons/leader.js` - Translations
- `.example.env` - FOREIGN_BUILD_FACTOR

---

## Quick Test

### Test Foreign Build
1. Set `FOREIGN_BUILD_FACTOR=2.0` in .env
2. Judge a build with `foreign_build:true`
3. Second judge completes rating
4. Check console: Should see "Foreign build multiplier (2.0x) applied"
5. Verify points are doubled

### Test Multilanguage
1. Register new user: `/register minecraft:Test language:Deutsch`
2. Check response is in German
3. Change language: `/language new_language:Français`
4. Check response is in French
5. Activate booster: Should see French message

---

## Example Scenarios

### Scenario 1: Foreign Build with Booster
```
Details: 8, Effort: 7, Base: Yes, Foreign: Yes, Booster: 2x
Factor: 1.5

Calculation:
((8+7)/2 + 0) * 1.5 * 2.0 = 7.5 * 1.5 * 2.0 = 22.5 points
```

### Scenario 2: Multilingual Team
```
User A: Registers in German → All messages in German
User B: Registers in French → All messages in French
User C: Registers in English → All messages in English
User A: Changes to Croatian → All future messages in Croatian
```

---

## Need Help?

See full documentation:
- `MULTILANG_FOREIGN_BUILD.md` - Complete guide
- `SETUP_GUIDE.md` - General setup
- `CHANGES.md` - All technical changes
