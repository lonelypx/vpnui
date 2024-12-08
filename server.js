const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

const execAsync = promisify(exec);
const app = express();
const port = process.env.PORT || 3000;

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const JWT_EXPIRES_IN = '5d'; // 5 days

// OpenVPN paths configuration
const OPENVPN_PATHS = {
  EASY_RSA_DIR: process.env.EASY_RSA_DIR || '/etc/openvpn/easy-rsa',
  OPENVPN_DIR: process.env.OPENVPN_DIR || '/etc/openvpn',
  CLIENT_CONFIG_DIR: process.env.CLIENT_CONFIG_DIR || '/root',
  INDEX_FILE: process.env.INDEX_FILE || '/etc/openvpn/easy-rsa/pki/index.txt',
  CLIENT_TEMPLATE: process.env.CLIENT_TEMPLATE || '/etc/openvpn/client-template.txt',
  SERVER_CONF: process.env.SERVER_CONF || '/etc/openvpn/server.conf',
  USERS_FILE: process.env.USERS_FILE || path.join(__dirname, 'users.json')
};

app.use(express.json());
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User management functions
async function loadUsers() {
  try {
    const data = await fs.readFile(OPENVPN_PATHS.USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // If file doesn't exist, create it with default admin user
      const defaultUsers = {
        users: [{
          username: 'admin',
          password: await bcrypt.hash('df6434gbcx$gvcrecun#Rew32@jdn2futMdfr', 10), // Default password: REPLACE IMPORTENT
          role: 'admin'
        }]
      };
      await fs.writeFile(OPENVPN_PATHS.USERS_FILE, JSON.stringify(defaultUsers, null, 2));
      return defaultUsers;
    }
    throw error;
  }
}

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }

    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const { users } = await loadUsers();
    const user = users.find(u => u.username === username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// User management endpoints
app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, and role required' });
    }

    const userData = await loadUsers();
    if (userData.users.some(u => u.username === username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    userData.users.push({
      username,
      password: hashedPassword,
      role
    });

    await fs.writeFile(OPENVPN_PATHS.USERS_FILE, JSON.stringify(userData, null, 2));
    res.json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Helper functions to execute OpenVPN commands
const executeCommand = async (command) => {
  try {
    const { stdout, stderr } = await execAsync(command);

    // Combine stdout and stderr for OpenVPN commands as they often use stderr for normal output
    const output = stdout + (stderr || '');

    // Check for actual error indicators in the output
    const errorIndicators = [
      'error',
      'failed',
      'unable to',
      'cannot',
      'bad',
      'invalid'
    ].map(indicator => new RegExp(indicator, 'i'));

    const hasError = errorIndicators.some(indicator =>
      indicator.test(output) &&
      !output.includes('Database updated') &&
      !output.includes('Write out database')
    );

    if (hasError) {
      console.error('Command error:', output);
      throw new Error(output);
    }

    return output;
  } catch (error) {
    if (error.message.includes('Database updated')) {
      return error.message;
    }
    console.error('Execution error:', error);
    throw error;
  }
};

// List all clients
const getClientList = async () => {
  try {
    const indexContent = await fs.readFile(OPENVPN_PATHS.INDEX_FILE, 'utf8');
    const clients = indexContent
      .split('\n')
      .filter(line => line.startsWith('V'))
      .map(line => {
        const parts = line.split('/');
        return parts[parts.length - 1].split('=')[1];
      });
    return clients;
  } catch (error) {
    console.error('Error reading client list:', error);
    throw error;
  }
};

// Helper function to generate client config
async function generateClientConfig(clientName) {
  const clientFile = path.join(OPENVPN_PATHS.CLIENT_CONFIG_DIR, `${clientName}.ovpn`);

  // Copy template
  await fs.copyFile(OPENVPN_PATHS.CLIENT_TEMPLATE, clientFile);

  // Append certificates and keys
  const ca = await fs.readFile(path.join(OPENVPN_PATHS.EASY_RSA_DIR, 'pki/ca.crt'), 'utf8');
  const cert = await fs.readFile(path.join(OPENVPN_PATHS.EASY_RSA_DIR, `pki/issued/${clientName}.crt`), 'utf8');
  const key = await fs.readFile(path.join(OPENVPN_PATHS.EASY_RSA_DIR, `pki/private/${clientName}.key`), 'utf8');

  let config = await fs.readFile(clientFile, 'utf8');
  config += '\n<ca>\n' + ca + '</ca>\n';
  config += '<cert>\n' + cert.split('Certificate:')[1] + '</cert>\n';
  config += '<key>\n' + key + '</key>\n';

  // Check if using tls-crypt or tls-auth
  const serverConfig = await fs.readFile(OPENVPN_PATHS.SERVER_CONF, 'utf8');
  if (serverConfig.includes('tls-crypt')) {
    const tlsCrypt = await fs.readFile(path.join(OPENVPN_PATHS.OPENVPN_DIR, 'tls-crypt.key'), 'utf8');
    config += '<tls-crypt>\n' + tlsCrypt + '</tls-crypt>\n';
  } else if (serverConfig.includes('tls-auth')) {
    const tlsAuth = await fs.readFile(path.join(OPENVPN_PATHS.OPENVPN_DIR, 'tls-auth.key'), 'utf8');
    config += 'key-direction 1\n<tls-auth>\n' + tlsAuth + '</tls-auth>\n';
  }

  await fs.writeFile(clientFile, config);
  return config;
}

// Protected API Routes
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const clients = await getClientList();
    res.json({ clients });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get client list' });
  }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const { clientName, usePassword = false } = req.body;

    if (!clientName || !/^[a-zA-Z0-9_-]+$/.test(clientName)) {
      return res.status(400).json({
        error: 'Invalid client name. Use only alphanumeric characters, underscores, and dashes.'
      });
    }

    const clients = await getClientList();
    if (clients.includes(clientName)) {
      return res.status(409).json({ error: 'Client already exists' });
    }

    process.chdir(OPENVPN_PATHS.EASY_RSA_DIR);

    const command = usePassword
      ? `./easyrsa --batch build-client-full "${clientName}"`
      : `./easyrsa --batch build-client-full "${clientName}" nopass`;

    await executeCommand(command);
    const clientConfig = await generateClientConfig(clientName);

    res.json({
      message: 'Client created successfully',
      clientName,
      configFile: clientConfig
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.delete('/api/clients/:clientName', authenticateToken, async (req, res) => {
  try {
    const { clientName } = req.params;

    process.chdir(OPENVPN_PATHS.EASY_RSA_DIR);
    await executeCommand(`./easyrsa --batch revoke "${clientName}"`);
    await executeCommand('EASYRSA_CRL_DAYS=3650 ./easyrsa gen-crl');

    const crlPath = path.join(OPENVPN_PATHS.OPENVPN_DIR, 'crl.pem');
    await fs.unlink(crlPath).catch(() => { });
    await fs.copyFile(
      path.join(OPENVPN_PATHS.EASY_RSA_DIR, 'pki/crl.pem'),
      crlPath
    );
    await fs.chmod(crlPath, 0o644);

    const configPath = path.join(OPENVPN_PATHS.CLIENT_CONFIG_DIR, `${clientName}.ovpn`);
    await fs.unlink(configPath).catch(() => { });

    const ippPath = path.join(OPENVPN_PATHS.OPENVPN_DIR, 'ipp.txt');
    await executeCommand(`sed -i "/^${clientName},.*/d" ${ippPath}`);

    res.json({ message: 'Client removed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove client' });
  }
});

app.get('/api/clients/:clientName/config', authenticateToken, async (req, res) => {
  try {
    const { clientName } = req.params;

    // Verify client exists
    const clients = await getClientList();
    if (!clients.includes(clientName)) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Generate or fetch the client config
    const configPath = path.join(OPENVPN_PATHS.CLIENT_CONFIG_DIR, `${clientName}.ovpn`);

    try {
      // Try to read existing config
      const config = await fs.readFile(configPath, 'utf8');
      return res.json({ config });
    } catch (error) {
      // If config doesn't exist, generate a new one
      const config = await generateClientConfig(clientName);
      return res.json({ config });
    }
  } catch (error) {
    console.error('Error getting client config:', error);
    res.status(500).json({ error: 'Failed to get client configuration' });
  }
});


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});


// Handle all other routes by sending index.html (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`OpenVPN Management API listening at http://localhost:${port}`);
});