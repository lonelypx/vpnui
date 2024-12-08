// Global variables
let currentConfig = null;
let currentConfigName = null;
let token = localStorage.getItem('token');

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        showDashboard();
    }
});

// Event Listeners
document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('addClientBtn').addEventListener('click', () => showModal('addClientModal'));
document.getElementById('addClientForm').addEventListener('submit', handleAddClient);

// Authentication Functions
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Login failed');
        }

        const data = await response.json();
        token = data.token;
        localStorage.setItem('token', token);
        showDashboard();
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    token = null;
    showLogin();
}

// UI Control Functions
function showDashboard() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    loadClients();
    checkAdminStatus();
}

function showLogin() {
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
}

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    document.getElementById(modalId).classList.add('flex');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    document.getElementById(modalId).classList.remove('flex');
}

// Client Management Functions
async function loadClients() {
    try {
        const response = await fetch('/api/clients', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to load clients');
        }

        const data = await response.json();
        const clientsList = document.getElementById('clientsList');
        clientsList.innerHTML = '';

        data.clients.forEach(client => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">${client}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <button onclick="downloadClientConfig('${client}')" class="text-blue-500 hover:text-blue-700 mr-4">
                        <i class="fas fa-download"></i> Config
                    </button>
                    <button onclick="deleteClient('${client}')" class="text-red-500 hover:text-red-700">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;
            clientsList.appendChild(row);
        });
    } catch (error) {
        alert('Error loading clients: ' + error.message);
        if (error.message.includes('Invalid token')) {
            handleLogout();
        }
    }
}

async function handleAddClient(e) {
    e.preventDefault();
    const clientName = document.getElementById('clientName').value;
    const usePassword = document.getElementById('usePassword').checked;

    try {
        const response = await fetch('/api/clients', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ clientName, usePassword })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create client');
        }

        const data = await response.json();
        currentConfig = data.configFile;
        closeModal('addClientModal');
        showModal('configModal');
        document.getElementById('configContent').textContent = data.configFile;
        loadClients();
    } catch (error) {
        alert('Error creating client: ' + error.message);
    }
}

async function deleteClient(clientName) {
    if (!confirm(`Are you sure you want to delete client "${clientName}"?`)) return;

    try {
        const response = await fetch(`/api/clients/${clientName}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete client');
        }

        loadClients();
    } catch (error) {
        alert('Error deleting client: ' + error.message);
    }
}

async function downloadClientConfig(clientName) {
    try {
        const response = await fetch(`/api/clients/${clientName}/config`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get client config');
        }

        const data = await response.json();
        currentConfig = data.config;
        currentConfigName = clientName;
        document.getElementById('cname').textContent = `Client Config: ${clientName}`;
        showModal('configModal');
        document.getElementById('configContent').textContent = data.config;
    } catch (error) {
        alert('Error getting client config: ' + error.message);
    }
}

function downloadConfig() {
    if (!currentConfig) return;

    const blob = new Blob([currentConfig], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentConfigName}.ovpn` || 'client.ovpn';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Admin Functions
async function checkAdminStatus() {
    try {
        const response = await fetch('/api/users/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get user info');
        }

        const data = await response.json();
        document.getElementById('userDisplay').textContent = `${data.username} (${data.role})`;

        if (data.role === 'admin') {
            document.getElementById('adminSection').classList.remove('hidden');
            loadUsers();
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        if (error.message.includes('Invalid token')) {
            handleLogout();
        }
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to load users');
        }

        const data = await response.json();
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = '';

        data.users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">${user.username}</td>
                <td class="px-6 py-4 whitespace-nowrap">${user.role}</td>
                <td class="px-6 py-4 whitespace-nowrap">${formatDate(user.lastLogin)}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <button onclick="editUser('${user.username}')" class="text-blue-500 hover:text-blue-700 mr-2">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="resetUserPassword('${user.username}')" class="text-yellow-500 hover:text-yellow-700 mr-2">
                        <i class="fas fa-key"></i> Reset Password
                    </button>
                    ${user.username !== 'admin' ? `
                        <button onclick="deleteUser('${user.username}')" class="text-red-500 hover:text-red-700">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    ` : ''}
                </td>
            `;
            usersList.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading users:', error);
        alert('Error loading users: ' + error.message);
    }
}

async function createUser(userData) {
    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create user');
        }

        await loadUsers();
        closeModal('addUserModal');
    } catch (error) {
        alert('Error creating user: ' + error.message);
    }
}

async function editUser(username) {
    try {
        const response = await fetch(`/api/users/${username}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get user details');
        }

        const user = await response.json();
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editRole').value = user.role;
        showModal('editUserModal');
    } catch (error) {
        alert('Error loading user details: ' + error.message);
    }
}

async function updateUser(username, userData) {
    try {
        const response = await fetch(`/api/users/${username}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update user');
        }

        await loadUsers();
        closeModal('editUserModal');
    } catch (error) {
        alert('Error updating user: ' + error.message);
    }
}

async function deleteUser(username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;

    try {
        const response = await fetch(`/api/users/${username}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete user');
        }

        await loadUsers();
    } catch (error) {
        alert('Error deleting user: ' + error.message);
    }
}

async function resetUserPassword(username) {
    const newPassword = prompt(`Enter new password for user "${username}"`);
    if (!newPassword) return;

    try {
        const response = await fetch(`/api/users/${username}/reset-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: newPassword })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to reset password');
        }

        alert('Password reset successfully');
    } catch (error) {
        alert('Error resetting password: ' + error.message);
    }
}

// Utility Functions
function formatDate(dateString) {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
}

function handleApiError(error, defaultMessage = 'Operation failed') {
    console.error('API Error:', error);

    if (error.message.includes('Invalid token') || error.message.includes('jwt expired')) {
        handleLogout();
        return 'Session expired. Please log in again.';
    }

    return error.message || defaultMessage;
}

// Error Handler
window.onerror = function (message, source, lineno, colno, error) {
    console.error('Global error:', { message, source, lineno, colno, error });
    alert('An unexpected error occurred. Please try again or contact support if the problem persists.');
    return false;
};

// Export functions for use in HTML
window.showModal = showModal;
window.closeModal = closeModal;
window.downloadConfig = downloadConfig;
window.downloadClientConfig = downloadClientConfig;
window.deleteClient = deleteClient;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.resetUserPassword = resetUserPassword;