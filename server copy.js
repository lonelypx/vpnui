const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const execAsync = promisify(exec);
const app = express();
const port = process.env.PORT || 3000;

// OpenVPN paths configuration
const OPENVPN_PATHS = {
  EASY_RSA_DIR: process.env.EASY_RSA_DIR || '/etc/openvpn/easy-rsa',
  OPENVPN_DIR: process.env.OPENVPN_DIR || '/etc/openvpn',
  CLIENT_CONFIG_DIR: process.env.CLIENT_CONFIG_DIR || '/root', // Default client config directory
  INDEX_FILE: process.env.INDEX_FILE || '/etc/openvpn/easy-rsa/pki/index.txt',
  CLIENT_TEMPLATE: process.env.CLIENT_TEMPLATE || '/etc/openvpn/client-template.txt',
  SERVER_CONF: process.env.SERVER_CONF || '/etc/openvpn/server.conf'
};

app.use(express.json());

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
      !output.includes('Database updated') && // Ignore when it's part of success message
      !output.includes('Write out database')
    );

    if (hasError) {
      console.error('Command error:', output);
      throw new Error(output);
    }

    return output;
  } catch (error) {
    if (error.message.includes('Database updated')) {
      // This is actually a success case
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

// API Routes
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await getClientList();
    res.json({ clients });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get client list' });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const { clientName, usePassword = false } = req.body;

    if (!clientName || !/^[a-zA-Z0-9_-]+$/.test(clientName)) {
      return res.status(400).json({
        error: 'Invalid client name. Use only alphanumeric characters, underscores, and dashes.'
      });
    }

    // Check if client already exists
    const clients = await getClientList();
    if (clients.includes(clientName)) {
      return res.status(409).json({ error: 'Client already exists' });
    }

    // Change to easy-rsa directory
    process.chdir(OPENVPN_PATHS.EASY_RSA_DIR);

    // Build client certificate
    const command = usePassword
      ? `./easyrsa --batch build-client-full "${clientName}"`
      : `./easyrsa --batch build-client-full "${clientName}" nopass`;

    await executeCommand(command);

    // Generate client config
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

app.delete('/api/clients/:clientName', async (req, res) => {
  try {
    const { clientName } = req.params;

    // Change to easy-rsa directory
    process.chdir(OPENVPN_PATHS.EASY_RSA_DIR);

    // Revoke certificate
    await executeCommand(`./easyrsa --batch revoke "${clientName}"`);

    // Generate new CRL
    await executeCommand('EASYRSA_CRL_DAYS=3650 ./easyrsa gen-crl');

    // Update CRL file
    const crlPath = path.join(OPENVPN_PATHS.OPENVPN_DIR, 'crl.pem');
    await fs.unlink(crlPath).catch(() => { });
    await fs.copyFile(
      path.join(OPENVPN_PATHS.EASY_RSA_DIR, 'pki/crl.pem'),
      crlPath
    );
    await fs.chmod(crlPath, 0o644);

    // Clean up client config files
    const configPath = path.join(OPENVPN_PATHS.CLIENT_CONFIG_DIR, `${clientName}.ovpn`);
    await fs.unlink(configPath).catch(() => { });

    // Remove from ipp.txt
    const ippPath = path.join(OPENVPN_PATHS.OPENVPN_DIR, 'ipp.txt');
    await executeCommand(`sed -i "/^${clientName},.*/d" ${ippPath}`);

    res.json({ message: 'Client removed successfully' });

  } catch (error) {
    res.status(500).json({ error: 'Failed to remove client' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

app.listen(port, () => {
  console.log(`OpenVPN Management API listening at http://localhost:${port}`);
});