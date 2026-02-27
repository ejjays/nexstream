#!/bin/bash

# NEXSTREAM SONARCLOUD SCANNER (Termux Edition)
# Usage: SONAR_TOKEN=your_token ./scan.sh

# Configuration
PROJECT_KEY="ejjays_nexstream"
ORG="ejjays"
SCANNER_VERSION="6.2.1.4610"
SCANNER_DIR="$HOME/.sonar/scanner"

# 1. Check for Token
if [ -z "$SONAR_TOKEN" ]; then
    echo "❌ Error: SONAR_TOKEN environment variable is not set."
    echo "Usage: SONAR_TOKEN=xxxxxx ./scan.sh"
    exit 1
fi

# 2. Check for Java
if ! command -v java &> /dev/null; then
    echo "❌ Java not found. Installing OpenJDK 17..."
    pkg install -y openjdk-17
fi

# 3. Check for SonarScanner CLI
if [ ! -d "$SCANNER_DIR" ]; then
    echo "📦 Downloading SonarScanner CLI..."
    mkdir -p "$HOME/.sonar"
    curl -LO https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-$SCANNER_VERSION.zip
    unzip -q sonar-scanner-cli-$SCANNER_VERSION.zip
    mv sonar-scanner-$SCANNER_VERSION "$SCANNER_DIR"
    rm sonar-scanner-cli-$SCANNER_VERSION.zip
fi

# 4. Run the Scan (Force system Java for Termux compatibility)
echo "🚀 Starting Analysis..."
export SONAR_SCANNER_OPTS="-Dsonar.java.jdkHome=$PREFIX"
"$SCANNER_DIR/bin/sonar-scanner" \
  -Dsonar.projectKey=$PROJECT_KEY \
  -Dsonar.organization=$ORG \
  -Dsonar.sources=. \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.token=$SONAR_TOKEN \
  -Dsonar.scanner.skipJreProvisioning=true \
  -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
  -Dsonar.exclusions="node_modules/**,dist/**,frontend/dist/**,backend/dist/**,frontend/public/libav/**,**/*.min.js,backend/tests/**,scripts/**"

echo "✅ Done!"
