# OpenVPN GUI Manager

A web-based GUI management interface for [angristan/openvpn-install](https://github.com/angristan/openvpn-install) script. This project provides a simple web interface and REST API to manage OpenVPN users and configurations.

## Overview

This project is a web GUI wrapper around the popular OpenVPN installation script by [angristan](https://github.com/angristan/openvpn-install). It provides:

- Web-based interface for managing OpenVPN clients
- REST API for programmatic access
- User authentication and role-based access
- Client configuration generation and management
- Command-line user management tools

## Prerequisites

- Node.js (v14 or higher)
- OpenVPN server installed using [angristan/openvpn-install](https://github.com/angristan/openvpn-install)
- Linux system with root access

## Installation

1. First, install OpenVPN using angristan's script:
```bash
curl -O https://raw.githubusercontent.com/angristan/openvpn-install/master/openvpn-install.sh
chmod +x openvpn-install.sh
sudo ./openvpn-install.sh
```

2. Clone this repository:
```bash
git clone https://github.com/lonelypx/vpnui
cd vpnui
```

3. Install dependencies:
```bash
npm install
```

4. Edit configuration:
```bash
.env
# Edit .env with your settings
```

5. Set up users:
```bash
node users.js
```

6. Start the server:
```bash
sudo node server.js
```

## Features

- **Web Interface**
  - User-friendly dashboard
  - Client management (create, delete, download config)
  - User management for administrators
  - Secure authentication

- **REST API**
  - JWT authentication
  - Client management endpoints
  - User management endpoints
  - Role-based access control

- **Command Line Tools**
  - User management utility
  - Password management
  - Role assignment

## Configuration

### Environment Variables
```env
PORT=3000
JWT_SECRET=your-secret-key-here
EASY_RSA_DIR=/etc/openvpn/easy-rsa
OPENVPN_DIR=/etc/openvpn
CLIENT_CONFIG_DIR=/root
INDEX_FILE=/etc/openvpn/easy-rsa/pki/index.txt
CLIENT_TEMPLATE=/etc/openvpn/client-template.txt
SERVER_CONF=/etc/openvpn/server.conf
USERS_FILE=users.json
```

### User Roles
- **admin**: Full system access
- **operator**: Can manage VPN clients
- **user**: Can create and view clients
- **readonly**: Can only view clients

## API Endpoints

### Authentication
- `POST /api/login` - Login and get JWT token

### Client Management
- `GET /api/clients` - List all clients
- `POST /api/clients` - Create new client
- `DELETE /api/clients/:clientName` - Delete client
- `GET /api/clients/:clientName/config` - Get client configuration

### User Management (Admin only)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `PUT /api/users/:username` - Update user
- `DELETE /api/users/:username` - Delete user
- `POST /api/users/:username/reset-password` - Reset user password

## Security Notes

1. Always run with appropriate permissions
2. Use HTTPS in production
3. Change default passwords
4. Keep JWT secret secure
5. Regular security audits recommended

## Command Line User Management

The `users.js` script provides a command-line interface for managing users:

```bash
node users.js
```

Options:
1. Add User
2. List Users
3. Delete User
4. Reset Password

## Acknowledgements

This project is built on top of [angristan/openvpn-install](https://github.com/angristan/openvpn-install) and provides a GUI wrapper for its functionality. All OpenVPN installation and base configuration is handled by angristan's script.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## Disclaimer

This is a management interface for angristan's OpenVPN installation script. It is not affiliated with or endorsed by the original project. Use at your own risk and ensure proper security measures are in place before deploying in production.

## Support

For issues related to:
- OpenVPN installation: Please refer to [angristan/openvpn-install](https://github.com/angristan/openvpn-install)
- GUI interface: Create an issue in this repository

## Project Structure
```
.
├── server.js         # Main server file
├── users.js          # User management CLI
├── public/           # Static files
│   ├── index.html
│   └── js/
│       └── main.js
├── users.json        # User database
└── .env             # Configuration
```