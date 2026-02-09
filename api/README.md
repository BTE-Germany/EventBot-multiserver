# API

This repo uses fastify to provide an easy API interface.

# Endpoints

## GET `/leaderboard`

Returns all users sorted by points (descending), filtered builds, and total points.

**Query Parameters:**
- `guild_id` (optional): Filter results by guild ID

**Response:**

```json
{
  "users": [
    {
      "id": "123456789012345678",
      "banned": false,
      "minecraft_id": "MinecraftPlayer",
      "points": 0,
      "team": "TeamName",
      "team_flag": "🏳️",
      "guild_id": "123456789012345678",
      "language": "en"
    }
  ],
  "builds": [
    {
      "id": 1,
      "message": "123456789012345670",
      "judge_msg": "123456789012345678",
      "location": "location",
      "A": 0,
      "B": 0,
      "base_points": true,
      "foreign_build": false,
      "builder_id": "123456789012345678",
      "judges": [],
      "images": [
        "https://cdn.com/event/123456789012345678/eff455cd-787d-427f-8eb1-91e8a4ea2c26.jpg"
      ],
      "created_timestamp": "2026-02-09T12:00:00.000Z",
      "guild_id": "123456789012345678"
    }
  ],
  "points": 10
}
```

---

## GET `/get_user`

Retrieves detailed information about a specific user, including their boosters and builds.

**Query Parameters:**
- `user_id` (optional): Discord user ID
- `minecraft_id` (optional): Minecraft username

*Note: At least one parameter is required.*

**Response:**

```json
{
  "user": {
    "id": "123456789012345678",
    "banned": false,
    "minecraft_id": "MinecraftPlayer",
    "points": 150,
    "team": "TeamName",
    "team_flag": "🏳️",
    "guild_id": "123456789012345678",
    "language": "en",
    "boosters": [
      {
        "id": 1,
        "user_id": "123456789012345678",
        "type": "multiplier",
        "value": 2.0,
        "duration": 3600000,
        "activated": true,
        "activated_at": "2026-02-09T12:00:00.000Z",
        "expires_at": "2026-02-09T13:00:00.000Z",
        "created_at": "2026-02-09T11:00:00.000Z"
      }
    ]
  },
  "builds": [
    {
      "id": 1,
      "message": "123456789012345670",
      "judge_msg": "123456789012345678",
      "location": "location",
      "A": 10,
      "B": 8,
      "base_points": true,
      "foreign_build": false,
      "builder_id": "123456789012345678",
      "judges": [],
      "images": [],
      "created_timestamp": "2026-02-09T10:00:00.000Z",
      "guild_id": "123456789012345678"
    }
  ]
}
```

**Error Responses:**
- `400`: Missing required parameter
- `404`: User not found
- `500`: Internal server error

---

## POST `/grant_points`

Grants (or deducts if negative) points to a user.

**Request Body:**

```json
{
  "user_id": "123456789012345678",
  "points": 100
}
```

**Parameters:**
- `user_id` (required): Discord user ID
- `points` (required): Number of points to grant (can be negative to deduct)

**Response:**

```json
{
  "success": true,
  "user": {
    "id": "123456789012345678",
    "banned": false,
    "minecraft_id": "MinecraftPlayer",
    "points": 250,
    "team": "TeamName",
    "team_flag": "🏳️",
    "guild_id": "123456789012345678",
    "language": "en"
  },
  "points_granted": 100
}
```

**Error Responses:**
- `400`: Missing required fields or invalid points value
- `404`: User not found
- `500`: Internal server error

---

## POST `/grant_booster`

Grants a booster to a user via API.

**Request Body:**

```json
{
  "user_id": "123456789012345678",
  "type": "multiplier",
  "value": 2.0,
  "duration": 3600000
}
```

**Parameters:**
- `user_id` (required): Discord user ID
- `type` (required): Booster type - either "points" (instant points) or "multiplier" (time-based multiplier)
- `value` (required): For "points" type: number of points to grant. For "multiplier" type: multiplier value (e.g., 2.0 for 2x)
- `duration` (optional): Duration in milliseconds (only for "multiplier" type, null for instant "points" boosters)

**Response:**

```json
{
  "success": true,
  "booster": {
    "id": 1,
    "user_id": "123456789012345678",
    "type": "multiplier",
    "value": 2.0,
    "duration": 3600000,
    "activated": false,
    "activated_at": null,
    "expires_at": null,
    "created_at": "2026-02-09T12:00:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Missing required fields or invalid type
- `404`: User not found
- `500`: Internal server error

---

## GET `/static/grant_booster`

Displays an HTML form for granting boosters through a web interface. This endpoint server-side renders a user-friendly form with a dropdown list of all users and fields for booster configuration.

**Response:** HTML page with booster grant form

---

## POST `/static/grant_booster_api`

Backend endpoint for the HTML form at `/static/grant_booster`. Processes form submissions and returns HTML success/error pages.

**Request Body (form-encoded):**
- `user_id` (required): Discord user ID
- `type` (required): "points" or "multiplier"
- `value` (required): Booster value
- `duration` (optional): Duration in milliseconds

**Response:** HTML success or error page

---

# Adding new endpoints

Use this template to create a new endpoint

```javascript
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/endpoint",
  method: "GET",
  handler: async (request, reply) => {
    reply.send("success");
  },
};
```
