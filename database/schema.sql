CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    userRole VARCHAR(20) DEFAULT 'user',
    displayName VARCHAR(100),
    lastLogin TIMESTAMP,
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    userId INTEGER REFERENCES users(id),
    deviceName VARCHAR(100),
    deviceType VARCHAR(50),
    isActive BOOLEAN DEFAULT TRUE,
    pairingToken VARCHAR(64) UNIQUE,
    pairedAt TIMESTAMP,
    lastSeen TIMESTAMP,
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deviceTokens (
    id SERIAL PRIMARY KEY,
    deviceId INTEGER REFERENCES devices(id),
    authToken VARCHAR(256) UNIQUE NOT NULL,
    createdAt TIMESTAMP DEFAULT NOW(),
    expiresAt TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE
);