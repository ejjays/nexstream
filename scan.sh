#!/bin/bash

# NEXSTREAM SONARCLOUD SCANNER (Termux Edition)
# This script runs a local analysis and updates your SonarCloud dashboard instantly.

PROJECT_KEY="ejjays_nexstream"
ORG="ejjays"
TOKEN="3246302ac62d25469b7400382ecf8863252a73b9"
SCANNER_VERSION="6.2.1.4610"
SCANNER_DIR="$HOME/.sonar/scanner"

# 1. Check for Java (Required)
if ! command -v java &> /dev/null; then
    echo "❌ Java not found. Installing OpenJDK 17..."
    pkg install -y openjdk-17
fi

# 2. Check for SonarScanner CLI
if [ ! -d "$SCANNER_DIR" ]; then
    echo "📦 Downloading SonarScanner CLI..."
    mkdir -p "$HOME/.sonar"
    curl -LO https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-$SCANNER_VERSION.zip
    unzip -q sonar-scanner-cli-$SCANNER_VERSION.zip
    mv sonar-scanner-$SCANNER_VERSION "$SCANNER_DIR"
    rm sonar-scanner-cli-$SCANNER_VERSION.zip
    echo "✅ Scanner installed."
fi

# 3. Run the Scan
echo "🚀 Starting Analysis for $PROJECT_KEY..."
"$SCANNER_DIR/bin/sonar-scanner" 
  -Dsonar.projectKey=$PROJECT_KEY 
  -Dsonar.organization=$ORG 
  -Dsonar.sources=. 
  -Dsonar.host.url=https://sonarcloud.io 
  -Dsonar.token=$TOKEN 
  -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info 
  -Dsonar.exclusions="node_modules/**,dist/**,frontend/dist/**,backend/dist/**,frontend/public/libav/**,**/*.min.js,backend/tests/**,scripts/**"

echo ""
echo "✅ Analysis Submitted!"
echo "Check results here: https://sonarcloud.io/dashboard?id=$PROJECT_KEY"
