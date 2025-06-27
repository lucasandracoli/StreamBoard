CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    displayName VARCHAR(100),
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    userId INTEGER REFERENCES users(id),
    name VARCHAR(100),
    isActive BOOLEAN DEFAULT TRUE,
    pairingToken VARCHAR(64) UNIQUE,
    pairedAt TIMESTAMP,
    lastSeen TIMESTAMP,
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deviceTokens (
    id SERIAL PRIMARY KEY,
    deviceId INTEGER REFERENCES devices(id),
    authToken VARCHAR(64) UNIQUE NOT NULL,
    createdAt TIMESTAMP DEFAULT NOW(),
    revoked BOOLEAN DEFAULT FALSE
);