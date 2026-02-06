# Booster Web Interface

A simple web interface for granting boosters to users through the API.

## Features

- Grant boosters to users via a user-friendly form
- Support for two booster types:
  - **Points**: Add bonus points to users
  - **Multiplier**: Multiply points earned (e.g., 2.0 = 2x points)
- Optional duration setting (in minutes)
- Real-time feedback on success/failure
- Responsive design

## Usage

1. Start the API server (it should be running on the configured PORT)
2. Open your browser and navigate to: `http://localhost:<PORT>/`
3. Fill in the form:
   - **User ID**: Discord user ID of the recipient
   - **Booster Type**: Select either "Points" or "Multiplier"
   - **Value**: The booster value (e.g., 100 points or 2.0 for 2x multiplier)
   - **Duration** (optional): How long the booster lasts in minutes. Leave empty for permanent boosters.
4. Click "Grant Booster"

## API Endpoint

The interface uses the existing `/grant_booster` POST endpoint with the following payload:

```json
{
  "user_id": "123456789",
  "type": "points",
  "value": 100,
  "duration": 60
}
```

## Security Note

⚠️ This is a simple interface without authentication. In a production environment, you should add proper authentication and authorization to prevent unauthorized access to the booster granting functionality.
