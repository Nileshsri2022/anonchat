#!/bin/bash

# Setup script for AnonChat Monero Node
# This script prepares the directory structure and downloads the necessary binaries.

set -e

echo "Starting setup..."

# 1. Create necessary directories
echo "Creating directories..."
mkdir -p data/monerod-data
mkdir -p data/tor-keys

# 2. Download Monero
echo "Downloading Monero..."
MONERO_URL="https://downloads.getmonero.org/cli/linux64"
curl -L -o monero-latest.bz2 "$MONERO_URL"

# 3. Extract Monero
echo "Extracting Monero..."
tar --wildcards -xf monero-latest.bz2 "monero*/monerod"

# 4. Move binary to the data directory (mounted volume)
echo "Installing binary..."
# Find the extracted directory (it changes with version)
EXTRACTED_DIR=$(find . -maxdepth 1 -type d -name "monero-*" | head -n 1)

if [ -d "$EXTRACTED_DIR" ]; then
    mv "$EXTRACTED_DIR/monerod" data/monerod-data/
    chmod +x data/monerod-data/monerod
    echo "Monerod binary moved to data/monerod-data/"
    
    # Cleanup
    rm -rf "$EXTRACTED_DIR"
    rm monero-latest.bz2
    echo "Cleanup complete."
else
    echo "Error: Could not find extracted directory."
    exit 1
fi

echo "Setup complete! You can now run 'docker-compose up -d'"
