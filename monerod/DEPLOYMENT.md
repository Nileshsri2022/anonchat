# Monero Node Deployment Guide

This guide explains how to deploy the Monero node required for the AnonChat system on a VPS.

## Prerequisites

- **VPS**: A Virtual Private Server (e.g., DigitalOcean, Linode, AWS).
    - **OS**: Ubuntu 20.04/22.04 or Debian 10/11 recommended.
    - **Storage**: At least **1TB SSD** is recommended for a full node. A pruned node may require less (~150GB), but the provided configuration is for a full node.
    - **RAM**: 4GB+ recommended.
- **Docker**: Installed on the VPS.
- **Docker Compose**: Installed on the VPS.

## Deployment Steps

### 1. Prepare the VPS

SSH into your VPS and install Docker and Docker Compose if you haven't already:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose Plugin
sudo apt install docker-compose-plugin
```

### 2. Copy Files

Copy the `monerod` directory from this project to your VPS. You can use `scp` or `rsync`.

```bash
# From your local machine
scp -r monerod user@your-vps-ip:~/monerod
```

### 3. Run Setup Script

Navigate to the directory and run the setup script. This script will:
- Create the necessary `data` directories.
- Download the latest Monero CLI binaries.
- Place the `monerod` binary in the correct location for the Docker container.

```bash
cd ~/monerod
chmod +x setup.sh
./setup.sh
```

### 4. Start the Node

Start the services using Docker Compose:

```bash
docker compose up -d
```

### 5. Verify Deployment

Check the logs to ensure everything is running correctly:

```bash
docker compose logs -f
```

You should see `monerod` syncing with the network.

## Configuration Details

- **Tor Hidden Service**: The node is configured to run behind a Tor Hidden Service.
- **Data Location**: Blockchain data is stored in `./data/monerod-data`.
- **Tor Keys**: Tor keys are stored in `./data/tor-keys`. **Backup this directory** if you want to keep the same Onion address.

## Troubleshooting

- **Permissions**: If you encounter permission errors, ensure the user running docker has permissions to write to the `data` directory.
- **Healthchecks**: The `docker-compose.yml` includes healthchecks. If containers are restarting, check logs with `docker compose logs`.
