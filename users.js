#!/usr/bin/env node
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const USERS_FILE = path.join(__dirname, 'users.json');
const ROLES = ['admin', 'operator', 'user', 'readonly'];
const SALT_ROUNDS = 10;

const DEFAULT_DATA = {
    users: [],
    roles: {
        admin: {
            description: "Full system access",
            permissions: ["create", "read", "update", "delete", "manage_users"]
        },
        operator: {
            description: "Can manage VPN clients",
            permissions: ["create", "read", "update", "delete"]
        },
        user: {
            description: "Can create and manage own clients",
            permissions: ["create", "read"]
        },
        readonly: {
            description: "Can only view clients",
            permissions: ["read"]
        }
    },
    metadata: {
        lastUpdated: new Date().toISOString(),
        version: "1.0"
    }
};

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function loadUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        const userData = JSON.parse(data);
        // Ensure metadata exists
        userData.metadata = userData.metadata || {};
        return userData;
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Create new file with default structure
            await fs.writeFile(USERS_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
            return DEFAULT_DATA;
        }
        throw error;
    }
}

async function saveUsers(data) {
    // Ensure metadata exists
    data.metadata = data.metadata || {};
    data.metadata.lastUpdated = new Date().toISOString();
    await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2));
}

async function addUser() {
    try {
        const userData = await loadUsers();

        console.log('\nAdd New User');
        console.log('============');

        const username = await question('Username: ');
        if (userData.users.some(u => u.username === username)) {
            console.log('Error: Username already exists');
            return;
        }

        const password = await question('Password: ');
        console.log('\nAvailable roles:', ROLES.join(', '));
        const role = await question('Role: ');

        if (!ROLES.includes(role)) {
            console.log('Error: Invalid role');
            return;
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        userData.users.push({
            username,
            password: hashedPassword,
            role,
            created: new Date().toISOString(),
            lastLogin: null
        });

        await saveUsers(userData);
        console.log('\nUser added successfully!');

    } catch (error) {
        console.error('Error adding user:', error.message);
    }
}

async function listUsers() {
    try {
        const userData = await loadUsers();

        console.log('\nCurrent Users');
        console.log('=============');

        if (userData.users.length === 0) {
            console.log('No users found');
            return;
        }

        userData.users.forEach(user => {
            console.log(`\nUsername: ${user.username}`);
            console.log(`Role: ${user.role}`);
            console.log(`Created: ${new Date(user.created).toLocaleString()}`);
            console.log(`Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}`);
        });

    } catch (error) {
        console.error('Error listing users:', error.message);
    }
}

async function deleteUser() {
    try {
        const userData = await loadUsers();

        console.log('\nDelete User');
        console.log('===========');

        const username = await question('Username to delete: ');

        const userIndex = userData.users.findIndex(u => u.username === username);
        if (userIndex === -1) {
            console.log('Error: User not found');
            return;
        }

        if (username === 'admin') {
            console.log('Error: Cannot delete admin user');
            return;
        }

        userData.users.splice(userIndex, 1);
        await saveUsers(userData);
        console.log('\nUser deleted successfully!');

    } catch (error) {
        console.error('Error deleting user:', error.message);
    }
}

async function resetPassword() {
    try {
        const userData = await loadUsers();

        console.log('\nReset Password');
        console.log('==============');

        const username = await question('Username: ');
        const user = userData.users.find(u => u.username === username);

        if (!user) {
            console.log('Error: User not found');
            return;
        }

        const newPassword = await question('New Password: ');
        user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);

        await saveUsers(userData);
        console.log('\nPassword reset successfully!');

    } catch (error) {
        console.error('Error resetting password:', error.message);
    }
}

async function mainMenu() {
    while (true) {
        console.log('\nUser Management');
        console.log('1. Add User');
        console.log('2. List Users');
        console.log('3. Delete User');
        console.log('4. Reset Password');
        console.log('5. Exit');

        const choice = await question('\nSelect an option (1-5): ');

        switch (choice) {
            case '1':
                await addUser();
                break;
            case '2':
                await listUsers();
                break;
            case '3':
                await deleteUser();
                break;
            case '4':
                await resetPassword();
                break;
            case '5':
                console.log('\nGoodbye!');
                rl.close();
                return;
            default:
                console.log('\nInvalid option');
        }
    }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
    console.log('\nExiting...');
    rl.close();
    process.exit(0);
});

// Start the program
console.log('OpenVPN User Management');
mainMenu().catch(error => {
    console.error('Fatal error:', error.message);
    rl.close();
    process.exit(1);
});