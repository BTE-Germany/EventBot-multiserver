const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/static/grant_booster",
  method: "GET",
  handler: async (request, reply) => {
    try {
      // Fetch all users from database for SSR
      const users = await prisma.user.findMany({
        select: {
          id: true,
          minecraft_id: true,
        },
        orderBy: {
          minecraft_id: "asc",
        },
      });

      // Convert BigInt to string for JSON
      const usersJSON = JSON.stringify(
        users.map((user) => ({
          id: user.id.toString(),
          minecraft_id: user.minecraft_id,
        }))
      );

      // render the html form for granting a booster
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grant Booster</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            padding: 40px;
            max-width: 800px;
            width: 100%;
        }

        h1 {
            color: #333;
            margin-bottom: 30px;
            text-align: center;
        }

        .form-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }

        @media (max-width: 768px) {
            .form-section {
                grid-template-columns: 1fr;
            }
        }

        .user-list-section {
            border-right: 2px solid #e0e0e0;
            padding-right: 30px;
        }

        @media (max-width: 768px) {
            .user-list-section {
                border-right: none;
                border-bottom: 2px solid #e0e0e0;
                padding-right: 0;
                padding-bottom: 30px;
            }
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 600;
            font-size: 14px;
        }

        input, select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 14px;
            transition: border-color 0.3s;
        }

        input:focus, select:focus {
            outline: none;
            border-color: #667eea;
        }

        input[readonly] {
            background-color: #f5f5f5;
            cursor: not-allowed;
        }

        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        button:active {
            transform: translateY(0);
        }

        .search-box {
            margin-bottom: 15px;
        }

        .user-list {
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            max-height: 400px;
            overflow-y: auto;
        }

        .user-item {
            padding: 12px;
            border-bottom: 1px solid #e0e0e0;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .user-item:last-child {
            border-bottom: none;
        }

        .user-item:hover {
            background-color: #f8f9fa;
        }

        .user-item.selected {
            background-color: #667eea;
            color: white;
        }

        .user-item-name {
            font-weight: 600;
            margin-bottom: 4px;
        }

        .user-item.selected .user-item-name {
            color: white;
        }

        .user-item-id {
            font-size: 12px;
            color: #666;
        }

        .user-item.selected .user-item-id {
            color: rgba(255, 255, 255, 0.9);
        }

        .no-results {
            padding: 20px;
            text-align: center;
            color: #999;
        }

        .user-count {
            font-size: 13px;
            color: #666;
            margin-bottom: 10px;
        }

        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
            font-size: 13px;
            color: #555;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎁 Grant Booster</h1>

        <div class="form-section">
            <div class="user-list-section">
                <h2 style="font-size: 18px; margin-bottom: 15px; color: #333;">Select User</h2>
                <div class="form-group search-box">
                    <input type="text" id="userSearch" placeholder="Search by username or ID..." autocomplete="off">
                </div>
                <div class="user-count">
                    <span id="userCount">0</span> users found
                </div>
                <div class="user-list" id="userList"></div>
            </div>

            <div class="form-section-right">
                <h2 style="font-size: 18px; margin-bottom: 15px; color: #333;">Booster Details</h2>
                
                <div class="info-box">
                    <strong>Selected User:</strong><br>
                    <span id="selectedUserDisplay">None</span>
                </div>

                <form id="boosterForm">
                    <input type="hidden" id="user_id" name="user_id" required>

                    <div class="form-group">
                        <label for="type">Booster Type *</label>
                        <select id="type" name="type" required>
                            <option value="">Select type...</option>
                            <option value="points">Points</option>
                            <option value="multiplier">Multiplier</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="value">Value *</label>
                        <input type="number" id="value" name="value" step="0.01" required 
                               placeholder="e.g., 100 for points or 2.0 for multiplier">
                    </div>

                    <div class="form-group">
                        <label for="duration">Duration (seconds, optional)</label>
                        <input type="number" id="duration" name="duration" 
                               placeholder="Leave empty for permanent">
                    </div>

                    <div class="form-group">
                        <label for="max_builds">Max Builds (optional)</label>
                        <input type="number" id="max_builds" name="max_builds" 
                               placeholder="Leave empty for unlimited builds">
                    </div>

                    <button type="submit">Grant Booster</button>
                </form>
            </div>
        </div>
    </div>

    <script>
        // Pre-loaded users from SSR
        const allUsers = ${usersJSON};
        let filteredUsers = allUsers;
        let selectedUserId = null;

        const userSearch = document.getElementById('userSearch');
        const userList = document.getElementById('userList');
        const userCount = document.getElementById('userCount');
        const userIdInput = document.getElementById('user_id');
        const selectedUserDisplay = document.getElementById('selectedUserDisplay');
        const boosterForm = document.getElementById('boosterForm');

        // Display users
        function displayUsers(users) {
            if (users.length === 0) {
                userList.innerHTML = '<div class="no-results">No users found</div>';
                userCount.textContent = '0';
                return;
            }

            userCount.textContent = users.length;
            userList.innerHTML = users.map(user => \`
                <div class="user-item" data-id="\${user.id}" onclick="selectUser('\${user.id}', '\${user.minecraft_id}')">
                    <div class="user-item-name">\${user.minecraft_id}</div>
                    <div class="user-item-id">ID: \${user.id}</div>
                </div>
            \`).join('');
        }

        // Select user
        function selectUser(id, name) {
            selectedUserId = id;
            userIdInput.value = id;
            selectedUserDisplay.textContent = \`\${name} (ID: \${id})\`;

            // Update UI
            document.querySelectorAll('.user-item').forEach(item => {
                if (item.dataset.id === id) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        }

        // Search users
        userSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            
            if (!searchTerm) {
                filteredUsers = allUsers;
            } else {
                filteredUsers = allUsers.filter(user => 
                    user.minecraft_id.toLowerCase().includes(searchTerm) ||
                    user.id.includes(searchTerm)
                );
            }
            
            displayUsers(filteredUsers);
        });

        // Form validation and submission
        boosterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!selectedUserId) {
                alert('Please select a user from the list');
                return false;
            }
            
            const formData = {
                user_id: document.getElementById('user_id').value,
                type: document.getElementById('type').value,
                value: document.getElementById('value').value,
                duration: document.getElementById('duration').value || null,
                max_builds: document.getElementById('max_builds').value || null
            };
            
            try {
                const response = await fetch('/static/grant_booster_api', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });
                
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('text/html')) {
                    // Server returned HTML (success or error page)
                    const html = await response.text();
                    document.open();
                    document.write(html);
                    document.close();
                } else {
                    // Server returned JSON
                    const result = await response.json();
                    if (response.ok) {
                        alert('Booster granted successfully!');
                        boosterForm.reset();
                        selectedUserId = null;
                        selectedUserDisplay.textContent = 'None';
                        document.querySelectorAll('.user-item').forEach(item => {
                            item.classList.remove('selected');
                        });
                    } else {
                        alert('Error: ' + (result.error || 'Unknown error'));
                    }
                }
            } catch (error) {
                alert('Error submitting form: ' + error.message);
            }
        });

        // Initialize display
        displayUsers(allUsers);

        console.log(\`Loaded \${allUsers.length} users via SSR\`);
    </script>
</body>
</html>
      `;
      reply.type("text/html").send(html);
    } catch (error) {
      console.error("Error rendering grant booster form:", error);
      reply.status(500).send({ error: "Internal Server Error" });
    }
  },
};
